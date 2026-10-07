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
import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging/sw';
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { resolvePushConfig } from './lib/pushConfig';
import { parseMedReminderData } from './lib/reminderApi';

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
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // 이 앱이 처리한다. Firebase 의 기본 클릭 처리기(링크 없으면 아무것도 안 함)는 건너뛴다
  event.stopImmediatePropagation();
  const data = parseMedReminderData(pushData(event.notification));
  // 투약 알림이면 "오늘" 화면, 알 수 없는 알림이면 첫 화면만 연다
  event.waitUntil(openApp(data ? `${TODAY_PUSH_PATH}&med=${encodeURIComponent(data.medicationId)}` : '/'));
});

const push = resolvePushConfig(import.meta.env);
if (push.enabled) {
  // getMessaging 이 push 수신 처리기를 등록한다(백그라운드 알림 자동 표시, 앞 화면이 있으면 onMessage 로 전달)
  getMessaging(initializeApp(push.firebase));
}
