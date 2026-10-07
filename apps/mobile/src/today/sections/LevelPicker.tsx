// 조금/보통/많이 3단 선택. 제안값은 점선 + "최근 평균" 글자, 확정 값은 채움 + ✓ (식사·물 공용)
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText, ChoiceButton } from '../../components/ui';
import { LEVEL_LABELS } from '../../lib/format';
import type { LevelField } from '../../lib/todayForm';
import { spacing } from '../../theme';

/** 이 배율 이상이면 3단 버튼을 세로로 쌓는다(글자 200% 에서도 잘리지 않게) */
export const STACK_FONT_SCALE = 1.4;

export function LevelPicker({
  title,
  field,
  suggestion,
  onTap,
}: {
  title: string;
  field: LevelField;
  suggestion: number | null;
  onTap: (v: number) => void;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <AppText variant="title" accessibilityRole="header" style={styles.h2}>
          {title}
        </AppText>
        {suggestion != null && <AppText variant="secondary">{`최근 평균: ${LEVEL_LABELS[suggestion]}`}</AppText>}
      </View>
      <View style={[styles.levels, fontScale >= STACK_FONT_SCALE && styles.levelsStacked]} accessibilityRole="radiogroup">
        {[1, 2, 3].map((v) => {
          const selected = field.value === v;
          const suggested = selected && field.source === 'suggested';
          const confirmed = selected && field.source === 'confirmed';
          return (
            <ChoiceButton
              key={v}
              grow
              role="radio"
              label={LEVEL_LABELS[v]}
              selected={confirmed}
              suggested={suggested}
              accessibilityLabel={suggested ? `${LEVEL_LABELS[v]}, 최근 평균 제안값, 아직 확인 안 함` : LEVEL_LABELS[v]}
              onPress={() => onTap(v)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  h2: { fontSize: 20 },
  levels: { flexDirection: 'row', gap: spacing.sm },
  levelsStacked: { flexDirection: 'column' },
});
