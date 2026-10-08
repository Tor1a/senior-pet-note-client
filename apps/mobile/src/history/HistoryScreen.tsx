// H1 지난 기록 (/history) — 웹 HistoryPage 와 같은 구성·문구
// - 서버가 준 30일치를 한 번 받아 7일/30일은 화면에서 자른다(재요청 없음). 기록 날짜는 서버(recordDate)가 정한다.
// - 읽기 전용. 건강 기록은 기기 디스크에 저장하지 않는다: 연결이 끊기면 이미 본 내용을 메모리에서 그대로 보여 주고
//   "마지막으로 불러온 시각"을 알린다(앱을 다시 켜면 사라짐).
// - 큰 글씨(1.3+)는 배치를 세로로, 2.0+ 또는 스크린리더가 켜져 있으면 표 보기가 기본이다.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, RefreshControl, View, useWindowDimensions } from 'react-native';
import { NoticeCard } from '../components/NoticeCard';
import { AppButton, AppText, Card, ChoiceButton, LinkButton, Screen } from '../components/ui';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../lib/api';
import { DISCLAIMER } from '../lib/constants';
import { formatKg, formatRecordDate, formatTime } from '../lib/format';
import {
  lastNDays,
  levelCounts,
  medicationTotals,
  recordedDayCount,
  symptomDays,
  waterMlAverage,
  weightPoints,
  type HistoryRange,
} from '../lib/historyStats';
import {
  dayRowSummary,
  HISTORY_TEXT as T,
  levelCountsText,
  medicationText,
  rangeSummary,
  staleNotice,
  symptomNames,
  symptomNoneText,
  waterMlText,
  weightFactLines,
} from '../lib/historyText';
import type { HistoryResponse } from '../lib/petApi';
import { REPORT_TEXT } from '../lib/reportText';
import { reportFromHistoryHref } from '../report/routes';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { usePet } from '../pet/PetProvider';
import { petApi } from '../services/client';
import { colors, spacing } from '../theme';
import { DayRow } from './DayRow';
import { historyDayHref } from './routes';
import WeightChart from './WeightChart';

const HUGE_FONT_SCALE = 2;

/** 기기 시계의 '오후 3:20' (마지막으로 불러온 시각 표기용. 기록 날짜 계산에는 쓰지 않는다) */
function nowText(): string {
  const d = new Date();
  return formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
}

export default function HistoryScreen() {
  const router = useRouter();
  const { pet, reload: reloadPet } = usePet();
  const petId = pet?.id ?? null;
  const { fontScale } = useWindowDimensions();

  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loadedAt, setLoadedAt] = useState('');
  const [error, setError] = useState<{ network: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<HistoryRange>(30);
  const [rangeNotice, setRangeNotice] = useState('');
  const [tableOverride, setTableOverride] = useState<boolean | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  const seq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => alive.current && setScreenReader(on));
  }, []);

  const load = useCallback(async () => {
    if (!petId) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await petApi.getHistory(petId);
      if (!alive.current || mine !== seq.current) return;
      setHistory(res);
      setLoadedAt(nowText());
    } catch (err) {
      if (!alive.current || mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        void reloadPet();
        return;
      }
      setError({ network: isNetworkError(err) });
    } finally {
      if (alive.current && mine === seq.current) setLoading(false);
    }
  }, [petId, reloadPet]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo(() => (history ? lastNDays(history.days, range) : []), [history, range]);
  const tableView = tableOverride ?? (screenReader || fontScale >= HUGE_FONT_SCALE);

  const chooseRange = (next: HistoryRange) => {
    setRange(next);
    const msg = `${next}일 보기로 바꿨어요`;
    setRangeNotice(msg);
    AccessibilityInfo.announceForAccessibility?.(msg);
  };

  const goToday = () => router.replace('/' as never);
  const goDay = (recordDate: string) => router.push(historyDayHref(recordDate) as never);

  const errorText = error ? (error.network ? NETWORK_ERROR_MESSAGE : T.loadFailed) : '';

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={loading && history !== null} onRefresh={() => void load()} colors={[colors.primary]} />
      }
    >
      <ScreenTop
        backLabel="오늘로"
        backA11yLabel="오늘 화면으로 돌아가기"
        onBack={() => goBackOr(router, '/')}
        title={T.title}
        lead={pet ? `${pet.name}의 최근 ${range}일` : undefined}
      />

      <View accessibilityRole="radiogroup" accessibilityLabel={T.rangeGroup} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {([7, 30] as const).map((r) => (
          <ChoiceButton key={r} label={`${r}일`} selected={range === r} onPress={() => chooseRange(r)} grow tall />
        ))}
      </View>
      {/* 안내가 있을 때만 그린다(빈 글자 줄이 버튼 아래 공간을 차지하지 않게). 스크린리더에는 announceForAccessibility 로도 알린다 */}
      {rangeNotice !== '' && (
        <AppText variant="caption" accessibilityLiveRegion="polite">
          {rangeNotice}
        </AppText>
      )}

      <AppButton
        label={REPORT_TEXT.historyLink}
        accessibilityLabel="병원 방문 리포트 만들기"
        variant="secondary"
        onPress={() => router.push(reportFromHistoryHref(range === 7 ? 7 : 30) as never)}
      />

      {error && (
        <NoticeCard kind="info" alert>
          <AppText>{history && error.network ? staleNotice(loadedAt) : errorText}</AppText>
          <AppButton label={T.retry} variant="secondary" onPress={() => void load()} />
        </NoticeCard>
      )}

      {loading && !history && !error && (
        <View style={{ alignItems: 'center', gap: spacing.sm }} accessibilityState={{ busy: true }}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="secondary">{T.loading}</AppText>
        </View>
      )}

      {history && (
        <LinkButton label={T.refresh} onPress={() => void load()} accessibilityHint="서버에서 지난 기록을 다시 불러와요" />
      )}

      {history && (
        <HistoryBody
          history={history}
          days={days}
          range={range}
          tableView={tableView}
          onToggleTable={() => setTableOverride(!tableView)}
          onDay={goDay}
          onToday={goToday}
        />
      )}

      <AppText variant="caption">{DISCLAIMER}</AppText>
    </Screen>
  );
}

function HistoryBody({
  history,
  days,
  range,
  tableView,
  onToggleTable,
  onDay,
  onToday,
}: {
  history: HistoryResponse;
  days: HistoryResponse['days'];
  range: HistoryRange;
  tableView: boolean;
  onToggleTable: () => void;
  onDay: (recordDate: string) => void;
  onToday: () => void;
}) {
  const recorded = recordedDayCount(days);
  const summary = rangeSummary(days);

  if (recorded === 0) {
    return (
      <>
        <AppText variant="secondary">{summary}</AppText>
        <Card>
          <AppText style={{ fontWeight: '700' }}>{T.emptyTitle}</AppText>
          <AppText variant="secondary">{T.emptyBody}</AppText>
          <AppButton label={T.goToday} onPress={onToday} />
        </Card>
      </>
    );
  }

  const points = weightPoints(days);
  const food = levelCounts(days, 'foodLevel');
  const water = levelCounts(days, 'waterLevel');
  const waterMl = waterMlAverage(days);
  const symptoms = symptomDays(days);
  const noneText = symptomNoneText(days);
  const meds = medicationTotals(days);
  const listDays = [...days].reverse();

  return (
    <>
      <AppText>{summary}</AppText>
      {recorded <= 2 && <AppText variant="secondary">{T.fewRecords}</AppText>}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          {T.weightTitle}
        </AppText>
        {points.length > 0 && (
          <AppButton
            label={tableView ? T.showGraph : T.showTable}
            variant="secondary"
            accessibilityHint={tableView ? undefined : '날짜별 체중을 목록으로 읽을 수 있어요'}
            onPress={onToggleTable}
          />
        )}
        {weightFactLines(days, history.days).map((line) => (
          <AppText key={line}>{line}</AppText>
        ))}
        {points.length === 0 ? (
          <View style={{ gap: spacing.sm }}>
            <AppText variant="secondary">{T.weightNone}</AppText>
            <AppButton label={T.goToday} variant="secondary" onPress={onToday} />
          </View>
        ) : tableView ? (
          <View style={{ gap: spacing.sm }} accessibilityLabel={T.tableCaption}>
            {listDays.map((d) => (
              <DayRow
                key={d.recordDate}
                title={formatRecordDate(d.recordDate)}
                summary={[
                  d.dailyLog?.weightKg != null ? `체중 ${formatKg(d.dailyLog.weightKg)}kg` : `체중 ${T.noRecord}`,
                  d.dailyLog && d.dailyLog.symptoms.length > 0
                    ? `◆ ${symptomNames(d.dailyLog.symptoms, d.dailyLog.symptomOther)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => onDay(d.recordDate)}
                dashed={!d.dailyLog?.weightKg}
              />
            ))}
          </View>
        ) : (
          <>
            <WeightChart days={days} />
            <AppText variant="caption">{T.scaleNote}</AppText>
            {points.length === 1 && <AppText variant="secondary">{T.weightOne}</AppText>}
            {points.some((_, i) => i > 0 && points[i].index - points[i - 1].index >= 2) && (
              <AppText variant="caption">{T.legendDashed}</AppText>
            )}
          </>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          {T.mealWaterTitle}
        </AppText>
        <Card>
          <AppText>{`식사: ${levelCountsText(food)}`}</AppText>
          <AppText>{`물: ${levelCountsText(water)}`}</AppText>
          {waterMl && <AppText>{waterMlText(waterMl)}</AppText>}
        </Card>
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          {T.symptomTitle}
        </AppText>
        {symptoms.length === 0 ? (
          <AppText variant="secondary">{T.symptomNoneInPeriod}</AppText>
        ) : (
          symptoms.map((s) => (
            <DayRow
              key={s.recordDate}
              title={`◆ ${formatRecordDate(s.recordDate)}`}
              summary={symptomNames(s.codes, s.other)}
              onPress={() => onDay(s.recordDate)}
            />
          ))
        )}
        {noneText && <AppText variant="secondary">{noneText}</AppText>}
      </View>

      {meds.scheduled > 0 && (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="title" accessibilityRole="header">
            {T.medicationTitle}
          </AppText>
          <Card>
            <AppText style={{ fontWeight: '700' }}>{medicationText(meds)}</AppText>
            <AppText variant="caption">{T.medicationBasis}</AppText>
          </Card>
        </View>
      )}

      <View style={{ gap: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          {T.dayListTitle}
        </AppText>
        {listDays.map((d) => {
          const isToday = d.recordDate === history.recordDate;
          const title = `${formatRecordDate(d.recordDate)}${isToday ? ` · ${T.todayTag}` : ''}`;
          return (
            <DayRow
              key={`${range}-${d.recordDate}`}
              title={title}
              summary={dayRowSummary(d)}
              onPress={() => onDay(d.recordDate)}
              dashed={!d.dailyLog}
              accent={isToday}
            />
          );
        })}
      </View>
    </>
  );
}
