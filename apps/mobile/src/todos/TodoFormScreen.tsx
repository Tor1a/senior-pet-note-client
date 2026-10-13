// 할 일 추가(/todos/new)·보기·고치기(/todos/[id]) — 웹 TodoFormPage 와 같은 규칙 (기획서 6-1)
// 제목(필수 40자), 날짜(필수·기본값 없음), 시각(선택), 일정 메모(200자), 알림 받기(기본 켬). 고치기 화면에는 병원 메모(500자)·완료/완료 취소·지우기가 더해진다.
// 단일 조회 API 가 없어 예정 목록 → 완료 목록 순으로 찾는다. 날짜·시각 계산은 하지 않는다(서버가 판단).
// 제목 예시 글자나 추천 버튼은 두지 않는다(기획서 Q6). 알림 권한은 [알림 허용하기] 버튼에서만 묻는다.
// 저장 성공·지우기·404 는 목록(/todos)으로 dismissTo + 안내 코드. 고친 내용이 있으면 뒤로·스와이프·버튼 모두 이탈 확인(useLeaveGuard).
// 저장 중에는 입력·뒤로를 잠그고(시스템 뒤로는 확인 카드 없이 막기만), 중복 제출은 useRef 로 막는다.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { ConfirmCard } from '../components/ConfirmCard';
import { DateTimeField } from '../components/DateTimeField';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, Card, ChoiceButton, LinkButton, Screen, TextField } from '../components/ui';
import { ApiError, toUserMessage } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { formatTime } from '../lib/format';
import type { Todo } from '../lib/todoApi';
import {
  codePointLength,
  draftFromTodo,
  EMPTY_TODO_DRAFT,
  isTodoDraftDirty,
  toTodoInput,
  TODO_HOSPITAL_NOTE_MAX,
  TODO_MEMO_MAX,
  TODO_TITLE_MAX,
  validateTodoDraft,
  type TodoDraft,
  type TodoField,
  type TodoProblem,
} from '../lib/todoForm';
import { countText, remindInfoText, TODO_TEXT } from '../lib/todoText';
import { isHugeFont, isLargeFont } from '../medications/layout';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { useLeaveGuard } from '../medications/useLeaveGuard';
import { usePet } from '../pet/PetProvider';
import { formatFullDate, spokenDate, spokenTime } from '../services/datePickerValue';
import { todoApi } from '../services/client';
import { colors, spacing } from '../theme';
import { TODOS_HREF, type TodoNoticeKind } from './routes';
import { TodoDeviceLine } from './TodoDeviceLine';
import { TODO_MOBILE_TEXT } from './todoMobileText';

export default function TodoFormScreen({ todoId }: { todoId?: string }) {
  const router = useRouter();
  const { pet, reload: reloadPet } = usePet();
  const { fontScale } = useWindowDimensions();
  const large = isLargeFont(fontScale);
  const huge = isHugeFont(fontScale);
  const editing = !!todoId;

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
  const submitting = useRef(false);
  const alive = useRef(true);
  const titleRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  const dirty = !!draft && isTodoDraftDirty(draft, base);
  const { leaving, confirmLeave, stay, guard, withoutGuard } = useLeaveGuard(dirty, saving || deleting);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const goList = useCallback(
    (kind?: TodoNoticeKind) =>
      withoutGuard(() =>
        router.dismissTo((kind ? { pathname: TODOS_HREF, params: { notice: kind } } : TODOS_HREF) as never),
      ),
    [router, withoutGuard],
  );

  const load = useCallback(async () => {
    if (!pet || !todoId) return;
    setLoadError(null);
    try {
      // 단일 조회 API 가 없다 → 예정 목록에서 먼저, 없으면 완료 목록에서 찾는다
      let found = (await todoApi.listTodos(pet.id, 'open'))?.todos?.find((t) => t.id === todoId) ?? null;
      if (!found) found = (await todoApi.listTodos(pet.id, 'done'))?.todos?.find((t) => t.id === todoId) ?? null;
      if (!alive.current) return;
      if (!found) {
        goList('gone');
        return;
      }
      setTodo(found);
      const d = draftFromTodo(found);
      setDraft(d);
      setBase(d);
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      setLoadError(toUserMessage(err, 'todo'));
    }
  }, [pet, todoId, goList, reloadPet]);

  useEffect(() => {
    if (editing) void load();
  }, [editing, load]);

  function change(patch: Partial<TodoDraft>) {
    if (!draft || saving) return;
    setDraft({ ...draft, ...patch });
    setSaveError(null);
    // 입력을 시작하면 그 칸 오류를 지운다
    const field = (Object.keys(patch)[0] ?? '') as TodoField;
    if (problem && problem.field === field) setProblem(null);
  }

  function handleFailure(err: unknown) {
    if (err instanceof ApiError && err.status === 401) return; // 로그인 화면으로 이동 중
    if (err instanceof ApiError && err.status === 404) {
      goList('gone');
      return;
    }
    setSaveError(toUserMessage(err, 'todo'));
  }

  async function onSubmit() {
    if (!draft || !pet || saving || submitting.current) return;
    setNotice(null);
    const p = validateTodoDraft(draft);
    setProblem(p);
    setSaveError(null);
    if (p) {
      if (p.field === 'title') titleRef.current?.focus();
      else scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    submitting.current = true;
    setSaving(true);
    Keyboard.dismiss();
    try {
      const input = toTodoInput(draft);
      if (editing && todoId) await todoApi.updateTodo(todoId, input);
      else await todoApi.createTodo(pet.id, input);
      // 저장 성공 뒤에는 이탈 확인 없이 목록으로
      goList(editing ? 'updated' : 'created');
    } catch (err) {
      if (alive.current) handleFailure(err);
    } finally {
      submitting.current = false;
      if (alive.current) setSaving(false);
    }
  }

  /** 완료/완료 취소: 저장된 값에 바로 적용하고, 폼에 고치던 내용은 그대로 둔다 */
  async function toggleCompleted() {
    if (!todo || toggling) return;
    setToggling(true);
    setSaveError(null);
    try {
      const res = await todoApi.setTodoCompleted(todo.id, !todo.completed);
      if (!alive.current) return;
      if (res) setTodo(res);
      setNotice(todo.completed ? TODO_TEXT.undoneNotice : TODO_TEXT.completedNotice);
    } catch (err) {
      if (alive.current) handleFailure(err);
    } finally {
      if (alive.current) setToggling(false);
    }
  }

  async function remove() {
    if (!todo || deleting) return;
    setDeleting(true);
    try {
      await todoApi.deleteTodo(todo.id);
      goList('deleted');
    } catch (err) {
      if (!alive.current) return;
      setConfirmDelete(false);
      handleFailure(err);
    } finally {
      if (alive.current) setDeleting(false);
    }
  }

  const title = editing ? TODO_TEXT.formTitleEdit : TODO_TEXT.formTitleNew;
  const errorFor = (field: TodoField) => (problem?.field === field ? problem.message : undefined);
  const saveLabel = saving ? TODO_TEXT.saving : editing ? TODO_TEXT.saveEdit : TODO_TEXT.saveNew;
  const goBack = () => goBackOr(router, TODOS_HREF);

  const errorNode =
    problem || saveError ? (
      <NoticeCard kind="info" alert>
        <AppText style={{ fontWeight: '700' }}>{saveError ?? TODO_TEXT.summaryProblem}</AppText>
        {saveError ? <AppText variant="secondary">{TODO_TEXT.keptInput}</AppText> : null}
      </NoticeCard>
    ) : null;

  const saveButton = draft ? (
    <AppButton label={saveLabel} accessibilityLabel={saveLabel} loading={saving} disabled={deleting} onPress={() => void onSubmit()} />
  ) : null;

  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        draft ? (
          <View style={{ gap: 8, padding: 16, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
            {huge ? null : errorNode}
            {saveButton}
          </View>
        ) : undefined
      }
    >
      <ScreenTop
        backLabel={TODO_TEXT.backToList.replace('← ', '')}
        backA11yLabel="할 일 목록으로 돌아가기"
        backDisabled={saving || deleting}
        onBack={() => guard(goBack)}
        title={title}
        lead={TODO_TEXT.guide}
      />

      {huge ? errorNode : null}

      {leaving && !saving ? (
        <ConfirmCard
          title={TODO_TEXT.leaveTitle}
          primaryLabel={TODO_TEXT.leaveStay}
          onPrimary={stay}
          secondaryLabel={TODO_TEXT.leaveGo}
          onSecondary={confirmLeave}
        >
          <AppText variant="secondary">{TODO_TEXT.leaveBody}</AppText>
        </ConfirmCard>
      ) : null}

      {loadError ? (
        <NoticeCard kind="info" alert>
          <AppText>{loadError}</AppText>
          <AppButton label={TODO_TEXT.retry} variant="secondary" onPress={() => void load()} />
        </NoticeCard>
      ) : null}
      {!draft && !loadError ? (
        <AppText variant="secondary" accessibilityState={{ busy: true }}>
          {TODO_TEXT.loading}
        </AppText>
      ) : null}

      {notice ? (
        <NoticeCard kind="ok">
          <AppText>{`✓ ${notice}`}</AppText>
        </NoticeCard>
      ) : null}

      {draft ? (
        <>
          <View style={{ gap: 4 }}>
            <TextField
              label={TODO_TEXT.fieldTitle}
              value={draft.title}
              returnKeyType="done"
              editable={!saving}
              onChangeText={(t) => change({ title: t.replace(/[\r\n]+/g, ' ') })}
              onSubmitEditing={() => Keyboard.dismiss()}
              inputRef={titleRef}
              error={errorFor('title')}
            />
            <AppText variant="caption" style={{ textAlign: 'right' }}>
              {countText(codePointLength(draft.title.trim()), TODO_TITLE_MAX)}
            </AppText>
          </View>

          <View style={{ gap: 4 }}>
            <AppText style={{ fontWeight: '700' }}>{TODO_TEXT.fieldDate}</AppText>
            <DateTimeField
              mode="date"
              value={draft.dueDate}
              onChange={(dueDate) => change({ dueDate })}
              displayText={draft.dueDate ? formatFullDate(draft.dueDate) : TODO_MOBILE_TEXT.dateEmpty}
              sheetTitle={TODO_MOBILE_TEXT.dateSheetTitle}
              accessibilityLabel={`${TODO_TEXT.fieldDate}, ${draft.dueDate ? spokenDate(draft.dueDate) : TODO_MOBILE_TEXT.dateNotChosen}`}
              accessibilityHint={TODO_MOBILE_TEXT.dateHint}
              disabled={saving}
              testID="todo-date"
            />
            {editing ? <AppText variant="secondary">{TODO_TEXT.dateEditNote}</AppText> : null}
            {errorFor('dueDate') ? (
              <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${errorFor('dueDate')}`}</AppText>
            ) : null}
          </View>

          <View style={{ gap: 4 }}>
            <AppText style={{ fontWeight: '700' }}>{TODO_TEXT.fieldTime}</AppText>
            <DateTimeField
              mode="time"
              value={draft.dueTime}
              onChange={(dueTime) => change({ dueTime })}
              displayText={draft.dueTime ? formatTime(draft.dueTime) : TODO_MOBILE_TEXT.timeEmpty}
              sheetTitle={TODO_MOBILE_TEXT.timeSheetTitle}
              accessibilityLabel={`${TODO_TEXT.fieldTime}, ${draft.dueTime ? spokenTime(draft.dueTime) : TODO_MOBILE_TEXT.timeNotChosen}`}
              accessibilityHint={TODO_MOBILE_TEXT.timeHint}
              disabled={saving}
              testID="todo-time"
            />
            {draft.dueTime ? (
              <LinkButton label={TODO_TEXT.fieldTimeClear} disabled={saving} onPress={() => change({ dueTime: '' })} />
            ) : null}
            {errorFor('dueTime') ? (
              <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${errorFor('dueTime')}`}</AppText>
            ) : null}
          </View>

          <View style={{ gap: 4 }}>
            <TextField
              label={TODO_TEXT.fieldMemo}
              value={draft.memo}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              editable={!saving}
              onChangeText={(memo) => change({ memo })}
              error={errorFor('memo')}
            />
            <AppText variant="secondary">{TODO_TEXT.fieldMemoHelp}</AppText>
            <AppText variant="caption" style={{ textAlign: 'right' }}>
              {countText(codePointLength(draft.memo.trim()), TODO_MEMO_MAX)}
            </AppText>
          </View>

          <View style={{ gap: spacing.sm }}>
            <AppText style={{ fontWeight: '700' }} accessibilityRole="header">
              {TODO_TEXT.fieldRemind}
            </AppText>
            <ChoiceButton
              tall
              role="checkbox"
              label={`${TODO_TEXT.fieldRemind} · ${draft.remind ? TODO_TEXT.switchOn : TODO_TEXT.switchOff}`}
              accessibilityLabel={TODO_TEXT.fieldRemind}
              selected={draft.remind}
              disabled={saving}
              onPress={() => change({ remind: !draft.remind })}
            />
            <Card accent={false}>
              <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
                <AppText>{draft.remind ? remindInfoText() : TODO_TEXT.remindOffInfo}</AppText>
                {draft.remind ? <AppText variant="caption">{TODO_TEXT.remindSkipNote}</AppText> : null}
              </View>
            </Card>
            {draft.remind ? <TodoDeviceLine onAllowed={() => setNotice(TODO_TEXT.devicePermAsked)} /> : null}
          </View>

          {editing ? (
            <View style={{ gap: 4 }}>
              <TextField
                label={TODO_TEXT.fieldHospitalNote}
                value={draft.hospitalNote}
                multiline
                numberOfLines={5}
                submitBehavior="blurAndSubmit"
                returnKeyType="done"
                editable={!saving}
                onChangeText={(hospitalNote) => change({ hospitalNote })}
                error={errorFor('hospitalNote')}
              />
              <AppText variant="secondary">{TODO_TEXT.fieldHospitalNoteHelp}</AppText>
              <AppText variant="caption" style={{ textAlign: 'right' }}>
                {countText(codePointLength(draft.hospitalNote.trim()), TODO_HOSPITAL_NOTE_MAX)}
              </AppText>
            </View>
          ) : null}

          {/* 큰 글씨에서 키보드가 올라오면 하단 고정 버튼이 숨으므로 스크롤 맨 아래에도 한 번 더 둔다 */}
          {large ? saveButton : null}

          {editing && todo ? (
            <Card>
              <AppText accessibilityRole="header" style={{ fontWeight: '700' }}>
                {TODO_TEXT.stateSection}
              </AppText>
              <AppText variant="secondary">{todo.completed ? TODO_TEXT.stateDone : TODO_TEXT.stateOpen}</AppText>
              <AppButton
                label={toggling ? TODO_TEXT.completing : todo.completed ? TODO_TEXT.formCancelDone : TODO_TEXT.formComplete}
                variant={todo.completed ? 'secondary' : 'primary'}
                disabled={toggling || saving}
                onPress={() => void toggleCompleted()}
              />
              {confirmDelete ? (
                <ConfirmCard
                  title={TODO_TEXT.deleteTitle}
                  primaryLabel={TODO_TEXT.deleteNo}
                  onPrimary={() => setConfirmDelete(false)}
                  secondaryLabel={deleting ? TODO_TEXT.deleting : TODO_TEXT.deleteYes}
                  onSecondary={() => void remove()}
                  disabled={deleting}
                >
                  <AppText variant="secondary">{TODO_TEXT.deleteBody}</AppText>
                </ConfirmCard>
              ) : (
                <LinkButton label={TODO_TEXT.deleteButton} disabled={saving} onPress={() => setConfirmDelete(true)} />
              )}
            </Card>
          ) : null}
        </>
      ) : null}

      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}
