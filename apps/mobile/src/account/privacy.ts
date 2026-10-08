// 개인정보 처리방침 주소 (EXPO_PUBLIC_PRIVACY_POLICY_URL). 비어 있으면 null → 링크 줄 전체를 숨긴다.
// 주의: EXPO_PUBLIC_ 변수는 빌드 때 글자 그대로 치환되므로 process.env.EXPO_PUBLIC_... 형태로 직접 써야 한다.
import { resolvePrivacyPolicyUrl } from '../lib/privacyConfig';

export const PRIVACY_POLICY_URL = resolvePrivacyPolicyUrl(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL);
