// [공유 로직 사본] 원본: web/src/lib/privacyConfig.ts (2026-10-08 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
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
