// 투약 알림 설정 (/medications/[id]/reminder) — 웹 ReminderPage 를 모바일로 (화면 설계 5·7·8장, 계약 docs/api-reminders.md 2장)
// - 알림 시각 = 약의 투약 시각(읽기 전용). 시각은 약 고치기에서 바꾼다.
// - 다음 알림 시각(nextFireAt)은 서버 값만 표시한다. 반복 규칙은 계산하지 않는다.
// - [저장]을 눌러야 확정(전체 교체 PUT). 권한이 없어도 설정 저장은 항상 한다(계정 단위, 다른 기기에서 받을 수 있음).
// - 권한 창은 사전 안내(PermissionModal)의 [알림 허용하기]를 누른 뒤에만 띄운다. 앱 시작·화면 진입 때는 묻지 않는다.
// - 401 은 아무것도 하지 않고(AuthContext 가 로그인으로), 404 는 목록으로 돌아가며 gone 안내.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, findNodeHandle, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, Card, LinkButton, Screen } from '../components/ui';
import { ApiError, toUserMessage } from '../lib/api';
import { formatTime, seoulDateString } from '../lib/format';
import type { Medication } from '../lib/petApi';
import type { Reminder } from '../lib/reminderApi';
import {
  buildSaveBody,
  dawnNotice,
  formFromReminder,
  nextFireText,
  SAVE_FAILED_400,
  saveMessage,
  sameReminderBody,
  summaryText,
  validateReminderForm,
  type ReminderField,
  type ReminderForm,
  type ReminderProblem,
} from '../lib/reminderForm';
import { usePet } from '../pet/PetProvider';
import { cannotReceive, usePush, type PushDeviceState } from '../push/pushContext';
import { petApi, reminderApi } from '../services/client';
import { openAppSettings } from '../services/openAppSettings';
import { colors, spacing } from '../theme';
import { isHugeFont } from './layout';
import { editMedicationHref, goBackOr, MEDICATIONS_HREF } from './routes';
import { ScreenTop } from './ScreenTop';
import { DeviceCard } from './sections/DeviceCard';
import { PeriodSection } from './sections/PeriodSection';
import { PermissionModal } from './sections/PermissionModal';
import { RepeatSection } from './sections/RepeatSection';
import { SwitchRow } from './sections/SwitchRow';
import { useLeaveGuard } from './useLeaveGuard';

type DialogPurpose = 'save' | 'device';

export default function ReminderScreen({ id }: { id: string }) {
  const router = useRouter();
  const { pet } = usePet();
  const push = usePush();
  const { fontScale } = useWindowDimensions();

  const [med, setMed] = useState<Medication | null>(null);
  const [saved, setSaved] = useState<Reminder | null>(null);
  const [form, setForm] = useState<ReminderForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [problem, setProblem] = useState<ReminderProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogPurpose | null>(null);

  const alive = useRef(true);
  const scrollRef = useRef<ScrollView>(null);
  const saveBtnRef = useRef<View>(null);
  const fieldRefs = useRef<Partial<Record<ReminderField, View | null>>>({});
  const savingRef = useRef(false);
  const loadSeq = useRef(0);

  const dirty = !!form && !!saved && !sameReminderBody(form, formFromReminder(saved));
  // 늦게 도착한 읽기 응답이 고치는 중인 폼을 덮어쓰지 않게 한다(재포커스 로드, R3)
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const { leaving, confirmLeave, stay, guard, withoutGuard } = useLeaveGuard(dirty);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const goneToList = useCallback(() => {
    withoutGuard(() => router.dismissTo({ pathname: MEDICATIONS_HREF, params: { notice: 'gone' } } as never));
  }, [router, withoutGuard]);

  const load = useCallback(async () => {
    if (!pet) return;
    const seq = ++loadSeq.current;
    setLoadError(null);
    try {
      const [meds, reminder] = await Promise.all([petApi.listMedications(pet.id), reminderApi.getReminder(id)]);
      // 더 나중에 시작한 읽기가 있거나, 읽는 동안 사용자가 폼을 고치기 시작했거나 저장 중이면 이 응답은 버린다
      if (!alive.current || seq !== loadSeq.current || dirtyRef.current || savingRef.current) return;
      const found = (meds ?? []).find((m) => m.id === id) ?? null;
      if (!found) {
        goneToList();
        return;
      }
      setMed(found);
      setSaved(reminder);
      setForm(formFromReminder(reminder));
    } catch (err) {
      if (!alive.current || seq !== loadSeq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        goneToList();
        return;
      }
      if (err instanceof ApiError && err.status === 401) return;
      if (dirtyRef.current) return; // 고치는 중이면 읽기 실패 안내로 화면을 바꾸지 않는다
      setLoadError(toUserMessage(err));
    }
  }, [pet, id, goneToList]);

  // 첫 진입과 [먹이는 시각 바꾸기]에서 돌아올 때 다시 읽는다(돌아올 때는 저장 안 한 변경이 없다: 이동 전에 확인했다)
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // 휴대폰 설정에서 알림을 허용하고 돌아와 등록되면 알려 준다(설계 8-3).
  // 허용 → registering → registered 로 상태가 두 번 바뀌므로 "막혀 있었는지"를 기억해 둔다.
  const wasBlocked = useRef(push.state === 'denied' || push.state === 'default');
  useEffect(() => {
    if (push.state === 'denied' || push.state === 'default') wasBlocked.current = true;
    else if (push.state === 'registered' && wasBlocked.current && !dialog) {
      wasBlocked.current = false;
      setNotice('이제 이 기기에서도 알림을 받아요.');
    }
  }, [push.state, dialog]);

  // 결과 안내는 화면을 읽는 도구에도 한 번 읽어 준다
  useEffect(() => {
    if (notice) AccessibilityInfo.announceForAccessibility(notice);
  }, [notice]);

  function change(patch: Partial<ReminderForm>) {
    if (!form || saving) return;
    setForm({ ...form, ...patch });
    setNotice(null);
    if (problem) {
      setProblem(null);
      setSaveError(null);
    }
  }

  /** 검증 실패 칸으로 접근성 포커스와 스크롤을 옮긴다 */
  function focusField(field: ReminderField) {
    const node = fieldRefs.current[field];
    if (!node) return;
    const handle = findNodeHandle(node);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    const inner = (scrollRef.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
    if (inner) {
      node.measureLayout?.(
        inner as never,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
        () => {},
      );
    }
  }

  async function doSave(device: PushDeviceState) {
    if (!form || !saved || savingRef.current) return;
    savingRef.current = true;
    const body = buildSaveBody(form, saved);
    setSaving(true);
    setSaveError(null);
    try {
      const r = await reminderApi.putReminder(id, body);
      if (!alive.current) return;
      setSaved(r);
      setForm(formFromReminder(r));
      setNotice(saveMessage(r, cannotReceive(device)));
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 404) {
        goneToList();
        return;
      }
      if (err instanceof ApiError && err.status === 401) return;
      setSaveError(err instanceof ApiError && err.status === 400 ? SAVE_FAILED_400 : toUserMessage(err));
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }

  function onSave() {
    if (!form || saving) return;
    setNotice(null);
    if (form.enabled) {
      const p = validateReminderForm(form);
      setProblem(p);
      setSaveError(p?.message ?? null);
      if (p) {
        focusField(p.field);
        return;
      }
      // 아직 안 물어봄 → 먼저 설명(S3), 권한 창은 그 대화상자 버튼에서
      if (push.state === 'default') {
        setDialog('save');
        return;
      }
    }
    void doSave(push.state);
  }

  function closeDialog() {
    setDialog(null);
    // 닫히면 [저장] 버튼으로 접근성 포커스를 돌려보낸다
    setTimeout(() => {
      const handle = saveBtnRef.current ? findNodeHandle(saveBtnRef.current) : null;
      if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }, 300);
  }

  function onDialogAllow() {
    const purpose = dialog;
    closeDialog();
    // 버튼 처리 안에서 바로 권한 창을 띄운다
    void push.requestPermission().then((state) => {
      if (!alive.current) return;
      if (purpose === 'save') void doSave(state);
      else if (state === 'registered') setNotice('이제 이 기기에서도 알림을 받아요.');
    });
  }

  function onDialogLater() {
    const purpose = dialog;
    closeDialog();
    if (purpose === 'save') void doSave(push.state);
  }

  // ---------- 화면 ----------
  const times = saved?.times ?? med?.times ?? [];
  // 한계: 서버의 "기록 날짜"(새벽 4시 기준)가 아니라 서울의 달력 날짜다. 00~04시에는 하루 앞서 보인다.
  // 서버가 주는 값 중 오늘 기록 날짜는 GET reminder 의 startDate 기본값(설정 전에만)뿐이라 일반 대체가 안 된다.
  // 쓰임: 시작일 선택 범위의 끝, "미래 시작" 요약 문구 판정뿐이며 서버 검증·발송에는 영향이 없다.
  const today = seoulDateString();
  const huge = isHugeFont(fontScale);
  const dawn = form ? dawnNotice(form, times) : null;

  const messages = (
    <>
      {saveError ? (
        <AppText accessibilityRole="alert" style={styles.bold}>{`! ${saveError}`}</AppText>
      ) : null}
      {notice ? (
        <View accessibilityLiveRegion="polite">
          <AppText style={styles.ok}>{`✓ ${notice}`}</AppText>
        </View>
      ) : null}
    </>
  );

  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        <View style={styles.bar}>
          {huge ? null : messages}
          <View ref={saveBtnRef} collapsable={false}>
            <AppButton label={saving ? '저장하는 중…' : '저장'} accessibilityLabel={saving ? '저장하는 중' : '저장'} disabled={!form || saving || dialog !== null} onPress={onSave} />
          </View>
        </View>
      }
    >
      <ScreenTop
        backLabel="약 목록으로"
        backA11yLabel="약 목록으로 돌아가기"
        onBack={() => guard(() => goBackOr(router, MEDICATIONS_HREF))}
        title="투약 알림"
        lead={med ? `${med.name}${med.doseText ? ` · ${med.doseText}` : ''}` : undefined}
      />

      {huge ? messages : null}

      {leaving ? (
        <NoticeCard kind="info" alert>
          <AppText style={styles.bold}>저장하지 않고 나갈까요?</AppText>
          <View style={styles.leaveRow}>
            <View style={styles.leaveCell}>
              <AppButton label="나가기" variant="secondary" onPress={confirmLeave} />
            </View>
            <View style={styles.leaveCell}>
              <AppButton label="계속 고치기" onPress={stay} />
            </View>
          </View>
        </NoticeCard>
      ) : null}

      {loadError ? (
        <NoticeCard kind="info" alert>
          <AppText style={styles.bold}>{loadError}</AppText>
          <AppButton label="다시 불러오기" variant="secondary" onPress={() => void load()} />
        </NoticeCard>
      ) : null}
      {!form && !loadError ? (
        <View style={{ alignItems: 'center' }} accessibilityState={{ busy: true }} accessibilityLabel="불러오는 중">
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="secondary">불러오는 중…</AppText>
        </View>
      ) : null}

      {form && saved ? (
        <>
          <DeviceCard
            state={push.state}
            savedEnabled={saved.enabled}
            onAllow={() => setDialog('device')}
            onRetry={() => void push.recheck()}
            onOpenSettings={() => void openAppSettings()}
          />

          <SwitchRow label="알림 받기" value={form.enabled} disabled={saving} onToggle={() => change({ enabled: !form.enabled })} />

          {!form.enabled ? (
            <AppText variant="secondary">알림을 켜면 얼마나 자주, 언제까지 받을지 정할 수 있어요.</AppText>
          ) : (
            <>
              <View style={styles.section}>
                <AppText variant="title" accessibilityRole="header" style={styles.h2}>
                  알림 시각
                </AppText>
                <Card>
                  <AppText style={styles.bold}>{times.map(formatTime).join(' · ')}</AppText>
                  <AppText variant="secondary">먹이는 시각에 맞춰 알려 드려요.</AppText>
                  <LinkButton
                    label="먹이는 시각 바꾸기 ›"
                    accessibilityLabel="먹이는 시각 바꾸기"
                    onPress={() => guard(() => router.push(editMedicationHref(id, 'reminder') as never))}
                  />
                </Card>
              </View>

              <RepeatSection
                form={form}
                problem={problem}
                disabled={saving}
                fontScale={fontScale}
                onChange={change}
                registerField={(field, node) => void (fieldRefs.current[field] = node)}
              />

              <PeriodSection
                form={form}
                problem={problem}
                disabled={saving}
                today={today}
                onChange={change}
                registerField={(field, node) => void (fieldRefs.current[field] = node)}
              />

              <View style={styles.summary} accessibilityLiveRegion="polite">
                <AppText style={styles.bold}>{summaryText(form, times, today)}</AppText>
                <AppText>{dirty ? '저장하면 다음 알림 시각을 알려 드려요.' : nextFireText(saved)}</AppText>
              </View>
              {form.repeat !== 'daily' ? (
                <AppText variant="secondary">ⓘ 오늘 화면에는 이 약이 매일 보여요. 먹이지 않는 날은 체크하지 않아도 돼요.</AppText>
              ) : null}
              {dawn ? <AppText variant="secondary">{`ⓘ ${dawn}`}</AppText> : null}
            </>
          )}

          <AppText variant="secondary">이 계정으로 로그인한 모든 기기에 알림이 가요.</AppText>
        </>
      ) : null}

      {dialog ? <PermissionModal medName={med?.name ?? ''} onAllow={onDialogAllow} onLater={onDialogLater} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  ok: { fontWeight: '700', color: colors.done },
  h2: { fontSize: 20 },
  section: { gap: spacing.sm },
  bar: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  summary: { gap: 4, padding: spacing.md, borderRadius: 12, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  leaveRow: { gap: spacing.sm },
  leaveCell: {},
});
