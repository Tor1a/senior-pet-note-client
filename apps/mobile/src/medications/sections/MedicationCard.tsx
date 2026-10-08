// 약 목록의 약 카드: 이름·용량·시각 + 알림 상태 줄 + [고치기] [알림 설정] + 목록에서 빼기(인라인 확인)
// 버튼 라벨에 약 이름을 넣어 같은 이름의 버튼이 여러 개여도 구분되게 한다(설계 10-4).
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View } from 'react-native';
import { AppButton, AppText, Card, LinkButton } from '../../components/ui';
import { formatTime } from '../../lib/format';
import type { Medication } from '../../lib/petApi';
import type { Reminder } from '../../lib/reminderApi';
import { colors, spacing } from '../../theme';
import { ReminderStatusLine } from './ReminderStatusLine';

interface MedicationCardProps {
  med: Medication;
  reminder: Reminder | 'error' | undefined;
  deviceCannotReceive: boolean;
  confirming: boolean;
  busy: boolean;
  largeFont: boolean;
  onEdit: () => void;
  onReminder: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

export function MedicationCard({
  med,
  reminder,
  deviceCannotReceive,
  confirming,
  busy,
  largeFont,
  onEdit,
  onReminder,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: MedicationCardProps) {
  const confirmRef = useRef<View>(null);
  // 확인 영역이 열리면 접근성 포커스를 확인 문구로 옮긴다
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => {
      const node = confirmRef.current ? findNodeHandle(confirmRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
    return () => clearTimeout(t);
  }, [confirming]);

  const deleteButton = (
    <View key="delete" style={largeFont ? undefined : styles.cell}>
      <AppButton label={busy ? '잠시만요…' : `${med.name} 빼기`} accessibilityLabel={`${med.name} 빼기`} variant="secondary" disabled={busy} onPress={onDelete} />
    </View>
  );
  const keepButton = (
    <View key="keep" style={largeFont ? undefined : styles.cell}>
      <AppButton label="그대로 두기" onPress={onCancelDelete} disabled={busy} />
    </View>
  );

  return (
    <Card>
      <AppText style={styles.bold}>
        {med.name}
        {med.doseText ? <AppText variant="secondary">{` · ${med.doseText}`}</AppText> : null}
      </AppText>
      <AppText variant="secondary">{med.times.map(formatTime).join(' · ')}</AppText>
      <ReminderStatusLine
        medName={med.name}
        medTimes={med.times}
        reminder={reminder}
        deviceCannotReceive={deviceCannotReceive}
        onPress={onReminder}
      />
      {confirming ? (
        <View ref={confirmRef} accessible style={styles.confirm} accessibilityLabel={`${med.name}을(를) 목록에서 뺄까요? 지난 기록은 남아요.`}>
          <AppText style={styles.bold}>{`${med.name}을(를) 목록에서 뺄까요?`}</AppText>
          <AppText variant="secondary">지난 기록은 남아요.</AppText>
        </View>
      ) : null}
      {confirming ? (
        // 큰 글씨에서는 세로로 쌓고, 안전한 쪽(그대로 두기)을 위에 둔다(읽는 순서도 같게 순서를 바꿔 그린다)
        <View style={[styles.row, largeFont && styles.column]}>
          {largeFont ? [keepButton, deleteButton] : [deleteButton, keepButton]}
        </View>
      ) : (
        <>
          <View style={[styles.row, largeFont && styles.column]}>
            <View style={largeFont ? undefined : styles.cell}>
              <AppButton label="고치기" accessibilityLabel={`${med.name} 고치기`} variant="secondary" onPress={onEdit} />
            </View>
            <View style={largeFont ? undefined : styles.cell}>
              <AppButton label="알림 설정" accessibilityLabel={`${med.name} 알림 설정`} variant="secondary" onPress={onReminder} />
            </View>
          </View>
          {/* 지우는 동작이라 다음 줄 링크로 내려 실수 탭을 줄인다(설계 3-1) */}
          <LinkButton label="목록에서 빼기" accessibilityLabel={`${med.name} 목록에서 빼기`} onPress={onAskDelete} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  column: { flexDirection: 'column' },
  cell: { flex: 1 },
  confirm: { gap: 4, padding: spacing.md, borderRadius: 12, borderWidth: 2, borderColor: colors.border },
});
