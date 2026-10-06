// 로그인 폼 검증(src/lib/loginForm.ts) 테스트. 모바일에서 작성했으며 packages/shared 통합 때 웹과 함께 쓴다.
import { hasErrors, validateLoginForm } from './loginForm';

describe('validateLoginForm', () => {
  it('정상 입력은 오류 없음', () => {
    expect(hasErrors(validateLoginForm({ email: ' a@b.co ', password: 'x' }, 'login'))).toBe(false);
    expect(
      hasErrors(validateLoginForm({ email: 'a@b.co', password: '12345678', passwordConfirm: '12345678' }, 'signup')),
    ).toBe(false);
  });

  it('회원가입 비밀번호는 8자 이상 (백엔드 계약)', () => {
    const errors = validateLoginForm({ email: 'a@b.co', password: '1234567', passwordConfirm: '1234567' }, 'signup');
    expect(errors.password).toBeDefined();
  });

  it('회원가입 비밀번호 확인 불일치', () => {
    const errors = validateLoginForm({ email: 'a@b.co', password: '12345678', passwordConfirm: '12345679' }, 'signup');
    expect(errors.passwordConfirm).toBeDefined();
  });

  it('빈 이메일, 형식 오류', () => {
    expect(validateLoginForm({ email: '', password: 'x' }, 'login').email).toBeDefined();
    expect(validateLoginForm({ email: 'abc', password: 'x' }, 'login').email).toBeDefined();
  });
});
