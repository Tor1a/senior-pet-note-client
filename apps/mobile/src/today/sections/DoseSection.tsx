// 투약 섹션: "오늘 먹일 약 n / m", 카드(대기·접힘·강조), 오류 문구 (웹 TodayPage 투약 영역과 같은 문구)
// 접힌 줄은 줄 전체가 아니라 [되돌리기] 버튼만 반응한다(스크롤하다 건드려도 체크가 풀리지 않게). 되돌린 직후에는 [다시 체크] 안내를 보여 준다.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { UndoNotice } from '../../components/UndoNotice';
import { AppButton, AppText, Card } from '../../components/ui';
import { doseKey, doseLabel, doseParts, type DoseView } from '../../lib/todayDoses';
import { doseUndoButtonLabel, UNDO_TEXT } from '../../lib/undoText';
import { UNDO_ACTION_MS, UNDO_RESULT_MS } from '../../lib/undoLogic';
import { colors, spacing, touch } from '../../theme';
import { isLargeFont } from '../../medications/layout';

interface DoseSectionProps {
  doses: DoseView[];
  cutoffNotice: string;
  message: string | null;
  highlightKey: string | null;
  onToggle: (dose: DoseView) => void;
  /** 강조된 카드가 생기면 화면이 그 위치로 스크롤·포커스를 옮긴다 */
  onHighlight: (node: View) => void;
  /** 약 관리 화면으로(약 카드를 누르면 체크라서 카드 밖에 별도 버튼으로 둔다) */
  onManage: () => void;
  /** 지난 기록 보기 화면으로 */
  onHistory: () => void;
  /** 약 등록 화면으로(약이 하나도 없을 때) */
  onAdd: () => void;
  /** 되돌린 직후 안내. recheckKey 가 있으면 [다시 체크] 버튼을 보여 준다 */
  notice?: { message: string; recheckKey: string | null } | null;
  onRecheck?: (key: string) => void;
  onDismissNotice?: () => void;
  /** 체크·되돌리기로 줄 모양이 바뀐 뒤 접근성 포커스를 둘 곳 */
  focusTarget?: { key: string; to: 'undo' | 'card' } | null;
  onFocused?: () => void;
}

export function DoseSection({
  doses,
  cutoffNotice,
  message,
  highlightKey,
  onToggle,
  onHighlight,
  onManage,
  onHistory,
  onAdd,
  notice = null,
  onRecheck,
  onDismissNotice,
  focusTarget = null,
  onFocused,
}: DoseSectionProps) {
  const { fontScale } = useWindowDimensions();
  const takenCount = doses.filter((d) => d.taken).length;
  return (
    <View style={styles.section}>
      <AppText variant="title" accessibilityRole="header" style={styles.h2}>
        {'오늘 먹일 약'}
        {doses.length > 0 ? ` ${takenCount} / ${doses.length}` : ''}
      </AppText>
      <AppText variant="secondary">{cutoffNotice}</AppText>

      {doses.length === 0 ? (
        <Card>
          <AppText style={styles.bold}>먹이는 약이 있나요?</AppText>
          <AppText variant="secondary">등록하면 여기서 한 번에 체크할 수 있어요.</AppText>
          <AppButton label="약 등록하기" variant="secondary" onPress={onAdd} />
        </Card>
      ) : (
        <>
          {takenCount === doses.length && (
            <AppText style={[styles.bold, { color: colors.done }]}>{`▣ 오늘 약 ${doses.length}개 모두 먹였어요`}</AppText>
          )}
          {doses.map((d) => (
            <DoseItem
              key={doseKey(d)}
              dose={d}
              highlight={doseKey(d) === highlightKey}
              onToggle={() => onToggle(d)}
              onHighlight={onHighlight}
              focusWanted={focusTarget?.key === doseKey(d) ? focusTarget.to : null}
              onFocused={onFocused}
            />
          ))}
        </>
      )}
      <View style={[styles.links, isLargeFont(fontScale) && styles.linksStacked]}>
        {doses.length > 0 && (
          <View style={styles.linkItem}>
            <AppButton label="약 관리 ›" accessibilityLabel="약 관리" variant="secondary" onPress={onManage} />
          </View>
        )}
        <View style={styles.linkItem}>
          <AppButton label="지난 기록 보기 ›" accessibilityLabel="지난 기록 보기" variant="secondary" onPress={onHistory} />
        </View>
      </View>
      {message && (
        <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.bold}>
          {`! ${message}`}
        </AppText>
      )}
      {notice && (
        <UndoNotice
          key={notice.message}
          message={notice.message}
          actionLabel={notice.recheckKey ? UNDO_TEXT.doseRecheckButton : undefined}
          onAction={() => notice.recheckKey && onRecheck?.(notice.recheckKey)}
          onClose={notice.recheckKey ? onDismissNotice : undefined}
          closeLabel={UNDO_TEXT.close}
          autoDismissMs={notice.recheckKey ? UNDO_ACTION_MS : UNDO_RESULT_MS}
          onDismiss={onDismissNotice}
        />
      )}
    </View>
  );
}

function DoseItem({
  dose,
  highlight,
  onToggle,
  onHighlight,
  focusWanted,
  onFocused,
}: {
  dose: DoseView;
  highlight: boolean;
  onToggle: () => void;
  onHighlight: (node: View) => void;
  focusWanted: 'undo' | 'card' | null;
  onFocused?: () => void;
}) {
  const ref = useRef<View>(null);
  const undoRef = useRef<View>(null);
  const collapsedNow = dose.taken && dose.collapsed;
  const mode = collapsedNow ? 'undo' : 'card';
  useEffect(() => {
    if (!focusWanted || focusWanted !== mode) return;
    const node = mode === 'undo' ? undoRef.current : ref.current;
    const tag = node ? findNodeHandle(node) : null;
    if (tag) AccessibilityInfo.setAccessibilityFocus?.(tag);
    onFocused?.();
    // onFocused 는 화면이 바뀔 때마다 새로 만들어져도 다시 부르지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusWanted, mode]);
  const fontScale = useWindowDimensions().fontScale;
  useEffect(() => {
    if (highlight && ref.current) onHighlight(ref.current);
    // onHighlight 는 화면이 바뀔 때마다 새로 만들어져도 다시 스크롤하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  const { what, time, takenText } = doseParts(dose);
  // 큰 글씨(1.3~)에서는 이름과 용량을 줄 단위로 나눠 "1 / 정"처럼 단어 중간에서 끊기지 않게 한다
  const stacked = isLargeFont(fontScale) && !!dose.doseText;
  const a11y = {
    accessibilityRole: 'checkbox' as const,
    accessibilityLabel: highlight ? `방금 알림 온 약, ${doseLabel(dose)}` : doseLabel(dose),
    accessibilityState: { checked: dose.taken, disabled: dose.pending },
  };

  if (collapsedNow) {
    const large = isLargeFont(fontScale);
    return (
      <View ref={ref} style={[styles.collapsed, large && styles.collapsedLarge]}>
        <View style={styles.collapsedTop}>
          <AppText style={[styles.check, { color: colors.done }]} accessibilityElementsHidden importantForAccessibility="no">
            ✓
          </AppText>
          {stacked ? (
            <View style={styles.collapsedLine}>
              <AppText>{`${time} ${dose.name}`}</AppText>
              <AppText>{dose.doseText}</AppText>
              <AppText>{takenText}</AppText>
            </View>
          ) : (
            <AppText style={styles.collapsedLine}>{`${time} ${what} · ${takenText}`}</AppText>
          )}
        </View>
        <Pressable
          ref={undoRef}
          accessibilityRole="button"
          accessibilityLabel={doseUndoButtonLabel(what, time)}
          accessibilityState={{ disabled: dose.pending }}
          disabled={dose.pending}
          onPress={onToggle}
          hitSlop={4}
          style={({ pressed }) => [styles.undoButton, large && styles.undoButtonLarge, (pressed || dose.pending) && { opacity: 0.6 }]}
        >
          <AppText style={styles.bold}>{UNDO_TEXT.doseUndoButton}</AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {highlight && <AppText style={[styles.bold, { color: colors.primary }]}>방금 알림 온 약</AppText>}
      <Pressable
        ref={ref}
        {...a11y}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.card,
          dose.taken && styles.cardTaken,
          highlight && styles.cardHighlight,
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={[styles.box, dose.taken && styles.boxOn]}>
          {dose.taken ? <AppText style={styles.boxMark}>✓</AppText> : null}
        </View>
        <View style={styles.doseBody}>
          <AppText style={styles.bold}>{time}</AppText>
          {stacked ? (
            <>
              <AppText>{dose.name}</AppText>
              <AppText>{dose.doseText}</AppText>
            </>
          ) : (
            <AppText>{what}</AppText>
          )}
        </View>
        <AppText style={styles.bold}>{dose.taken ? takenText : '먹였어요'}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  linksStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
  linkItem: { flexGrow: 1, flexBasis: 140 },
  h2: { fontSize: 20 },
  bold: { fontWeight: '700' },
  card: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTaken: { borderColor: colors.done },
  cardHighlight: { borderWidth: 3, borderColor: colors.primary },
  box: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.done, borderColor: colors.done },
  boxMark: { color: colors.onPrimary, fontWeight: '700', lineHeight: 24 },
  doseBody: { flex: 1 },
  collapsed: {
    minHeight: touch.minSize,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.done,
  },
  collapsedLarge: { flexDirection: 'column', alignItems: 'stretch' },
  collapsedTop: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  undoButton: {
    minHeight: touch.minSize,
    minWidth: touch.minSize,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  undoButtonLarge: { minHeight: touch.primaryHeight },
  check: { fontWeight: '700' },
  collapsedLine: { flex: 1 },
});
