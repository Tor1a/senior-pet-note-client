// 오늘 화면 "최근 7일 돌아보기" 접이식 카드. 설계 .company/design/최근-7일-돌아보기-카드.md (웹 components/WeekReviewCard 와 같은 동작)
// - 기본 접힘. 펼칠 때(그리고 [다시 불러오기] 때)만 getHistory(petId) 를 인자 없이 1회 요청한다. 저장·캐시·펼침 상태 저장 없음.
// - 접는 순간 결과를 버리고, 접힌 동안 도착한 응답은 무시한다(다음 펼침을 덮지 않게).
// - 사실 영역(accessibilityLiveRegion)은 펼치면 먼저 있고 내용이 채워질 때 한 번 읽힌다. 오류는 그 밖에 둔다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppButton, AppText, Card } from '../../components/ui';
import { ApiError, isNetworkError, NETWORK_ERROR_MESSAGE } from '../../lib/api';
import { HISTORY_TEXT } from '../../lib/historyText';
import { weekReviewView, type WeekReviewView } from '../../lib/weekReview';
import {
  WEEK_REVIEW_TEXT as T,
  weekMedicationSr,
  weekMedicationText,
  weekRangeSr,
  weekRangeText,
  weekRecordedSr,
  weekRecordedText,
  weekWeightFirst,
  weekWeightLast,
  weekWeightTitle,
  weekWeightValue,
} from '../../lib/weekReviewText';
import { isLargeFont } from '../../medications/layout';
import { petApi } from '../../services/client';
import { colors, spacing, touch } from '../../theme';

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** 웹 .week-review-toggle 과 같은 테두리 색 */
const SOFT_BORDER = '#b8aa9c';
/** 눌림 배경(기존 notice-box 색) */
const PRESSED_BG = '#f4ece4';

export function WeekReviewCard({
  petId,
  onNotFound,
  onHistory,
}: {
  petId: string;
  onNotFound: () => void;
  onHistory: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const large = isLargeFont(fontScale);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [view, setView] = useState<WeekReviewView>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setStatus('loading');
    setError('');
    setView(null);
    try {
      const res = await petApi.getHistory(petId);
      if (mine !== seq.current) return;
      setView(weekReviewView(res.days));
      setStatus('ready');
    } catch (err) {
      if (mine !== seq.current) return;
      if (err instanceof ApiError && err.status === 404) {
        setOpen(false);
        setStatus('idle');
        onNotFound();
        return;
      }
      setError(isNetworkError(err) ? NETWORK_ERROR_MESSAGE : HISTORY_TEXT.loadFailed);
      setStatus('error');
    }
  }, [petId, onNotFound]);

  // 화면을 떠나면 늦게 온 응답을 버린다
  useEffect(
    () => () => {
      seq.current += 1;
    },
    [],
  );

  const toggle = () => {
    if (open) {
      seq.current += 1; // 접힘: 진행 중 응답 무효화, 결과 버림
      setOpen(false);
      setStatus('idle');
      setView(null);
      setError('');
    } else {
      setOpen(true);
      void load();
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={T.title}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <View style={[styles.toggleHead, large && styles.column]}>
          <AppText style={styles.title}>{T.title}</AppText>
          <AppText importantForAccessibility="no">{open ? T.close : T.open}</AppText>
        </View>
      </Pressable>
      {open ? (
        <Card>
          <View
            accessibilityLiveRegion="polite"
            accessibilityState={{ busy: status === 'loading' }}
            style={styles.facts}
          >
            {status === 'loading' ? <AppText>{HISTORY_TEXT.loading}</AppText> : null}
            {status === 'ready' ? <Facts view={view} /> : null}
          </View>
          {status === 'error' ? (
            <>
              <AppText accessibilityRole="alert">{error}</AppText>
              <AppButton label={HISTORY_TEXT.retry} variant="secondary" onPress={() => void load()} />
            </>
          ) : null}
          <AppButton label={HISTORY_TEXT.entryLink} accessibilityLabel="지난 기록 보기" variant="secondary" onPress={onHistory} />
        </Card>
      ) : null}
    </View>
  );
}

function Facts({ view }: { view: WeekReviewView }) {
  if (!view) return <AppText>{T.none}</AppText>;
  const range = (
    <AppText variant="secondary" accessibilityLabel={weekRangeSr(view.firstDate, view.lastDate)}>
      {weekRangeText(view.firstDate, view.lastDate)}
    </AppText>
  );
  if (view.kind === 'empty') {
    return (
      <>
        {range}
        <AppText>{T.none}</AppText>
      </>
    );
  }
  const { weight, medication } = view;
  return (
    <>
      {range}
      <AppText accessibilityLabel={weekRecordedSr(view.recorded, view.total)}>
        {weekRecordedText(view.recorded, view.total)}
      </AppText>
      {weight ? (
        <>
          <AppText>{weekWeightTitle(weight.count)}</AppText>
          {weight.count >= 2 ? (
            <>
              <AppText>{weekWeightFirst(weight.first.weightKg, weight.first.recordDate)}</AppText>
              <AppText>{weekWeightLast(weight.last.weightKg, weight.last.recordDate)}</AppText>
            </>
          ) : (
            <AppText>{weekWeightValue(weight.last.weightKg, weight.last.recordDate)}</AppText>
          )}
        </>
      ) : null}
      {medication ? (
        <>
          <AppText accessibilityLabel={weekMedicationSr(medication.taken, medication.scheduled)}>
            {weekMedicationText(medication.taken, medication.scheduled)}
          </AppText>
          <AppText variant="secondary">{T.medicationNote}</AppText>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  toggle: {
    minHeight: touch.primaryHeight,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: SOFT_BORDER,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: PRESSED_BG },
  toggleHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  column: { flexDirection: 'column', alignItems: 'flex-start', flexWrap: 'nowrap' },
  title: { fontWeight: '700', flexShrink: 1 },
  facts: { gap: spacing.sm },
});
