/// <reference lib="webworker" />
// 서비스워커 (vite-plugin-pwa injectManifest) — 기획서 6-2 A안 "하나로 합친다"
// 1) PWA: 앱 껍데기(HTML/JS/CSS/아이콘)만 precache 해서 오프라인에서도 기본 화면을 그린다.
//    API 요청(/api/**)은 절대 캐시하지 않는다(민감한 건강 기록, 항상 서버 최신값).
//    - 런타임 캐시 라우트를 두지 않으므로 API 응답은 저장되지 않는다.
//    - 나중에 같은 주소에서 /api 를 서비스하더라도 index.html 로 대체되지 않게 denylist 로 뺀다.
// 2) 새 버전은 바로 적용한다(registerType: 'autoUpdate' → skipWaiting + clientsClaim).
// 3) 알림 클릭(notificationclick)은 Firebase 초기화보다 "먼저" 등록한다.
//    Firebase SW SDK 의 클릭 처리기가 stopImmediatePropagation 으로 뒤의 처리기를 막기 때문이다.
// 4) Firebase 설정(VITE_FIREBASE_*)이 없으면 Messaging 초기화를 건너뛰고 precache 만 한다.
//    서버가 notification 페이로드를 보내므로 백그라운드 알림은 Firebase SDK 가 자동 표시한다
//    (onBackgroundMessage 에서 showNotification 을 또 부르지 않는다 — 중복 표시 방지).
//    서버가 webpush.notification.actions=[{action:'taken',title:'먹였어요'}] 를 보내면 Firebase SDK(@firebase/messaging 0.13.3 의
//    showNotification)가 payload.notification 을 그대로 showNotification 옵션으로 넘기므로 버튼이 그대로 붙는다.
// 5) 알림 버튼 [먹였어요](event.action === 'taken')은 앱을 열지 않고 여기서 POST /api/med-logs 로 체크한다(lib/pushAction.ts).
//    토큰은 페이지가 IndexedDB 에 둔 사본을 "읽기만" 한다(lib/swTokenStore.ts). 결과는 같은 tag 로 알림을 덮어써 보여 준다.
//    요청 전에 같은 tag 로 "기록하는 중이에요"를 먼저 띄운다(버튼을 누르면 원래 알림이 닫힐 수 있어서). 소리 없음, 결과가 같은 tag 로 덮어쓴다.
//    실패는 "기록하지 못했어요"로 알리고 누르면 앱을 연다 — 실패를 "기록했어요"로 말하지 않는다. /api/** 응답은 여전히 캐시하지 않는다.
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { DEFAULT_API_BASE_URL, resolveApiConfig } from './lib/config';
import {
  buildRecordingNotification,
  buildResultNotification,
  checkNotificationAge,
  runTakenAction,
  TAKEN_ACTION,
  type ActionDeps,
} from './lib/pushAction';
import { resolvePushConfig } from './lib/pushConfig';
import { medTargetQuery, parseMedReminderData, type MedReminderData } from './lib/reminderApi';
import { clearSwTokenIfEquals, readSwToken } from './lib/swTokenStore';

declare const self: ServiceWorkerGlobalScope;

const TODAY_PUSH_PATH = '/today?source=push';

void self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api(\/|$)/] }));

/** Firebase 가 표시한 알림은 data.FCM_MSG.data 에, 그 밖에는 data 에 바로 값이 있다 */
function pushData(notification: Notification): unknown {
  const raw = notification.data as { FCM_MSG?: { data?: unknown } } | null | undefined;
  return raw?.FCM_MSG?.data ?? raw;
}

/** 같은 주소의 열린 창이 있으면 포커스 후 이동, 없으면 새 창 */
async function openApp(path: string): Promise<void> {
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((c) => new URL(c.url).origin === self.location.origin);
  if (existing) {
    try {
      const focused = await existing.focus();
      await focused.navigate(url);
      return;
    } catch {
      // 제어하지 않는 창이면 navigate 가 실패한다 → 새 창으로
    }
  }
  try {
    await self.clients.openWindow(url);
  } catch {
    // 창을 못 열면(사용자 활동 없음 등) 더 할 수 있는 일이 없다. 처리기가 오류로 끝나지 않게 삼킨다
  }
}

/** 같은 tag 의 알림을 모두 닫는다(앱을 열어 알릴 때 "기록하는 중이에요" 알림이 남지 않게) */
async function closeByTag(tag: string): Promise<void> {
  try {
    const list = await self.registration.getNotifications({ tag });
    list.forEach((n) => n.close());
  } catch {
    // 닫지 못해도 앱 열기는 계속한다
  }
}

/** 알림을 눌러 앱을 열 오늘 화면 주소. t·d 는 알림이 가리킨 회차(시각·기록 날짜), n 은 열 때마다 바뀌는 값(같은 약을 다시 눌러도 강조가 다시 시작된다) */
function todayPath(data: MedReminderData | null): string {
  return data ? `${TODAY_PUSH_PATH}${medTargetQuery(data)}&n=${Date.now()}` : '/';
}

/** 페이지와 같은 API 주소 설정(VITE_API_BASE_URL). 잘못된 값이면 기본값 */
function actionDeps(): ActionDeps {
  const api = resolveApiConfig(import.meta.env.VITE_API_BASE_URL);
  return {
    baseUrl: api.ok ? api.baseUrl : DEFAULT_API_BASE_URL,
    readToken: readSwToken,
    forgetToken: clearSwTokenIfEquals,
    fetchImpl: (input, init) => fetch(input, init),
    now: () => Date.now(),
  };
}

/** 같은 알림의 [먹였어요]가 겹쳐 눌려도 요청은 하나만 보낸다 */
const takenInFlight = new Set<string>();

/** 알림 [먹였어요]: 체크하고 결과 알림으로 바꾼다. 알림을 못 바꾸는 경우에만 앱을 열어 알린다 */
async function handleTaken(notification: Notification, data: MedReminderData | null): Promise<void> {
  const key = notification.tag || (data ? `${data.medicationId}:${data.recordDate}:${data.scheduledTime}` : '');
  if (key && takenInFlight.has(key)) return;
  if (key) takenInFlight.add(key);
  try {
    const timestamp = (notification as Notification & { timestamp?: number }).timestamp;
    // 요청을 보낼 알림이면 먼저 같은 tag 로 "기록하는 중이에요"를 띄운다: 버튼을 누르면 브라우저가 원래 알림을 닫을 수 있어
    // 네트워크가 느릴 때 알림이 사라진 채로 보이지 않게 한다. 결과 알림이 같은 tag 로 다시 덮어쓴다(소리 없음, 이중 표시 없음)
    let recordingShown = false;
    if (data && checkNotificationAge(timestamp, Date.now()) === 'ok') {
      const rec = buildRecordingNotification(data, notification.body ?? '', notification.tag, notification.data);
      try {
        await self.registration.showNotification(rec.title, rec.options as NotificationOptions);
        recordingShown = true;
      } catch {
        // 못 띄워도 체크는 계속한다
      }
    }
    let outcome;
    try {
      outcome = await runTakenAction(data, timestamp, actionDeps());
    } catch {
      outcome = { kind: 'server' } as const; // 예상 밖 오류도 침묵하지 않는다
    }
    const result = data ? buildResultNotification(outcome, data, notification.body ?? '', notification.tag) : null;
    if (result) {
      try {
        await self.registration.showNotification(result.title, result.options as NotificationOptions);
        return;
      } catch {
        // 알림을 못 바꾸면(권한 회수 등) 앱을 열어 알린다
      }
    }
    notification.close();
    if (recordingShown && key) await closeByTag(key);
    await openApp(todayPath(data));
  } finally {
    if (key) takenInFlight.delete(key);
  }
}

self.addEventListener('notificationclick', (event) => {
  // 이 앱이 처리한다. Firebase 의 기본 클릭 처리기(링크 없으면 아무것도 안 함)는 건너뛴다
  event.stopImmediatePropagation();
  const data = parseMedReminderData(pushData(event.notification));
  if (event.action === TAKEN_ACTION) {
    // 알림 버튼: 앱을 열지 않는다. 같은 tag 로 결과 알림이 원래 알림을 덮어쓴다(닫지 않는다 — 처리 도중 알림이 사라져 침묵하지 않게)
    event.waitUntil(handleTaken(event.notification, data));
    return;
  }
  event.notification.close();
  // 본문 탭(action === ''): 투약 알림이면 "오늘" 화면, 알 수 없는 알림이면 첫 화면만 연다
  event.waitUntil(openApp(todayPath(data)));
});

const push = resolvePushConfig(import.meta.env);
if (push.enabled) {
  // getMessaging 이 push 수신 처리기를 등록한다(백그라운드 알림 자동 표시, 앞 화면이 있으면 onMessage 로 전달)
  getMessaging(initializeApp(push.firebase));
}
