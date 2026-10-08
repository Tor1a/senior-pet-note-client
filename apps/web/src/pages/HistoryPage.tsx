import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import WeightChart from '../components/WeightChart';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../lib/api';
import { petApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import { formatKg, formatRecordDate } from '../lib/format';
import {
  lastNDays,
  levelCounts,
  medicationTotals,
  recordedDayCount,
  symptomDays,
  waterMlAverage,
  weightPoints,
  type HistoryRange,
} from '../lib/historyStats';
import {
  dayRowSummary,
  HISTORY_TEXT as T,
  levelCountsText,
  medicationText,
  rangeSummary,
  symptomNames,
  symptomNoneText,
  waterMlText,
  weightFactLines,
} from '../lib/historyText';
import type { HistoryResponse } from '../lib/petApi';
import { REPORT_TEXT } from '../lib/reportText';
import { usePet } from '../pet';

// H1 지난 기록: 서버가 준 30일치를 한 번 받아 7일/30일은 화면에서 자른다(재요청 없음).
// 읽기 전용. 기록 날짜는 서버(recordDate)가 정하고, 웹은 계산하지 않는다.

const RANGES: HistoryRange[] = [7, 30];

export default function HistoryPage() {
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<HistoryRange>(30);
  const [tableView, setTableView] = useState(false);
  const [rangeNotice, setRangeNotice] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!petId) return;
    const mine = ++seq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await petApi.getHistory(petId);
      if (mine === seq.current) setHistory(res);
    } catch (err) {
      if (mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      setLoadError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : T.loadFailed);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [petId, reloadPet]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => (history ? lastNDays(history.days, range) : []), [history, range]);

  const chooseRange = (next: HistoryRange) => {
    setRange(next);
    setRangeNotice(`${next}일 보기로 바꿨어요`);
  };
  const onRangeKey = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      chooseRange(range === 7 ? 30 : 7);
      requestAnimationFrame(() => {
        const next = e.currentTarget.querySelector<HTMLButtonElement>('[aria-checked="true"]');
        next?.focus();
      });
    }
  };

  return (
    <main className="page history-page" aria-busy={loading || undefined}>
      <Link to="/today" className="back-link">
        {T.backToToday}
      </Link>
      <h1>{T.title}</h1>
      {pet && <p className="lead">{pet.name}의 최근 {range}일</p>}

      <fieldset className="range-toggle" role="radiogroup" onKeyDown={onRangeKey}>
        <legend>{T.rangeGroup}</legend>
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            tabIndex={range === r ? 0 : -1}
            onClick={() => chooseRange(r)}
          >
            {range === r ? `${r}일 ✓` : `${r}일`}
          </button>
        ))}
      </fieldset>
      <p className="visually-hidden" aria-live="polite">
        {rangeNotice}
      </p>

      <Link to={`/report?range=${range}&from=history`} className="history-link-row">
        <span>{REPORT_TEXT.historyLink}</span>
      </Link>

      {loadError && (
        <div role="alert" className="error">
          <p>{loadError}</p>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            {T.retry}
          </button>
        </div>
      )}

      {loading && !history && <p className="muted">{T.loading}</p>}

      {history && (
        <HistoryBody
          history={history}
          days={days}
          tableView={tableView}
          onToggleTable={() => setTableView((v) => !v)}
        />
      )}

      <p className="disclaimer">{DISCLAIMER}</p>
    </main>
  );
}

function HistoryBody({
  history,
  days,
  tableView,
  onToggleTable,
}: {
  history: HistoryResponse;
  days: HistoryResponse['days'];
  tableView: boolean;
  onToggleTable: () => void;
}) {
  const recorded = recordedDayCount(days);
  const summary = rangeSummary(days);

  if (recorded === 0) {
    return (
      <>
        <p className="muted">{summary}</p>
        <section className="card" aria-labelledby="empty-title">
          <p id="empty-title" className="strong">
            {T.emptyTitle}
          </p>
          <p className="muted">{T.emptyBody}</p>
          <Link to="/today" className="btn-primary link-button">
            {T.goToday}
          </Link>
        </section>
      </>
    );
  }

  const points = weightPoints(days);
  const food = levelCounts(days, 'foodLevel');
  const water = levelCounts(days, 'waterLevel');
  const waterMl = waterMlAverage(days);
  const symptoms = symptomDays(days);
  const noneText = symptomNoneText(days);
  const meds = medicationTotals(days);
  const listDays = [...days].reverse();

  return (
    <>
      <p>{summary}</p>
      {recorded <= 2 && <p className="muted">{T.fewRecords}</p>}

      <section className="section" aria-labelledby="weight-title">
        <div className="row-between">
          <h2 id="weight-title">{T.weightTitle}</h2>
          {points.length > 0 && (
            <button type="button" className="btn-secondary" aria-pressed={tableView} onClick={onToggleTable}>
              {tableView ? T.showGraph : T.showTable}
            </button>
          )}
        </div>
        {weightFactLines(days, history.days).map((line) => (
          <p key={line}>{line}</p>
        ))}
        {points.length === 0 ? (
          <p className="muted">
            {T.weightNone} <Link to="/today">{T.goToday}</Link>
          </p>
        ) : tableView ? (
          <table className="history-table">
            <caption>{T.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">체중</th>
                <th scope="col">증상</th>
              </tr>
            </thead>
            <tbody>
              {listDays.map((d) => (
                <tr key={d.recordDate}>
                  <th scope="row">
                    <Link to={`/history/${d.recordDate}`}>{formatRecordDate(d.recordDate)}</Link>
                  </th>
                  <td>{d.dailyLog?.weightKg != null ? `${formatKg(d.dailyLog.weightKg)}kg` : T.noRecord}</td>
                  <td>
                    {d.dailyLog && d.dailyLog.symptoms.length > 0
                      ? `◆ ${symptomNames(d.dailyLog.symptoms, d.dailyLog.symptomOther)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <WeightChart days={days} />
            {points.length === 1 && <p className="muted">{T.weightOne}</p>}
          </>
        )}
      </section>

      <section className="section" aria-labelledby="meal-title">
        <h2 id="meal-title">{T.mealWaterTitle}</h2>
        <p>식사: {levelCountsText(food)}</p>
        <p>물: {levelCountsText(water)}</p>
        {waterMl && <p>{waterMlText(waterMl)}</p>}
      </section>

      <section className="section" aria-labelledby="symptom-title">
        <h2 id="symptom-title">{T.symptomTitle}</h2>
        {symptoms.length === 0 ? (
          <p className="muted">{T.symptomNoneInPeriod}</p>
        ) : (
          <ul className="day-list">
            {symptoms.map((s) => (
              <li key={s.recordDate}>
                <Link to={`/history/${s.recordDate}`} className="day-row">
                  <span className="day-name">
                    ◆ {formatRecordDate(s.recordDate)} · {symptomNames(s.codes, s.other)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {noneText && <p className="muted">{noneText}</p>}
      </section>

      {meds.scheduled > 0 && (
        <section className="section" aria-labelledby="med-title">
          <h2 id="med-title">{T.medicationTitle}</h2>
          <p className="strong">{medicationText(meds)}</p>
          <p className="muted small">{T.medicationBasis}</p>
        </section>
      )}

      <section className="section" aria-labelledby="days-title">
        <h2 id="days-title">{T.dayListTitle}</h2>
        <ul className="day-list">
          {listDays.map((d) => {
            const isToday = d.recordDate === history.recordDate;
            const empty = !d.dailyLog;
            return (
              <li key={d.recordDate}>
                <Link
                  to={`/history/${d.recordDate}`}
                  className={`day-row${empty ? ' empty' : ''}${isToday ? ' today' : ''}`}
                >
                  <span className="day-name">
                    {formatRecordDate(d.recordDate)}
                    {isToday ? ` · ${T.todayTag}` : ''}
                  </span>
                  <span className="day-sub">{dayRowSummary(d)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
