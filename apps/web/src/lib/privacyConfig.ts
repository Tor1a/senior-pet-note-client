// 개인정보 처리방침 주소 (웹 VITE_PRIVACY_POLICY_URL / 앱 EXPO_PUBLIC_PRIVACY_POLICY_URL)
// 비어 있거나 http(s) 주소가 아니면 null → 화면은 링크 줄 전체를 숨긴다(작동 안 하는 링크를 보이지 않는다).
// 순수 TS(모바일 사본 대상). 환경변수 읽기는 각 앱에서 한다.

export function resolvePrivacyPolicyUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}
