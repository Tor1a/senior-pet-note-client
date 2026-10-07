// 체중(선택): − / 입력 / + 스테퍼, 제안값·지난 기록, [오늘 쟀어요] 토글
import { StyleSheet, View } from 'react-native';
import { AppButton, AppInput, AppText, ChoiceButton } from '../../components/ui';
import { daysBetween, formatKg } from '../../lib/format';
import type { TodayForm } from '../../lib/todayForm';
import { daysAgoText } from '../../lib/todayDoses';
import { spacing } from '../../theme';

export function WeightSection({
  weight,
  lastWeight,
  recordDate,
  onStep,
  onChangeText,
  onToggleMeasured,
}: {
  weight: TodayForm['weight'];
  lastWeight: { weightKg: number; recordDate: string } | null;
  recordDate: string;
  onStep: (delta: number) => void;
  onChangeText: (raw: string) => void;
  onToggleMeasured: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header" style={styles.h2}>
          체중 (선택)
        </AppText>
        {lastWeight && (
          <AppText variant="secondary">
            {`지난 기록 ${formatKg(lastWeight.weightKg)}kg (${daysAgoText(daysBetween(lastWeight.recordDate, recordDate))})`}
          </AppText>
        )}
      </View>
      <View style={styles.stepper}>
        <AppButton
          variant="secondary"
          label="−"
          accessibilityLabel="0.1kg 빼기"
          disabled={!weight.text}
          onPress={() => onStep(-0.1)}
        />
        <View style={styles.unit}>
          <AppInput
            accessibilityLabel="체중 (kg)"
            keyboardType="decimal-pad"
            dashed={!weight.measured && weight.suggested}
            value={weight.text}
            placeholder="-.-"
            onChangeText={onChangeText}
            style={styles.flex}
          />
          <AppText>kg</AppText>
        </View>
        <AppButton
          variant="secondary"
          label="+"
          accessibilityLabel="0.1kg 더하기"
          disabled={!weight.text}
          onPress={() => onStep(0.1)}
        />
      </View>
      {!weight.measured && weight.suggested && <AppText variant="caption">최근 평균</AppText>}
      <ChoiceButton
        role="checkbox"
        label="오늘 쟀어요"
        selected={weight.measured}
        disabled={!weight.text}
        onPress={onToggleMeasured}
      />
      {!weight.measured && (
        <AppText variant="caption">[오늘 쟀어요]를 누르거나 숫자를 바꾸면 오늘 체중으로 저장돼요.</AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  h2: { fontSize: 20 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unit: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
