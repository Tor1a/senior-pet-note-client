// 목록 시트(Modal): YearSheet 패턴을 일반화한 것. 생일 월·일, 입양일 연·월·일 고르기에 쓴다 (설계 .company/design/초보-견주-온보딩-C.md 11장). 새 네이티브 모듈 없음.
// - 줄을 눌러도 바로 닫지 않고 [완료]에서 반영한다. [취소]·바깥 탭·안드로이드 뒤로는 이전 값을 유지한다.
// - 목록: 맨 위 "없음" 줄(noneLabel), 그 아래 options. 직접 입력은 받지 않는다.
// - 처음 보이는 위치: 고른 값이 있으면 그 줄, 없으면 startValue 줄(없으면 맨 위).
// - 열리면 키보드를 닫고 접근성 포커스를 제목으로, 뒤쪽 화면은 읽히지 않게(accessibilityViewIsModal).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, AppText, ChoiceButton, LinkButton } from '../components/ui';
import { colors, spacing } from '../theme';
import { PET_TEXT } from './petText';

export interface SheetOption {
  value: number;
  label: string;
}

export interface OptionSheetProps {
  visible: boolean;
  title: string;
  noneLabel: string;
  options: SheetOption[];
  /** 지금 고른 값(없으면 null) */
  value: number | null;
  /** 고른 값이 없을 때 처음 보여 줄 줄 */
  startValue?: number | null;
  onDone: (value: number | null) => void;
  onCancel: () => void;
}

export function OptionSheet({ visible, title, noneLabel, options, value, startValue = null, onDone, onCancel }: OptionSheetProps) {
  const [pending, setPending] = useState<number | null>(value);
  const titleRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});

  // 열릴 때마다 현재 값에서 시작하고, 키보드를 닫고, 제목으로 접근성 포커스를 옮긴다
  useEffect(() => {
    if (!visible) return;
    setPending(value);
    Keyboard.dismiss();
    const t = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(t);
    // 열릴 때의 값만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const scrollToStart = () => {
    const target = value ?? startValue;
    if (target === null) return;
    const y = rowY.current[String(target)];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: false });
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={styles.outside} accessible={false} onPress={onCancel} importantForAccessibility="no" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View ref={titleRef} accessible accessibilityRole="header" collapsable={false}>
            <AppText variant="title">{title}</AppText>
          </View>
          <ScrollView ref={scrollRef} style={styles.list} contentContainerStyle={styles.listBody} onContentSizeChange={scrollToStart}>
            <View onLayout={(e) => (rowY.current.none = e.nativeEvent.layout.y)}>
              <ChoiceButton tall label={noneLabel} selected={pending === null} onPress={() => setPending(null)} />
            </View>
            {options.map((o) => (
              <View key={o.value} onLayout={(e) => (rowY.current[String(o.value)] = e.nativeEvent.layout.y)}>
                <ChoiceButton tall label={o.label} selected={pending === o.value} onPress={() => setPending(o.value)} />
              </View>
            ))}
          </ScrollView>
          <AppButton label={PET_TEXT.sheetDone} onPress={() => onDone(pending)} />
          <LinkButton label={PET_TEXT.sheetCancel} center onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

/** 라벨 + 누르면 시트가 열리는 칸. 눈에 보이는 라벨과 읽는 라벨을 따로 받는다 */
export function PickField({
  label,
  shownValue,
  a11yLabel,
  hint,
  disabled,
  buttonRef,
  onPress,
}: {
  label: string;
  shownValue: string;
  a11yLabel: string;
  hint: string;
  disabled?: boolean;
  /** 오류·시트 닫힘 뒤 접근성 포커스를 돌려줄 때 쓴다 */
  buttonRef?: React.RefObject<View | null>;
  onPress: () => void;
}) {
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      <Pressable
        ref={buttonRef}
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={hint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.fieldButton, (pressed || disabled) && styles.dimmed]}
      >
        <AppText style={styles.fieldValue}>{shownValue}</AppText>
        <AppText accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          ▾
        </AppText>
      </Pressable>
    </View>
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,36,32,0.5)' },
  outside: { flex: 1 },
  sheet: {
    maxHeight: '80%',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
  },
  list: { flexShrink: 1 },
  listBody: { gap: spacing.sm },
});
