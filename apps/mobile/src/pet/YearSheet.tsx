// 태어난 해 고르기: 목록 시트(Modal) + 칸(YearField) (설계 4-3). 새 네이티브 모듈 없이 만든다.
// - 줄을 눌러도 바로 닫지 않고 [완료]에서 반영한다. [취소]·바깥 탭·안드로이드 뒤로는 이전 값을 유지한다.
// - 목록: 맨 위 "모르거나 적지 않음", 그 아래 올해부터 1980년까지 내림차순. 직접 입력은 받지 않는다.
// - 처음 보이는 위치: 이미 고른 해가 있으면 그 줄, 없으면 (올해 − 12년) 근처.
// - 열리면 접근성 포커스를 제목으로, 뒤쪽 화면은 읽히지 않게(accessibilityViewIsModal).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppButton, AppText, ChoiceButton, LinkButton } from '../components/ui';
import { birthYearOptions, PET_MIN_YEAR } from '../lib/petForm';
import { colors, spacing } from '../theme';
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
  const [pending, setPending] = useState<number | null>(value);
  const titleRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const rowY = useRef<Record<string, number>>({});
  const years = birthYearOptions(thisYear);

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
    const y = rowY.current[String(initialSheetYear(value, thisYear))];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: false });
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={styles.outside} accessible={false} onPress={onCancel} importantForAccessibility="no" />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View ref={titleRef} accessible accessibilityRole="header" collapsable={false}>
            <AppText variant="title">{PET_TEXT.sheetTitle}</AppText>
          </View>
          <ScrollView ref={scrollRef} style={styles.list} contentContainerStyle={styles.listBody} onContentSizeChange={scrollToStart}>
            <View onLayout={(e) => (rowY.current.none = e.nativeEvent.layout.y)}>
              <ChoiceButton
                tall
                label={PET_TEXT.sheetNone}
                selected={pending === null}
                onPress={() => setPending(null)}
              />
            </View>
            {years.map((y) => (
              <View key={y} onLayout={(e) => (rowY.current[String(y)] = e.nativeEvent.layout.y)}>
                <ChoiceButton tall label={yearText(y)} selected={pending === y} onPress={() => setPending(y)} />
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
