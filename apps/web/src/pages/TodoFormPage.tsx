import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ConfirmCard from '../components/ConfirmCard';
import { ApiError, toUserMessage } from '../lib/api';
import { todoApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import type { Todo } from '../lib/todoApi';
import {
  draftFromTodo,
  EMPTY_TODO_DRAFT,
  isTodoDraftDirty,
  TODO_HOSPITAL_NOTE_MAX,
  TODO_MEMO_MAX,
  TODO_TITLE_MAX,
  codePointLength,
  toTodoInput,
  validateTodoDraft,
  type TodoDraft,
  type TodoField,
  type TodoProblem,
} from '../lib/todoForm';
import { countText, remindInfoText, TODO_TEXT } from '../lib/todoText';
import { usePet } from '../pet';
import { usePush, type PushDeviceState } from '../push/PushProvider';

// 할 일 추가(/todos/new)·보기·고치기(/todos/:id) — 기획서 6-1
// 제목(필수 40자), 날짜(필수·기본값 없음), 시각(선택), 일정 메모(200자), 알림 받기(기본 켬). 수정 화면에는 병원 메모(500자)·완료/완료 취소·지우기가 더해진다.
// 단일 조회 API 가 없어 예정 목록 → 완료 목록 순으로 찾는다. 날짜·시각 계산은 하지 않는다(서버가 판단).
// 제목 예시 글자나 추천 버튼은 두지 않는다(기획서 Q6). 알림 권한은 [알림 허용하기] 버튼에서만 묻는다.

export default function TodoFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const { pet, reload: reloadPet } = usePet();
  const navigate = useNavigate();
  const push = usePush();

  const [draft, setDraft] = useState<TodoDraft | null>(editing ? null : { ...EMPTY_TODO_DRAFT });
  const [base, setBase] = useState<TodoDraft>({ ...EMPTY_TODO_DRAFT });
  const [todo, setTodo] = useState<Todo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [problem, setProblem] = useState<TodoProblem | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const fieldRefs = useRef<Partial<Record<TodoField, HTMLElement | null>>>({});
  const submitting = useRef(false);

  const dirty = !!draft && isTodoDraftDirty(draft, base);

  // 저장하지 않은 입력이 있는 채로 새로고침·탭 닫기를 하면 브라우저 기본 경고만 띄운다
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const goList = useCallback(
    (state?: { notice: string }) => navigate('/todos', { replace: true, state }),
    [navigate],
  );

  const load = useCallback(async () => {
    if (!pet || !id) return;
    setLoadError(null);
    try {
      // 단일 조회 API 가 없다 → 예정 목록에서 먼저, 없으면 완료 목록에서 찾는다
      let found = (await todoApi.listTodos(pet.id, 'open'))?.todos?.find((t) => t.id === id) ?? null;
      if (!found) found = (await todoApi.listTodos(pet.id, 'done'))?.todos?.find((t) => t.id === id) ?? null;
      if (!found) {
        goList({ notice: TODO_TEXT.gone });
        return;
      }
      setTodo(found);
      const d = draftFromTodo(found);
      setDraft(d);
      setBase(d);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      setLoadError(toUserMessage(err, 'todo'));
    }
  }, [pet, id, goList, reloadPet]);

  useEffect(() => {
    if (editing) void load();
  }, [editing, load]);

  function change(patch: Partial<TodoDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setSaveError(null);
    // 입력을 시작하면 그 칸 오류를 지운다
    const field = (Object.keys(patch)[0] ?? '') as TodoField;
    if (problem && problem.field === field) setProblem(null);
  }

  function leave(to: string) {
    if (dirty) setLeaveTo(to);
    else navigate(to);
  }

  function handleFailure(err: unknown) {
    if (err instanceof ApiError && err.status === 404) {
      goList({ notice: TODO_TEXT.gone });
      return;
    }
    setSaveError(toUserMessage(err, 'todo'));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft || !pet || saving || submitting.current) return;
    setNotice(null);
    const p = validateTodoDraft(draft);
    setProblem(p);
    setSaveError(null);
    if (p) {
      fieldRefs.current[p.field]?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const input = toTodoInput(draft);
      if (editing && id) await todoApi.updateTodo(id, input);
      else await todoApi.createTodo(pet.id, input);
      // 저장 성공 뒤에는 이탈 확인 없이 목록으로
      setBase(draft);
      goList({ notice: editing ? TODO_TEXT.updated : TODO_TEXT.created });
    } catch (err) {
      handleFailure(err);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  /** 완료/완료 취소: 저장된 값에 바로 적용하고, 폼에 고치던 내용은 그대로 둔다 */
  async function toggleCompleted() {
    if (!todo || toggling) return;
    setToggling(true);
    setSaveError(null);
    try {
      const res = await todoApi.setTodoCompleted(todo.id, !todo.completed);
      if (res) setTodo(res);
      setNotice(todo.completed ? TODO_TEXT.undoneNotice : TODO_TEXT.completedNotice);
    } catch (err) {
      handleFailure(err);
    } finally {
      setToggling(false);
    }
  }

  async function remove() {
    if (!todo || deleting) return;
    setDeleting(true);
    try {
      await todoApi.deleteTodo(todo.id);
      setBase(draft ?? base);
      goList({ notice: TODO_TEXT.deleted });
    } catch (err) {
      setConfirmDelete(false);
      handleFailure(err);
    } finally {
      setDeleting(false);
    }
  }

  const title = editing ? TODO_TEXT.formTitleEdit : TODO_TEXT.formTitleNew;
  const errorFor = (field: TodoField) => (problem?.field === field ? problem.message : null);
  const ref = (field: TodoField) => (el: HTMLElement | null) => {
    fieldRefs.current[field] = el;
  };

  return (
    <div className="todo-page">
      <header className="topbar">
        <button type="button" className="btn-link" onClick={() => leave('/todos')}>
          {TODO_TEXT.backToList}
        </button>
      </header>
      <main className="page">
        <h1>{title}</h1>
        <p className="lead">{TODO_TEXT.guide}</p>

        {leaveTo && (
          <ConfirmCard
            title={TODO_TEXT.leaveTitle}
            primaryLabel={TODO_TEXT.leaveStay}
            onPrimary={() => setLeaveTo(null)}
            secondaryLabel={TODO_TEXT.leaveGo}
            onSecondary={() => navigate(leaveTo)}
            scrollIntoView
          >
            <p>{TODO_TEXT.leaveBody}</p>
          </ConfirmCard>
        )}

        {loadError && (
          <div role="alert" className="error">
            <p>{loadError}</p>
            <button type="button" className="btn-secondary" onClick={() => void load()}>
              {TODO_TEXT.retry}
            </button>
          </div>
        )}
        {!draft && !loadError && <p aria-busy="true">{TODO_TEXT.loading}</p>}

        {notice && (
          <div role="status" className="ok">
            <p>{notice}</p>
          </div>
        )}

        {draft && (
          <form className="card" onSubmit={onSubmit} noValidate aria-label={title}>
            {problem && (
              <p role="alert" className="error">
                {TODO_TEXT.summaryProblem}
              </p>
            )}

            <label htmlFor="todo-title">{TODO_TEXT.fieldTitle}</label>
            <input
              id="todo-title"
              ref={ref('title')}
              value={draft.title}
              aria-invalid={errorFor('title') ? true : undefined}
              aria-describedby={errorFor('title') ? 'todo-title-error todo-title-count' : 'todo-title-count'}
              disabled={saving}
              onChange={(e) => change({ title: e.target.value })}
            />
            <p id="todo-title-count" className="muted small align-end">
              {countText(codePointLength(draft.title.trim()), TODO_TITLE_MAX)}
            </p>
            {errorFor('title') && (
              <p id="todo-title-error" className="field-error">
                {errorFor('title')}
              </p>
            )}

            <label htmlFor="todo-date">{TODO_TEXT.fieldDate}</label>
            <input
              id="todo-date"
              type="date"
              ref={ref('dueDate')}
              value={draft.dueDate}
              aria-invalid={errorFor('dueDate') ? true : undefined}
              aria-describedby={errorFor('dueDate') ? 'todo-date-error' : editing ? 'todo-date-note' : undefined}
              disabled={saving}
              onChange={(e) => change({ dueDate: e.target.value })}
            />
            {editing && (
              <p id="todo-date-note" className="muted small">
                {TODO_TEXT.dateEditNote}
              </p>
            )}
            {errorFor('dueDate') && (
              <p id="todo-date-error" className="field-error">
                {errorFor('dueDate')}
              </p>
            )}

            <label htmlFor="todo-time">{TODO_TEXT.fieldTime}</label>
            <div className="row">
              <input
                id="todo-time"
                type="time"
                ref={ref('dueTime')}
                value={draft.dueTime}
                aria-invalid={errorFor('dueTime') ? true : undefined}
                aria-describedby={errorFor('dueTime') ? 'todo-time-error' : undefined}
                disabled={saving}
                onChange={(e) => change({ dueTime: e.target.value })}
              />
              {draft.dueTime && (
                <button type="button" className="btn-link" disabled={saving} onClick={() => change({ dueTime: '' })}>
                  {TODO_TEXT.fieldTimeClear}
                </button>
              )}
            </div>
            {errorFor('dueTime') && (
              <p id="todo-time-error" className="field-error">
                {errorFor('dueTime')}
              </p>
            )}

            <label htmlFor="todo-memo">{TODO_TEXT.fieldMemo}</label>
            <textarea
              id="todo-memo"
              ref={ref('memo')}
              rows={3}
              value={draft.memo}
              aria-invalid={errorFor('memo') ? true : undefined}
              aria-describedby="todo-memo-help todo-memo-count"
              disabled={saving}
              onChange={(e) => change({ memo: e.target.value })}
            />
            <p id="todo-memo-help" className="muted small">
              {TODO_TEXT.fieldMemoHelp}
            </p>
            <p id="todo-memo-count" className="muted small align-end">
              {countText(codePointLength(draft.memo.trim()), TODO_MEMO_MAX)}
            </p>
            {errorFor('memo') && <p className="field-error">{errorFor('memo')}</p>}

            <fieldset className="plain">
              <legend>{TODO_TEXT.fieldRemind}</legend>
              <button
                type="button"
                role="switch"
                aria-checked={draft.remind}
                className={draft.remind ? 'switch-row is-on' : 'switch-row'}
                disabled={saving}
                onClick={() => change({ remind: !draft.remind })}
              >
                <span className="strong">{TODO_TEXT.fieldRemind}</span>
                <span className="switch-state">{draft.remind ? TODO_TEXT.switchOn : TODO_TEXT.switchOff}</span>
              </button>
              <div className="summary-box" aria-live="polite">
                <p>{draft.remind ? remindInfoText() : TODO_TEXT.remindOffInfo}</p>
                {draft.remind && <p className="muted small">{TODO_TEXT.remindSkipNote}</p>}
              </div>
              {draft.remind && (
                <DeviceLine
                  state={push.state}
                  isMobile={push.isMobile}
                  onAllow={() => {
                    // 버튼 클릭 처리 안에서 바로 권한 창을 띄운다
                    void push.requestPermission().then((s) => {
                      if (s === 'registered') setNotice(TODO_TEXT.devicePermAsked);
                    });
                  }}
                  onRetry={() => void push.recheck()}
                />
              )}
            </fieldset>

            {editing && (
              <>
                <label htmlFor="todo-hospital-note">{TODO_TEXT.fieldHospitalNote}</label>
                <textarea
                  id="todo-hospital-note"
                  ref={ref('hospitalNote')}
                  rows={5}
                  value={draft.hospitalNote}
                  aria-invalid={errorFor('hospitalNote') ? true : undefined}
                  aria-describedby="todo-hospital-note-help todo-hospital-note-count"
                  disabled={saving}
                  onChange={(e) => change({ hospitalNote: e.target.value })}
                />
                <p id="todo-hospital-note-help" className="muted small">
                  {TODO_TEXT.fieldHospitalNoteHelp}
                </p>
                <p id="todo-hospital-note-count" className="muted small align-end">
                  {countText(codePointLength(draft.hospitalNote.trim()), TODO_HOSPITAL_NOTE_MAX)}
                </p>
                {errorFor('hospitalNote') && <p className="field-error">{errorFor('hospitalNote')}</p>}
              </>
            )}

            <button type="submit" className="btn-primary" disabled={saving || deleting}>
              {saving ? TODO_TEXT.saving : editing ? TODO_TEXT.saveEdit : TODO_TEXT.saveNew}
            </button>

            {saveError && (
              <div role="alert" className="error">
                <p>{saveError}</p>
                <p>{TODO_TEXT.keptInput}</p>
              </div>
            )}
          </form>
        )}

        {draft && editing && todo && (
          <section className="card" aria-label={TODO_TEXT.stateSection}>
            <p className="muted">
              {todo.completed ? TODO_TEXT.stateDone : TODO_TEXT.stateOpen}
            </p>
            <button
              type="button"
              className={todo.completed ? 'btn-secondary' : 'btn-primary'}
              disabled={toggling || saving}
              onClick={() => void toggleCompleted()}
            >
              {toggling ? TODO_TEXT.completing : todo.completed ? TODO_TEXT.formCancelDone : TODO_TEXT.formComplete}
            </button>
            {confirmDelete ? (
              <ConfirmCard
                title={TODO_TEXT.deleteTitle}
                primaryLabel={TODO_TEXT.deleteNo}
                onPrimary={() => setConfirmDelete(false)}
                secondaryLabel={deleting ? TODO_TEXT.deleting : TODO_TEXT.deleteYes}
                onSecondary={() => void remove()}
                disabled={deleting}
                scrollIntoView
              >
                <p>{TODO_TEXT.deleteBody}</p>
              </ConfirmCard>
            ) : (
              <button type="button" className="btn-link align-start" onClick={() => setConfirmDelete(true)}>
                {TODO_TEXT.deleteButton}
              </button>
            )}
          </section>
        )}

        <Link
          to="/todos"
          className="btn-secondary block link-button"
          onClick={(e) => {
            if (dirty) {
              e.preventDefault();
              setLeaveTo('/todos');
            }
          }}
        >
          {TODO_TEXT.backToList.replace('← ', '')}
        </Link>
        <p className="disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}

/** 이 기기의 알림 상태 한 줄 (허용됨이면 사실만, 아니면 사실 + 필요한 버튼). 권한 요청은 버튼에서만 */
function DeviceLine({
  state,
  isMobile,
  onAllow,
  onRetry,
}: {
  state: PushDeviceState;
  isMobile: boolean;
  onAllow: () => void;
  onRetry: () => void;
}) {
  const T = TODO_TEXT;
  let text: string;
  let action: { label: string; run: () => void } | null = null;
  switch (state) {
    case 'registered':
    case 'registering':
      text = T.deviceRegistered;
      break;
    case 'checking':
      text = T.deviceChecking;
      break;
    case 'default':
      text = T.deviceDefault;
      action = { label: T.deviceAllow, run: onAllow };
      break;
    case 'denied':
      text = T.deviceDenied;
      break;
    case 'ios-browser':
      text = T.deviceIosBrowser;
      break;
    case 'ios-outdated':
      text = T.deviceIosOutdated;
      break;
    case 'unsupported':
      text = T.deviceUnsupported;
      break;
    case 'error':
      text = T.deviceError;
      action = { label: T.deviceRetry, run: onRetry };
      break;
    default:
      text = T.deviceUnavailable;
  }
  const good = state === 'registered' || state === 'registering';
  return (
    <div className={good ? 'device-line' : 'error device-card'}>
      <p>{text}</p>
      {good && !isMobile && <p className="muted small">{T.deviceDesktop}</p>}
      {action && (
        <button type="button" className="btn-secondary" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
