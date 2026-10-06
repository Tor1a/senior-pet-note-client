import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { toUserMessage } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import {
  hasErrors,
  PASSWORD_MIN_LENGTH,
  validateLoginForm,
  type AuthMode,
  type LoginFormErrors,
} from '../lib/loginForm';

// 이메일 + 비밀번호 로그인 / 회원가입 화면 (Java 백엔드 /api/auth/*)
export default function LoginPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  function switchMode(next: AuthMode) {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
    setPassword('');
    setPasswordConfirm('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errors = validateLoginForm({ email, password, passwordConfirm }, mode);
    setFieldErrors(errors);
    setFormError(null);
    if (hasErrors(errors)) return;

    setSubmitting(true);
    try {
      if (isSignup) await signup(email.trim(), password);
      else await login(email.trim(), password);
      // 성공하면 상태가 signedIn 으로 바뀌어 /today 로 자동 이동한다
    } catch (err) {
      setFormError(toUserMessage(err, mode));
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>시니어펫 노트</h1>
      <p className="lead">매일 10초 기록, 진료 때 1장 리포트</p>

      <form onSubmit={onSubmit} className="card" noValidate>
        <h2>{isSignup ? '회원가입' : '로그인'}</h2>

        <label htmlFor="email">이메일</label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" className="field-error">
            {fieldErrors.email}
          </p>
        )}

        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          placeholder={isSignup ? `${PASSWORD_MIN_LENGTH}자 이상` : ''}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
        />
        {fieldErrors.password && (
          <p id="password-error" className="field-error">
            {fieldErrors.password}
          </p>
        )}

        {isSignup && (
          <>
            <label htmlFor="password-confirm">비밀번호 확인</label>
            <input
              id="password-confirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              aria-invalid={fieldErrors.passwordConfirm ? true : undefined}
              aria-describedby={fieldErrors.passwordConfirm ? 'password-confirm-error' : undefined}
            />
            {fieldErrors.passwordConfirm && (
              <p id="password-confirm-error" className="field-error">
                {fieldErrors.passwordConfirm}
              </p>
            )}
          </>
        )}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? '잠시만요…' : isSignup ? '가입하고 시작하기' : '로그인'}
        </button>

        {formError && (
          <p role="alert" className="error">
            {formError}
          </p>
        )}

        <button type="button" className="btn-link" onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
          {isSignup ? '이미 계정이 있어요 · 로그인' : '처음이신가요? 회원가입'}
        </button>
      </form>

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
