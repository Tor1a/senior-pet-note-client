// 반려동물 등록·수정 폼 (/pet/new, /pet/edit) — 웹 PetFormPage 의 사진 제외 부분 (설계 4~5장, 1단계)
// - 검증·변환·오류 분류는 lib/petForm.ts(웹 원본의 사본). 사진은 1단계에서 만들지 않는다: 수정 폼에 "웹에서만 바꿀 수 있어요" 안내 한 줄만 둔다.
//   2단계에서 이 파일의 PHOTO_SLOT 자리와 PetAvatar 안쪽만 바꾸면 된다.
// - 등록 성공: 오늘로(폼이 스택에 남지 않게 dismissTo) + 등록 안내 코드. 수정 성공: 들어왔던 화면으로 + 수정 안내 코드.
// - 409 PET_LIMIT_REACHED(등록): 반려동물을 다시 읽고 오늘로 + 안내. 404(수정): 다시 읽고 오늘(=시작 화면)로 + 안내. 401 은 조용히 무시.
//   다시 읽기에 실패하면(오프라인 등) 이동하지 않고 폼에 머물며 사실 위주 오류 + [다시 시도]. 입력은 그대로.
// - 등록 화면(/pet/new)은 PetGate 밖이라 직접 확인한다: 확인 중이면 로딩, 이미 반려동물이 있으면 오늘로, 없음·오프라인·오류로 확정되면 폼.
// - 저장 중 시스템 뒤로·스와이프는 확인 카드 없이 막기만 한다("저장하지 않고 나갈까요?"는 저장 중에 오해를 부른다).
// - 중복 제출은 useRef 로 막고(같은 프레임 연타 포함), 저장 중에는 입력·뒤로를 잠근다. 입력값은 오류에도 유지한다.
// - 고친 내용이 있으면 뒤로·스와이프·버튼 모두 이탈 확인(useLeaveGuard). 유형·생일·입양일도 dirty 에 들어가고, 날짜 행을 접고 펴는 것은 들어가지 않는다.
// - 온보딩 C단계: 유형 라디오 3개(기본 "나중에 정할게요" = null), 접힌 행 "날짜 자세히 적기"(생일 월·일, 입양일 연·월·일; 값이 있으면 열린 채 시작,
//   저장 때 오류가 안에 있으면 펼침). 검사는 validatePetDraft(draft, today) 로 기기 달력 날짜를 **명시해서** 넘긴다. 본문은 toPetInput(draft, 저장된 pet): 바뀐 키만. 유형·생일·입양일도 dirty 에 들어가고, 날짜 행을 접고 펴는 것은 들어가지 않는다.
// - 온보딩 C단계: 유형 라디오 3개(기본 "나중에 정할게요" = null), 접힌 행 "날짜 자세히 적기"(생일 월·일, 입양일 연·월·일; 값이 있으면 열린 채 시작,
//   저장 때 오류가 안에 있으면 펼침). 검사는 validatePetDraft(draft, today) 로 기기 달력 날짜를 **명시해서** 넘긴다. 본문은 toPetInput(draft, 저장된 pet): 바뀐 키만.
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, ChoiceButton, Screen, TextField } from '../components/ui';
import { ApiError } from '../lib/api';
import {
  adoptedDate,
  birthMonthDay,
  birthYearOptions,
  changeAdoptedPart,
  changeBirthPart,
  changeBirthYear,
  classifyPetSaveError,
  conditionsRemaining,
  draftFromPet,
  hasDateValues,
  hasPetFieldErrors,
  isPetDraftDirty,
  PET_CONDITIONS_MAX,
  PET_NAME_MAX,
  toPetInput,
  toSingleLine,
  validatePetDraft,
  type PetDraft,
  type PetDraftChange,
  type PetFieldErrors,
} from '../lib/petForm';
import type { Species } from '../lib/petApi';
import { dayOptions, monthOptions, todayParts } from '../lib/petProfile';
import { PET_PROFILE_TEXT as PT, PET_TYPE_CHOICES, petDateSummary, petDayText, petMonthText, petYearText } from '../lib/petProfileText';
import { PRIVACY_TEXT } from '../lib/privacyText';
import { isHugeFont, isLargeFont } from '../medications/layout';
import { PetLoading } from './PetGate';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { useLeaveGuard } from '../medications/useLeaveGuard';
import { petApi } from '../services/client';
import { colors, spacing } from '../theme';
import { OptionSheet, PickField, type SheetOption } from './OptionSheet';
import {
  chosenDayText,
  chosenMonthText,
  chosenYearText,
  dateFieldLabel,
  PET_DATE_TEXT,
  PET_TEXT,
  remainingText,
  speciesText,
  typeChoiceLabel,
} from './petText';
import { usePet } from './PetProvider';
import { FROM_HREF, parseEditFrom, type EditFrom } from './routes';
import { YearField, YearSheet } from './YearSheet';

const BACK_LABELS: Record<EditFrom, { label: string; a11y: string }> = {
  today: { label: PET_TEXT.backToday, a11y: '오늘 화면으로 돌아가기' },
  medications: { label: PET_TEXT.backMedications, a11y: '약 관리 화면으로 돌아가기' },
  account: { label: PET_TEXT.backAccount, a11y: '계정 화면으로 돌아가기' },
};

const SPECIES_LIST: readonly Species[] = ['dog', 'cat'];

/** 날짜 칸 시트 하나를 가리킨다 */
type DateSheet = 'birthMonth' | 'birthDay' | 'adoptedYear' | 'adoptedMonth' | 'adoptedDay';
const DATE_FIELDS: Record<DateSheet, { draftKey: keyof PetDraft; title: string; name: string }> = {
  birthMonth: { draftKey: 'birthMonth', title: PET_DATE_TEXT.sheetBirthMonth, name: '생일 월' },
  birthDay: { draftKey: 'birthDay', title: PET_DATE_TEXT.sheetBirthDay, name: '생일 일' },
  adoptedYear: { draftKey: 'adoptedYear', title: PET_DATE_TEXT.sheetAdoptYear, name: '입양일 연도' },
  adoptedMonth: { draftKey: 'adoptedMonth', title: PET_DATE_TEXT.sheetAdoptMonth, name: '입양일 월' },
  adoptedDay: { draftKey: 'adoptedDay', title: PET_DATE_TEXT.sheetAdoptDay, name: '입양일 일' },
};
const numOrNull = (v: string) => (v ? Number(v) : null);

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
  const [dateOpen, setDateOpen] = useState(() => hasDateValues(draftFromPet(editing))); // 화면을 연 직후 한 번: 값이 있으면 열린 채 시작
  const [sheet, setSheet] = useState<DateSheet | null>(null);
  const [dateNotice, setDateNotice] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<'birth' | 'adopted' | null>(null); // 펼친 뒤 첫 오류 칸으로 포커스
  const alive = useRef(true);
  const submittingRef = useRef(false); // 같은 프레임 연타(state 가 아직 안 바뀐 때)도 막는다
  const nameRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const speciesRef = useRef<View>(null);
  const speciesY = useRef(0);
  const yearButtonRef = useRef<View>(null);
  const dateY = useRef(0);
  const birthFieldRef = useRef<View>(null);
  const adoptedFieldRef = useRef<View>(null);
  const sheetOpenerRef = useRef<View | null>(null);

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

  // 접힘 안 오류로 펼친 직후, 렌더가 끝난 다음 첫 오류 칸으로 스크롤·포커스
  useEffect(() => {
    if (!focusDate || !dateOpen) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, dateY.current - spacing.md), animated: true });
    focusNode(focusDate === 'birth' ? birthFieldRef.current : adoptedFieldRef.current);
    setFocusDate(null);
    // focusNode 는 고정 함수다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDate, dateOpen]);

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

  /** 날짜 칸을 바꾼다. 일이 사라지면 안내를 읽어 준다. 그 칸 그룹의 오류는 지운다 */
  function applyDateChange(result: PetDraftChange, clear: ('birth' | 'adopted')[]) {
    if (busy) return;
    setDraft(result.draft);
    for (const key of clear) clearFieldError(key);
    // 생일을 바꾸면 "입양일이 생일보다 빠를 수 없어요" 오류도 낡은 것이 된다
    if (clear.includes('birth') && !clear.includes('adopted') && fieldError.adopted === PT.errAdoptBeforeBirth) clearFieldError('adopted');
    const text =
      result.notice === 'dayCleared' ? PT.noticeDayCleared : result.notice === 'birthCleared' ? PT.noticeBirthCleared : null;
    setDateNotice(text);
    if (text) AccessibilityInfo.announceForAccessibility?.(text);
  }

  const leaveTo = (href: string, notice: string) =>
    withoutGuard(() => router.dismissTo({ pathname: href, params: { notice } } as never));

  const focusNode = (node: View | null) => {
    try {
      const handle = node ? findNodeHandle(node) : null;
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    } catch {
      // 지연 포커스가 돌아올 때 칸이 이미 사라졌을 수 있다(화면 이동·접힘). 포커스만 못 옮길 뿐이라 무시한다
    }
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
    const errors = validatePetDraft(draft, todayParts(new Date())); // today 는 기본값에 맡기지 않고 명시한다(기기 달력 날짜)
    setFieldError(errors);
    setFormError(null);
    setFollowup(null);
    setShowSummary(hasPetFieldErrors(errors));
    const input = toPetInput(draft, editing);
    if (hasPetFieldErrors(errors) || !input) {
      if (errors.name) nameRef.current?.focus();
      else if (!errors.species && (errors.birth || errors.adopted)) {
        setDateOpen(true); // 접힘 안 오류면 펼치고 첫 오류 칸으로
        setFocusDate(errors.birth ? 'birth' : 'adopted');
      } else {
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
  const monthOpts: SheetOption[] = monthOptions().map((m) => ({ value: m, label: petMonthText(m) }));
  const sheetOptions: Record<DateSheet, SheetOption[]> = {
    birthMonth: monthOpts,
    birthDay: dayOptions(birthYear, numOrNull(draft.birthMonth)).map((d) => ({ value: d, label: petDayText(d) })),
    adoptedYear: birthYearOptions(thisYear).map((y) => ({ value: y, label: petYearText(y) })),
    adoptedMonth: monthOpts,
    adoptedDay: dayOptions(numOrNull(draft.adoptedYear), numOrNull(draft.adoptedMonth)).map((d) => ({
      value: d,
      label: petDayText(d),
    })),
  };
  const shownDate = (key: DateSheet) => {
    const v = numOrNull(draft[DATE_FIELDS[key].draftKey] as string);
    if (v === null) return PT.none;
    return key === 'adoptedYear' ? petYearText(v) : key.endsWith('Month') ? petMonthText(v) : petDayText(v);
  };
  const stackDates = large; // 글자 확대(1.3 이상)에서는 월·일, 연·월·일 칸을 세로로 쌓는다
  const dateSummary = petDateSummary(birthMonthDay(draft), adoptedDate(draft));

  function onSheetDone(key: DateSheet, value: number | null) {
    const text = value === null ? '' : String(value);
    if (key === 'birthMonth' || key === 'birthDay') applyDateChange(changeBirthPart(draft, key, text), ['birth']);
    else applyDateChange(changeAdoptedPart(draft, key, text), ['adopted']);
    setSheet(null);
    const spoken =
      value === null
        ? PET_DATE_TEXT.announceNone
        : key === 'adoptedYear'
          ? chosenYearText(value)
          : key.endsWith('Month')
            ? chosenMonthText(value)
            : chosenDayText(value);
    AccessibilityInfo.announceForAccessibility?.(spoken);
    setTimeout(() => focusNode(sheetOpenerRef.current), 300);
  }

  const dateField = (key: DateSheet, label: string, ref?: React.RefObject<View | null>) => (
    <View key={key} style={stackDates ? undefined : { flex: 1 }}>
      <PickField
        buttonRef={ref}
        label={label}
        shownValue={shownDate(key)}
        a11yLabel={dateFieldLabel(DATE_FIELDS[key].name, shownDate(key))}
        hint={PET_DATE_TEXT.fieldHint}
        disabled={busy}
        onPress={() => {
          sheetOpenerRef.current = ref?.current ?? null;
          setSheet(key);
        }}
      />
    </View>
  );
  const dateRow = { flexDirection: stackDates ? 'column' : 'row', gap: spacing.sm } as const;

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

      <View style={{ gap: spacing.sm }}>
        <View accessible accessibilityRole="header" collapsable={false}>
          <AppText style={{ fontWeight: '700' }}>{PT.typeTitle}</AppText>
        </View>
        <View accessibilityRole="radiogroup" accessibilityLabel={PT.typeGroupLabel} style={{ gap: spacing.sm }}>
          {PET_TYPE_CHOICES.map((choice, i) => (
            <ChoiceButton
              key={choice.label}
              tall
              label={choice.label}
              accessibilityLabel={typeChoiceLabel(choice.label, i, PET_TYPE_CHOICES.length)}
              selected={draft.profileType === choice.value}
              disabled={busy}
              onPress={() => change({ profileType: choice.value })}
            />
          ))}
        </View>
        <AppText variant="secondary">{PT.typeHelp}</AppText>
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
          applyDateChange(changeBirthYear(draft, year ? String(year) : ''), ['birth', 'adopted']);
          AccessibilityInfo.announceForAccessibility?.(year ? `${year}년으로 정했어요` : PET_TEXT.birthNone);
          setTimeout(() => focusNode(yearButtonRef.current), 300);
        }}
      />

      <View style={{ gap: spacing.sm }} onLayout={(e) => (dateY.current = e.nativeEvent.layout.y)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${PET_DATE_TEXT.toggleA11y}${dateSummary ? `, ${dateSummary}` : ''}`}
          accessibilityState={{ expanded: dateOpen, disabled: busy }}
          disabled={busy}
          onPress={() => setDateOpen((o) => !o)}
          style={({ pressed }) => ({
            minHeight: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
            borderWidth: 2,
            borderColor: colors.border,
            borderRadius: 10,
            paddingHorizontal: 12,
            backgroundColor: colors.surface,
            opacity: pressed || busy ? 0.6 : 1,
          })}
        >
          <AppText style={{ flexShrink: 1, fontWeight: '700' }}>{PT.dateToggle}</AppText>
          <AppText accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {`${dateOpen ? PT.dateClose : PT.dateOpen} ${dateOpen ? '▴' : '▾'}`}
          </AppText>
        </Pressable>
        {!dateOpen && dateSummary ? <AppText variant="secondary">{dateSummary}</AppText> : null}
        {dateOpen ? (
          <>
            <AppText variant="secondary">{PT.dateHelp}</AppText>

            <View accessible accessibilityRole="header" collapsable={false}>
              <AppText style={{ fontWeight: '700' }}>{PT.birthTitle}</AppText>
            </View>
            <AppText variant="secondary">{PT.birthHelp}</AppText>
            <View testID="birth-row" style={dateRow}>
              {dateField('birthMonth', PT.month, birthFieldRef)}
              {dateField('birthDay', PT.day)}
            </View>
            {fieldError.birth ? (
              <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${fieldError.birth}`}</AppText>
            ) : null}

            <View accessible accessibilityRole="header" collapsable={false}>
              <AppText style={{ fontWeight: '700' }}>{PT.adoptTitle}</AppText>
            </View>
            <View testID="adopted-row" style={dateRow}>
              {dateField('adoptedYear', PT.year, adoptedFieldRef)}
              {dateField('adoptedMonth', PT.month)}
              {dateField('adoptedDay', PT.day)}
            </View>
            {fieldError.adopted ? (
              <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${fieldError.adopted}`}</AppText>
            ) : null}
            {dateNotice ? (
              <AppText variant="secondary" accessibilityLiveRegion="polite">
                {dateNotice}
              </AppText>
            ) : null}
          </>
        ) : null}
      </View>
      {sheet ? (
        <OptionSheet
          visible
          title={DATE_FIELDS[sheet].title}
          noneLabel={PET_DATE_TEXT.sheetNone}
          options={sheetOptions[sheet]}
          value={numOrNull(draft[DATE_FIELDS[sheet].draftKey] as string)}
          startValue={sheet === 'adoptedYear' ? thisYear : null}
          onDone={(v) => onSheetDone(sheet, v)}
          onCancel={() => {
            setSheet(null);
            setTimeout(() => focusNode(sheetOpenerRef.current), 300);
          }}
        />
      ) : null}

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
        <AppText variant="secondary">{PRIVACY_TEXT.memoHelp}</AppText>
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
