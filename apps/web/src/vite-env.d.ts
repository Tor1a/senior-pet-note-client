/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 앱이 쓰는 환경변수 타입 (값이 없을 수 있으므로 optional)
interface ImportMetaEnv {
  /** Java 백엔드 API 주소. 비어 있으면 http://localhost:8080 을 쓴다 */
  readonly VITE_API_BASE_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
