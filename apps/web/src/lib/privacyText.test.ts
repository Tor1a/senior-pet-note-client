import { describe, expect, it } from 'vitest';
import { findPrivacyForbidden, PRIVACY_TEXT, validateAgeConfirm } from './privacyText';

describe('개인정보 후속 조치 문구', () => {
  it('문구가 정해진 그대로다', () => {
    expect(PRIVACY_TEXT.ageCheck).toBe('만 14세 이상입니다.');
    expect(PRIVACY_TEXT.ageError).toBe('가입하려면 만 14세 이상인지 확인해 주세요.');
    expect(PRIVACY_TEXT.memoHelp).toBe('반려동물의 기록만 적어 주세요. 보호자 본인의 건강 정보는 적지 마세요.');
  });

  it('모든 문구가 금지 표현 검사를 통과한다', () => {
    for (const text of Object.values(PRIVACY_TEXT)) expect(findPrivacyForbidden(text)).toBeNull();
  });

  it('금지어 검사는 "14세 이상"만 예외로 두고 그 밖의 금지어는 그대로 잡는다', () => {
    expect(findPrivacyForbidden('이상 징후가 있어요')).toBe('이상');
    expect(findPrivacyForbidden('만 14세 이상입니다. 정상이에요')).toBe('정상');
  });

  it('체크했으면 오류가 없고, 안 했으면 오류 문구를 준다', () => {
    expect(validateAgeConfirm(true)).toBeUndefined();
    expect(validateAgeConfirm(false)).toBe(PRIVACY_TEXT.ageError);
  });

  it('"14세 이상" 예외는 앞이 숫자가 아닐 때만 적용된다', () => {
    expect(findPrivacyForbidden('114세 이상')).toBe('이상');
    expect(findPrivacyForbidden('만 14세 이상')).toBeNull();
    expect(findPrivacyForbidden('14세 이상')).toBeNull();
  });
});
