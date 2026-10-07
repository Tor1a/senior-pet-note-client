// 웹 푸시(FCM) 설정 점검 — 기획서 6-1, 6-6
// - VITE_FIREBASE_* 다섯 개가 모두 있어야 알림 기능을 켠다. 하나라도 비면 알림만 꺼지고 앱은 그대로 동작한다.
// - 이 값들은 Firebase 가 공개를 전제로 한 식별값이다(비밀 아님). VAPID "개인 키"는 절대 넣지 않는다(공개 키만).
// - 앱(main)과 서비스워커(sw.ts)가 함께 쓴다. 순수 함수라 테스트 대상.

export interface FirebaseWebConfig {
  apiKey: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
}

export type PushConfigStatus =
  | { enabled: true; firebase: FirebaseWebConfig; vapidKey: string }
  | { enabled: false; reason: 'missing-config'; missing: string[] };

/** import.meta.env 중 이 함수가 읽는 값 */
export interface PushEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_FIREBASE_VAPID_KEY?: string;
}

const KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
] as const;

/** 환경변수를 점검해 푸시 설정을 돌려준다 */
export function resolvePushConfig(env: PushEnv): PushConfigStatus {
  const value = (k: (typeof KEYS)[number]) => env[k]?.trim() ?? '';
  const missing = KEYS.filter((k) => !value(k));
  if (missing.length > 0) return { enabled: false, reason: 'missing-config', missing: [...missing] };
  return {
    enabled: true,
    firebase: {
      apiKey: value('VITE_FIREBASE_API_KEY'),
      projectId: value('VITE_FIREBASE_PROJECT_ID'),
      messagingSenderId: value('VITE_FIREBASE_MESSAGING_SENDER_ID'),
      appId: value('VITE_FIREBASE_APP_ID'),
    },
    vapidKey: value('VITE_FIREBASE_VAPID_KEY'),
  };
}

/** 일부만 채운 경우(오타 가능성) 경고할지 */
export function isPartialPushConfig(status: PushConfigStatus): boolean {
  return !status.enabled && status.missing.length < KEYS.length;
}
