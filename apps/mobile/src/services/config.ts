// API 서버 주소 설정 (모바일 전용)
// - 환경변수 EXPO_PUBLIC_API_BASE_URL 로 정한다. (.env.example 참고)
// - 비어 있으면 플랫폼별 로컬 개발 기본값을 쓴다.
//     안드로이드 에뮬레이터: http://10.0.2.2:8080  (에뮬레이터 안에서 PC 의 localhost 를 가리키는 특수 주소)
//     iOS 시뮬레이터·웹:    http://localhost:8080
//     실기기(Expo Go):      기본값으로는 안 된다. PC 의 LAN IP(예: http://192.168.0.10:8080)를 .env 에 적어야 한다.
// - EXPO_PUBLIC_ 변수는 번들에 그대로 들어가므로 비밀값(키·토큰)을 넣으면 안 된다.

export const DEFAULT_API_BASE_URL = {
  android: 'http://10.0.2.2:8080',
  other: 'http://localhost:8080',
} as const;

export type ApiConfigStatus =
  | { ok: true; baseUrl: string }
  | { ok: false; reason: 'invalid-url'; message: string };

/** 환경변수 값을 점검해 실제로 쓸 API 주소를 돌려준다. (순수 함수, 테스트 대상) */
export function resolveApiConfig(raw: string | undefined, platformOS: string): ApiConfigStatus {
  const value = raw?.trim();
  if (!value) {
    return {
      ok: true,
      baseUrl: platformOS === 'android' ? DEFAULT_API_BASE_URL.android : DEFAULT_API_BASE_URL.other,
    };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'invalid-url', message: 'EXPO_PUBLIC_API_BASE_URL 이 올바른 주소가 아니에요.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      reason: 'invalid-url',
      message: 'EXPO_PUBLIC_API_BASE_URL 은 http:// 또는 https:// 로 시작해야 해요.',
    };
  }
  // 끝의 / 는 떼어 낸다 (경로를 붙일 때 // 가 생기지 않게).
  // new URL().toString() 은 쓰지 않는다: RN 의 URL 구현이 브라우저와 달라 원문을 그대로 쓰는 편이 안전하다.
  return { ok: true, baseUrl: value.replace(/\/+$/, '') };
}
