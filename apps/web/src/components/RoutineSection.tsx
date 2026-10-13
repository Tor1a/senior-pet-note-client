import { useEffect, useRef, useState } from 'react';
import {
  isStepDisabled,
  ROUTINE_MAX,
  stepRoutine,
  type RoutineItem,
  type RoutineState,
  type RoutineStep,
  type RoutineValue,
} from '../lib/routineForm';
import {
  ROUTINE_TEXT as T,
  routineButtonLabel,
  routineLiveText,
  routineSummaryOf,
  routineToggleLabel,
  routineValueText,
} from '../lib/routineText';

// 산책·배변 기록 (선택): 접힌 행 1줄. 설계 .company/design/루틴-기록-칩.md 3·9장
// - 별도 저장 없음(화면 아래 기존 [저장] 하나). 값은 상위 폼 상태에 있어 접어도 유지된다.
// - 비활성 모양은 disabled 가 아니라 aria-disabled(눌러도 변화 없음) → 포커스가 body 로 떨어지지 않는다.
// - 값 변경 낭독은 마지막 입력 후 0.5초 모아 한 번만(숨김 role="status" 1개).

const LIVE_DELAY_MS = 500;
const ITEMS: { item: RoutineItem; label: string }[] = [
  { item: 'walk', label: T.walk },
  { item: 'poop', label: T.poop },
];

export default function RoutineSection({
  routine,
  open,
  onToggle,
  onChange,
  dirty,
  saveFailed,
  saving,
}: {
  routine: RoutineState;
  open: boolean;
  onToggle: () => void;
  onChange: (next: RoutineState) => void;
  /** 저장 기준값과 다른가 */
  dirty: boolean;
  /** 직전 저장이 실패했나(값은 화면에 그대로 있다) */
  saveFailed: boolean;
  saving: boolean;
}) {
  const [live, setLive] = useState('');
  const liveTimer = useRef<number | null>(null);
  const plusRefs = useRef<Record<RoutineItem, HTMLButtonElement | null>>({ walk: null, poop: null });

  useEffect(
    () => () => {
      if (liveTimer.current != null) window.clearTimeout(liveTimer.current);
    },
    [],
  );

  const announce = (item: RoutineItem, value: RoutineValue) => {
    if (liveTimer.current != null) window.clearTimeout(liveTimer.current);
    liveTimer.current = window.setTimeout(() => setLive(routineLiveText(item, value)), LIVE_DELAY_MS);
  };

  const apply = (item: RoutineItem, step: RoutineStep) => {
    if (saving) return;
    const current = routine[item];
    if (isStepDisabled(current, step)) return;
    const value = stepRoutine(current, step);
    onChange({ ...routine, [item]: value });
    announce(item, value);
    // [지우기]가 비활성이 되므로 같은 항목의 [+] 로 포커스를 옮긴다
    if (step === 'clear') plusRefs.current[item]?.focus();
  };

  const summary = routineSummaryOf(routine);

  return (
    <section className="section routine" aria-labelledby="routine-title">
      <h2 id="routine-title">
        <button
          type="button"
          className="routine-toggle"
          aria-expanded={open}
          aria-controls="routine-body"
          onClick={onToggle}
        >
          <span className="routine-toggle-head">
            <span>{T.title}</span>
            <span aria-hidden="true">
              {open ? T.close : T.open} {open ? '▾' : '▸'}
            </span>
          </span>
          {!open && (summary || dirty) && (
            <span className="routine-summary">
              {summary && <span>{summary}</span>}
              {dirty && <span className="routine-chip">{T.dirtyChip}</span>}
            </span>
          )}
        </button>
      </h2>
      <span className="sr-only" role="status" aria-live="polite">
        {live}
      </span>
      <div id="routine-body" role="group" aria-label={routineToggleLabel(null, false)} hidden={!open} className="routine-body">
        <p className="muted">{T.help}</p>
        {ITEMS.map(({ item, label }) => {
          const value = routine[item];
          const valueId = `routine-${item}-value`;
          return (
            <div key={item} className="routine-item">
              <p className="routine-label">{label}</p>
              <div className="routine-controls">
                <button
                  type="button"
                  className="routine-step"
                  aria-label={routineButtonLabel(item, 'minus')}
                  aria-describedby={valueId}
                  aria-disabled={saving || isStepDisabled(value, 'minus') || undefined}
                  onClick={() => apply(item, 'minus')}
                >
                  {T.minus}
                </button>
                <span id={valueId} className={`routine-value ${value == null ? 'is-none' : 'is-set'}`}>
                  {routineValueText(value)}
                </span>
                <button
                  type="button"
                  className="routine-step"
                  ref={(el) => {
                    plusRefs.current[item] = el;
                  }}
                  aria-label={routineButtonLabel(item, 'plus')}
                  aria-describedby={value === ROUTINE_MAX ? `${valueId} routine-${item}-limit` : valueId}
                  aria-disabled={saving || isStepDisabled(value, 'plus') || undefined}
                  onClick={() => apply(item, 'plus')}
                >
                  {T.plus}
                </button>
                <button
                  type="button"
                  className="btn-secondary routine-clear"
                  aria-label={routineButtonLabel(item, 'clear')}
                  aria-describedby={valueId}
                  aria-disabled={saving || isStepDisabled(value, 'clear') || undefined}
                  onClick={() => apply(item, 'clear')}
                >
                  {T.clear}
                </button>
              </div>
              {value === ROUTINE_MAX && (
                <p id={`routine-${item}-limit`} className="muted small">
                  {T.limitReached}
                </p>
              )}
            </div>
          );
        })}
        {dirty && (
          <p className="routine-dirty">
            <span className="routine-chip">{T.dirtyChip}</span> {saveFailed ? T.dirtyFailed : T.dirtyNote}
          </p>
        )}
      </div>
    </section>
  );
}
