// 개인정보 후속 조치 문구 모음 (법률 검토 의견 후속, 2026-10-12): 가입 화면 만 14세 확인, 메모 입력칸 도움말
// 해요체, 짧게, 사실만. 만 14세 확인은 화면에서만 확인하고 서버로 보내지 않으며 저장하지 않는다.
// 금지 표현 검사는 findPrivacyForbidden() 으로 테스트가 한다. 문구를 더하면 테스트에도 더한다.
import { findForbidden } from './historyText';

export const PRIVACY_TEXT = {
  /** 가입 화면 필수 확인 체크박스 */
  ageCheck: '만 14세 이상입니다.',
  /** 체크하지 않고 가입을 눌렀을 때 칸 오류 */
  ageError: '가입하려면 만 14세 이상인지 확인해 주세요.',
  /** 오늘 메모·반려동물 질환 메모 입력칸 아래에 항상 보이는 도움말 */
  memoHelp: '반려동물의 기록만 적어 주세요. 보호자 본인의 건강 정보는 적지 마세요.',
} as const;

/** 가입 화면: 체크하지 않았으면 오류 문구, 체크했으면 undefined */
export function validateAgeConfirm(checked: boolean): string | undefined {
  return checked ? undefined : PRIVACY_TEXT.ageError;
}

/**
 * 기존 금지 표현 목록(findForbidden)을 그대로 쓰되, 법적 연령 확인 문구의 "14세 이상"만 예외로 둔다.
 * (목록의 "이상"은 "이상 징후" 같은 의료 판단을 막으려는 것이라 나이 기준 표현과 다르다.)
 */
export function findPrivacyForbidden(text: string): string | null {
  return findForbidden(text.replace(/(^|[^0-9])14세 이상/g, '$114세'));
}
