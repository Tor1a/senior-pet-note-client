// API 서버 주소 설정
// - 환경변수 VITE_API_BASE_URL 로 정한다. 비어 있으면 로컬 개발 기본값(http://localhost:8080)을 쓴다.
// - 주소 형식이 잘못되면 앱은 멈추지 않고 "환경변수 설정 필요" 안내 화면을 보여 준다.

export const DEFAULT_API_BASE_URL = 'http://localhost:8080';

export type ApiConfigStatus =
  | { ok: true; baseUrl: string }
  | { ok: false; reason: 'invalid-url'; message: string };

/** 환경변수 값을 점검해 실제로 쓸 API 주소를 돌려준다. (순수 함수, 테스트 대상) */
export function resolveApiConfig(raw: string | undefined): ApiConfigStatus {
  const value = raw?.trim();
  if (!value) return { ok: true, baseUrl: DEFAULT_API_BASE_URL };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'invalid-url', message: 'VITE_API_BASE_URL 이 올바른 주소가 아니에요.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'invalid-url',
      message: 'VITE_API_BASE_URL 은 http:// 또는 https:// 로 시작해야 해요.',
    };
  }
  // 끝의 / 는 떼어 낸다 (경로를 붙일 때 // 가 생기지 않게)
  return { ok: true, baseUrl: value.replace(/\/+$/, '') };
}

export const apiConfig: ApiConfigStatus = resolveApiConfig(import.meta.env.VITE_API_BASE_URL);
