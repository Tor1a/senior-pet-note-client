import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ApiError, toUserMessage } from '../lib/api';
import { todoApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import type { Todo, TodoListResponse, TodoStatus } from '../lib/todoApi';
import { groupByDateStatus, removeTodo, replaceTodo } from '../lib/todoList';
import {
  cancelDoneLabel,
  completeLabel,
  dateTimeLine,
  groupTitle,
  openLabel,
  remindLine,
  TODO_TEXT,
  undoLabel,
} from '../lib/todoText';
import { VISIT_QUESTION_TEXT } from '../lib/visitQuestionText';
import { usePet } from '../pet';

// 내 할 일 목록 (/todos, 알림을 눌러 열면 ?source=push) — 기획서 6-1
// 탭 [예정] [완료]. 예정은 서버가 계산한 dateStatus 로 묶는다(지난 일정/오늘/내일/그 이후). 날짜 계산은 하지 않는다.
// 완료 체크는 줄이 제자리에서 접히고 [되돌리기]가 남는다(저장 되돌리기 U1 방식). 완료 탭에서는 [완료 취소].
// 지난 일정도 색·문구로 재촉하지 않는다(사실만).

type Tab = TodoStatus;

export default function TodosPage() {
  const { pet, reload: reloadPet } = usePet();
  const [params] = useSearchParams();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>('open');
  const [lists, setLists] = useState<Record<Tab, TodoListResponse | null>>({ open: null, done: null });
  const [loading, setLoading] = useState<Tab | null>('open');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    const fromState = (location.state as { notice?: string } | null)?.notice;
    if (fromState) return fromState;
    return params.get('source') === 'push' ? TODO_TEXT.openedFromPush : null;
  });
  /** 이 화면에서 방금 완료로 체크한 줄(제자리에서 접힌 줄). 목록을 새로 불러오면 비운다 */
  const [collapsed, setCollapsed] = useState<Record<string, Todo>>({});
  const [busy, setBusy] = useState<Record<string, 'complete' | 'undo'>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const busyRef = useRef(new Set<string>());

  const load = useCallback(
    async (which: Tab) => {
      if (!pet) return;
      setLoading(which);
      setLoadError(null);
      try {
        const res = await todoApi.listTodos(pet.id, which);
        setLists((l) => ({ ...l, [which]: { recordDate: res?.recordDate ?? '', todos: res?.todos ?? [] } }));
        if (which === 'open') setCollapsed({});
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // 반려동물이 없어졌다 → 다시 읽는다
          void reloadPet();
          return;
        }
        setLoadError(toUserMessage(err, 'todo'));
      } finally {
        setLoading((cur) => (cur === which ? null : cur));
      }
    },
    [pet, reloadPet],
  );

  useEffect(() => {
    void load('open');
  }, [load]);

  function chooseTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setLoadError(null);
    void load(next);
  }

  function setRowBusy(id: string, kind: 'complete' | 'undo' | null) {
    if (kind) busyRef.current.add(id);
    else busyRef.current.delete(id);
    setBusy((b) => {
      const next = { ...b };
      if (kind) next[id] = kind;
      else delete next[id];
      return next;
    });
  }

  function failRow(id: string, base: string, err: unknown) {
    if (err instanceof ApiError && err.status === 404) {
      setNotice(TODO_TEXT.gone);
      void load(tab);
      return;
    }
    setRowErrors((e) => ({ ...e, [id]: `${base} ${toUserMessage(err, 'todo')} ${TODO_TEXT.errorRetryHint}` }));
  }

  async function complete(todo: Todo) {
    if (busyRef.current.has(todo.id)) return;
    setRowBusy(todo.id, 'complete');
    setRowErrors((e) => withoutKey(e, todo.id));
    try {
      const res = await todoApi.setTodoCompleted(todo.id, true);
      setCollapsed((c) => ({ ...c, [todo.id]: res ?? { ...todo, completed: true } }));
      setNotice(TODO_TEXT.completedNotice);
    } catch (err) {
      failRow(todo.id, TODO_TEXT.errorComplete, err);
    } finally {
      setRowBusy(todo.id, null);
    }
  }

  /** 방금 접힌 줄의 [되돌리기] (예정 탭) */
  async function undo(todo: Todo) {
    if (busyRef.current.has(todo.id)) return;
    setRowBusy(todo.id, 'undo');
    setRowErrors((e) => withoutKey(e, todo.id));
    try {
      const res = await todoApi.setTodoCompleted(todo.id, false);
      setCollapsed((c) => withoutKey(c, todo.id));
      if (res) setLists((l) => (l.open ? { ...l, open: { ...l.open, todos: replaceTodo(l.open.todos, res) } } : l));
      setNotice(TODO_TEXT.undoneNotice);
    } catch (err) {
      failRow(todo.id, TODO_TEXT.errorUndo, err);
    } finally {
      setRowBusy(todo.id, null);
    }
  }

  /** 완료 탭의 [완료 취소] */
  async function cancelDone(todo: Todo) {
    if (busyRef.current.has(todo.id)) return;
    setRowBusy(todo.id, 'undo');
    setRowErrors((e) => withoutKey(e, todo.id));
    try {
      await todoApi.setTodoCompleted(todo.id, false);
      setLists((l) => ({
        // 예정 목록은 다음에 열 때 새로 불러온다
        open: null,
        done: l.done ? { ...l.done, todos: removeTodo(l.done.todos, todo.id) } : l.done,
      }));
      setNotice(TODO_TEXT.cancelDoneNotice);
    } catch (err) {
      failRow(todo.id, TODO_TEXT.errorUndo, err);
    } finally {
      setRowBusy(todo.id, null);
    }
  }

  const current = lists[tab];
  const todos = current?.todos ?? [];
  const showAddTop = tab === 'open' && todos.length >= 3;

  return (
    <div>
      <header className="topbar">
        <Link to="/today" className="btn-link">
          {TODO_TEXT.backToToday}
        </Link>
      </header>
      <main className="page">
        <h1>{TODO_TEXT.listTitle}</h1>
        <p className="lead">{TODO_TEXT.guide}</p>
        <Link to="/visit-questions?from=todos" className="history-link-row">
          <span>{VISIT_QUESTION_TEXT.title}</span>
          <span aria-hidden="true">›</span>
        </Link>

        {notice && (
          <div role="status" className="ok">
            <p>{notice}</p>
          </div>
        )}

        <div className="todo-tabs" role="tablist" aria-label={TODO_TEXT.tabGroup}>
          <button
            type="button"
            role="tab"
            id="todo-tab-open"
            aria-selected={tab === 'open'}
            aria-controls="todo-panel"
            onClick={() => chooseTab('open')}
          >
            {tab === 'open' && <span aria-hidden="true">✓ </span>}
            {TODO_TEXT.tabOpen}
          </button>
          <button
            type="button"
            role="tab"
            id="todo-tab-done"
            aria-selected={tab === 'done'}
            aria-controls="todo-panel"
            onClick={() => chooseTab('done')}
          >
            {tab === 'done' && <span aria-hidden="true">✓ </span>}
            {TODO_TEXT.tabDone}
          </button>
        </div>

        <div id="todo-panel" role="tabpanel" aria-labelledby={tab === 'open' ? 'todo-tab-open' : 'todo-tab-done'}>
          {loadError && (
            <div role="alert" className="error">
              <p>{current ? TODO_TEXT.stale : loadError}</p>
              <button type="button" className="btn-secondary" onClick={() => void load(tab)}>
                {TODO_TEXT.retry}
              </button>
            </div>
          )}
          {loading === tab && !current && !loadError && <p aria-busy="true">{TODO_TEXT.loading}</p>}

          {showAddTop && (
            <Link to="/todos/new" className="btn-link">
              {TODO_TEXT.add}
            </Link>
          )}

          {current && tab === 'open' && (
            <OpenList
              todos={todos}
              collapsed={collapsed}
              busy={busy}
              rowErrors={rowErrors}
              onComplete={complete}
              onUndo={undo}
            />
          )}
          {current && tab === 'done' && (
            <>
              {todos.length === 0 ? (
                <p className="muted">{TODO_TEXT.emptyDone}</p>
              ) : (
                <>
                  <ul className="todo-list">
                    {todos.map((t) => (
                      <li key={t.id} className="card todo-row is-done">
                        <p className="todo-title">
                          <span aria-hidden="true">✓ </span>
                          {t.title}
                          <span className="muted"> · {TODO_TEXT.doneBadge}</span>
                        </p>
                        <p className="muted">{dateTimeLine(t)}</p>
                        {t.hospitalNote && (
                          <p className="todo-note">
                            <span className="strong">{TODO_TEXT.hospitalNoteLabel}</span> {t.hospitalNote}
                          </p>
                        )}
                        {rowErrors[t.id] && (
                          <p role="alert" className="error">
                            {rowErrors[t.id]}
                          </p>
                        )}
                        <div className="row">
                          <button
                            type="button"
                            className="btn-secondary"
                            aria-label={cancelDoneLabel(t.title)}
                            disabled={!!busy[t.id]}
                            onClick={() => void cancelDone(t)}
                          >
                            {busy[t.id] ? TODO_TEXT.undoing : TODO_TEXT.cancelDone}
                          </button>
                          <Link
                            to={`/todos/${encodeURIComponent(t.id)}`}
                            className="btn-secondary link-button"
                            aria-label={openLabel(t.title)}
                          >
                            {TODO_TEXT.open}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="muted small">{TODO_TEXT.doneListNote}</p>
                </>
              )}
            </>
          )}
        </div>

        <Link to="/todos/new" className="btn-primary block link-button">
          {TODO_TEXT.add}
        </Link>
        <p className="disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}

function withoutKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}

function OpenList({
  todos,
  collapsed,
  busy,
  rowErrors,
  onComplete,
  onUndo,
}: {
  todos: Todo[];
  collapsed: Record<string, Todo>;
  busy: Record<string, 'complete' | 'undo'>;
  rowErrors: Record<string, string>;
  onComplete: (t: Todo) => void;
  onUndo: (t: Todo) => void;
}) {
  if (todos.length === 0) {
    return (
      <section className="card" aria-labelledby="todo-empty-title">
        <p id="todo-empty-title" className="strong">
          {TODO_TEXT.emptyOpenTitle}
        </p>
        <p className="muted">{TODO_TEXT.emptyOpenBody}</p>
      </section>
    );
  }
  return (
    <>
      {groupByDateStatus(todos).map((group) => (
        <section key={group.status} aria-labelledby={`todo-group-${group.status}`}>
          <h2 id={`todo-group-${group.status}`} className="todo-group-title">
            {groupTitle(group.status)}
          </h2>
          <ul className="todo-list">
            {group.todos.map((t) => {
              const done = collapsed[t.id];
              const state = busy[t.id];
              if (done) {
                return (
                  <li key={t.id} className="todo-collapsed">
                    <p className="dose-line">
                      <span aria-hidden="true">✓ </span>
                      {t.title} · {TODO_TEXT.doneBadge}
                      <span className="muted"> · {dateTimeLine(t)}</span>
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      aria-label={undoLabel(t.title)}
                      disabled={state === 'undo'}
                      onClick={() => onUndo(t)}
                    >
                      {state === 'undo' ? TODO_TEXT.undoing : TODO_TEXT.undo}
                    </button>
                    {rowErrors[t.id] && (
                      <p role="alert" className="error">
                        {rowErrors[t.id]}
                      </p>
                    )}
                  </li>
                );
              }
              return (
                <li key={t.id} className="card todo-row">
                  <p className="muted">{dateTimeLine(t)}</p>
                  <p className="todo-title">{t.title}</p>
                  {t.memo && <p className="todo-note">{t.memo}</p>}
                  <p className="muted small">{remindLine(t)}</p>
                  {rowErrors[t.id] && (
                    <p role="alert" className="error">
                      {rowErrors[t.id]}
                    </p>
                  )}
                  <div className="row">
                    <button
                      type="button"
                      className="btn-primary"
                      aria-label={completeLabel(t.title)}
                      disabled={state === 'complete'}
                      onClick={() => onComplete(t)}
                    >
                      {state === 'complete' ? TODO_TEXT.completing : TODO_TEXT.complete}
                    </button>
                    <Link
                      to={`/todos/${encodeURIComponent(t.id)}`}
                      className="btn-secondary link-button"
                      aria-label={openLabel(t.title)}
                    >
                      {TODO_TEXT.open}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
