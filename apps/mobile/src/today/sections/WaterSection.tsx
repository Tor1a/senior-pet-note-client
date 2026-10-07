// 물: 3단 ↔ ml 입력 전환 (선택한 방식은 화면이 기기에 기억한다)
import { StyleSheet, View } from 'react-native';
import { AppButton, AppInput, AppText } from '../../components/ui';
import type { LevelField, TodayForm } from '../../lib/todayForm';
import { spacing } from '../../theme';
import { LevelPicker } from './LevelPicker';

export function WaterSection({
  form,
  suggestions,
  onTapLevel,
  onChangeMl,
  onChangeMode,
}: {
  form: Pick<TodayForm, 'waterMode' | 'water' | 'waterMl'>;
  suggestions: { waterLevel: number | null; waterMl: number | null };
  onTapLevel: (v: number) => void;
  onChangeMl: (raw: string) => void;
  onChangeMode: (mode: 'level' | 'ml') => void;
}) {
  const level: LevelField = form.water;
  return (
    <View style={styles.wrap}>
      {form.waterMode === 'level' ? (
        <LevelPicker title="물" field={level} suggestion={suggestions.waterLevel} onTap={onTapLevel} />
      ) : (
        <>
          <View style={styles.head}>
            <AppText variant="title" accessibilityRole="header" style={styles.h2}>
              물
            </AppText>
            {suggestions.waterMl != null && <AppText variant="secondary">{`최근 평균: ${suggestions.waterMl}ml`}</AppText>}
          </View>
          <View style={styles.unit}>
            <AppInput
              accessibilityLabel="물 마신 양 (ml)"
              keyboardType="number-pad"
              dashed={form.waterMl.source === 'suggested'}
              value={form.waterMl.text}
              placeholder="예: 300"
              onChangeText={onChangeMl}
              style={styles.flex}
            />
            <AppText>ml</AppText>
          </View>
          {form.waterMl.source === 'suggested' && <AppText variant="caption">최근 평균</AppText>}
        </>
      )}
      <AppButton
        variant="secondary"
        label={form.waterMode === 'level' ? 'ml로 적기 ›' : '조금/보통/많이로 고르기 ›'}
        onPress={() => onChangeMode(form.waterMode === 'level' ? 'ml' : 'level')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  h2: { fontSize: 20 },
  unit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
