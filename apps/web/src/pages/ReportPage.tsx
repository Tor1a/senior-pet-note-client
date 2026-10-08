import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ReportSheet from '../components/ReportSheet';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../lib/api';
import { petApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import type { HistoryResponse } from '../lib/petApi';
import { parseReportRange, REPORT_RANGES, reportDays, type ReportRange } from '../lib/reportStats';
import {
  buildReport,
  documentTitle,
  rangeChangedNotice,
  REPORT_TEXT as T,
  type MedicationsState,
} from '../lib/reportText';
import { usePet } from '../pet';

// R1 병원 방문 리포트: 지난 기록과 같은 daily-logs 호출 1번 + 약 목록으로 만든다(신규 API 없음).
// 7/14/30일 전환은 재요청 없이 받은 days 를 자른다. 기간·메모 옵션은 어디에도 저장하지 않는다(매번 14일, 메모 포함).
// 인쇄는 window.print() + styles.css 의 @media print. 앱은 파일을 만들거나 저장하지 않는다.
// 근거: .company/plans/병원-방문-리포트.md, .company/design/병원-방문-리포트.md

export default function ReportPage() {
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const [params, setParams] = useSearchParams();
  const range = parseReportRange(params.get('range'));
  const fromHistory = params.get('from') === 'history';

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [medications, setMedications] = useState<MedicationsState>({ status: 'loading' });
  const [includeMemo, setIncludeMemo] = useState(true);
  const [rangeNotice, setRangeNotice] = useState('');
  const seq = useRef(0);
  const medSeq = useRef(0);

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

  const loadMedications = useCallback(async () => {
    if (!petId) return;
    const mine = ++medSeq.current;
    setMedications({ status: 'loading' });
    try {
      const items = (await petApi.listMedications(petId)) ?? [];
      if (mine === medSeq.current) setMedications({ status: 'ready', items });
    } catch {
      // 약 목록만 실패해도 나머지 리포트는 보여 준다 (화면에는 실패 문구, 종이에는 "담지 않았어요" 사실 문구)
      if (mine === medSeq.current) setMedications({ status: 'error' });
    }
  }, [petId]);

  useEffect(() => {
    void load();
    void loadMedications();
  }, [load, loadMedications]);

  const days = useMemo(() => (history ? reportDays(history.days, range) : []), [history, range]);
  const model = useMemo(
    () =>
      pet && history
        ? buildReport({ pet, recordDate: history.recordDate, days, medications, includeMemo, restWording: 'paper' })
        : null,
    [pet, history, days, medications, includeMemo],
  );

  // 인쇄 창의 "PDF로 저장" 기본 파일명이 되도록 문서 제목을 바꿔 둔다(화면을 떠나면 되돌린다)
  const petName = pet?.name;
  const baseDate = history?.recordDate;
  useEffect(() => {
    if (!petName || !baseDate) return;
    const previous = document.title;
    document.title = documentTitle(petName, baseDate);
    return () => {
      document.title = previous;
    };
  }, [petName, baseDate]);

  const chooseRange = (next: ReportRange) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('range', String(next));
        return p;
      },
      { replace: true },
    );
    if (history) setRangeNotice(rangeChangedNotice(next, reportDays(history.days, next)));
  };
  const onRangeKey = (e: KeyboardEvent<HTMLFieldSetElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const group = e.currentTarget;
    const index = REPORT_RANGES.indexOf(range);
    chooseRange(REPORT_RANGES[(index + step + REPORT_RANGES.length) % REPORT_RANGES.length]);
    requestAnimationFrame(() => {
      group.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    });
  };

  const recorded = model?.recorded ?? 0;
  const printReason = !history
    ? T.printDisabledLoading
    : medications.status === 'loading'
      ? T.printDisabledMedications
      : recorded === 0
        ? T.printDisabledEmpty
        : null;
  const onPrint = () => window.print();

  return (
    <main className="page report-page" aria-busy={loading || undefined}>
      <div className="no-print">
        <Link to={fromHistory ? '/history' : '/today'} className="back-link">
          {fromHistory ? T.backToHistory : T.backToToday}
        </Link>
        <h1>{T.title}</h1>
        <p className="lead">{T.subtitle}</p>
        <button type="button" className="btn-secondary" disabled={printReason !== null} onClick={onPrint}>
          {T.print}
        </button>

        <fieldset className="range-toggle report-range" role="radiogroup" onKeyDown={onRangeKey}>
          <legend>{T.rangeGroup}</legend>
          {REPORT_RANGES.map((r) => (
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

        {loadError && (
          <div role="alert" className="error">
            <p>{history ? `${T.stale} ${loadError}` : loadError}</p>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              {T.retry}
            </button>
          </div>
        )}
        {loading && !history && <p className="muted">{T.loading}</p>}
      </div>

      {model && history && (
        <>
          <div className="no-print report-actions">
            <button
              type="button"
              role="switch"
              aria-checked={includeMemo}
              className={`switch-row${includeMemo ? ' is-on' : ''}`}
              onClick={() => setIncludeMemo((v) => !v)}
            >
              <span>{T.memoSwitch}</span>
              <span className="switch-state">{includeMemo ? '켜짐' : '꺼짐'}</span>
            </button>
            <p className="muted small">{T.memoSwitchHintWeb}</p>
          </div>
          <div className="report-frame">
            <div className="report-frame-body">
          {recorded === 0 ? (
            <section className="card" aria-labelledby="report-empty-title">
              <p className="strong">{model.periodLine}</p>
              <p id="report-empty-title" className="strong">
                {T.emptyTitle}
              </p>
              <p className="muted">{T.emptyBody}</p>
              <Link to="/today" className="btn-primary link-button no-print">
                {T.goToday}
              </Link>
            </section>
          ) : (
            <ReportSheet model={model} days={days} onRetryMedications={() => void loadMedications()} />
          )}
            </div>
            {/* 인쇄에서 쪽마다 바닥글 자리를 비워 둔다(본문과 겹치지 않게) */}
            <div className="report-frame-foot" aria-hidden="true" />
          </div>
        </>
      )}

      <div className="no-print report-actions">
        <button
          type="button"
          className="btn-primary block"
          disabled={printReason !== null}
          aria-describedby={printReason ? 'report-print-reason' : undefined}
          onClick={onPrint}
        >
          {T.print}
        </button>
        {printReason ? (
          <p className="muted" id="report-print-reason">
            {printReason}
          </p>
        ) : (
          <>
            <p className="muted small">{T.printHint}</p>
            <p className="muted small">{T.printHint2}</p>
            <p className="muted small">{T.printPrivacy}</p>
          </>
        )}
        <Link to="/today" className="btn-secondary link-button">
          {T.toToday}
        </Link>
      </div>

      <p className="disclaimer report-disclaimer no-print">{DISCLAIMER}</p>
      <p className="report-print-footer" aria-hidden="true">
        {DISCLAIMER} · {T.appName}
      </p>
    </main>
  );
}
