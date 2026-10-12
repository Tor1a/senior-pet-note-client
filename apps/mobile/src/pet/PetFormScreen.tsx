// 반려동물 등록·수정 폼 (/pet/new, /pet/edit) — 웹 PetFormPage 의 사진 제외 부분 (설계 4~5장, 1단계)
// - 검증·변환·오류 분류는 lib/petForm.ts(웹 원본의 사본). 사진은 1단계에서 만들지 않는다: 수정 폼에 "웹에서만 바꿀 수 있어요" 안내 한 줄만 둔다.
//   2단계에서 이 파일의 PHOTO_SLOT 자리와 PetAvatar 안쪽만 바꾸면 된다.
// - 등록 성공: 오늘로(폼이 스택에 남지 않게 dismissTo) + 등록 안내 코드. 수정 성공: 들어왔던 화면으로 + 수정 안내 코드.
// - 409 PET_LIMIT_REACHED(등록): 반려동물을 다시 읽고 오늘로 + 안내. 404(수정): 다시 읽고 오늘(=시작 화면)로 + 안내. 401 은 조용히 무시.
//   다시 읽기에 실패하면(오프라인 등) 이동하지 않고 폼에 머물며 사실 위주 오류 + [다시 시도]. 입력은 그대로.
// - 등록 화면(/pet/new)은 PetGate 밖이라 직접 확인한다: 확인 중이면 로딩, 이미 반려동물이 있으면 오늘로, 없음·오프라인·오류로 확정되면 폼.
// - 저장 중 시스템 뒤로·스와이프는 확인 카드 없이 막기만 한다("저장하지 않고 나갈까요?"는 저장 중에 오해를 부른다).
// - 중복 제출은 useRef 로 막고(같은 프레임 연타 포함), 저장 중에는 입력·뒤로를 잠근다. 입력값은 오류에도 유지한다.
// - 고친 내용이 있으면 뒤로·스와이프·버튼 모두 이탈 확인(useLeaveGuard).
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, ChoiceButton, Screen, TextField } from '../components/ui';
import { ApiError } from '../lib/api';
import {
  classifyPetSaveError,
  conditionsRemaining,
  draftFromPet,
  hasPetFieldErrors,
  isPetDraftDirty,
  PET_CONDITIONS_MAX,
  PET_NAME_MAX,
  toPetInput,
  toSingleLine,
  validatePetDraft,
  type PetDraft,
  type PetFieldErrors,
} from '../lib/petForm';
import type { Species } from '../lib/petApi';
import { isHugeFont, isLargeFont } from '../medications/layout';
import { PetLoading } from './PetGate';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { useLeaveGuard } from '../medications/useLeaveGuard';
import { petApi } from '../services/client';
import { colors, spacing } from '../theme';
import { PET_TEXT, remainingText, speciesText } from './petText';
import { usePet } from './PetProvider';
import { FROM_HREF, parseEditFrom, type EditFrom } from './routes';
import { YearField, YearSheet } from './YearSheet';

const BACK_LABELS: Record<EditFrom, { label: string; a11y: string }> = {
  today: { label: PET_TEXT.backToday, a11y: '오늘 화면으로 돌아가기' },
  medications: { label: PET_TEXT.backMedications, a11y: '약 관리 화면으로 돌아가기' },
  account: { label: PET_TEXT.backAccount, a11y: '계정 화면으로 돌아가기' },
};

const SPECIES_LIST: readonly Species[] = ['dog', 'cat'];

export default function PetFormScreen({ mode, from: fromParam }: { mode: 'new' | 'edit'; from?: unknown }) {
  const router = useRouter();
  const { pet, status, reload, setPet } = usePet();
  const { fontScale } = useWindowDimensions();
  const isNew = mode === 'new';
  const from = parseEditFrom(fromParam);
  const editing = isNew ? null : pet;

  // 등록 화면: 처음 확인(loading)이 끝나기 전에는 폼을 그리지 않는다. 한 번 확정되면 이후 재확인(loading)에도 폼을 유지한다
  const [settled, setSettled] = useState(status !== 'loading');
  const finishedRef = useRef(false); // 저장·안내 이동이 시작됐다: 상태가 ready 로 바뀌어도 "이미 있음" 이동을 또 하지 않는다
  const [draft, setDraft] = useState<PetDraft>(() => draftFromPet(editing));
  const [fieldError, setFieldError] = useState<PetFieldErrors>({});
  const [showSummary, setShowSummary] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [followup, setFollowup] = useState<'limit' | 'gone' | null>(null); // 다시 읽기에 실패해 [다시 시도]를 기다리는 중
  const [busy, setBusy] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const alive = useRef(true);
  const submittingRef = useRef(false); // 같은 프레임 연타(state 가 아직 안 바뀐 때)도 막는다
  const nameRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const speciesRef = useRef<View>(null);
  const speciesY = useRef(0);
  const yearButtonRef = useRef<View>(null);

  const dirty = isPetDraftDirty(draft, editing);
  const { leaving, confirmLeave, stay, guard, withoutGuard } = useLeaveGuard(dirty, busy);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (status !== 'loading') setSettled(true);
  }, [status]);

  const alreadyHasPet = isNew && status === 'ready' && !finishedRef.current;
  useEffect(() => {
    if (alreadyHasPet) router.replace('/' as never);
    // router 는 고정이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyHasPet]);

  // 칸별 오류를 모두 고치면 "빠진 곳이 있어요" 요약도 사라진다
  useEffect(() => {
    if (showSummary && !hasPetFieldErrors(fieldError)) setShowSummary(false);
  }, [showSummary, fieldError]);

  const thisYear = new Date().getFullYear();
  const birthYear = draft.birthYear ? Number(draft.birthYear) : null;

  function change(patch: Partial<PetDraft>) {
    if (busy) return;
    setDraft((d) => ({ ...d, ...patch }));
  }

  // 키째 지운다(값만 undefined 로 두면 hasPetFieldErrors 가 오류가 남은 것으로 센다)
  function clearFieldError(key: keyof PetFieldErrors) {
    setFieldError((e) => {
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  }

  const leaveTo = (href: string, notice: string) =>
    withoutGuard(() => router.dismissTo({ pathname: href, params: { notice } } as never));

  const focusNode = (node: View | null) => {
    const handle = node ? findNodeHandle(node) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };

  /** 409·404 뒤: 반려동물을 다시 읽고 안내와 함께 오늘로. 못 읽으면 이동하지 않고 폼에 머문다 */
  async function reloadThenLeave(kind: 'limit' | 'gone') {
    finishedRef.current = true; // 다시 읽어 ready 가 되어도 "이미 있음" 이동이 겹치지 않게
    const ok = await reload({ keepOnError: true });
    if (ok) {
      leaveTo('/', kind === 'limit' ? 'petLimit' : 'petGone'); // 화면이 이미 사라졌어도(시작 화면 전환) 이동은 한다
      return;
    }
    finishedRef.current = false;
    if (!alive.current) return;
    setFollowup(kind);
    setFormError(PET_TEXT.recheckFailed);
  }

  async function onRetry() {
    if (busy || submittingRef.current || !followup) return;
    submittingRef.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const kind = followup;
      setFollowup(null);
      await reloadThenLeave(kind);
    } finally {
      submittingRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function onSubmit() {
    if (busy || submittingRef.current) return;
    if (!isNew && !editing) return;
    const errors = validatePetDraft(draft);
    setFieldError(errors);
    setFormError(null);
    setFollowup(null);
    setShowSummary(hasPetFieldErrors(errors));
    const input = toPetInput(draft);
    if (hasPetFieldErrors(errors) || !input) {
      if (errors.name) nameRef.current?.focus();
      else {
        scrollRef.current?.scrollTo({ y: Math.max(0, speciesY.current - spacing.md), animated: true });
        focusNode(speciesRef.current);
      }
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    Keyboard.dismiss();
    try {
      const saved = isNew ? await petApi.createPet(input) : await petApi.updatePet(editing!.id, input);
      finishedRef.current = true; // setPet 으로 ready 가 되어도 "이미 있음" 이동이 겹치지 않게
      setPet(saved); // 화면이 사라졌어도 앱 상태는 맞춘다
      if (!alive.current) return;
      if (isNew) leaveTo('/', 'petCreated');
      else leaveTo(FROM_HREF[from], 'petUpdated');
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 401) return;
      const failure = classifyPetSaveError(err, isNew);
      if (failure.kind === 'limit' || failure.kind === 'gone') {
        await reloadThenLeave(failure.kind);
      } else {
        setFormError(failure.message);
        const network = err instanceof ApiError && err.kind === 'network';
        if (network) AccessibilityInfo.announceForAccessibility?.(`${failure.message} ${PET_TEXT.kept}`);
      }
    } finally {
      submittingRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const goBack = () => (isNew ? goBackOr(router, '/') : goBackOr(router, FROM_HREF[from]));
  const backLabels = isNew ? { label: PET_TEXT.backNew, a11y: '이전 화면으로 돌아가기' } : BACK_LABELS[from];
  const saveLabel = busy ? PET_TEXT.busy : isNew ? PET_TEXT.create : PET_TEXT.save;
  const large = isLargeFont(fontScale);
  const huge = isHugeFont(fontScale);
  const remaining = conditionsRemaining(draft.conditions);
  const networkKept = (formError !== null && formError.startsWith('서버에 연결할 수 없어요')) || followup !== null;

  if (isNew && !settled) return <PetLoading />;
  if (alreadyHasPet) return null;

  const errorNode =
    showSummary || formError ? (
      <NoticeCard kind="info" alert>
        <AppText style={{ fontWeight: '700' }}>{formError ?? PET_TEXT.summary}</AppText>
        {networkKept ? <AppText variant="secondary">{PET_TEXT.kept}</AppText> : null}
        {followup ? <AppButton label={PET_TEXT.recheckRetry} variant="secondary" onPress={() => void onRetry()} /> : null}
      </NoticeCard>
    ) : null;

  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        <View style={{ gap: 8, padding: 16, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
          {huge ? null : errorNode}
          <AppButton label={saveLabel} accessibilityLabel={saveLabel} loading={busy} onPress={() => void onSubmit()} />
        </View>
      }
    >
      <ScreenTop
        backLabel={backLabels.label}
        backA11yLabel={backLabels.a11y}
        backDisabled={busy}
        onBack={() => guard(goBack)}
        title={isNew ? PET_TEXT.newTitle : PET_TEXT.editTitle}
        lead={isNew ? PET_TEXT.newLead : undefined}
      />

      {huge ? errorNode : null}

      {leaving && !busy ? (
        <NoticeCard kind="info" alert>
          <AppText style={{ fontWeight: '700' }} accessibilityRole="header">
            {PET_TEXT.leaveTitle}
          </AppText>
          <AppText variant="secondary">{PET_TEXT.leaveBody}</AppText>
          <AppButton label={PET_TEXT.leaveStay} onPress={stay} />
          <AppButton label={PET_TEXT.leaveGo} variant="secondary" onPress={confirmLeave} />
        </NoticeCard>
      ) : null}

      <TextField
        label={PET_TEXT.nameLabel}
        value={draft.name}
        maxLength={PET_NAME_MAX}
        placeholder={PET_TEXT.namePlaceholder}
        returnKeyType="done"
        editable={!busy}
        autoCorrect={false}
        onChangeText={(name) => {
          change({ name });
          if (fieldError.name) clearFieldError('name');
        }}
        onSubmitEditing={() => {
          Keyboard.dismiss();
          scrollRef.current?.scrollTo({ y: Math.max(0, speciesY.current - spacing.md), animated: true });
        }}
        inputRef={nameRef}
        error={fieldError.name}
      />

      <View
        style={{ gap: spacing.sm }}
        onLayout={(e) => (speciesY.current = e.nativeEvent.layout.y)}
      >
        <View ref={speciesRef} accessible accessibilityRole="header" collapsable={false}>
          <AppText style={{ fontWeight: '700' }}>{PET_TEXT.speciesLabel}</AppText>
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={PET_TEXT.speciesLabel}
          style={{ flexDirection: large ? 'column' : 'row', gap: spacing.sm }}
        >
          {SPECIES_LIST.map((value, i) => (
            <View key={value} style={large ? undefined : { flex: 1 }}>
              <ChoiceButton
                large
                label={speciesText(value)}
                accessibilityLabel={`${speciesText(value)}, ${SPECIES_LIST.length}개 중 ${i + 1}번째`}
                selected={draft.species === value}
                disabled={busy}
                onPress={() => {
                  change({ species: value });
                  if (fieldError.species) clearFieldError('species');
                }}
              />
            </View>
          ))}
        </View>
        {fieldError.species ? (
          <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${fieldError.species}`}</AppText>
        ) : null}
      </View>

      <View ref={yearButtonRef} collapsable={false}>
        <YearField value={birthYear} disabled={busy} onPress={() => setYearOpen(true)} />
      </View>
      <YearSheet
        visible={yearOpen}
        value={birthYear}
        thisYear={thisYear}
        onCancel={() => {
          setYearOpen(false);
          setTimeout(() => focusNode(yearButtonRef.current), 300);
        }}
        onDone={(year) => {
          setYearOpen(false);
          change({ birthYear: year ? String(year) : '' });
          AccessibilityInfo.announceForAccessibility?.(year ? `${year}년으로 정했어요` : PET_TEXT.birthNone);
          setTimeout(() => focusNode(yearButtonRef.current), 300);
        }}
      />

      <View style={{ gap: 4 }}>
        <TextField
          label={PET_TEXT.conditionsLabel}
          value={draft.conditions}
          maxLength={PET_CONDITIONS_MAX}
          placeholder={PET_TEXT.conditionsPlaceholder}
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          editable={!busy}
          onChangeText={(text) => change({ conditions: toSingleLine(text) })}
        />
        {remaining !== null ? (
          <AppText variant="secondary" accessibilityLiveRegion="polite">
            {remaining <= 0 ? PET_TEXT.conditionsFull : remainingText(remaining)}
          </AppText>
        ) : null}
      </View>

      {/* PHOTO_SLOT: 2단계에서 여기에 사진 영역(PhotoField)이 들어간다. 1단계는 수정 폼에 안내 한 줄만 */}
      {isNew ? null : <AppText variant="secondary">{PET_TEXT.photoNote}</AppText>}

      {/* 큰 글씨에서 키보드가 올라오면 하단 고정 버튼이 숨으므로 스크롤 맨 아래에도 한 번 더 둔다 */}
      {large ? <AppButton label={saveLabel} loading={busy} onPress={() => void onSubmit()} /> : null}
    </Screen>
  );
}
