import { useAuth } from '../auth';
import { DISCLAIMER } from '../lib/constants';

// 앱 시작 시 서버에 연결하지 못했을 때 보여 주는 안내 화면 (앱이 멈추지 않게)
// onRetry 를 주면 그 동작으로 다시 시도한다(예: 반려동물 정보 다시 읽기). 없으면 세션을 다시 확인한다.
export default function ServerDownPage({ onRetry }: { onRetry?: () => void } = {}) {
  const { retry, logout } = useAuth();
  return (
    <main className="page" role="alert">
      <h1>서버에 연결할 수 없어요</h1>
      <p>인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요.</p>
      <div className="card">
        <button type="button" className="btn-primary" onClick={onRetry ?? retry}>
          다시 시도
        </button>
        <button type="button" className="btn-secondary" onClick={logout}>
          로그인 화면으로
        </button>
      </div>
      <p className="muted small">
        개발 중이라면 백엔드 서버가 켜져 있는지 확인해 주세요. (README 의 실행 순서 참고)
      </p>
      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
