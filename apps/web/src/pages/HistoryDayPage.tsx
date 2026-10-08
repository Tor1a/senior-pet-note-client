import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../lib/api';
import { petApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import { addDays, formatRecordDate } from '../lib/format';
import { isValidRecordDate } from '../lib/historyStats';
import { dayDetailValues, HISTORY_TEXT as T, medicationText } from '../lib/historyText';
import type { HistoryDay } from '../lib/petApi';
import { usePet } from '../pet';

// H2 하루 상세(읽기 전용): GET daily-logs?from=D&to=D. 새로고침·딥링크에도 안전하다.
// 전날/다음 날은 달력 날짜 문자열만 더하고 뺀다. 다음 날은 서버가 준 오늘(recordDate)까지만.
// 전날에는 하한을 두지 않는다: 서버는 과거 날짜에 하한을 두지 않고(계약서 INVALID_DATE_RANGE 는 형식·from>to·미래뿐)
// 응답의 from 은 요청한 값이라 "조회 가능한 시작일"이 아니다. 오래된 날은 "이 날은 기록이 없어요"로 보인다.

export default function HistoryDayPage() {
  const { recordDate } = useParams();
  if (!isValidRecordDate(recordDate)) return <Navigate to="/history" replace />;
  return <DayView key={recordDate} recordDate={recordDate} />;
}

function DayView({ recordDate }: { recordDate: string }) {
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const [day, setDay] = useState<HistoryDay | null>(null);
  const [serverToday, setServerToday] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!petId) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await petApi.getHistory(petId, { from: recordDate, to: recordDate });
      if (mine !== seq.current) return;
      setDay(res.days[0] ?? null);
      setServerToday(res.recordDate);
    } catch (err) {
      if (mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      if (err instanceof ApiError && err.code === 'INVALID_DATE_RANGE') setError(T.invalidDay);
      else setError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : T.loadFailed);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [petId, recordDate, reloadPet]);

  useEffect(() => {
    void load();
  }, [load]);

  const values = dayDetailValues(day?.dailyLog ?? null);
  const log = day?.dailyLog ?? null;
  const isToday = serverToday !== null && recordDate === serverToday;
  const canNext = serverToday !== null && recordDate < serverToday;
  const med = day?.medication;

  return (
    <main className="page history-page" aria-busy={loading || undefined}>
      <Link to="/history" className="back-link">
        {T.backToHistory}
      </Link>
      <h1>{formatRecordDate(recordDate)}</h1>
      <p className="lead">
        {pet ? `${pet.name} · ` : ''}
        {T.dayReadOnly}
      </p>

      <div className="day-nav">
        <Link to={`/history/${addDays(recordDate, -1)}`} replace className="btn-secondary link-button">
          {T.prevDay}
        </Link>
        {canNext ? (
          <Link to={`/history/${addDays(recordDate, 1)}`} replace className="btn-secondary link-button">
            {T.nextDay}
          </Link>
        ) : (
          <span className="btn-secondary link-button disabled" aria-disabled="true">
            {T.nextDay}
          </span>
        )}
      </div>

      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            {T.retry}
          </button>
        </div>
      )}
      {loading && !day && !error && <p className="muted">{T.loading}</p>}

      {day && (
        <>
          {isToday && (
            <section className="card">
              {/* 이미 기록이 있으면 "기록 중" 안내는 숨기고 버튼만 둔다(기록이 있는데 기록 중이라는 모순 방지) */}
              {!log && <p>{T.dayToday}</p>}
              <Link to="/today" className="btn-primary link-button">
                {T.dayGoToday}
              </Link>
            </section>
          )}
          {values && log ? (
            <section className="card">
              <dl className="detail-list">
                <dt>체중</dt>
                <dd>{values.weight}</dd>
                <dt>식사</dt>
                <dd>{values.food}</dd>
                <dt>물</dt>
                <dd>{values.water}</dd>
                <dt>증상</dt>
                <dd>{values.symptom}</dd>
                {log.memo && (
                  <>
                    <dt>메모</dt>
                    <dd>{log.memo}</dd>
                  </>
                )}
              </dl>
            </section>
          ) : (
            <p className="muted">{T.dayEmpty}</p>
          )}
          {med && med.scheduledCount > 0 && (
            <section className="card">
              <p className="strong">{medicationText({ scheduled: med.scheduledCount, taken: med.takenCount })}</p>
              <p className="muted small">{T.medicationBasis}</p>
            </section>
          )}
        </>
      )}

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}
