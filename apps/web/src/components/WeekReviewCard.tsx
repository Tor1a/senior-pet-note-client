import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../lib/api';
import { petApi } from '../lib/client';
import { HISTORY_TEXT } from '../lib/historyText';
import { weekReviewView, type WeekReviewView } from '../lib/weekReview';
import {
  WEEK_REVIEW_TEXT as T,
  weekMedicationSr,
  weekMedicationText,
  weekRangeSr,
  weekRangeText,
  weekRecordedSr,
  weekRecordedText,
  weekWeightFirst,
  weekWeightLast,
  weekWeightTitle,
  weekWeightValue,
} from '../lib/weekReviewText';

// 오늘 화면 "최근 7일 돌아보기" 접이식 카드. 설계 .company/design/최근-7일-돌아보기-카드.md
// - 기본 접힘. 펼칠 때(그리고 [다시 불러오기] 때)만 getHistory(petId) 를 인자 없이 1회 요청한다. 저장·캐시 없음.
// - 접는 순간 결과를 버리고, 접힌 동안 도착한 응답은 무시한다(다음 펼침을 덮지 않게).
// - 사실 영역(aria-live)은 DOM 에 먼저 있고 내용이 채워질 때 한 번 읽힌다. 오류는 그 밖에 둔다.

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** 보이는 글자는 그대로 두고 낭독만 바꾼다(음성 제어는 보이는 글자로 동작) */
function Line({ text, sr, muted }: { text: string; sr?: string; muted?: boolean }) {
  return (
    <p className={muted ? 'muted' : undefined}>
      {sr ? (
        <>
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{sr}</span>
        </>
      ) : (
        text
      )}
    </p>
  );
}

export default function WeekReviewCard({ petId, onNotFound }: { petId: string; onNotFound: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [view, setView] = useState<WeekReviewView>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setStatus('loading');
    setError('');
    setView(null);
    try {
      const res = await petApi.getHistory(petId);
      if (mine !== seq.current) return;
      setView(weekReviewView(res.days));
      setStatus('ready');
    } catch (err) {
      if (mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        setOpen(false);
        setStatus('idle');
        onNotFound();
        return;
      }
      setError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : HISTORY_TEXT.loadFailed);
      setStatus('error');
    }
  }, [petId, onNotFound]);

  // 화면을 떠나면 늦게 온 응답을 버린다
  useEffect(
    () => () => {
      seq.current += 1;
    },
    [],
  );

  const toggle = () => {
    if (open) {
      seq.current += 1; // 접힘: 진행 중 응답 무효화, 결과 버림
      setOpen(false);
      setStatus('idle');
      setView(null);
      setError('');
    } else {
      setOpen(true);
      void load();
    }
  };

  const retry = () => {
    void load();
    toggleRef.current?.focus(); // 오류 영역이 로딩으로 바뀌며 사라지므로 토글 버튼으로 되돌린다
  };

  return (
    <div className="week-review">
      <button
        ref={toggleRef}
        type="button"
        className="week-review-toggle"
        aria-expanded={open}
        aria-controls="week-review-body"
        onClick={toggle}
      >
        <span>{T.title}</span>
        <span className="week-review-state" aria-hidden="true">
          {open ? T.close : T.open}
        </span>
      </button>
      <div id="week-review-body" className="week-review-body" hidden={!open}>
        <div aria-live="polite" aria-busy={status === 'loading'}>
          {status === 'loading' && <p>{HISTORY_TEXT.loading}</p>}
          {status === 'ready' && <Facts view={view} />}
        </div>
        {status === 'error' && (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <button type="button" className="btn-secondary week-review-retry" onClick={retry}>
              {HISTORY_TEXT.retry}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Facts({ view }: { view: WeekReviewView }) {
  if (!view) return <p>{T.none}</p>;
  const range = <Line muted text={weekRangeText(view.firstDate, view.lastDate)} sr={weekRangeSr(view.firstDate, view.lastDate)} />;
  if (view.kind === 'empty') {
    return (
      <>
        {range}
        <p>{T.none}</p>
      </>
    );
  }
  const { weight, medication } = view;
  return (
    <>
      {range}
      <Line text={weekRecordedText(view.recorded, view.total)} sr={weekRecordedSr(view.recorded, view.total)} />
      {weight && (
        <>
          <Line text={weekWeightTitle(weight.count)} />
          {weight.count >= 2 ? (
            <>
              <Line text={weekWeightFirst(weight.first.weightKg, weight.first.recordDate)} />
              <Line text={weekWeightLast(weight.last.weightKg, weight.last.recordDate)} />
            </>
          ) : (
            <Line text={weekWeightValue(weight.last.weightKg, weight.last.recordDate)} />
          )}
        </>
      )}
      {medication && (
        <>
          <Line
            text={weekMedicationText(medication.taken, medication.scheduled)}
            sr={weekMedicationSr(medication.taken, medication.scheduled)}
          />
          <Line muted text={T.medicationNote} />
        </>
      )}
    </>
  );
}
