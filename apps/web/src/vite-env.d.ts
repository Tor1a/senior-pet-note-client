/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 앱이 쓰는 환경변수 타입 (값이 없을 수 있으므로 optional)
interface ImportMetaEnv {
  /** Java 백엔드 API 주소. 비어 있으면 http://localhost:8080 을 쓴다 */
  readonly VITE_API_BASE_URL?: string;
  /** Firebase 웹 앱 설정값 (투약 알림). 다섯 개 중 하나라도 비면 알림 기능만 꺼진다 */
  readonly VITE_FIREBASE_API_KEY?: string;
  /** 백엔드 서비스 계정과 같은 Firebase 프로젝트여야 한다 */
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  /** 웹 푸시 인증서의 "공개 키" (개인 키는 절대 넣지 않는다) */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
