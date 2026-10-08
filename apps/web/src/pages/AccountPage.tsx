import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { PrivacyLink } from '../components/accountParts';
import { DISCLAIMER } from '../lib/constants';

// 계정 (/account): 로그인한 이메일, 비밀번호 바꾸기, 로그아웃, 회원 탈퇴 진입
// 설계: .company/design/계정-관리-탈퇴.md 3장. 면책 문구는 이 화면에만 둔다(7-1).
export default function AccountPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  // 비밀번호를 바꾸고 돌아왔을 때 한 번만(고정 키만 받는다)
  const passwordChanged = (location.state as { notice?: string } | null)?.notice === 'password';

  return (
    <div>
      <header className="topbar">
        <Link to="/pet" className="btn-link">
          <span aria-hidden="true">← </span>프로필로
        </Link>
      </header>
      <main className="page">
        <h1>계정</h1>
        {passwordChanged && (
          <p role="status" className="ok">
            비밀번호를 바꿨어요.
          </p>
        )}

        <section className="card" aria-labelledby="account-email-label">
          <span id="account-email-label" className="muted small">
            이메일
          </span>
          {user ? (
            <p className="strong email-text">{user.email}</p>
          ) : (
            <p>이메일을 불러오지 못했어요.</p>
          )}
        </section>

        <Link to="/account/password" className="btn-secondary link-button">
          비밀번호 바꾸기 <span aria-hidden="true">&nbsp;›</span>
        </Link>
        <button
          type="button"
          className="btn-secondary block"
          disabled={loggingOut}
          aria-describedby="account-logout-note"
          onClick={() => {
            setLoggingOut(true);
            void logout();
          }}
        >
          {loggingOut ? '로그아웃하는 중…' : '로그아웃'}
        </button>
        <p id="account-logout-note" className="notice">
          로그아웃하면 이 기기로 오던 투약 알림도 멈춰요.
        </p>

        <PrivacyLink />

        <hr className="account-divider" />
        <section aria-labelledby="account-withdraw-title" className="account-withdraw">
          <h2 id="account-withdraw-title">회원 탈퇴</h2>
          <p className="muted">계정과 모든 기록이 지워져요.</p>
          <Link to="/account/delete" className="btn-secondary link-button">
            회원 탈퇴 <span aria-hidden="true">&nbsp;›</span>
          </Link>
        </section>

        <p className="disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
