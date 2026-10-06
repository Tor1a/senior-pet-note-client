// 공통 UI 조각. 접근성 기본값(본문 18, 터치 48 이상, 주요 버튼 56 이상)을 여기서 강제한다.
// 새 화면을 만들 때 RN 의 Text/Pressable 대신 이 컴포넌트를 쓰면 기본값을 놓치지 않는다.

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontSize, spacing, touch } from '../theme';

/** 본문 글자 (기본 18). variant 로 제목·보조 문구를 고른다. */
export function AppText({
  variant = 'body',
  style,
  ...rest
}: TextProps & { variant?: 'body' | 'title' | 'caption' | 'secondary' }) {
  return <Text {...rest} style={[styles.body, variantStyles[variant], style]} />;
}

/** 화면 바탕: 안전 영역 + 스크롤(글자 크기 200% 에서도 잘리지 않게) */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

interface AppButtonProps {
  label: string;
  onPress: () => void;
  /** primary: 테라코타 채움(주요 동작, 높이 56) / secondary: 테두리만(높이 48) */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

export function AppButton({ label, onPress, variant = 'primary', disabled, loading, accessibilityHint }: AppButtonProps) {
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || inactive) && styles.buttonDimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onPrimary : colors.text} />
      ) : (
        <Text style={[styles.body, styles.buttonLabel, isPrimary && { color: colors.onPrimary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** 라벨 + 입력칸 + 오류 문구. 오류는 색만이 아니라 글자로도 알린다. */
export function TextField({
  label,
  error,
  ...inputProps
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      <TextInput
        {...inputProps}
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={[styles.body, styles.input, !!error && styles.inputError]}
      />
      {error ? (
        <AppText variant="secondary" accessibilityLiveRegion="polite">
          {`! ${error}`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { padding: spacing.screen, gap: spacing.md, flexGrow: 1 },
  body: { fontSize: fontSize.body, lineHeight: fontSize.body * 1.5, color: colors.text },
  button: {
    minHeight: touch.minSize,
    minWidth: touch.minSize,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { minHeight: touch.primaryHeight, backgroundColor: colors.primary },
  buttonSecondary: { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface },
  buttonDimmed: { opacity: 0.6 },
  buttonLabel: { fontWeight: '700', textAlign: 'center' },
  field: { gap: 4 },
  fieldLabel: { fontWeight: '700' },
  input: {
    minHeight: touch.minSize,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  inputError: { borderWidth: 3 },
});

const variantStyles = StyleSheet.create({
  body: {},
  title: { fontSize: fontSize.title, lineHeight: fontSize.title * 1.4, fontWeight: '700' },
  caption: { fontSize: fontSize.caption, lineHeight: fontSize.caption * 1.5, color: colors.textSecondary },
  secondary: { color: colors.textSecondary },
});
