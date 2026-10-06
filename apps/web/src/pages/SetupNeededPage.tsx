import { DISCLAIMER } from '../lib/constants';

// API 주소 환경변수가 잘못됐을 때 보여 주는 안내 화면 (앱이 멈추지 않게)
export default function SetupNeededPage({ message }: { message: string }) {
  return (
    <main className="page">
      <h1>환경변수 설정 필요</h1>
      <p>{message}</p>
      <ol className="steps">
        <li>
          <code>web/.env.local</code> 의 <code>VITE_API_BASE_URL</code> 을 확인하세요. (예:{' '}
          <code>http://localhost:8080</code>)
        </li>
        <li>
          개발 서버를 다시 시작하세요 (<code>npm run dev</code>).
        </li>
      </ol>
      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
