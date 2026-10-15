import type { FormEvent, KeyboardEvent } from 'react';
import type { VisitQuestion } from '../lib/visitQuestionApi';
import { visitQuestionLength } from '../lib/visitQuestionForm';
import {
  doneLabel,
  editLabel,
  removeLabel,
  saveEditLabel,
  undoLabel,
  VISIT_QUESTION_COUNT_MAX,
  VISIT_QUESTION_TEXT as T,
} from '../lib/visitQuestionText';
import { countText } from '../lib/todoText';
import ConfirmCard from './ConfirmCard';

// 진료 때 물어볼 것 한 줄 (설계 6-2): 남은 줄 / 접힌 줄(방금 체크) / 물어본 줄 / 고치는 줄 / 지우기 확인 줄.
// 사용자 글은 가공·검열·말줄임 없이 그대로 보여 준다(.vq-text). 체크 상태는 ✓ + 글자 `물어봤어요`로 알린다(색에 의존하지 않음).
// 이 부품은 표시만 한다. 서버 호출과 상태는 VisitQuestionsPage 가 가진다.

export type VisitQuestionRowMode = 'open' | 'collapsed' | 'done';
export type VisitQuestionBusy = 'done' | 'undo' | 'save' | 'remove';

export interface VisitQuestionRowProps {
  q: VisitQuestion;
  mode: VisitQuestionRowMode;
  busy: VisitQuestionBusy | null;
  /** 줄 안 오류(체크·되돌리기 실패) */
  error: string | null;
  /** null 이 아니면 고치는 중 */
  editDraft: string | null;
  /** 고치기 입력의 오류 문구(비어 있음·100자 초과·저장 실패) */
  editError: string | null;
  confirmingRemove: boolean;
  onDone: () => void;
  onUndo: () => void;
  onEditStart: () => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onRemoveAsk: () => void;
  onRemoveYes: () => void;
  onRemoveNo: () => void;
}

export default function VisitQuestionRow(p: VisitQuestionRowProps) {
  const { q, mode, busy } = p;
  const key = (kind: string) => `${q.id}:${kind}`;

  if (p.confirmingRemove) {
    return (
      <li className="vq-item">
        <div className="card tight vq-card">
          <p className="vq-text">{q.text}</p>
          <ConfirmCard
            title={T.removeTitle}
            primaryLabel={T.removeNo}
            onPrimary={p.onRemoveNo}
            secondaryLabel={busy === 'remove' ? T.removing : T.removeYes}
            onSecondary={p.onRemoveYes}
            disabled={busy === 'remove'}
          >
            <p>{T.removeBody}</p>
            {p.error && <p role="alert">{p.error}</p>}
          </ConfirmCard>
        </div>
      </li>
    );
  }

  if (p.editDraft !== null) {
    const inputId = `vq-edit-${q.id}`;
    const errorId = `vq-edit-error-${q.id}`;
    const onSubmit = (e: FormEvent) => {
      e.preventDefault();
      p.onEditSave();
    };
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        p.onEditCancel();
      }
    };
    return (
      <li className="vq-item">
        <form className="card tight vq-card" onSubmit={onSubmit} aria-label={saveEditLabel(q.text)}>
          <label htmlFor={inputId}>{T.fieldLabel}</label>
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            className="vq-input"
            value={p.editDraft}
            aria-invalid={p.editError ? true : undefined}
            aria-describedby={p.editError ? errorId : undefined}
            data-vq-focus={key('input')}
            onChange={(e) => p.onEditChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="vq-count-line">
            <span className="muted">{T.fieldHelp}</span>
            <span className="count">{countText(visitQuestionLength(p.editDraft), VISIT_QUESTION_COUNT_MAX)}</span>
          </div>
          {p.editError && (
            <p role="alert" id={errorId} className="field-error">
              {p.editError}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={busy === 'save'} aria-label={saveEditLabel(q.text)}>
            {busy === 'save' ? T.adding : T.editSave}
          </button>
          <button type="button" className="btn-secondary" disabled={busy === 'save'} onClick={p.onEditCancel}>
            {T.editCancel}
          </button>
        </form>
      </li>
    );
  }

  if (mode === 'collapsed') {
    return (
      <li className="vq-item">
        <div className="todo-collapsed vq-collapsed">
          <p className="vq-text">
            <span aria-hidden="true">✓ </span>
            {q.text}
            <span> · {T.doneState}</span>
          </p>
          <button
            type="button"
            className="btn-secondary"
            aria-label={undoLabel(q.text)}
            disabled={busy === 'undo'}
            data-vq-focus={key('undo')}
            onClick={p.onUndo}
          >
            {busy === 'undo' ? T.undoing : T.undo}
          </button>
          {p.error && (
            <p role="alert" className="error">
              {p.error}
            </p>
          )}
        </div>
      </li>
    );
  }

  if (mode === 'done') {
    return (
      <li className="vq-item">
        <div className="card tight vq-card">
          <p className="vq-text">
            <span aria-hidden="true">✓ </span>
            {q.text}
          </p>
          <p className="muted">{T.doneState}</p>
          {p.error && (
            <p role="alert" className="error">
              {p.error}
            </p>
          )}
          <div className="vq-actions">
            <button
              type="button"
              className="btn-secondary"
              aria-label={undoLabel(q.text)}
              disabled={busy === 'undo'}
              data-vq-focus={key('undo')}
              onClick={p.onUndo}
            >
              {busy === 'undo' ? T.undoing : T.undo}
            </button>
            <button
              type="button"
              className="btn-secondary"
              aria-label={removeLabel(q.text)}
              disabled={busy === 'undo'}
              data-vq-focus={key('remove')}
              onClick={p.onRemoveAsk}
            >
              {T.remove}
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="vq-item">
      <div className="card tight vq-card">
        <p className="vq-text">{q.text}</p>
        {p.error && (
          <p role="alert" className="error">
            {p.error}
          </p>
        )}
        <button
          type="button"
          className="btn-primary"
          aria-label={doneLabel(q.text)}
          disabled={busy === 'done'}
          data-vq-focus={key('done')}
          onClick={p.onDone}
        >
          {busy === 'done' ? T.adding : T.done}
        </button>
        <div className="vq-actions">
          <button
            type="button"
            className="btn-secondary"
            aria-label={editLabel(q.text)}
            disabled={busy === 'done'}
            data-vq-focus={key('edit')}
            onClick={p.onEditStart}
          >
            {T.edit}
          </button>
          <button
            type="button"
            className="btn-secondary"
            aria-label={removeLabel(q.text)}
            disabled={busy === 'done'}
            data-vq-focus={key('remove')}
            onClick={p.onRemoveAsk}
          >
            {T.remove}
          </button>
        </div>
      </div>
    </li>
  );
}
