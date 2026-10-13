// 산책·배변 기록 (선택): 접힌 행 1줄. 웹 components/RoutineSection 과 같은 규칙, 설계 .company/design/루틴-기록-칩.md 3·4·9장
// - 별도 저장 없음(화면 아래 기존 [저장] 하나). 값은 상위 폼 상태에 있어 접어도 유지된다.
// - 못 누르는 버튼은 disabled 가 아니라 상태(accessibilityState.disabled)만 알리고 눌러도 변화 없음(포커스 유지).
// - 큰 글씨(fontScale 1.3 이상): 값 칸 전체 폭 -> [−][+] 가로 2개 -> [지우기] 전체 폭으로 세로 배치. 글자는 줄이지 않는다.
// - 값 변경 낭독은 마지막 입력 후 0.5초 모아 한 번만: iOS 는 announceForAccessibility, Android 는 liveRegion(둘 중 하나만).
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AppText } from '../../components/ui';
import {
  isStepDisabled,
  ROUTINE_MAX,
  stepRoutine,
  type RoutineItem,
  type RoutineState,
  type RoutineStep,
  type RoutineValue,
} from '../../lib/routineForm';
import {
  ROUTINE_TEXT as T,
  routineButtonLabel,
  routineLiveText,
  routineSummaryOf,
  routineToggleLabel,
  routineValueText,
} from '../../lib/routineText';
import { isLargeFont } from '../../medications/layout';
import { colors, spacing, touch } from '../../theme';

export const LIVE_DELAY_MS = 500;
/** 설계 3-4: 안 적음 상태의 옅은 실선(웹 styles.css 와 같은 값) */
const SOFT_BORDER = '#b8aa9c';
const ITEMS: { item: RoutineItem; label: string }[] = [
  { item: 'walk', label: T.walk },
  { item: 'poop', label: T.poop },
];

export function RoutineSection({
  routine,
  open,
  onToggle,
  onChange,
  dirty,
  saveFailed,
  saving,
}: {
  routine: RoutineState;
  open: boolean;
  onToggle: () => void;
  onChange: (next: RoutineState) => void;
  /** 저장 기준값과 다른가 */
  dirty: boolean;
  /** 직전 저장이 실패했나(값은 화면에 그대로 있다) */
  saveFailed: boolean;
  saving: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const large = isLargeFont(fontScale);
  const [live, setLive] = useState('');
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (liveTimer.current != null) clearTimeout(liveTimer.current);
    },
    [],
  );

  const announce = (item: RoutineItem, value: RoutineValue) => {
    if (liveTimer.current != null) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      const text = routineLiveText(item, value);
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
      else setLive(text);
    }, LIVE_DELAY_MS);
  };

  const apply = (item: RoutineItem, step: RoutineStep) => {
    if (saving) return;
    const current = routine[item];
    if (isStepDisabled(current, step)) return;
    const value = stepRoutine(current, step);
    onChange({ ...routine, [item]: value });
    announce(item, value);
  };

  const summary = routineSummaryOf(routine);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={routineToggleLabel(summary, dirty)}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.toggle, pressed && styles.dimmed]}
      >
        <View style={[styles.toggleHead, large && styles.column]}>
          <AppText style={styles.toggleTitle}>{T.title}</AppText>
          <AppText importantForAccessibility="no" style={styles.bold}>
            {`${open ? T.close : T.open} ${open ? '▾' : '▸'}`}
          </AppText>
        </View>
        {!open && (summary || dirty) ? (
          <View style={styles.summary}>
            {summary ? <AppText variant="secondary">{summary}</AppText> : null}
            {dirty ? <Chip /> : null}
          </View>
        ) : null}
      </Pressable>

      {Platform.OS !== 'ios' ? (
        <View accessibilityLiveRegion="polite" style={styles.liveBox}>
          <Text>{live}</Text>
        </View>
      ) : null}

      {open ? (
        <View style={styles.body}>
          <AppText variant="secondary">{T.help}</AppText>
          {ITEMS.map(({ item, label }) => (
            <RoutineStepper
              key={item}
              item={item}
              label={label}
              value={routine[item]}
              large={large}
              saving={saving}
              onStep={(step) => apply(item, step)}
            />
          ))}
          {dirty ? (
            <View style={styles.dirtyRow}>
              <Chip />
              <AppText style={[styles.bold, styles.dirtyText]}>{saveFailed ? T.dirtyFailed : T.dirtyNote}</AppText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Chip() {
  return (
    <View style={styles.chip}>
      <AppText variant="caption" style={styles.bold}>
        {T.dirtyChip}
      </AppText>
    </View>
  );
}

function RoutineStepper({
  item,
  label,
  value,
  large,
  saving,
  onStep,
}: {
  item: RoutineItem;
  label: string;
  value: RoutineValue;
  large: boolean;
  saving: boolean;
  onStep: (step: RoutineStep) => void;
}) {
  const valueText = routineValueText(value);
  const stepButton = (step: RoutineStep, text: string, grow: boolean) => {
    const inactive = saving || isStepDisabled(value, step);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={routineButtonLabel(item, step)}
        accessibilityValue={{ text: valueText }}
        accessibilityState={{ disabled: inactive }}
        onPress={() => onStep(step)}
        hitSlop={4}
        style={({ pressed }) => [
          step === 'clear' ? styles.clear : styles.step,
          grow && styles.grow,
          (pressed || inactive) && styles.inactive,
        ]}
      >
        <Text style={[styles.stepText, step === 'clear' && styles.clearText]}>{text}</Text>
      </Pressable>
    );
  };
  const valueCell = (
    <View
      accessible
      accessibilityLabel={`${label}, ${valueText}`}
      style={[styles.value, value == null ? styles.valueNone : styles.valueSet, large && styles.valueWide]}
    >
      <Text style={[styles.valueText, value == null ? styles.valueTextNone : styles.valueTextSet]}>{valueText}</Text>
    </View>
  );

  return (
    <View style={styles.item}>
      <AppText style={styles.bold}>{label}</AppText>
      {large ? (
        <View style={styles.column}>
          {valueCell}
          <View style={styles.row}>
            {stepButton('minus', T.minus, true)}
            {stepButton('plus', T.plus, true)}
          </View>
          {stepButton('clear', T.clear, false)}
        </View>
      ) : (
        <View style={styles.controls}>
          {stepButton('minus', T.minus, false)}
          {valueCell}
          {stepButton('plus', T.plus, false)}
          {stepButton('clear', T.clear, false)}
        </View>
      )}
      {value === ROUTINE_MAX ? <AppText variant="secondary">{T.limitReached}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  bold: { fontWeight: '700' },
  dimmed: { opacity: 0.6 },
  inactive: { opacity: 0.5 },
  column: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1 },
  toggle: {
    minHeight: touch.primaryHeight,
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: SOFT_BORDER,
    backgroundColor: colors.surface,
  },
  toggleHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  toggleTitle: { fontWeight: '700', flexShrink: 1 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  chip: { borderWidth: 2, borderColor: SOFT_BORDER, borderRadius: 999, paddingHorizontal: spacing.sm },
  liveBox: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  body: { gap: spacing.md },
  item: { gap: spacing.sm },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  step: {
    width: touch.primaryHeight,
    minHeight: touch.primaryHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepText: { fontSize: 24, color: colors.text },
  clear: {
    minWidth: 64,
    minHeight: touch.minSize,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  clearText: { fontSize: 18 },
  value: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 80,
    minWidth: 80,
    minHeight: touch.primaryHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  valueWide: { alignSelf: 'stretch', flexBasis: 'auto' },
  valueNone: { borderWidth: 2, borderColor: SOFT_BORDER },
  valueSet: { borderWidth: 3, borderColor: colors.text },
  valueText: { fontSize: 22, textAlign: 'center' },
  valueTextNone: { color: colors.textSecondary },
  valueTextSet: { color: colors.text, fontWeight: '700' },
  dirtyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  dirtyText: { flexShrink: 1 },
});
