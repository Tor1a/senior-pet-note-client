// 약 목록 (/medications) — 웹 MedicationsPage 의 목록·삭제·알림 상태 줄 부분 (화면 설계 3장)
// - 등록·수정 폼은 별도 화면(/medications/new, /medications/[id]/edit). 약이 없으면 폼을 자동으로 열지 않고 빈 상태 카드를 보여 준다.
// - 약마다 GET reminder 를 병렬로 부른다(목록 API 에 알림 정보가 없음). 하나가 실패해도 나머지는 표시한다.
// - 401 은 화면이 아무것도 하지 않는다(AuthContext 가 로그인 화면으로 보낸다). 404 는 반려동물을 다시 읽는다.
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, useWindowDimensions } from 'react-native';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { NoticeCard, NoticeTitle } from '../components/NoticeCard';
import { ApiError, toUserMessage } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import type { Medication } from '../lib/petApi';
import type { Reminder } from '../lib/reminderApi';
import { usePet } from '../pet/PetProvider';
import { cannotReceive, usePush } from '../push/pushContext';
import { petApi, reminderApi } from '../services/client';
import { colors } from '../theme';
import { isLargeFont } from './layout';
import {
  createdText,
  deletedText,
  editMedicationHref,
  goBackOr,
  isListNoticeKind,
  NEW_MEDICATION_HREF,
  reminderHref,
  ALREADY_REMOVED_NOTICE,
  GONE_LIST_NOTICE,
  updatedText,
  type ListNoticeKind,
} from './routes';
import { MedicationCard } from './sections/MedicationCard';
import { ScreenTop } from './ScreenTop';

type Notice = { kind: ListNoticeKind | 'deleted' | 'deleted-gone'; medId?: string; name?: string };

export default function MedicationsScreen() {
  const router = useRouter();
  const { pet, reload } = usePet();
  const push = usePush();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{ notice?: string; medId?: string }>();

  const [meds, setMeds] = useState<Medication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** 약별 알림 설정. 'error' 면 상태 줄을 숨긴다 */
  const [reminders, setReminders] = useState<Record<string, Reminder | 'error'>>({});
  const alive = useRef(true);
  const loadSeq = useRef(0);
  const removingRef = useRef(false); // 같은 프레임 연타 방지

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 폼·알림 설정 화면이 돌아오며 실어 준 안내 코드를 한 번만 받고 파라미터는 지운다
  useEffect(() => {
    if (!params.notice) return;
    if (isListNoticeKind(params.notice)) setNotice({ kind: params.notice, medId: params.medId });
    router.setParams({ notice: undefined, medId: undefined } as never);
  }, [params.notice, params.medId, router]);

  const handleError = useCallback(
    (err: unknown, set: (m: string) => void) => {
      if (err instanceof ApiError && err.status === 401) return;
      if (err instanceof ApiError && err.status === 404) {
        // 반려동물이 없어졌거나 약이 이미 지워짐 → 다시 읽는다
        void reload();
        return;
      }
      set(toUserMessage(err, 'medication'));
    },
    [reload],
  );

  const load = useCallback(async () => {
    if (!pet) return;
    const seq = ++loadSeq.current;
    setLoadError(null);
    try {
      const list = (await petApi.listMedications(pet.id)) ?? [];
      if (!alive.current || seq !== loadSeq.current) return;
      setMeds(list);
      // 하나가 실패해도 다른 카드는 표시한다
      const entries = await Promise.all(
        list.map((m) =>
          reminderApi.getReminder(m.id).then(
            (r): [string, Reminder | 'error'] => [m.id, r],
            (): [string, Reminder | 'error'] => [m.id, 'error'],
          ),
        ),
      );
      if (alive.current && seq === loadSeq.current) setReminders(Object.fromEntries(entries));
    } catch (err) {
      if (alive.current) handleError(err, setLoadError);
    }
  }, [pet, handleError]);

  // 첫 진입과 폼·알림 설정에서 돌아올 때마다 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void load();
      // 다른 화면으로 떠나면 안내를 지운다(돌아왔을 때 오래된 "등록했어요"가 남지 않게)
      return () => setNotice(null);
    }, [load]),
  );

  async function remove(med: Medication) {
    if (busy || removingRef.current) return;
    removingRef.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await petApi.deleteMedication(med.id);
      if (!alive.current) return;
      setConfirmDeleteId(null);
      setNotice({ kind: 'deleted', name: med.name });
      await load();
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 404) {
        // 약이 이미 목록에서 빠짐(다른 기기에서 뺐거나 두 번 눌림). 반려동물 404 와 달리 목록만 다시 읽는다.
        // 반려동물이 없어진 경우는 목록을 읽을 때 404 로 드러나 handleError 가 반려동물을 다시 읽는다.
        setConfirmDeleteId(null);
        setNotice({ kind: 'deleted-gone' });
        await load();
        return;
      }
      handleError(err, setActionError);
    } finally {
      removingRef.current = false;
      if (alive.current) setBusy(false);
    }
  }

  const largeFont = isLargeFont(fontScale);
  const nameOf = (id?: string) => meds?.find((m) => m.id === id)?.name;

  return (
    <Screen>
      <ScreenTop
        backLabel="오늘로"
        backA11yLabel="오늘 화면으로 돌아가기"
        onBack={() => goBackOr(router, '/')}
        title="먹이는 약"
        lead="약을 추가하거나 고칠 수 있어요."
      />

      {loadError ? (
        <Card>
          <AppText accessibilityRole="alert">{`! ${loadError}`}</AppText>
          <AppButton label="다시 불러오기" variant="secondary" onPress={() => void load()} />
        </Card>
      ) : null}
      {actionError ? <AppText accessibilityRole="alert" style={{ fontWeight: '700' }}>{`! ${actionError}`}</AppText> : null}

      {notice ? <ListNotice notice={notice} name={notice.name ?? nameOf(notice.medId)} onReminder={(id) => router.push(reminderHref(id) as never)} /> : null}

      {meds === null && !loadError ? (
        <View style={{ alignItems: 'center' }} accessibilityState={{ busy: true }} accessibilityLabel="불러오는 중">
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText variant="secondary">불러오는 중…</AppText>
        </View>
      ) : null}

      {meds && meds.length === 0 ? (
        <Card>
          <AppText style={{ fontWeight: '700' }}>아직 등록한 약이 없어요.</AppText>
          <AppText variant="secondary">약을 등록하면 오늘 화면에서 [먹였어요]로 체크하고, 먹일 시간에 알림도 받을 수 있어요.</AppText>
          <AppButton label="+ 약 등록하기" onPress={() => router.push(NEW_MEDICATION_HREF as never)} />
        </Card>
      ) : null}

      {meds && meds.length > 0
        ? meds.map((m) => (
            <MedicationCard
              key={m.id}
              med={m}
              reminder={reminders[m.id]}
              deviceCannotReceive={cannotReceive(push.state)}
              confirming={confirmDeleteId === m.id}
              busy={busy}
              largeFont={largeFont}
              onEdit={() => router.push(editMedicationHref(m.id) as never)}
              onReminder={() => router.push(reminderHref(m.id) as never)}
              onAskDelete={() => {
                setActionError(null);
                setConfirmDeleteId(m.id);
              }}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={() => void remove(m)}
            />
          ))
        : null}

      {meds && meds.length > 0 ? (
        <AppButton
          label="+ 약 추가"
          variant="secondary"
          onPress={() => {
            setNotice(null);
            router.push(NEW_MEDICATION_HREF as never);
          }}
        />
      ) : null}

      <AppButton label="오늘 화면으로" variant={meds && meds.length === 0 ? 'secondary' : 'primary'} onPress={() => goBackOr(router, '/')} />
      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}

/** 등록·수정·빼기 직후 안내(웹 .ok 카드). 방금 등록했다면 [알림 설정하기 ›] 를 함께 보여 준다 */
function ListNotice({ notice, name, onReminder }: { notice: Notice; name: string | undefined; onReminder: (id: string) => void }) {
  if (notice.kind === 'deleted-gone') {
    return (
      <NoticeCard kind="info">
        <AppText style={{ fontWeight: '700' }}>{ALREADY_REMOVED_NOTICE}</AppText>
      </NoticeCard>
    );
  }
  if (notice.kind === 'gone') {
    return (
      <NoticeCard kind="info">
        <AppText style={{ fontWeight: '700' }}>{GONE_LIST_NOTICE}</AppText>
      </NoticeCard>
    );
  }
  if (!name) return null; // 목록을 불러오면 이름을 찾아 보여 준다
  const text = notice.kind === 'created' ? createdText(name) : notice.kind === 'updated' ? updatedText(name) : deletedText(name);
  return (
    <NoticeCard kind="ok">
      <NoticeTitle ok>{text}</NoticeTitle>
      {notice.kind === 'created' && notice.medId ? (
        <>
          <AppText>먹일 시간에 알림을 받아 볼까요?</AppText>
          <AppButton label="알림 설정하기 ›" variant="secondary" onPress={() => onReminder(notice.medId!)} />
        </>
      ) : null}
    </NoticeCard>
  );
}

