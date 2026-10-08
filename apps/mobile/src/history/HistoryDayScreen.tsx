// H2 하루 상세 (/history/[recordDate], 읽기 전용) — 웹 HistoryDayPage 와 같은 구성·문구
// GET daily-logs?from=D&to=D. 전날/다음 날은 달력 날짜 문자열만 더하고 뺀다(replace 로 이동해 뒤로 한 번이면 H1).
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { addDays, formatRecordDate } from '../lib/format';
import { isValidRecordDate } from '../lib/historyStats';
import { dayDetailValues, HISTORY_TEXT as T, medicationText } from '../lib/historyText';
import type { HistoryDay } from '../lib/petApi';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { usePet } from '../pet/PetProvider';
import { petApi } from '../services/client';
import { colors, spacing } from '../theme';
import { HISTORY_HREF, historyDayHref } from './routes';

export default function HistoryDayScreen({ recordDate }: { recordDate: string | undefined }) {
  const router = useRouter();
  const valid = isValidRecordDate(recordDate);

  useEffect(() => {
    if (!valid) router.replace(HISTORY_HREF as never);
  }, [valid, router]);

  if (!valid) {
    return (
      <Screen>
        <AppText variant="caption">{DISCLAIMER}</AppText>
      </Screen>
    );
  }
  return <DayView recordDate={recordDate} />;
}

function DayView({ recordDate }: { recordDate: string }) {
  const router = useRouter();
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const [day, setDay] = useState<HistoryDay | null>(null);
  const [serverToday, setServerToday] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!petId) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await petApi.getHistory(petId, { from: recordDate, to: recordDate });
      if (!alive.current || mine !== seq.current) return;
      setDay(res.days[0] ?? null);
      setServerToday(res.recordDate);
    } catch (err) {
      if (!alive.current || mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      if (err instanceof ApiError && err.code === 'INVALID_DATE_RANGE') setError(T.invalidDay);
      else setError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : T.loadFailed);
    } finally {
      if (alive.current && mine === seq.current) setLoading(false);
    }
  }, [petId, recordDate, reloadPet]);

  useEffect(() => {
    void load();
  }, [load]);

  const log = day?.dailyLog ?? null;
  const values = dayDetailValues(log);
  const isToday = serverToday !== null && recordDate === serverToday;
  const canNext = serverToday !== null && recordDate < serverToday;
  const med = day?.medication;

  return (
    <Screen>
      <ScreenTop
        backLabel="지난 기록"
        backA11yLabel="지난 기록으로 돌아가기"
        onBack={() => goBackOr(router, HISTORY_HREF)}
        title={formatRecordDate(recordDate)}
        lead={`${pet ? `${pet.name} · ` : ''}${T.dayReadOnly}`}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <AppButton
            label={T.prevDay}
            accessibilityLabel="전날"
            variant="secondary"
            onPress={() => router.replace(historyDayHref(addDays(recordDate, -1)) as never)}
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <AppButton
            label={T.nextDay}
            accessibilityLabel="다음 날"
            variant="secondary"
            disabled={!canNext}
            onPress={() => router.replace(historyDayHref(addDays(recordDate, 1)) as never)}
          />
        </View>
      </View>

      {error && (
        <NoticeCard kind="info" alert>
          <AppText>{error}</AppText>
          <AppButton label={T.retry} variant="secondary" onPress={() => void load()} />
        </NoticeCard>
      )}
      {loading && !day && !error && (
        <View style={{ alignItems: 'center', gap: spacing.sm }} accessibilityState={{ busy: true }}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="secondary">{T.loading}</AppText>
        </View>
      )}

      {day && (
        <>
          {isToday && (
            <Card>
              {/* 이미 기록이 있으면 "기록 중" 안내는 숨기고 버튼만 둔다(기록이 있는데 기록 중이라는 모순 방지) */}
              {!log && <AppText>{T.dayToday}</AppText>}
              <AppButton label={T.dayGoToday} onPress={() => router.replace('/' as never)} />
            </Card>
          )}
          {values && log ? (
            <Card>
              <Field label="체중" value={values.weight} />
              <Field label="식사" value={values.food} />
              <Field label="물" value={values.water} />
              <Field label="증상" value={values.symptom} />
              {log.memo ? <Field label="메모" value={log.memo} selectable /> : null}
            </Card>
          ) : (
            <AppText variant="secondary">{T.dayEmpty}</AppText>
          )}
          {med && med.scheduledCount > 0 && (
            <Card>
              <AppText style={{ fontWeight: '700' }}>
                {medicationText({ scheduled: med.scheduledCount, taken: med.takenCount })}
              </AppText>
              <AppText variant="caption">{T.medicationBasis}</AppText>
            </Card>
          )}
        </>
      )}

      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}

function Field({ label, value, selectable }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: 2 }}>
      <AppText style={{ fontWeight: '700' }}>{label}</AppText>
      <AppText selectable={selectable}>{value}</AppText>
    </View>
  );
}
