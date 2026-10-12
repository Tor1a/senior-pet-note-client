import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { DELETE_GUIDE_TEXT as T, resolveDeleteGuide, SERVICE_NAME, type DeleteGuideConfig } from '../lib/deleteGuide';

// 로그인 없이 보는 계정 삭제 안내 (/delete-account). Google Play 의 "앱 밖 삭제 요청 링크"로 쓸 수 있다.
// 공개 라우트: 로그인 가드 밖이고, 로그아웃 상태에서도 열린다. 로그인해 있으면 계정 삭제 화면으로 가는 링크를 더 보여 준다.
// 환경변수가 비어 있는 줄(운영자명·이메일·처리방침·보관 안내)은 통째로 숨긴다. 면책 문구는 두지 않는다.
export default function DeleteAccountGuidePage({ config }: { config?: DeleteGuideConfig }) {
  const { status } = useAuth();
  const guide = config ?? resolveDeleteGuide(import.meta.env);

  return (
    <main className="page">
      <h1>{T.title}</h1>
      <p className="strong">{SERVICE_NAME}</p>
      {guide.operatorName && (
        <p>
          {T.operatorLabel}: {guide.operatorName}
        </p>
      )}
      <p className="lead">{T.intro}</p>

      <section className="card scope-card" aria-labelledby="guide-data-title">
        <h2 id="guide-data-title">{T.dataTitle}</h2>
        <ul className="scope-list">
          {T.dataItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="strong">{T.dataNote2}</p>
      </section>

      <section className="card" aria-labelledby="guide-how-title">
        <h2 id="guide-how-title">{T.howTitle}</h2>
        <ol className="scope-list">
          {T.howSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {status === 'signedIn' && (
          <p>
            {T.howLoggedIn}{' '}
            <Link to="/account/delete" className="btn-link">
              {T.howLoggedInLink}
            </Link>
          </p>
        )}
        {guide.supportEmail && (
          <p>
            {T.howEmailBefore}
            <a href={`mailto:${guide.supportEmail}`}>{guide.supportEmail}</a>
            {T.howEmailAfter}
            {guide.deleteRequestNote && <> {guide.deleteRequestNote}</>}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="guide-period-title">
        <h2 id="guide-period-title">{T.periodTitle}</h2>
        <p>{T.periodBody}</p>
        {guide.retentionNote && <p>{guide.retentionNote}</p>}
      </section>

      {guide.privacyUrl && (
        <p className="privacy-row">
          <a href={guide.privacyUrl} target="_blank" rel="noopener noreferrer" className="btn-link privacy-link">
            {T.privacyLinkLabel} <span aria-hidden="true">↗</span>
            <span className="sr-only"> 새 창에서 열려요</span>
          </a>
        </p>
      )}
    </main>
  );
}
