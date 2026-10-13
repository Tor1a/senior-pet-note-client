// 태어난 해 고르기: 목록 시트(OptionSheet 를 부르는 얇은 래퍼) + 칸(YearField) (설계 4-3). 새 네이티브 모듈 없이 만든다.
// - 줄을 눌러도 바로 닫지 않고 [완료]에서 반영한다. [취소]·바깥 탭·안드로이드 뒤로는 이전 값을 유지한다.
// - 목록: 맨 위 "모르거나 적지 않음", 그 아래 올해부터 1980년까지 내림차순. 직접 입력은 받지 않는다.
// - 처음 보이는 위치: 이미 고른 해가 있으면 그 줄, 없으면 (올해 − 12년) 근처.
// - 열리면 접근성 포커스를 제목으로, 뒤쪽 화면은 읽히지 않게(accessibilityViewIsModal).
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../components/ui';
import { birthYearOptions, PET_MIN_YEAR } from '../lib/petForm';
import { colors, spacing } from '../theme';
import { OptionSheet } from './OptionSheet';
import { PET_TEXT, yearText } from './petText';

/** 시트가 처음 보여 줄 줄의 해. 고른 해가 없으면 올해 − 12년(1980 아래로는 내려가지 않는다) */
export function initialSheetYear(selected: number | null, thisYear: number): number {
  return selected ?? Math.max(PET_MIN_YEAR, thisYear - 12);
}

export function YearField({
  value,
  disabled,
  onPress,
}: {
  value: number | null;
  disabled?: boolean;
  onPress: () => void;
}) {
  const shown = value ? yearText(value) : PET_TEXT.birthNone;
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{PET_TEXT.birthLabel}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${PET_TEXT.birthLabel.replace(' (선택)', '')}, ${shown}`}
        accessibilityHint={PET_TEXT.birthHint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.fieldButton, (pressed || disabled) && styles.dimmed]}
      >
        <AppText style={styles.fieldValue}>{shown}</AppText>
        <AppText accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          ▾
        </AppText>
      </Pressable>
    </View>
  );
}

export function YearSheet({
  visible,
  value,
  thisYear,
  onDone,
  onCancel,
}: {
  visible: boolean;
  value: number | null;
  thisYear: number;
  onDone: (year: number | null) => void;
  onCancel: () => void;
}) {
  const options = birthYearOptions(thisYear).map((y) => ({ value: y, label: yearText(y) }));
  return (
    <OptionSheet
      visible={visible}
      title={PET_TEXT.sheetTitle}
      noneLabel={PET_TEXT.sheetNone}
      options={options}
      value={value}
      startValue={initialSheetYear(value, thisYear)}
      onDone={onDone}
      onCancel={onCancel}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  label: { fontWeight: '700' },
  fieldButton: {
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
  },
  fieldValue: { flexShrink: 1 },
  dimmed: { opacity: 0.6 },
});
