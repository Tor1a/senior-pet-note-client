// [공유 로직 테스트 사본] 원본: web/src/lib/loginForm.test.ts (2026-10-07 복사)
// vitest import 한 줄 제거, vi.fn → jest.fn 만 바꿈(jest 전역 함수로 실행). 추후 packages/shared 로 통합 예정.
import { hasErrors, validateLoginForm } from './loginForm';

describe('validateLoginForm — 로그인', () => {
  it('정상 입력이면 오류 없음 (로그인은 비밀번호 길이를 따지지 않는다)', () => {
    const errors = validateLoginForm({ email: ' a@b.co ', password: 'short' }, 'login');
    expect(errors).toEqual({});
    expect(hasErrors(errors)).toBe(false);
  });

  it('빈 이메일·빈 비밀번호', () => {
    const errors = validateLoginForm({ email: '   ', password: '' }, 'login');
    expect(errors.email).toBe('이메일을 입력해 주세요.');
    expect(errors.password).toBe('비밀번호를 입력해 주세요.');
    expect(hasErrors(errors)).toBe(true);
  });

  it('이메일 형식이 틀리면 안내', () => {
    for (const email of ['abc', 'abc@', 'a@b', 'a b@c.co']) {
      expect(validateLoginForm({ email, password: 'x' }, 'login').email).toContain('이메일 형식');
    }
  });
});

describe('validateLoginForm — 회원가입', () => {
  it('비밀번호는 8자 이상 (7자 거부, 8자 통과)', () => {
    expect(
      validateLoginForm({ email: 'a@b.co', password: '1234567', passwordConfirm: '1234567' }, 'signup').password,
    ).toBe('비밀번호는 8자 이상으로 정해 주세요.');
    expect(validateLoginForm({ email: 'a@b.co', password: '12345678', passwordConfirm: '12345678' }, 'signup')).toEqual(
      {},
    );
  });

  it('비밀번호 확인이 다르면 안내', () => {
    expect(
      validateLoginForm({ email: 'a@b.co', password: '12345678', passwordConfirm: '12345679' }, 'signup')
        .passwordConfirm,
    ).toBe('비밀번호가 서로 달라요. 한 번 더 확인해 주세요.');
  });
});
