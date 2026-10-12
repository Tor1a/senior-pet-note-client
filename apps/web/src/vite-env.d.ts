/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 앱이 쓰는 환경변수 타입 (값이 없을 수 있으므로 optional)
interface ImportMetaEnv {
  /** Java 백엔드 API 주소. 비어 있으면 http://localhost:8080 을 쓴다 */
  readonly VITE_API_BASE_URL?: string;
  /** 개인정보 처리방침 주소(http/https). 비어 있으면 계정·탈퇴 화면의 링크 줄을 숨긴다 */
  readonly VITE_PRIVACY_POLICY_URL?: string;
  /** 계정 삭제 안내 페이지(/delete-account)의 문의 이메일. 비어 있으면 이메일 안내 줄을 숨긴다 */
  readonly VITE_SUPPORT_EMAIL?: string;
  /** 계정 삭제 안내 페이지의 운영자(개발자)명. 비어 있으면 줄을 숨긴다 */
  readonly VITE_OPERATOR_NAME?: string;
  /** 계정 삭제 안내 페이지의 백업·로그 보관 안내 문장. 비어 있으면 줄을 숨긴다 */
  readonly VITE_RETENTION_NOTE?: string;
  /** 계정 삭제 안내 페이지의 이메일 요청 줄에 덧붙일 처리 기간·본인 확인 안내. 비어 있으면 숨긴다(기본 문구 없음) */
  readonly VITE_DELETE_REQUEST_NOTE?: string;
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
