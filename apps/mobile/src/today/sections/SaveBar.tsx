// 하단 고정 저장 바: 토스트(3초), 저장 오류, 저장 버튼
import { StyleSheet, View } from 'react-native';
import { AppButton, AppText } from '../../components/ui';
import { colors, spacing } from '../../theme';

export function SaveBar({
  label,
  toast,
  error,
  disabled,
  saving,
  onSave,
}: {
  label: string;
  toast: string | null;
  error: string | null;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <View style={styles.bar}>
      <View accessibilityLiveRegion="polite">
        {toast ? <AppText style={styles.toast}>{`✓ ${toast}`}</AppText> : null}
      </View>
      {error ? (
        <AppText accessibilityRole="alert" style={styles.error}>
          {`! ${error}`}
        </AppText>
      ) : null}
      <AppButton label={label} disabled={disabled || saving} onPress={onSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  toast: { fontWeight: '700', color: colors.done },
  error: { fontWeight: '700' },
});
