// 투약 섹션: "오늘 먹일 약 n / m", 카드(대기·접힘·강조), 오류 문구 (웹 TodayPage 투약 영역과 같은 문구)
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppButton, AppText, Card } from '../../components/ui';
import { doseKey, doseLabel, doseParts, type DoseView } from '../../lib/todayDoses';
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
  /** 약 등록 화면으로(약이 하나도 없을 때) */
  onAdd: () => void;
}

export function DoseSection({ doses, cutoffNotice, message, highlightKey, onToggle, onHighlight, onManage, onAdd }: DoseSectionProps) {
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
            />
          ))}
        </>
      )}
      {doses.length > 0 && <AppButton label="약 관리 ›" accessibilityLabel="약 관리" variant="secondary" onPress={onManage} />}
      {message && (
        <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.bold}>
          {`! ${message}`}
        </AppText>
      )}
    </View>
  );
}

function DoseItem({
  dose,
  highlight,
  onToggle,
  onHighlight,
}: {
  dose: DoseView;
  highlight: boolean;
  onToggle: () => void;
  onHighlight: (node: View) => void;
}) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (highlight && ref.current) onHighlight(ref.current);
    // onHighlight 는 화면이 바뀔 때마다 새로 만들어져도 다시 스크롤하지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  const { what, time, takenText } = doseParts(dose);
  // 큰 글씨(1.3~)에서는 이름과 용량을 줄 단위로 나눠 "1 / 정"처럼 단어 중간에서 끊기지 않게 한다
  const stacked = isLargeFont(useWindowDimensions().fontScale) && !!dose.doseText;
  const a11y = {
    accessibilityRole: 'checkbox' as const,
    accessibilityLabel: highlight ? `방금 알림 온 약, ${doseLabel(dose)}` : doseLabel(dose),
    accessibilityState: { checked: dose.taken, disabled: dose.pending },
  };

  if (dose.taken && dose.collapsed) {
    return (
      <Pressable ref={ref} {...a11y} onPress={onToggle} style={[styles.collapsed]}>
        <AppText style={[styles.check, { color: colors.done }]}>✓</AppText>
        {stacked ? (
          <View style={styles.collapsedLine}>
            <AppText>{`${time} ${dose.name}`}</AppText>
            <AppText>{dose.doseText}</AppText>
            <AppText>{takenText}</AppText>
          </View>
        ) : (
          <AppText style={styles.collapsedLine}>{`${time} ${what} · ${takenText}`}</AppText>
        )}
        <AppText variant="secondary" style={styles.bold}>
          취소
        </AppText>
      </Pressable>
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
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.done,
  },
  check: { fontWeight: '700' },
  collapsedLine: { flex: 1 },
});
