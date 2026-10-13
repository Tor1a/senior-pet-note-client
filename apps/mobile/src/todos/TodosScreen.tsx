// 내 할 일 목록 (/todos, 알림을 눌러 열면 ?source=push) — 웹 TodosPage 와 같은 규칙 (기획서 6-1)
// 탭 [예정] [완료]. 예정은 서버가 계산한 dateStatus 로 묶는다(지난 일정/오늘/내일/그 이후). 날짜 계산은 하지 않는다.
// 완료 체크는 줄이 제자리에서 접히고 [되돌리기]가 남는다(저장 되돌리기 U1 방식). 완료 탭에서는 [완료 취소].
// 지난 일정도 색·문구로 재촉하지 않는다(사실만). 폼에서 돌아오면(포커스) 목록을 다시 읽는다.
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, Card, ChoiceButton, LinkButton, Screen } from '../components/ui';
import { ApiError, toUserMessage } from '../lib/api';
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
  rowLabel,
  TODO_TEXT,
  undoLabel,
} from '../lib/todoText';
import { isLargeFont } from '../medications/layout';
import { goBackOr } from '../medications/routes';
import { usePet } from '../pet/PetProvider';
import { todoApi } from '../services/client';
import { spacing } from '../theme';
import { isTodoNoticeKind, NEW_TODO_HREF, TODO_NOTICE_TEXT, todoHref } from './routes';

type Tab = TodoStatus;
type Busy = 'complete' | 'undo';

export default function TodosScreen() {
  const router = useRouter();
  const { pet, reload: reloadPet } = usePet();
  const { fontScale } = useWindowDimensions();
  const large = isLargeFont(fontScale);
  const params = useLocalSearchParams<{ notice?: string; source?: string }>();
  const [tab, setTab] = useState<Tab>('open');
  const [lists, setLists] = useState<Record<Tab, TodoListResponse | null>>({ open: null, done: null });
  const [loading, setLoading] = useState<Tab | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 이 화면에서 방금 완료로 체크한 줄(제자리에서 접힌 줄). 예정 목록을 새로 불러오면 비운다 */
  const [collapsed, setCollapsed] = useState<Record<string, Todo>>({});
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const busyRef = useRef(new Set<string>());
  const tabRef = useRef<Tab>(tab);
  tabRef.current = tab;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 폼에서 돌아오며 실은 안내 코드 / 알림으로 열었음. 한 번 보여 주고 파라미터를 비운다
  const noticeParam = Array.isArray(params.notice) ? params.notice[0] : params.notice;
  const sourceParam = Array.isArray(params.source) ? params.source[0] : params.source;
  useEffect(() => {
    if (isTodoNoticeKind(noticeParam)) {
      setNotice(TODO_NOTICE_TEXT[noticeParam]);
      router.setParams({ notice: undefined } as never);
    } else if (sourceParam === 'push') {
      setNotice(TODO_TEXT.openedFromPush);
      router.setParams({ source: undefined } as never);
    }
    // router 는 고정이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeParam, sourceParam]);

  const petId = pet?.id;
  const load = useCallback(
    async (which: Tab) => {
      if (!petId) return;
      setLoading(which);
      setLoadError(null);
      try {
        const res = await todoApi.listTodos(petId, which);
        if (!alive.current) return;
        setLists((l) => ({ ...l, [which]: { recordDate: res?.recordDate ?? '', todos: res?.todos ?? [] } }));
        if (which === 'open') setCollapsed({});
      } catch (err) {
        if (!alive.current) return;
        if (err instanceof ApiError && err.status === 404) {
          // 반려동물이 없어졌다 → 다시 읽는다
          void reloadPet();
          return;
        }
        setLoadError(toUserMessage(err, 'todo'));
      } finally {
        if (alive.current) setLoading((cur) => (cur === which ? null : cur));
      }
    },
    [petId, reloadPet],
  );

  // 처음 열 때와 다른 화면(폼)에서 돌아올 때마다 보고 있는 탭을 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void load(tabRef.current);
    }, [load]),
  );

  function chooseTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    tabRef.current = next;
    setLoadError(null);
    void load(next);
  }

  function setRowBusy(id: string, kind: Busy | null) {
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
      void load(tabRef.current);
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
      if (alive.current) setRowBusy(todo.id, null);
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
      if (alive.current) setRowBusy(todo.id, null);
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
      if (alive.current) setRowBusy(todo.id, null);
    }
  }

  const current = lists[tab];
  const todos = current?.todos ?? [];
  const showAddTop = tab === 'open' && todos.length >= 3;
  const goForm = () => router.push(NEW_TODO_HREF as never);
  const goBack = () => goBackOr(router, '/');
  const rowErrorNode = (id: string) =>
    rowErrors[id] ? (
      <AppText variant="secondary" accessibilityRole="alert">{`! ${rowErrors[id]}`}</AppText>
    ) : null;

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <LinkButton label={TODO_TEXT.backToToday} accessibilityLabel="오늘 화면으로 돌아가기" onPress={goBack} />
        <AppText variant="title" accessibilityRole="header">
          {TODO_TEXT.listTitle}
        </AppText>
        <AppText variant="secondary">{TODO_TEXT.guide}</AppText>
      </View>

      {notice ? (
        <NoticeCard kind="ok">
          <AppText>{`✓ ${notice}`}</AppText>
        </NoticeCard>
      ) : null}

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={TODO_TEXT.tabGroup}
        style={{ flexDirection: large ? 'column' : 'row', gap: spacing.sm }}
      >
        {(['open', 'done'] as const).map((t) => (
          <View key={t} style={large ? undefined : { flex: 1 }}>
            <ChoiceButton
              tall
              label={t === 'open' ? TODO_TEXT.tabOpen : TODO_TEXT.tabDone}
              selected={tab === t}
              onPress={() => chooseTab(t)}
            />
          </View>
        ))}
      </View>

      {loadError ? (
        <NoticeCard kind="info" alert>
          <AppText>{current ? TODO_TEXT.stale : loadError}</AppText>
          <AppButton label={TODO_TEXT.retry} variant="secondary" onPress={() => void load(tab)} />
        </NoticeCard>
      ) : null}
      {loading === tab && !current && !loadError ? (
        <AppText variant="secondary" accessibilityState={{ busy: true }}>
          {TODO_TEXT.loading}
        </AppText>
      ) : null}

      {showAddTop ? <AppButton label={TODO_TEXT.add} variant="secondary" onPress={goForm} /> : null}

      {current && tab === 'open' ? (
        todos.length === 0 ? (
          <Card>
            <AppText style={{ fontWeight: '700' }}>{TODO_TEXT.emptyOpenTitle}</AppText>
            <AppText variant="secondary">{TODO_TEXT.emptyOpenBody}</AppText>
          </Card>
        ) : (
          groupByDateStatus(todos).map((group) => (
            <View key={group.status} style={{ gap: spacing.sm }}>
              <AppText accessibilityRole="header" style={{ fontWeight: '700' }}>
                {groupTitle(group.status)}
              </AppText>
              {group.todos.map((t) => {
                const done = collapsed[t.id];
                const state = busy[t.id];
                if (done) {
                  return (
                    <Card key={t.id}>
                      <AppText accessibilityLabel={`${t.title}, ${TODO_TEXT.doneBadge}`}>
                        {`✓ ${t.title} · ${TODO_TEXT.doneBadge} · ${dateTimeLine(t)}`}
                      </AppText>
                      <AppButton
                        label={state === 'undo' ? TODO_TEXT.undoing : TODO_TEXT.undo}
                        accessibilityLabel={undoLabel(t.title)}
                        variant="secondary"
                        disabled={state === 'undo'}
                        onPress={() => void undo(t)}
                      />
                      {rowErrorNode(t.id)}
                    </Card>
                  );
                }
                return (
                  <Card key={t.id}>
                    <View accessible accessibilityLabel={rowLabel(t)} style={{ gap: 4 }}>
                      <AppText variant="secondary">{dateTimeLine(t)}</AppText>
                      <AppText style={{ fontWeight: '700' }}>{t.title}</AppText>
                      {t.memo ? <AppText>{t.memo}</AppText> : null}
                      <AppText variant="caption">{remindLine(t)}</AppText>
                    </View>
                    {rowErrorNode(t.id)}
                    <AppButton
                      label={state === 'complete' ? TODO_TEXT.completing : TODO_TEXT.complete}
                      accessibilityLabel={completeLabel(t.title)}
                      disabled={state === 'complete'}
                      onPress={() => void complete(t)}
                    />
                    <AppButton
                      label={TODO_TEXT.open}
                      accessibilityLabel={openLabel(t.title)}
                      variant="secondary"
                      onPress={() => router.push(todoHref(t.id) as never)}
                    />
                  </Card>
                );
              })}
            </View>
          ))
        )
      ) : null}

      {current && tab === 'done' ? (
        todos.length === 0 ? (
          <AppText variant="secondary">{TODO_TEXT.emptyDone}</AppText>
        ) : (
          <>
            {todos.map((t) => (
              <Card key={t.id}>
                <AppText style={{ fontWeight: '700' }}>{`✓ ${t.title} · ${TODO_TEXT.doneBadge}`}</AppText>
                <AppText variant="secondary">{dateTimeLine(t)}</AppText>
                {t.hospitalNote ? (
                  <AppText>
                    <AppText style={{ fontWeight: '700' }}>{TODO_TEXT.hospitalNoteLabel}</AppText>
                    {` ${t.hospitalNote}`}
                  </AppText>
                ) : null}
                {rowErrorNode(t.id)}
                <AppButton
                  label={busy[t.id] ? TODO_TEXT.undoing : TODO_TEXT.cancelDone}
                  accessibilityLabel={cancelDoneLabel(t.title)}
                  variant="secondary"
                  disabled={!!busy[t.id]}
                  onPress={() => void cancelDone(t)}
                />
                <AppButton
                  label={TODO_TEXT.open}
                  accessibilityLabel={openLabel(t.title)}
                  variant="secondary"
                  onPress={() => router.push(todoHref(t.id) as never)}
                />
              </Card>
            ))}
            <AppText variant="caption">{TODO_TEXT.doneListNote}</AppText>
          </>
        )
      ) : null}

      <AppButton label={TODO_TEXT.add} onPress={goForm} />
      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}

function withoutKey<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}
