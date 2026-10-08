import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { PasswordField, ShowPasswordToggle, useLockout } from '../components/accountParts';
import {
  classifyAccountError,
  hasFormErrors,
  validatePasswordChange,
  type PasswordChangeErrors,
} from '../lib/accountForm';
import { accountApi } from '../lib/client';
import { PASSWORD_MIN_LENGTH } from '../lib/loginForm';

// 비밀번호 바꾸기 (/account/password) — 설계 4장
// 성공하면 응답의 새 accessToken 으로 즉시 교체한다(이전 토큰은 모두 401 이라 안 바꾸면 로그아웃된다).
interface Failure {
  message: string;
  note: string | null;
}

export default function PasswordChangePage() {
  const { replaceToken } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [locked, lock] = useLockout();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const dirty = Boolean(current || next || confirm);

  function leave() {
    if (dirty && !done && !confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    navigate('/account');
  }

  function clearError(key: keyof PasswordChangeErrors) {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    setConfirmLeave(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting || locked) return;
    const found = validatePasswordChange({ currentPassword: current, newPassword: next, newPasswordConfirm: confirm });
    setErrors(found);
    setFailure(null);
    if (hasFormErrors(found)) {
      const first = found.currentPassword ? 'current' : found.newPassword ? 'next' : 'confirm';
      inputs.current[first]?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await accountApi.changePassword({ currentPassword: current, newPassword: next });
      replaceToken(res.accessToken);
      setCurrent('');
      setNext('');
      setConfirm('');
      setShow(false);
      setDone(true);
    } catch (err) {
      const f = classifyAccountError(err, 'password');
      if (f.sessionExpired) return; // 401: 강제 로그아웃 흐름이 로그인 화면으로 보낸다
      if (f.field === 'current') {
        setErrors({ currentPassword: f.message });
        setCurrent('');
        inputs.current.current?.focus();
      } else if (f.field === 'new') {
        setErrors({ newPassword: f.message });
        inputs.current.next?.focus();
      } else {
        setFailure({ message: f.message, note: f.note });
      }
      if (f.lockSeconds !== null) lock(f.lockSeconds);
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div>
        <header className="topbar">
          <Link to="/account" className="btn-link">
            <span aria-hidden="true">← </span>계정으로
          </Link>
        </header>
        <main className="page">
          <h1>비밀번호 바꾸기</h1>
          <div role="status" className="ok">
            <strong>비밀번호를 바꿨어요.</strong>
            <br />
            다음에 로그인할 때부터 새 비밀번호를 써 주세요.
          </div>
          <Link
            to="/account"
            state={{ notice: 'password' }}
            className="btn-primary link-button block"
            replace
          >
            계정으로 돌아가기
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div>
      <header className="topbar">
        <button type="button" className="btn-link" onClick={leave}>
          <span aria-hidden="true">← </span>계정으로
        </button>
      </header>
      <main className="page">
        <h1>비밀번호 바꾸기</h1>
        <p className="lead">새 비밀번호는 {PASSWORD_MIN_LENGTH}자 이상으로 정해 주세요.</p>

        <form onSubmit={onSubmit} className="card" noValidate>
          <PasswordField
            id="current-password"
            label="현재 비밀번호"
            value={current}
            show={show}
            autoComplete="current-password"
            error={errors.currentPassword}
            disabled={submitting}
            inputRef={(el) => (inputs.current.current = el)}
            onChange={(v) => {
              setCurrent(v);
              clearError('currentPassword');
            }}
          />
          <PasswordField
            id="new-password"
            label={`새 비밀번호 (${PASSWORD_MIN_LENGTH}자 이상)`}
            value={next}
            show={show}
            autoComplete="new-password"
            error={errors.newPassword}
            disabled={submitting}
            inputRef={(el) => (inputs.current.next = el)}
            onChange={(v) => {
              setNext(v);
              clearError('newPassword');
            }}
          />
          <PasswordField
            id="new-password-confirm"
            label="새 비밀번호 확인"
            value={confirm}
            show={show}
            autoComplete="new-password"
            error={errors.newPasswordConfirm}
            disabled={submitting}
            inputRef={(el) => (inputs.current.confirm = el)}
            onChange={(v) => {
              setConfirm(v);
              clearError('newPasswordConfirm');
            }}
          />
          <ShowPasswordToggle checked={show} onChange={setShow} disabled={submitting} />

          {failure && (
            <div role="alert" className="error">
              <span>{failure.message}</span>
              {failure.note && <span>{failure.note}</span>}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={submitting || locked}>
            {submitting ? '바꾸는 중…' : '비밀번호 바꾸기'}
          </button>
          <button type="button" className="btn-link" onClick={leave}>
            취소
          </button>
          {confirmLeave && (
            <div role="alert" className="card tight">
              <strong>저장하지 않고 나갈까요?</strong>
              <button type="button" className="btn-primary" onClick={() => setConfirmLeave(false)}>
                계속 고치기
              </button>
              <button type="button" className="btn-secondary" onClick={() => navigate('/account')}>
                나가기
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
