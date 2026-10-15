import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ConfirmCard from '../components/ConfirmCard';
import VisitQuestionRow, { type VisitQuestionBusy } from '../components/VisitQuestionRow';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE, toUserMessage } from '../lib/api';
import { visitQuestionApi } from '../lib/client';
import { DISCLAIMER } from '../lib/constants';
import { countText } from '../lib/todoText';
import { VISIT_QUESTION_LIMIT_CODE, type VisitQuestion } from '../lib/visitQuestionApi';
import {
  isAtVisitQuestionLimit,
  isVisitQuestionUnchanged,
  removeQuestion,
  replaceQuestion,
  toVisitQuestionInput,
  validateVisitQuestionText,
  visibleQuestions,
  visitQuestionLength,
  type VisitQuestionTab,
} from '../lib/visitQuestionForm';
import { problemText, VISIT_QUESTION_COUNT_MAX, VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { usePet } from '../pet';

// 진료 때 물어볼 것 (/visit-questions, ?from=todos|checklist) — 설계 .company/design/진료-질문-메모.md 4장
// 한 화면: 안내 → 입력 → 탭(남은 것/물어본 것) → 줄 목록. 목록은 status=all 1회로 받아 탭은 클라이언트가 나눈다.
// 서버 목록은 메모리에만 둔다(디스크/localStorage 저장 없음). 개수·진행률 문구 없음(30개일 때 한도 안내만).
// 입력은 줄바꿈을 공백으로 바꿔 보내고, 100자를 넘어도 자르지 않는다(오류 줄). 사용자 글은 검열하지 않는다.

const TABS: { tab: VisitQuestionTab; label: string }[] = [
  { tab: 'open', label: T.tabOpen },
  { tab: 'done', label: T.tabDone },
];

function backTarget(from: string | null): { to: string; label: string } {
  if (from === 'todos') return { to: '/todos', label: T.backToTodos };
  if (from === 'checklist') return { to: '/checklist', label: T.backToChecklist };
  return { to: '/today', label: T.backToToday };
}

function withoutKey<V>(obj: Record<string, V>, key: string): Record<string, V> {
  const next = { ...obj };
  delete next[key];
  return next;
}

export default function VisitQuestionsPage() {
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const back = backTarget(params.get('from'));

  const [items, setItems] = useState<VisitQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<VisitQuestionTab>('open');
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});
  const [notice, setNotice] = useState('');

  const [addText, setAddText] = useState('');
  const [addProblem, setAddProblem] = useState<string | null>(null);
  const [addFailure, setAddFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<Record<string, VisitQuestionBusy>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [leaveOpen, setLeaveOpen] = useState(false);

  const seq = useRef(0);
  const busyRef = useRef(new Set<string>());
  const addingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<string | null>(null);
  // 변경(추가/체크/수정/삭제) 진행 중에 도착한 오래된 목록 응답은 버리고, 변경이 끝난 뒤 다시 받는다
  const inflight = useRef(0);
  const mutationEpoch = useRef(0);
  const reloadAfter = useRef(false);
  // await 이후 낡은 클로저 대신 가장 최근에 그린 값을 읽는다
  const petIdRef = useRef(petId);
  petIdRef.current = petId;
  const [serverLimit, setServerLimit] = useState(false);

  const load = useCallback(async () => {
    if (!petId) return;
    const mine = ++seq.current;
    const startEpoch = mutationEpoch.current;
    let deferred = false;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await visitQuestionApi.listVisitQuestions(petId, 'all');
      if (mine !== seq.current) return;
      if (inflight.current > 0 || mutationEpoch.current !== startEpoch) {
        // 이 응답은 변경 전 목록일 수 있다 → 버리고 변경이 모두 끝난 뒤 다시 받는다
        if (inflight.current > 0) {
          reloadAfter.current = true;
          deferred = true;
        } else void load();
        return;
      }
      const next = res?.questions ?? [];
      setItems(next);
      setCollapsed({});
      // 다른 기기에서 지워진 줄의 고치는 초안은 버린다
      const ids = new Set(next.map((q) => q.id));
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([id]) => ids.has(id))));
      setConfirming((c) => Object.fromEntries(Object.entries(c).filter(([id]) => ids.has(id))) as Record<string, true>);
    } catch (err) {
      if (mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      setLoadError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : T.loadFailed);
    } finally {
      if (mine === seq.current && !deferred) setLoading(false);
    }
  }, [petId, reloadPet]);

  // 반려동물이 바뀌면 이전 반려동물의 목록·초안을 비운 뒤 새로 받는다
  useEffect(() => {
    setItems(null);
    setLoadError(null);
    setCollapsed({});
    setDrafts({});
    setEditErrors({});
    setConfirming({});
    setBusy({});
    setRowErrors({});
    setAddFailure(null);
    setAddProblem(null);
    setServerLimit(false);
    setNotice('');
    busyRef.current.clear();
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  function beginMutation() {
    inflight.current += 1;
  }

  function endMutation() {
    inflight.current -= 1;
    mutationEpoch.current += 1;
    if (inflight.current === 0 && reloadAfter.current) {
      reloadAfter.current = false;
      void load();
    }
  }

  // 줄 안 버튼 포커스 이동(체크 후 되돌리기 버튼 등). 요소가 그려진 뒤에 옮긴다
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const el =
      target === 'input'
        ? inputRef.current
        : Array.from(document.querySelectorAll<HTMLElement>('[data-vq-focus]')).find(
            (node) => node.getAttribute('data-vq-focus') === target,
          );
    // 한 번만 시도한다. 못 찾으면 예약을 지워 나중에 포커스를 빼앗지 않고, 포커스를 잃은 상태면 입력 칸으로 옮긴다
    pendingFocus.current = null;
    if (!el) {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) inputRef.current?.focus();
      return;
    }
    el.focus();
    if (el instanceof HTMLInputElement && target.endsWith(':input')) {
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  });

  const dirty =
    addText.trim() !== '' ||
    (items ?? []).some((q) => drafts[q.id] !== undefined && !isVisitQuestionUnchanged(drafts[q.id], q.text));

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

  const collapsedIds = useMemo(() => new Set(Object.keys(collapsed)), [collapsed]);
  const rows = useMemo(() => (items ? visibleQuestions(items, tab, collapsedIds) : []), [items, tab, collapsedIds]);
  const latest = useRef({ rows, tab, collapsed });
  latest.current = { rows, tab, collapsed };
  const atLimit = isAtVisitQuestionLimit(items) || serverLimit;
  const addDisabled = adding || items === null || atLimit;

  function leave() {
    if (dirty) setLeaveOpen(true);
    else navigate(back.to);
  }

  function chooseTab(next: VisitQuestionTab) {
    if (next === tab) return;
    setTab(next);
    setCollapsed({});
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = -1;
    if (e.key === 'ArrowRight') target = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') target = (index + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = TABS.length - 1;
    if (target < 0) return;
    e.preventDefault();
    chooseTab(TABS[target].tab);
    pendingFocus.current = `tab:${TABS[target].tab}`;
  }

  function setRowBusy(id: string, kind: VisitQuestionBusy | null) {
    if (kind) busyRef.current.add(id);
    else busyRef.current.delete(id);
    setBusy((b) => (kind ? { ...b, [id]: kind } : withoutKey(b, id)));
  }

  /** 404(다른 기기에서 이미 지움)면 안내 + 목록 다시 받기. 아니면 줄 안 오류 */
  function failRow(id: string, base: string, err: unknown) {
    if (err instanceof ApiError && err.status === 404) {
      setNotice(T.gone);
      reloadAfter.current = true; // 변경이 끝나는 즉시 한 번 다시 받는다
      return true;
    }
    setRowErrors((e) => ({ ...e, [id]: `${base} ${toUserMessage(err, 'visitQuestion')} ${T.errorRetryHint}` }));
    return false;
  }

  /** 줄이 사라진 뒤 포커스: 다음 줄 첫 버튼, 없으면 이전 줄, 둘 다 없으면 (탭 또는 입력 칸) */
  function focusNeighbor(id: string, fallback: string) {
    const { rows: cur, tab: curTab, collapsed: curCollapsed } = latest.current;
    const index = cur.findIndex((q) => q.id === id);
    const next = index < 0 ? undefined : (cur[index + 1] ?? cur[index - 1]);
    if (!next) {
      pendingFocus.current = fallback;
      return;
    }
    const nextMode = curTab === 'done' ? 'undo' : curCollapsed[next.id] ? 'undo' : 'done';
    pendingFocus.current = `${next.id}:${nextMode}`;
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!petId || addingRef.current || addDisabled) return;
    const problem = validateVisitQuestionText(addText);
    if (problem) {
      setAddProblem(problemText(problem));
      setAddFailure(null);
      inputRef.current?.focus();
      return;
    }
    addingRef.current = true;
    beginMutation();
    setAdding(true);
    setAddFailure(null);
    setAddProblem(null);
    try {
      const res = await visitQuestionApi.createVisitQuestion(petId, toVisitQuestionInput(addText));
      if (res && petIdRef.current === petId) {
        setItems((cur) =>
          cur?.some((q) => q.id === res.id) ? replaceQuestion(cur, res) : [...(cur ?? []), res],
        );
      }
      setAddText('');
      setNotice(tab === 'done' ? T.addedElsewhere : T.added);
      pendingFocus.current = 'input';
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
      } else if (err instanceof ApiError && err.code === VISIT_QUESTION_LIMIT_CODE) {
        // 입력한 글은 그대로 두고, 한도 안내(vq-limit) 하나만 보이게 한 뒤 목록을 다시 받는다
        setServerLimit(true);
        reloadAfter.current = true;
      } else {
        setAddFailure(`${T.errorAdd} ${toUserMessage(err, 'visitQuestion')} ${T.errorRetryHint}`);
      }
    } finally {
      endMutation();
      addingRef.current = false;
      setAdding(false);
    }
  }

  async function onDone(q: VisitQuestion) {
    if (busyRef.current.has(q.id)) return;
    beginMutation();
    setRowBusy(q.id, 'done');
    setRowErrors((e) => withoutKey(e, q.id));
    try {
      const res = await visitQuestionApi.setVisitQuestionCompleted(q.id, true);
      const next = res ?? { ...q, completed: true };
      setItems((cur) => (cur ? replaceQuestion(cur, next) : cur));
      setCollapsed((c) => ({ ...c, [q.id]: true }));
      setNotice(T.doneNotice);
      pendingFocus.current = `${q.id}:undo`;
    } catch (err) {
      failRow(q.id, T.errorDone, err);
    } finally {
      endMutation();
      setRowBusy(q.id, null);
    }
  }

  async function onUndo(q: VisitQuestion) {
    if (busyRef.current.has(q.id)) return;
    beginMutation();
    setRowBusy(q.id, 'undo');
    setRowErrors((e) => withoutKey(e, q.id));
    const fromDoneTab = tab === 'done';
    try {
      const res = await visitQuestionApi.setVisitQuestionCompleted(q.id, false);
      if (fromDoneTab && latest.current.tab === 'done') focusNeighbor(q.id, 'tab:done');
      else pendingFocus.current = `${q.id}:done`;
      const next = res ?? { ...q, completed: false, completedAt: null };
      setItems((cur) => (cur ? replaceQuestion(cur, next) : cur));
      setCollapsed((c) => withoutKey(c, q.id));
      setNotice(T.undoneNotice);
    } catch (err) {
      failRow(q.id, T.errorUndo, err);
    } finally {
      endMutation();
      setRowBusy(q.id, null);
    }
  }

  function onEditStart(q: VisitQuestion) {
    setDrafts((d) => ({ ...d, [q.id]: q.text }));
    setEditErrors((e) => withoutKey(e, q.id));
    pendingFocus.current = `${q.id}:input`;
  }

  function closeEdit(id: string, focus: boolean) {
    setDrafts((d) => withoutKey(d, id));
    setEditErrors((e) => withoutKey(e, id));
    if (focus) pendingFocus.current = `${id}:edit`;
  }

  async function onEditSave(q: VisitQuestion) {
    const draft = drafts[q.id];
    if (draft === undefined || busyRef.current.has(q.id)) return;
    const problem = validateVisitQuestionText(draft);
    if (problem) {
      setEditErrors((e) => ({ ...e, [q.id]: problemText(problem) }));
      pendingFocus.current = `${q.id}:input`;
      return;
    }
    if (isVisitQuestionUnchanged(draft, q.text)) {
      closeEdit(q.id, true);
      return;
    }
    beginMutation();
    setRowBusy(q.id, 'save');
    setEditErrors((e) => withoutKey(e, q.id));
    try {
      const res = await visitQuestionApi.updateVisitQuestion(q.id, toVisitQuestionInput(draft));
      if (res) setItems((cur) => (cur ? replaceQuestion(cur, res) : cur));
      closeEdit(q.id, true);
      setNotice(T.edited);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotice(T.gone);
        reloadAfter.current = true;
      } else {
        setEditErrors((e) => ({ ...e, [q.id]: `${T.errorEdit} ${toUserMessage(err, 'visitQuestion')}` }));
      }
    } finally {
      endMutation();
      setRowBusy(q.id, null);
    }
  }

  async function onRemove(q: VisitQuestion) {
    if (busyRef.current.has(q.id)) return;
    beginMutation();
    setRowBusy(q.id, 'remove');
    setRowErrors((e) => withoutKey(e, q.id));
    try {
      await visitQuestionApi.deleteVisitQuestion(q.id);
      focusNeighbor(q.id, 'input');
      setItems((cur) => (cur ? removeQuestion(cur, q.id) : cur));
      setCollapsed((c) => withoutKey(c, q.id));
      setConfirming((c) => withoutKey(c, q.id));
      setDrafts((d) => withoutKey(d, q.id));
      setNotice(T.removed);
    } catch (err) {
      if (failRow(q.id, T.errorRemove, err)) setConfirming((c) => withoutKey(c, q.id));
    } finally {
      endMutation();
      setRowBusy(q.id, null);
    }
  }

  const describedBy = ['vq-privacy', 'vq-help', addProblem ? 'vq-add-problem' : null].filter(Boolean).join(' ');
  const addReasonId = atLimit ? 'vq-limit' : items === null ? (loadError ? 'vq-load-error' : 'vq-loading') : undefined;
  const showStale = !!items && !!loadError;

  return (
    <div className="vq-page">
      <header className="topbar">
        <button type="button" className="btn-link" onClick={leave}>
          {back.label}
        </button>
      </header>
      <main className="page">
        <h1>{T.title}</h1>
        <p className="lead">{T.guide}</p>

        {leaveOpen && (
          <ConfirmCard
            title={T.leaveTitle}
            primaryLabel={T.leaveStay}
            onPrimary={() => setLeaveOpen(false)}
            secondaryLabel={T.leaveGo}
            onSecondary={() => navigate(back.to)}
          >
            <p>{T.leaveBody}</p>
          </ConfirmCard>
        )}

        {atLimit && (
          <p id="vq-limit" className="strong" role={serverLimit ? 'alert' : undefined}>
            {T.limitReached}
          </p>
        )}

        <form className="vq-form" onSubmit={(e) => void onAdd(e)} noValidate>
          <label htmlFor="vq-input">{T.fieldLabel}</label>
          <input
            id="vq-input"
            ref={inputRef}
            type="text"
            autoComplete="off"
            className="vq-input"
            value={addText}
            aria-invalid={addProblem ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              setAddText(e.target.value);
              setAddProblem(null);
              setAddFailure(null);
              setServerLimit(false);
            }}
          />
          <p id="vq-privacy" className="muted vq-help">
            {T.privacyHelp}
          </p>
          <div className="vq-count-line">
            <span id="vq-help" className="muted">
              {T.fieldHelp}
            </span>
            <span className="count">{countText(visitQuestionLength(addText), VISIT_QUESTION_COUNT_MAX)}</span>
          </div>
          {addProblem && (
            <p role="alert" id="vq-add-problem" className="field-error">
              {addProblem}
            </p>
          )}
          {addFailure && (
            <p role="alert" className="error">
              {addFailure}
            </p>
          )}
          <button
            type="submit"
            className="btn-primary block"
            aria-label={adding ? undefined : T.addLabel}
            aria-describedby={addReasonId}
            disabled={addDisabled}
          >
            {adding ? T.adding : T.add}
          </button>
        </form>

        <div role="status" className="vq-notice">
          {notice && <p className="ok">{notice}</p>}
        </div>

        <div className="vq-tabs-wrap">
          <div className="todo-tabs vq-tabs" role="tablist" aria-label={T.tabGroup}>
            {TABS.map((t, i) => (
              <button
                key={t.tab}
                type="button"
                role="tab"
                id={`vq-tab-${t.tab}`}
                aria-selected={tab === t.tab}
                aria-controls="vq-panel"
                tabIndex={tab === t.tab ? 0 : -1}
                data-vq-focus={`tab:${t.tab}`}
                onClick={() => chooseTab(t.tab)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {tab === t.tab && <span aria-hidden="true">✓ </span>}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div
          id="vq-panel"
          role="tabpanel"
          aria-labelledby={`vq-tab-${tab}`}
          aria-busy={loading && !items ? true : undefined}
        >
          {loadError && (
            <div role="alert" id="vq-load-error" className="error">
              <p>{showStale ? T.stale : loadError}</p>
              <button type="button" className="btn-secondary" onClick={() => void load()}>
                {T.retry}
              </button>
            </div>
          )}
          {loading && !items && !loadError && (
            <p id="vq-loading" aria-busy="true">
              {T.loading}
            </p>
          )}
          {items && rows.length === 0 && <p className="muted">{tab === 'open' ? T.emptyOpen : T.emptyDone}</p>}
          {items && rows.length > 0 && (
            <ul className="todo-list vq-list">
              {rows.map((q) => (
                <VisitQuestionRow
                  key={q.id}
                  q={q}
                  mode={tab === 'done' ? 'done' : collapsed[q.id] ? 'collapsed' : 'open'}
                  busy={busy[q.id] ?? null}
                  error={rowErrors[q.id] ?? null}
                  editDraft={drafts[q.id] ?? null}
                  editError={editErrors[q.id] ?? null}
                  confirmingRemove={!!confirming[q.id]}
                  onDone={() => void onDone(q)}
                  onUndo={() => void onUndo(q)}
                  onEditStart={() => onEditStart(q)}
                  onEditChange={(value) => {
                    setDrafts((d) => ({ ...d, [q.id]: value }));
                    setEditErrors((e) => withoutKey(e, q.id));
                  }}
                  onEditSave={() => void onEditSave(q)}
                  onEditCancel={() => closeEdit(q.id, true)}
                  onRemoveAsk={() => {
                    setRowErrors((e) => withoutKey(e, q.id));
                    setConfirming((c) => ({ ...c, [q.id]: true }));
                  }}
                  onRemoveYes={() => void onRemove(q)}
                  onRemoveNo={() => {
                    setRowErrors((e) => withoutKey(e, q.id));
                    setConfirming((c) => withoutKey(c, q.id));
                    pendingFocus.current = `${q.id}:remove`;
                  }}
                />
              ))}
            </ul>
          )}
        </div>

        <p className="disclaimer">{DISCLAIMER}</p>
      </main>
    </div>
  );
}
