// 하단 고정 저장 바: 되돌리기 안내(notice), 저장 오류, 저장 버튼
// - 저장 직후 안내는 UndoNotice(저장 되돌리기 버튼 포함). 글자 배율이 크면 화면이 안내를 스크롤 맨 위로 옮기고 이 막대에는 버튼만 남긴다.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton, AppText } from '../../components/ui';
import { colors, spacing } from '../../theme';

export function SaveBar({
  label,
  notice,
  hint,
  error,
  disabled,
  saving,
  onSave,
}: {
  label: string;
  /** 저장 직후·되돌린 직후 안내(UndoNotice) */
  notice?: ReactNode;
  /** 체중 숫자 확인 중이라는 한 줄(화면 아래만 보는 사람에게 알린다. 카드가 스크린리더로 읽히므로 숨김) */
  hint?: string | null;
  error: string | null;
  disabled: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <View style={styles.bar}>
      {notice}
      {hint ? (
        <AppText variant="secondary" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.hint}>
          {`ⓘ ${hint}`}
        </AppText>
      ) : null}
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
  hint: { fontWeight: '600' },
  error: { fontWeight: '700' },
});
