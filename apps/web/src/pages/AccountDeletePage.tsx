import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { PasswordField, PrivacyLink, ShowPasswordToggle, useLockout } from '../components/accountParts';
import { classifyAccountError, hasFormErrors, validateWithdraw, type WithdrawErrors } from '../lib/accountForm';
import { accountApi } from '../lib/client';

// 회원 탈퇴 (/account/delete) — 설계 5장. 3단계: 지워지는 내용 읽기(info) → 비밀번호 + 확인 체크(confirm) → 삭제 중(deleting)
// 되돌릴 수 없으므로 [그대로 두기]가 눈에 띄는 쪽(primary)이고, 삭제 중에는 입력·뒤로를 잠근다.
type Step = 'info' | 'confirm' | 'deleting';

const SCOPE_ITEMS = [
  '계정(이메일, 비밀번호)',
  '반려동물 프로필과 사진',
  '등록한 약과 먹임 체크 기록',
  '매일 적은 체중·식사·물·증상·메모',
  '투약 알림 설정',
  '알림을 받던 기기 연결(이 휴대폰과 다른 기기 모두)',
];

export default function AccountDeletePage() {
  const { finishWithdrawal } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('info');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<WithdrawErrors>({});
  const [failure, setFailure] = useState<{ message: string; note: string | null } | null>(null);
  const [slow, setSlow] = useState(false);
  const [backBlocked, setBackBlocked] = useState(false);
  const [locked, lock] = useLockout();
  const heading = useRef<HTMLHeadingElement>(null);
  const passwordInput = useRef<HTMLInputElement | null>(null);
  const checkInput = useRef<HTMLInputElement>(null);
  const deleting = step === 'deleting';

  // 단계가 바뀌면 포커스를 새 제목으로(비밀번호 칸에는 자동 포커스를 주지 않는다)
  useEffect(() => {
    heading.current?.focus();
  }, [step === 'info']); // eslint-disable-line react-hooks/exhaustive-deps

  // 삭제 중: 새로고침·닫기 경고, 브라우저 뒤로 가기 무시, 3초 넘으면 안내
  useEffect(() => {
    if (!deleting) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onPopState = () => {
      history.pushState(null, '', location.href);
      setBackBlocked(true);
    };
    history.pushState(null, '', location.href);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [deleting]);

  function backToStart() {
    setPassword('');
    setConfirmed(false);
    setShow(false);
    setErrors({});
    setFailure(null);
    setStep('info');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (deleting || locked) return;
    const found = validateWithdraw({ password, confirmed });
    setErrors(found);
    setFailure(null);
    if (hasFormErrors(found)) {
      if (found.password) passwordInput.current?.focus();
      else checkInput.current?.focus();
      return;
    }
    setSlow(false);
    setBackBlocked(false);
    setStep('deleting');
    try {
      await accountApi.withdraw(password);
    } catch (err) {
      const f = classifyAccountError(err, 'withdraw');
      setStep('confirm');
      if (f.sessionExpired) return; // 401: 강제 로그아웃 흐름이 로그인 화면으로 보낸다
      if (f.field === 'current') {
        setErrors({ password: f.message });
        setPassword('');
        setTimeout(() => passwordInput.current?.focus(), 0);
      } else {
        setFailure({ message: f.message, note: f.note });
      }
      if (f.lockSeconds !== null) lock(f.lockSeconds);
      return;
    }
    setPassword('');
    await finishWithdrawal();
  }

  if (step === 'info') {
    return (
      <div>
        <header className="topbar">
          <Link to="/account" className="btn-link">
            <span aria-hidden="true">← </span>계정으로
          </Link>
        </header>
        <main className="page">
          <h1 ref={heading} tabIndex={-1}>
            회원 탈퇴
          </h1>
          <p className="strong">탈퇴하면 계정과 모든 기록이 지워져요.</p>
          <p className="strong">한 번 지우면 되돌릴 수 없어요.</p>

          <section className="card scope-card" aria-labelledby="scope-title">
            <h2 id="scope-title">지워지는 내용</h2>
            <ul className="scope-list">
              {SCOPE_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <p className="muted">지운 기록은 다시 가져올 수 없어요.</p>

          <PrivacyLink />

          <button type="button" className="btn-primary block" onClick={() => navigate('/account')}>
            그대로 두기
          </button>
          <button type="button" className="btn-secondary block" onClick={() => setStep('confirm')}>
            탈퇴 계속하기 <span aria-hidden="true">&nbsp;›</span>
          </button>
        </main>
      </div>
    );
  }

  return (
    <div>
      <header className="topbar">
        <button type="button" className="btn-link" onClick={backToStart} disabled={deleting}>
          <span aria-hidden="true">← </span>처음으로
        </button>
      </header>
      <main className="page" aria-busy={deleting}>
        <h1 ref={heading} tabIndex={-1}>
          탈퇴 확인
        </h1>
        <p className="lead">본인 확인을 위해 비밀번호를 입력해 주세요.</p>

        <form onSubmit={onSubmit} className="card" noValidate>
          <PasswordField
            id="withdraw-password"
            label="비밀번호"
            value={password}
            show={show}
            autoComplete="current-password"
            error={errors.password}
            disabled={deleting}
            inputRef={(el) => (passwordInput.current = el)}
            onChange={(v) => {
              setPassword(v);
              setErrors((x) => ({ ...x, password: undefined }));
            }}
          />
          <ShowPasswordToggle checked={show} onChange={setShow} disabled={deleting} />

          <label className="check-label confirm-check">
            <input
              ref={checkInput}
              type="checkbox"
              checked={confirmed}
              disabled={deleting}
              aria-invalid={errors.confirmed ? true : undefined}
              aria-describedby={errors.confirmed ? 'withdraw-confirm-error' : undefined}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setErrors((x) => ({ ...x, confirmed: undefined }));
              }}
            />
            <span>지워지는 내용을 읽었고, 되돌릴 수 없다는 것을 알아요.</span>
          </label>
          {errors.confirmed && (
            <p id="withdraw-confirm-error" className="field-error">
              <span aria-hidden="true">! </span>
              {errors.confirmed}
            </p>
          )}

          {deleting && (
            <div role="status" className="notice-box">
              <p>계정과 기록을 지우는 중이에요.</p>
              <p>끝날 때까지 이 화면을 닫지 말아 주세요.</p>
              {slow && <p>조금 오래 걸리고 있어요.</p>}
              {backBlocked && <p>지우는 중이라 화면을 닫을 수 없어요.</p>}
            </div>
          )}
          {failure && (
            <div role="alert" className="error">
              <span>{failure.message}</span>
              {failure.note && <span>{failure.note}</span>}
            </div>
          )}

          <button type="button" className="btn-primary" disabled={deleting} onClick={() => navigate('/account')}>
            그대로 두기
          </button>
          <button type="submit" className="btn-secondary" disabled={deleting || locked}>
            {deleting ? '탈퇴하는 중…' : '탈퇴하기'}
          </button>
        </form>
      </main>
    </div>
  );
}
