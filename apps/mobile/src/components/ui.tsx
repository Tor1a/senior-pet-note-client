// 공통 UI 조각. 접근성 기본값(본문 18, 터치 48 이상, 주요 버튼 56 이상)을 여기서 강제한다.
// 새 화면을 만들 때 RN 의 Text/Pressable 대신 이 컴포넌트를 쓰면 기본값을 놓치지 않는다.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type RefreshControlProps,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { usePush } from '../push/pushContext';
import { colors, fontSize, spacing, touch } from '../theme';

/** 본문 글자 (기본 18). variant 로 제목·보조 문구를 고른다. */
export function AppText({
  variant = 'body',
  style,
  ...rest
}: TextProps & { variant?: 'body' | 'title' | 'caption' | 'secondary' }) {
  return <Text {...rest} style={[styles.body, variantStyles[variant], style]} />;
}

/**
 * 화면 프레임이 잡을 안전 영역 가장자리.
 * 상단 알림 배너가 떠 있으면 배너가 상단 안전 영역(노치)을 이미 채우므로 top 을 뺀다(중복 여백 방지).
 */
export function screenEdges(edges: readonly Edge[], bannerVisible: boolean, keyboardVisible = false): Edge[] {
  return edges.filter((e) => !(bannerVisible && e === 'top') && !(keyboardVisible && e === 'bottom'));
}

/** 큰 글씨(이 배율 이상)에서 키보드가 올라와 있으면 하단 고정 영역을 숨긴다(입력 영역이 너무 좁아지지 않게) */
export const LARGE_FONT_SCALE = 1.3;
export function shouldHideFooter(keyboardVisible: boolean, fontScale: number): boolean {
  return keyboardVisible && fontScale >= LARGE_FONT_SCALE;
}

/** 키보드가 올라와 있는지. 올라온 동안에는 하단 안전 영역을 키보드가 이미 덮으므로 다시 더하지 않는다 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** 입력칸이 포커스를 받으면 스크롤해서 보이게 한다(Screen 이 제공) */
const RevealInputContext = createContext<(node: View) => void>(() => {});
const REVEAL_DELAY_MS = 300; // 키보드가 올라오는 동안 기다린 뒤 위치를 잰다

interface ScreenProps {
  children: ReactNode;
  /** 스크롤 밖 하단 고정 영역(저장 바 등). 키보드가 올라오면 함께 올라온다 */
  footer?: ReactNode;
  /** 안전 영역 가장자리. 기본은 위·아래 */
  edges?: readonly Edge[];
  scrollRef?: RefObject<ScrollView | null>;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}

const DEFAULT_EDGES: readonly Edge[] = ['top', 'bottom'];

/** 화면 바탕: 안전 영역 + 스크롤(글자 크기 200% 에서도 잘리지 않게) + 키보드 대응 + 하단 고정 영역 */
export function Screen({ children, footer, edges = DEFAULT_EDGES, scrollRef, refreshControl }: ScreenProps) {
  const { bannerVisible } = usePush();
  const keyboardVisible = useKeyboardVisible();
  const { fontScale } = useWindowDimensions();
  const ownRef = useRef<ScrollView>(null);
  const ref = scrollRef ?? ownRef;
  const reveal = useCallback(
    (node: View) => {
      setTimeout(() => {
        const inner = (ref.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
        if (!inner) return;
        node.measureLayout?.(
          inner as never,
          (_x, y) => ref.current?.scrollTo({ y: Math.max(0, y - 120), animated: true }),
          () => {},
        );
      }, REVEAL_DELAY_MS);
    },
    [ref],
  );
  return (
    <SafeAreaView testID="screen-frame" style={styles.safe} edges={screenEdges(edges, bannerVisible, keyboardVisible)}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <RevealInputContext.Provider value={reveal}>
        <ScrollView
          ref={ref}
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
        </RevealInputContext.Provider>
        {shouldHideFooter(keyboardVisible, fontScale) ? null : footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** 테두리 있는 묶음 */
export function Card({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return <View style={[styles.card, accent && styles.cardAccent]}>{children}</View>;
}

interface ChoiceButtonProps {
  label: string;
  onPress: () => void;
  /** 확정(채움 + ✓). 글자로도 구분한다 */
  selected?: boolean;
  /** 서버 제안값(점선 + "최근 평균" 글자). 아직 확정 아님 */
  suggested?: boolean;
  /** radio: 3단 / checkbox: 토글 / tag: 증상 태그 */
  role?: 'radio' | 'checkbox' | 'tag';
  accessibilityLabel?: string;
  disabled?: boolean;
  /** 라벨 앞 글자(예: 기타 증상의 "+ ") */
  prefix?: string;
  /** 다른 값으로 바뀌었을 때 늘어나지 않게 flex 비율 */
  grow?: boolean;
  /** 높이 56(라디오 행·요일 칸처럼 눌러야 할 일이 많은 칸) */
  tall?: boolean;
}

/** 3단 버튼·증상 태그·토글. 선택=채움+✓, 제안=점선+"최근 평균", 최소 48 */
export function ChoiceButton({
  label,
  onPress,
  selected,
  suggested,
  role = 'radio',
  accessibilityLabel,
  disabled,
  prefix = '',
  grow,
  tall,
}: ChoiceButtonProps) {
  return (
    <Pressable
      accessibilityRole={role === 'tag' ? 'button' : role}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={role === 'tag' ? { selected: !!selected, disabled: !!disabled } : { checked: !!selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        grow && styles.choiceGrow,
        tall && styles.choiceTall,
        suggested && styles.choiceSuggested,
        selected && styles.choiceSelected,
        (pressed || disabled) && styles.buttonDimmed,
      ]}
    >
      <Text style={[styles.body, styles.choiceLabel, selected && { color: colors.onPrimary }]}>
        {selected ? '✓ ' : prefix}
        {label}
      </Text>
      {suggested ? <Text style={[styles.caption, styles.choiceLabel]}>최근 평균</Text> : null}
    </Pressable>
  );
}

/** 입력칸만(라벨 없음). 라벨은 accessibilityLabel 로 */
export function AppInput({
  accessibilityLabel,
  style,
  dashed,
  onFocus,
  ...inputProps
}: TextInputProps & { accessibilityLabel: string; dashed?: boolean }) {
  const ref = useRef<TextInput>(null);
  const reveal = useContext(RevealInputContext);
  return (
    <TextInput
      {...inputProps}
      ref={ref}
      onFocus={(e) => {
        onFocus?.(e);
        if (ref.current) reveal(ref.current as unknown as View);
      }}
      accessibilityLabel={accessibilityLabel}
      placeholderTextColor={colors.textSecondary}
      style={[styles.body, styles.input, dashed && styles.choiceSuggested, style]}
    />
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
  /** 화면에 보이는 글자와 다르게 읽어 줄 문구(예: "−" 버튼의 "0.1kg 빼기") */
  accessibilityLabel?: string;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  accessibilityHint,
  accessibilityLabel,
}: AppButtonProps) {
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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

/** 링크처럼 보이는 버튼(밑줄 글자, 높이 48). 지우는 동작·"나중에"·뒤로 가기처럼 주요 버튼보다 덜 눈에 띄어야 할 때 */
export function LinkButton({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled,
  center,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  /** 기본은 왼쪽 정렬 */
  center?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.link, center && styles.linkCenter, (pressed || disabled) && styles.buttonDimmed]}
    >
      <Text style={[styles.body, styles.linkLabel]}>{label}</Text>
    </Pressable>
  );
}

/** 라벨 + 입력칸 + 오류 문구. 오류는 색만이 아니라 글자로도 알린다. */
export function TextField({
  label,
  error,
  onFocus,
  inputRef,
  ...inputProps
}: TextInputProps & { label: string; error?: string; inputRef?: RefObject<TextInput | null> }) {
  const ownRef = useRef<TextInput>(null);
  const ref = inputRef ?? ownRef;
  const reveal = useContext(RevealInputContext);
  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      <TextInput
        {...inputProps}
        ref={ref}
        onFocus={(e) => {
          onFocus?.(e);
          if (ref.current) reveal(ref.current as unknown as View);
        }}
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
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardAccent: { borderWidth: 3, borderColor: colors.primary },
  caption: { fontSize: fontSize.caption, lineHeight: fontSize.caption * 1.5, color: colors.textSecondary },
  choice: {
    minHeight: touch.minSize,
    minWidth: touch.minSize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceGrow: { flexGrow: 1, flexBasis: 0 },
  choiceTall: { minHeight: touch.primaryHeight },
  choiceSuggested: { borderStyle: 'dashed', backgroundColor: colors.background },
  choiceSelected: { backgroundColor: colors.primary, borderColor: colors.primary, borderStyle: 'solid' },
  choiceLabel: { fontWeight: '700', textAlign: 'center' },
  buttonLabel: { fontWeight: '700', textAlign: 'center' },
  link: {
    minHeight: touch.minSize,
    minWidth: touch.minSize,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  linkCenter: { alignSelf: 'center' },
  linkLabel: { fontWeight: '700', textDecorationLine: 'underline' },
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
