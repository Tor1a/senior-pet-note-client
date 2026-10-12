// 알림 버튼([먹였어요]) 처리의 순수 로직 — 기획서 알림-바로-체크 5장, 설계서 2-6·3장
// 서비스워커(sw.ts)가 이 모듈에 fetch·토큰 읽기·현재 시각을 넣어 호출한다. 화면·DOM·전역 self 를 직접 만지지 않는다(테스트 대상).
// 순서(어느 단계든 실패하면 "기록했어요"는 쓰지 않는다)
//   1) 알림이 발송 후 1시간 이내인지(notification.timestamp). 모르면 앱 열기, 오래됐으면 "시간이 지난 알림" 안내
//   2) 토큰 사본(IndexedDB) 읽기. 없으면 로그인 안내
//   3) GET /api/pets/{petId}/today 의 recordDate 가 알림의 recordDate 와 같은지(밤새 남은 알림으로 다음 날 회차를 체크하지 않게)
//      - POST /api/med-logs 는 서버가 "지금" 기록 날짜로 저장하므로 날짜가 다르면 보내지 않는다. 계산은 서버값 비교뿐이다
//   4) POST /api/med-logs {medicationId, scheduledTime}: 201 기록, 409 ALREADY_CHECKED 는 성공으로 취급, 401 은 사본 삭제
// 응답 본문과 토큰은 알림·로그에 넣지 않는다(기록 시각 takenAt 만 표시용으로 쓴다).
import { PUSH_ACTION_TEXT, recordedBodyText } from './pushActionText';
import type { MedReminderData } from './reminderApi';

/** 서버가 푸시에 넣는 액션 id (docs/api-reminders.md 4장) */
export const TAKEN_ACTION = 'taken';
/** 알림 유효시간: 발송 후 1시간(서버 TTL 3600초와 같다). 넘으면 알림에서 기록하지 않는다 */
export const ACTION_MAX_AGE_MS = 60 * 60 * 1000;
/** 시계가 어긋나 알림 시각이 미래로 보일 때 허용하는 오차 */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** 요청 하나의 대기 한도. 두 요청이 이어져도 서비스워커 수명 안에 끝난다 */
export const ACTION_REQUEST_TIMEOUT_MS = 8000;
export const NOTIFICATION_ICON = '/pwa-192x192.png';

export type AgeCheck = 'ok' | 'stale' | 'unknown';

/** 알림 시각(Notification.timestamp, ms)의 신선도. 값이 없거나 이상하면 'unknown' → 보수적으로 앱을 연다 */
export function checkNotificationAge(timestamp: unknown, now: number): AgeCheck {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return 'unknown';
  const age = now - timestamp;
  if (age < -CLOCK_SKEW_MS) return 'unknown';
  return age > ACTION_MAX_AGE_MS ? 'stale' : 'ok';
}

/** 처리 결과. recorded/already 만 "먹였다고 기록돼 있음"이다 */
export type ActionOutcome =
  | { kind: 'recorded'; takenAt: string | null }
  | { kind: 'already' }
  | { kind: 'unauthorized' }
  | { kind: 'network' }
  | { kind: 'server' }
  | { kind: 'gone' }
  | { kind: 'stale' }
  /** 알림만으로는 판단할 수 없어 알림을 바꾸지 않고 앱을 연다(알림 시각 없음, 알 수 없는 알림) */
  | { kind: 'open-app' };

export interface ActionDeps {
  /** API 서버 주소(끝의 / 없음). 페이지와 같은 VITE_API_BASE_URL 설정 */
  baseUrl: string;
  /** 토큰 사본 읽기(IndexedDB). 서비스워커는 읽기만 한다 */
  readToken: () => Promise<string | null>;
  /** 서버가 401 을 알려 준 그 토큰의 사본 삭제(그사이 바뀌었으면 지우지 않는다) */
  forgetToken: (token: string) => Promise<void>;
  fetchImpl: typeof fetch;
  /** 현재 시각(ms) */
  now: () => number;
  timeoutMs?: number;
}

type CallResult = { status: number; body: unknown } | 'network';

async function call(
  deps: ActionDeps,
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<CallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? ACTION_REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await deps.fetchImpl(`${deps.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    try {
      parsed = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      parsed = null;
    }
    return { status: res.status, body: parsed };
  } catch {
    return 'network';
  } finally {
    clearTimeout(timer);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** 실패 응답 상태 → 결과. 401 은 호출한 쪽이 사본을 지운다 */
function classifyFailure(status: number): ActionOutcome {
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 400 || status === 404) return { kind: 'gone' }; // 일정에 없는 시각(400)·삭제된 약/반려동물(404)
  return { kind: 'server' };
}

/** Authorization 헤더에 그대로 쓸 수 있는 토큰인지: 공백·제어문자·한글 없이 눈에 보이는 ASCII 만(JWT 는 base64url 과 . 으로 이뤄진다) */
export function isHeaderSafeToken(token: string): boolean {
  return /^[\x21-\x7e]+$/.test(token);
}

/** 알림 [먹였어요] 한 번의 처리. 어떤 경우에도 오류를 던지지 않고 결과를 돌려준다 */
export async function runTakenAction(
  data: MedReminderData | null,
  timestamp: unknown,
  deps: ActionDeps,
): Promise<ActionOutcome> {
  if (!data) return { kind: 'open-app' };

  const age = checkNotificationAge(timestamp, deps.now());
  if (age === 'unknown') return { kind: 'open-app' };
  if (age === 'stale') return { kind: 'stale' };

  const token = await deps.readToken();
  if (!token) return { kind: 'unauthorized' };
  // 손상된 사본(줄바꿈·한글 등 헤더에 못 쓰는 글자)은 fetch 가 요청 전에 TypeError 를 던져 "인터넷 문제"로 오분류된다 → 로그인 안내로 처리하고 사본을 지운다
  if (!isHeaderSafeToken(token)) {
    await deps.forgetToken(token);
    return { kind: 'unauthorized' };
  }

  const enc = encodeURIComponent;
  const today = await call(deps, token, 'GET', `/api/pets/${enc(data.petId)}/today`);
  if (today === 'network') return { kind: 'network' };
  if (today.status !== 200) {
    const failure = classifyFailure(today.status);
    if (failure.kind === 'unauthorized') await deps.forgetToken(token);
    return failure;
  }
  const todayBody = isObject(today.body) ? today.body : null;
  if (!todayBody || typeof todayBody.recordDate !== 'string') return { kind: 'server' };
  // 서버의 현재 기록 날짜가 알림의 회차 날짜와 다르면 체크하지 않는다(새벽 4시 경계·밤새 남은 알림)
  if (todayBody.recordDate !== data.recordDate) return { kind: 'stale' };

  // 같은 날의 회차 목록에서 이 알림의 회차를 찾는다: 없으면(약을 뺐거나 시각이 바뀜) 보내지 않는다, 이미 먹였으면 보내지 않는다
  const doses = Array.isArray(todayBody.doses) ? todayBody.doses : [];
  const dose = doses.find(
    (d): d is Record<string, unknown> =>
      isObject(d) && d.medicationId === data.medicationId && d.scheduledTime === data.scheduledTime,
  );
  if (!dose) return { kind: 'gone' };
  if (dose.taken === true) return { kind: 'already' };

  const posted = await call(deps, token, 'POST', '/api/med-logs', {
    medicationId: data.medicationId,
    scheduledTime: data.scheduledTime,
  });
  if (posted === 'network') return { kind: 'network' };
  if (posted.status === 201) {
    const takenAt = isObject(posted.body) && typeof posted.body.takenAt === 'string' ? posted.body.takenAt : null;
    return { kind: 'recorded', takenAt };
  }
  if (posted.status === 409 && isObject(posted.body) && posted.body.code === 'ALREADY_CHECKED') {
    return { kind: 'already' };
  }
  const failure = classifyFailure(posted.status);
  if (failure.kind === 'unauthorized') await deps.forgetToken(token);
  return failure;
}

/**
 * "기록하는 중이에요" 알림 (설계 2-6, 8장). 버튼을 누르면 브라우저가 원래 알림을 닫을 수 있어서,
 * 요청이 느릴 때 알림이 사라진 채로 보이지 않도록 같은 tag 로 먼저 덮어쓴다. 결과 알림이 같은 tag 로 다시 덮어쓴다.
 * 소리·진동 없음(silent, renotify false)이라 이중 표시·재알림이 없다. 버튼이 없어 연타도 막힌다.
 * data 는 원래 알림의 것을 그대로 둔다(눌러도 기존 클릭 처리기가 오늘 화면을 연다).
 */
export function buildRecordingNotification(
  data: MedReminderData,
  originalBody: string,
  originalTag: string,
  originalData: unknown,
): { title: string; options: { body: string; tag: string; icon: string; silent: boolean; renotify: boolean; data: unknown } } {
  return {
    title: PUSH_ACTION_TEXT.recordingTitle,
    options: {
      body: originalBody,
      tag: originalTag || `${data.medicationId}:${data.recordDate}:${data.scheduledTime}`,
      icon: NOTIFICATION_ICON,
      silent: true,
      renotify: false,
      data: originalData,
    },
  };
}

/** showNotification 에 넘길 값 */
export interface ResultNotification {
  title: string;
  options: {
    body: string;
    tag: string;
    icon: string;
    silent: boolean;
    renotify: boolean;
    requireInteraction: boolean;
    data: MedReminderData & { result: 'recorded' | 'failed' };
  };
}

/**
 * 결과 알림 만들기(같은 tag 로 덮어쓴다). open-app 은 알림을 만들지 않으므로 null.
 * - 버튼 없음(알림 안 되돌리기는 이번에 만들지 않는다: 오늘 화면에서 카드로 되돌린다)
 * - 소리·진동 없음(silent). 실패 안내는 requireInteraction 으로 데스크톱에서 저절로 사라지지 않게 한다.
 * - data 는 투약 알림과 같은 5개 필드(+result): 눌렀을 때 기존 클릭 처리기가 /today?source=push&med= 로 연다.
 */
export function buildResultNotification(
  outcome: ActionOutcome,
  data: MedReminderData,
  originalBody: string,
  originalTag: string,
): ResultNotification | null {
  const tag = originalTag || `${data.medicationId}:${data.recordDate}:${data.scheduledTime}`;
  const make = (title: string, body: string, ok: boolean): ResultNotification => ({
    title,
    options: {
      body,
      tag,
      icon: NOTIFICATION_ICON,
      silent: true,
      renotify: false,
      requireInteraction: !ok,
      data: { ...data, result: ok ? 'recorded' : 'failed' },
    },
  });
  const T = PUSH_ACTION_TEXT;
  switch (outcome.kind) {
    case 'recorded':
      return make(T.recordedTitle, recordedBodyText(originalBody, outcome.takenAt), true);
    case 'already':
      return make(T.alreadyTitle, originalBody, true);
    case 'unauthorized':
      return make(T.loginTitle, T.loginBody, false);
    case 'network':
      return make(T.failedTitle, T.failNetwork, false);
    case 'server':
      return make(T.failedTitle, T.failServer, false);
    case 'gone':
      return make(T.failedTitle, T.failGone, false);
    case 'stale':
      return make(T.failedTitle, T.failStale, false);
    case 'open-app':
      return null;
  }
}
