// 알림 받기 스위치 행 (설계 5-2). RN 기본 Switch 는 작고 색만 달라 쓰지 않는다.
// 켜짐 = 초록 테두리 + 연초록 바탕 + 글자 "켜짐" + ▣, 꺼짐 = 흰 바탕 + 글자 "꺼짐" + □ (색만으로 구분하지 않는다)
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '../../components/ui';
import { colors, spacing, touch } from '../../theme';

export function SwitchRow({ label, value, disabled, onToggle }: { label: string; value: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.row, value && styles.on, (pressed || disabled) && styles.dim]}
    >
      <AppText style={styles.bold}>{label}</AppText>
      <AppText style={styles.bold} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {value ? '▣ 켜짐' : '□ 꺼짐'}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.primaryHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  on: { borderColor: colors.done, backgroundColor: '#EEF5F1' },
  dim: { opacity: 0.6 },
  bold: { fontWeight: '700' },
});
