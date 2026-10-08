// 약 등록·수정 폼 (/medications/new, /medications/[id]/edit) — 웹 MedicationsPage 의 인라인 폼을 별도 화면으로 (화면 설계 4장)
// - 검증·변환은 lib/medicationForm.ts(웹 원본의 사본). 시각은 'HH:mm' 글자로만 다룬다.
// - 저장하면 목록으로 돌아가며 안내 코드(notice)를 싣는다. 알림 설정의 [먹이는 시각 바꾸기]로 왔다면(from=reminder) 그 화면으로 돌아간다.
// - 401 은 조용히 무시, 404 는 수정 대상이 사라졌으면 목록 + gone, 아니면 반려동물을 다시 읽는다. 입력값은 오류에도 유지한다.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View, useWindowDimensions } from 'react-native';
import { AccessibilityInfo, findNodeHandle } from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, LinkButton, Screen, TextField } from '../components/ui';
import { ApiError, toUserMessage } from '../lib/api';
import {
  addTime,
  DOSE_MAX,
  draftFromMedication,
  EMPTY_MEDICATION_DRAFT,
  MAX_TIMES,
  NAME_MAX,
  removeTime,
  setTimeAt,
  toMedicationInput,
  validateMedicationDraft,
  type MedicationDraft,
} from '../lib/medicationForm';
import { usePet } from '../pet/PetProvider';
import { petApi } from '../services/client';
import { colors } from '../theme';
import { isHugeFont, isLargeFont } from './layout';
import { goBackOr, MEDICATIONS_HREF } from './routes';
import { ScreenTop } from './ScreenTop';
import { TimeRow } from './sections/TimeRow';

const NAME_PROBLEM = (m: string) => m === '약 이름을 적어 주세요.' || m.startsWith('약 이름은');

export default function MedicationFormScreen({ id }: { id?: string }) {
  const router = useRouter();
  const { pet, reload } = usePet();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromReminder = params.from === 'reminder';

  const [draft, setDraft] = useState<MedicationDraft | null>(id ? null : { ...EMPTY_MEDICATION_DRAFT });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const submittingRef = useRef(false); // 같은 프레임 연타(state 가 아직 안 바뀐 때)도 막는다
  const nameRef = useRef<TextInput>(null);
  const doseRef = useRef<TextInput>(null);
  const lastTimeRef = useRef<View>(null);
  const focusNewTime = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const goneToList = () => router.dismissTo({ pathname: MEDICATIONS_HREF, params: { notice: 'gone' } } as never);

  // 수정: 현재 값으로 폼을 채운다
  const petId = pet?.id;
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!id || !petId) return;
    let cancelled = false;
    setLoadError(null);
    petApi.listMedications(petId).then(
      (list) => {
        if (cancelled) return;
        const found = (list ?? []).find((m) => m.id === id);
        if (!found) goneToList();
        else setDraft(draftFromMedication(found));
      },
      (err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) return;
        if (err instanceof ApiError && err.status === 404) {
          goneToList();
          return;
        }
        setLoadError(toUserMessage(err, 'medication'));
      },
    );
    return () => {
      cancelled = true;
    };
    // goneToList 는 router 만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, petId, reloadKey]);

  // 시각을 추가하면 새 행의 시각 버튼으로 접근성 포커스를 옮긴다
  const timeCount = draft?.times.length ?? 0;
  useEffect(() => {
    if (!focusNewTime.current) return;
    focusNewTime.current = false;
    const t = setTimeout(() => {
      const node = lastTimeRef.current ? findNodeHandle(lastTimeRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
    return () => clearTimeout(t);
  }, [timeCount]);

  function change(patch: Partial<MedicationDraft>) {
    if (!draft || busy) return;
    setDraft({ ...draft, ...patch });
  }

  async function onSubmit() {
    if (!draft || !pet || busy || submittingRef.current) return;
    const problem = validateMedicationDraft(draft);
    setFormError(problem);
    if (problem) {
      if (NAME_PROBLEM(problem)) nameRef.current?.focus();
      return;
    }
    const input = toMedicationInput(draft);
    submittingRef.current = true;
    setBusy(true);
    try {
      if (draft.id) {
        await petApi.updateMedication(draft.id, input);
        if (!alive.current) return;
        if (fromReminder) router.back(); // 알림 설정이 돌아오며 최신 시각을 다시 읽는다
        else router.dismissTo({ pathname: MEDICATIONS_HREF, params: { notice: 'updated', medId: draft.id } } as never);
      } else {
        const created = await petApi.createMedication(pet.id, input);
        if (!alive.current) return;
        router.dismissTo({
          pathname: MEDICATIONS_HREF,
          params: { notice: 'created', ...(created?.id ? { medId: created.id } : {}) },
        } as never);
      }
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 404) {
        if (draft.id) goneToList();
        else void reload(); // 반려동물이 없어짐 등 → 다시 읽는다
        return;
      }
      setFormError(toUserMessage(err, 'medication'));
    } finally {
      submittingRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const isEdit = !!id;
  const saveLabel = busy ? '잠시만요…' : isEdit ? '고친 내용 저장' : '약 등록';
  const huge = isHugeFont(fontScale);
  const errorNode = formError ? (
    <NoticeCard kind="info" alert>
      <AppText style={{ fontWeight: '700' }}>{formError}</AppText>
    </NoticeCard>
  ) : null;

  return (
    <Screen
      footer={
        draft ? (
          <View style={{ gap: 8, padding: 16, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}>
            {huge ? null : errorNode}
            <AppButton label={saveLabel} accessibilityLabel={saveLabel} loading={busy} onPress={() => void onSubmit()} />
            <LinkButton label="닫기" center onPress={() => goBackOr(router, MEDICATIONS_HREF)} />
          </View>
        ) : undefined
      }
    >
      <ScreenTop
        backLabel="약 목록으로"
        backA11yLabel="약 목록으로 돌아가기"
        onBack={() => goBackOr(router, MEDICATIONS_HREF)}
        title={isEdit ? '약 고치기' : '약 추가'}
      />

      {loadError ? (
        <NoticeCard kind="info" alert>
          <AppText style={{ fontWeight: '700' }}>{loadError}</AppText>
          <AppButton label="다시 불러오기" variant="secondary" onPress={() => setReloadKey((k) => k + 1)} />
        </NoticeCard>
      ) : null}
      {!draft && !loadError ? (
        <View style={{ alignItems: 'center' }} accessibilityState={{ busy: true }} accessibilityLabel="불러오는 중">
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="secondary">불러오는 중…</AppText>
        </View>
      ) : null}

      {huge ? errorNode : null}

      {draft ? (
        <>
          <TextField
            label="약 이름"
            value={draft.name}
            maxLength={NAME_MAX}
            placeholder="예: 레나메진"
            returnKeyType="next"
            onChangeText={(name) => change({ name })}
            onSubmitEditing={() => doseRef.current?.focus()}
            inputRef={nameRef}
            error={formError && NAME_PROBLEM(formError) ? formError : undefined}
          />
          <TextField
            label="용량 (선택)"
            value={draft.doseText}
            maxLength={DOSE_MAX}
            placeholder="예: 1포, 1/2정, 0.5ml"
            returnKeyType="done"
            onChangeText={(doseText) => change({ doseText })}
            inputRef={doseRef}
          />

          <View style={{ gap: 8 }}>
            <AppText style={{ fontWeight: '700' }} accessibilityRole="header">
              하루에 먹이는 시각 (1~3개)
            </AppText>
            {isEdit ? <AppText variant="secondary">ⓘ 시각을 바꾸면 알림 시각도 같이 바뀌어요.</AppText> : null}
            {draft.times.map((t, i) => (
              <TimeRow
                key={i}
                ref={i === draft.times.length - 1 ? lastTimeRef : undefined}
                index={i}
                value={t}
                removable={draft.times.length > 1}
                onChange={(hhmm) => change({ times: setTimeAt(draft.times, i, hhmm) })}
                onRemove={() => change({ times: removeTime(draft.times, i) })}
              />
            ))}
            {draft.times.length < MAX_TIMES ? (
              <AppButton
                label="+ 시각 추가"
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  focusNewTime.current = true;
                  change({ times: addTime(draft.times) });
                }}
              />
            ) : null}
          </View>

          {/* 큰 글씨에서 키보드가 올라오면 하단 고정 버튼이 숨으므로 스크롤 맨 아래에도 한 번 더 둔다 */}
          {isLargeFont(fontScale) ? <AppButton label={saveLabel} loading={busy} onPress={() => void onSubmit()} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
