// 진료 때 물어볼 것 (/visit-questions, ?from=todos|checklist) — 웹 VisitQuestionsPage 와 같은 구성·문구
// 한 화면: 안내 → 입력 → 탭(남은 것/물어본 것) → 줄 목록. 목록은 status=all 1회로 받아 탭은 클라이언트가 나눈다.
// 서버 목록은 메모리에만 둔다(디스크·AsyncStorage·SecureStore 저장 없음). 개수·진행률 문구 없음(30개일 때 한도 안내만).
// 입력은 줄바꿈을 공백으로 바꿔 보내고, 100자를 넘어도 자르지 않는다(오류 줄). 사용자 글은 검열하지 않는다.
// 입력이 맨 위라 키보드가 올라와도 가려지지 않는다(Screen 이 키보드 대응·포커스 시 스크롤). 연속 입력을 위해 추가 뒤 키보드를 유지한다.
// 적던 글이 있으면 뒤로(버튼·시스템 뒤로·스와이프) 모두 이탈 확인을 거친다. 큰 글씨(1.3+)는 탭·버튼을 세로로 쌓는다.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { ConfirmCard } from '../components/ConfirmCard';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppInput, AppText, Screen } from '../components/ui';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE, toUserMessage } from '../lib/api';
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
import { isLargeFont } from '../medications/layout';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { useLeaveGuard } from '../medications/useLeaveGuard';
import { usePet } from '../pet/PetProvider';
import { visitQuestionApi } from '../services/client';
import { colors, fontSize, spacing, touch } from '../theme';
import { visitQuestionsBack } from './routes';
import VisitQuestionRow, { type VisitQuestionBusy } from './VisitQuestionRow';

const TABS: { tab: VisitQuestionTab; label: string }[] = [
  { tab: 'open', label: T.tabOpen },
  { tab: 'done', label: T.tabDone },
];

function withoutKey<V>(obj: Record<string, V>, key: string): Record<string, V> {
  const next = { ...obj };
  delete next[key];
  return next;
}

export default function VisitQuestionsScreen() {
  const router = useRouter();
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const params = useLocalSearchParams<{ from?: string }>();
  const back = visitQuestionsBack(Array.isArray(params.from) ? params.from[0] : params.from);
  const { fontScale } = useWindowDimensions();
  const large = isLargeFont(fontScale);

  const [items, setItems] = useState<VisitQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<VisitQuestionTab>('open');
  const [collapsed, setCollapsed] = useState<Record<string, true>>({});
  const [notice, setNoticeState] = useState('');

  const [addText, setAddText] = useState('');
  const [addProblem, setAddProblem] = useState<string | null>(null);
  const [addFailure, setAddFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [serverLimit, setServerLimit] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<Record<string, VisitQuestionBusy>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const seq = useRef(0);
  const alive = useRef(true);
  const busyRef = useRef(new Set<string>());
  const addingRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  // 변경(추가/체크/수정/삭제) 진행 중에 도착한 오래된 목록 응답은 버리고, 변경이 끝난 뒤 다시 받는다
  const inflight = useRef(0);
  const mutationEpoch = useRef(0);
  const reloadAfter = useRef(false);
  // await 이후 낡은 클로저 대신 가장 최근에 그린 값을 읽는다
  const petIdRef = useRef(petId);
  petIdRef.current = petId;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const setNotice = useCallback((text: string) => {
    setNoticeState(text);
    // iOS 는 직접 낭독, Android 는 liveRegion 만(둘 다 하면 두 번 읽힌다)
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility?.(text);
  }, []);

  const load = useCallback(async () => {
    if (!petId) return;
    const mine = ++seq.current;
    const startEpoch = mutationEpoch.current;
    let deferred = false;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await visitQuestionApi.listVisitQuestions(petId, 'all');
      if (!alive.current || mine !== seq.current) return;
      if (inflight.current > 0 || mutationEpoch.current !== startEpoch) {
        // 이 응답은 변경 전 목록일 수 있다 → 버리고 변경이 모두 끝난 뒤 다시 받는다
        if (inflight.current > 0) {
          reloadAfter.current = true;
          deferred = true;
        } else void loadRef.current();
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
      if (!alive.current || mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      setLoadError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : T.loadFailed);
    } finally {
      if (alive.current && mine === seq.current && !deferred) setLoading(false);
    }
  }, [petId, reloadPet]);
  const loadRef = useRef(load);
  loadRef.current = load;

  // 반려동물이 바뀌면 이전 반려동물의 목록·초안을 비운 뒤 새로 받는다
  useEffect(() => {
    seq.current += 1;
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
    setNoticeState('');
    busyRef.current.clear();
    inflight.current = 0;
    reloadAfter.current = false;
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 진행 중 변경 수를 센다. 반환값(어느 반려동물의 변경인지)을 endMutation 에 넘긴다 */
  function beginMutation() {
    inflight.current += 1;
    return petIdRef.current;
  }

  function endMutation(owner: string | null) {
    if (owner !== petIdRef.current) return; // 다른 반려동물 때 시작한 변경은 이미 초기화로 센 값에서 빠졌다
    inflight.current -= 1;
    mutationEpoch.current += 1;
    if (inflight.current === 0 && reloadAfter.current) {
      reloadAfter.current = false;
      if (alive.current) void loadRef.current();
    }
  }

  /** 이탈 확인 카드가 그려지면 스크롤된 화면에서도 보이게 카드 위치로 올린다 */
  const revealLeave = useCallback((node: View) => {
    const inner = (scrollRef.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
    if (!inner) return;
    node.measureLayout?.(
      inner as never,
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
      () => {},
    );
  }, []);

  const dirty =
    addText.trim() !== '' ||
    (items ?? []).some((q) => drafts[q.id] !== undefined && !isVisitQuestionUnchanged(drafts[q.id], q.text));
  const { leaving, confirmLeave, stay, guard } = useLeaveGuard(dirty);

  const collapsedIds = useMemo(() => new Set(Object.keys(collapsed)), [collapsed]);
  const rows = useMemo(() => (items ? visibleQuestions(items, tab, collapsedIds) : []), [items, tab, collapsedIds]);
  const atLimit = isAtVisitQuestionLimit(items) || serverLimit;
  const addDisabled = adding || items === null || atLimit;
  const showStale = !!items && !!loadError;
  // 추가 버튼이 꺼진 이유(스크린리더 설명). 한도 > 불러오는 중 > 불러오기 실패
  const addReason = atLimit ? T.limitReached : items === null ? (loadError ?? T.loading) : undefined;

  function chooseTab(next: VisitQuestionTab) {
    if (next === tab) return;
    setTab(next);
    setCollapsed({});
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

  async function onAdd() {
    if (!petId || addingRef.current || addDisabled) return;
    const problem = validateVisitQuestionText(addText);
    if (problem) {
      setAddProblem(problemText(problem));
      setAddFailure(null);
      inputRef.current?.focus();
      return;
    }
    addingRef.current = true;
    const owner = beginMutation();
    setAdding(true);
    setAddFailure(null);
    setAddProblem(null);
    try {
      const res = await visitQuestionApi.createVisitQuestion(petId, toVisitQuestionInput(addText));
      if (!alive.current) return;
      if (res && petIdRef.current === petId) {
        setItems((cur) => (cur?.some((q) => q.id === res.id) ? replaceQuestion(cur, res) : [...(cur ?? []), res]));
      }
      setAddText('');
      setNotice(tab === 'done' ? T.addedElsewhere : T.added);
      inputRef.current?.focus(); // 연속으로 여러 개 적을 수 있게 키보드를 유지한다
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
      } else if (err instanceof ApiError && err.code === VISIT_QUESTION_LIMIT_CODE) {
        // 입력한 글은 그대로 두고, 한도 안내 하나만 보이게 한 뒤 목록을 다시 받는다
        setServerLimit(true);
        reloadAfter.current = true;
      } else {
        setAddFailure(`${T.errorAdd} ${toUserMessage(err, 'visitQuestion')} ${T.errorRetryHint}`);
      }
    } finally {
      endMutation(owner);
      addingRef.current = false;
      if (alive.current) setAdding(false);
    }
  }

  async function onDone(q: VisitQuestion) {
    if (busyRef.current.has(q.id)) return;
    const owner = beginMutation();
    setRowBusy(q.id, 'done');
    setRowErrors((e) => withoutKey(e, q.id));
    try {
      const res = await visitQuestionApi.setVisitQuestionCompleted(q.id, true);
      if (!alive.current) return;
      const next = res ?? { ...q, completed: true };
      setItems((cur) => (cur ? replaceQuestion(cur, next) : cur));
      setCollapsed((c) => ({ ...c, [q.id]: true }));
      setNotice(T.doneNotice);
    } catch (err) {
      if (alive.current) failRow(q.id, T.errorDone, err);
    } finally {
      endMutation(owner);
      if (alive.current) setRowBusy(q.id, null);
    }
  }

  async function onUndo(q: VisitQuestion) {
    if (busyRef.current.has(q.id)) return;
    const owner = beginMutation();
    setRowBusy(q.id, 'undo');
    setRowErrors((e) => withoutKey(e, q.id));
    try {
      const res = await visitQuestionApi.setVisitQuestionCompleted(q.id, false);
      if (!alive.current) return;
      const next = res ?? { ...q, completed: false, completedAt: null };
      setItems((cur) => (cur ? replaceQuestion(cur, next) : cur));
      setCollapsed((c) => withoutKey(c, q.id));
      setNotice(T.undoneNotice);
    } catch (err) {
      if (alive.current) failRow(q.id, T.errorUndo, err);
    } finally {
      endMutation(owner);
      if (alive.current) setRowBusy(q.id, null);
    }
  }

  function closeEdit(id: string) {
    setDrafts((d) => withoutKey(d, id));
    setEditErrors((e) => withoutKey(e, id));
  }

  async function onEditSave(q: VisitQuestion) {
    const draft = drafts[q.id];
    if (draft === undefined || busyRef.current.has(q.id)) return;
    const problem = validateVisitQuestionText(draft);
    if (problem) {
      setEditErrors((e) => ({ ...e, [q.id]: problemText(problem) }));
      return;
    }
    if (isVisitQuestionUnchanged(draft, q.text)) {
      closeEdit(q.id);
      return;
    }
    const owner = beginMutation();
    setRowBusy(q.id, 'save');
    setEditErrors((e) => withoutKey(e, q.id));
    try {
      const res = await visitQuestionApi.updateVisitQuestion(q.id, toVisitQuestionInput(draft));
      if (!alive.current) return;
      if (res) setItems((cur) => (cur ? replaceQuestion(cur, res) : cur));
      closeEdit(q.id);
      setNotice(T.edited);
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 404) {
        setNotice(T.gone);
        reloadAfter.current = true;
      } else {
        setEditErrors((e) => ({ ...e, [q.id]: `${T.errorEdit} ${toUserMessage(err, 'visitQuestion')}` }));
      }
    } finally {
      endMutation(owner);
      if (alive.current) setRowBusy(q.id, null);
    }
  }

  async function onRemove(q: VisitQuestion) {
    if (busyRef.current.has(q.id)) return;
    const owner = beginMutation();
    setRowBusy(q.id, 'remove');
    setRowErrors((e) => withoutKey(e, q.id));
    try {
      await visitQuestionApi.deleteVisitQuestion(q.id);
      if (!alive.current) return;
      setItems((cur) => (cur ? removeQuestion(cur, q.id) : cur));
      setCollapsed((c) => withoutKey(c, q.id));
      setConfirming((c) => withoutKey(c, q.id));
      setDrafts((d) => withoutKey(d, q.id));
      setNotice(T.removed);
    } catch (err) {
      if (alive.current && failRow(q.id, T.errorRemove, err)) setConfirming((c) => withoutKey(c, q.id));
    } finally {
      endMutation(owner);
      if (alive.current) setRowBusy(q.id, null);
    }
  }

  const privacyHelpId = 'vq-privacy';
  return (
    <Screen scrollRef={scrollRef}>
      <ScreenTop
        backLabel={back.label}
        backA11yLabel={back.a11y}
        onBack={() => guard(() => goBackOr(router, back.href))}
        title={T.title}
        lead={T.guide}
      />

      {leaving ? (
        <ConfirmCard
          title={T.leaveTitle}
          primaryLabel={T.leaveStay}
          onPrimary={stay}
          secondaryLabel={T.leaveGo}
          onSecondary={confirmLeave}
          onShown={revealLeave}
        >
          <AppText>{T.leaveBody}</AppText>
        </ConfirmCard>
      ) : null}

      {atLimit ? (
        <AppText accessibilityRole={serverLimit ? 'alert' : undefined} style={{ fontWeight: '700' }}>
          {T.limitReached}
        </AppText>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <AppText style={{ fontWeight: '700' }}>{T.fieldLabel}</AppText>
        <AppInput
          inputRef={inputRef}
          accessibilityLabel={T.fieldLabel}
          accessibilityHint={`${T.privacyHelp} ${T.fieldHelp}`}
          value={addText}
          onChangeText={(text) => {
            setAddText(text);
            setAddProblem(null);
            setAddFailure(null);
            setServerLimit(false);
          }}
          autoCorrect={false}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={() => void onAdd()}
          aria-invalid={addProblem ? true : undefined}
          style={addProblem ? { borderWidth: 3 } : undefined}
        />
        <AppText nativeID={privacyHelpId} variant="secondary">
          {T.privacyHelp}
        </AppText>
        <AppText variant="secondary">{T.fieldHelp}</AppText>
        <AppText variant="secondary" style={{ textAlign: 'right' }}>
          {countText(visitQuestionLength(addText), VISIT_QUESTION_COUNT_MAX)}
        </AppText>
        {addProblem ? <AppText variant="secondary" accessibilityRole="alert">{`! ${addProblem}`}</AppText> : null}
        {addFailure ? (
          <NoticeCard kind="info" alert>
            <AppText>{addFailure}</AppText>
          </NoticeCard>
        ) : null}
        <AppButton
          label={adding ? T.adding : T.add}
          accessibilityLabel={adding ? undefined : T.addLabel}
          accessibilityHint={addReason}
          disabled={addDisabled}
          onPress={() => void onAdd()}
        />
      </View>

      <View accessibilityLiveRegion="polite" style={{ minHeight: 0 }}>
        {notice ? <AppText style={{ fontWeight: '700' }}>{`✓ ${notice}`}</AppText> : null}
      </View>

      <View
        accessibilityRole="tablist"
        accessibilityLabel={T.tabGroup}
        style={{ flexDirection: large ? 'column' : 'row', gap: touch.gap }}
      >
        {TABS.map((t) => {
          const selected = tab === t.tab;
          return (
            <Pressable
              key={t.tab}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected }}
              onPress={() => chooseTab(t.tab)}
              style={{
                flex: large ? undefined : 1,
                minHeight: touch.primaryHeight,
                justifyContent: 'center',
                alignItems: 'center',
                paddingHorizontal: spacing.sm,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: selected ? colors.primary : colors.textSecondary,
                backgroundColor: selected ? colors.primary : colors.surface,
              }}
            >
              <Text
                style={{
                  fontSize: fontSize.body,
                  textAlign: 'center',
                  fontWeight: selected ? '700' : '600',
                  color: selected ? colors.onPrimary : colors.text,
                }}
              >
                {selected ? `✓ ${t.label}` : t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View accessibilityState={{ busy: loading && !items }} style={{ gap: spacing.sm }}>
        {loadError ? (
          <NoticeCard kind="info" alert>
            <AppText>{showStale ? T.stale : loadError}</AppText>
            <AppButton label={T.retry} variant="secondary" onPress={() => void load()} />
          </NoticeCard>
        ) : null}
        {loading && !items && !loadError ? <AppText variant="secondary">{T.loading}</AppText> : null}
        {items && rows.length === 0 ? (
          <AppText variant="secondary">{tab === 'open' ? T.emptyOpen : T.emptyDone}</AppText>
        ) : null}
        {items
          ? rows.map((q) => (
              <VisitQuestionRow
                key={q.id}
                q={q}
                mode={tab === 'done' ? 'done' : collapsed[q.id] ? 'collapsed' : 'open'}
                busy={busy[q.id] ?? null}
                large={large}
                error={rowErrors[q.id] ?? null}
                editDraft={drafts[q.id] ?? null}
                editError={editErrors[q.id] ?? null}
                confirmingRemove={!!confirming[q.id]}
                onDone={() => void onDone(q)}
                onUndo={() => void onUndo(q)}
                onEditStart={() => {
                  setDrafts((d) => ({ ...d, [q.id]: q.text }));
                  setEditErrors((e) => withoutKey(e, q.id));
                }}
                onEditChange={(value) => {
                  setDrafts((d) => ({ ...d, [q.id]: value }));
                  setEditErrors((e) => withoutKey(e, q.id));
                }}
                onEditSave={() => void onEditSave(q)}
                onEditCancel={() => closeEdit(q.id)}
                onRemoveAsk={() => {
                  setRowErrors((e) => withoutKey(e, q.id));
                  setConfirming((c) => ({ ...c, [q.id]: true }));
                }}
                onRemoveYes={() => void onRemove(q)}
                onRemoveNo={() => {
                  setRowErrors((e) => withoutKey(e, q.id));
                  setConfirming((c) => withoutKey(c, q.id));
                }}
              />
            ))
          : null}
      </View>

      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}
