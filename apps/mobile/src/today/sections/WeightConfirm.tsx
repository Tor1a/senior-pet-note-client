// 체중 숫자 확인 카드 (설계 7장): 지난 기록과 지금 입력을 숫자만 나란히 보여 주고 맞는지 묻는다.
// 판단·증감·퍼센트 표현 없음. [다시 입력]이 주 버튼, [그대로 저장]은 한 번에 통과.
import { StyleSheet, View, type View as ViewType } from 'react-native';
import { ConfirmCard } from '../../components/ConfirmCard';
import { AppText } from '../../components/ui';
import type { WeightCheck } from '../../lib/undoLogic';
import { UNDO_TEXT, weightCardSpeech, weightEnteredText, weightLastText } from '../../lib/undoText';
import { spacing } from '../../theme';

export function WeightConfirm({
  check,
  ago,
  disabled,
  onRetype,
  onKeep,
  onShown,
}: {
  check: WeightCheck;
  ago: string;
  disabled: boolean;
  onRetype: () => void;
  onKeep: () => void;
  onShown: (node: ViewType) => void;
}) {
  return (
    <ConfirmCard
      title={UNDO_TEXT.weightTitle}
      speech={weightCardSpeech(check.last, check.entered)}
      primaryLabel={UNDO_TEXT.weightRetype}
      onPrimary={onRetype}
      secondaryLabel={UNDO_TEXT.weightKeep}
      onSecondary={onKeep}
      disabled={disabled}
      onShown={onShown}
    >
      <View style={styles.facts}>
        <View style={styles.fact}>
          <AppText variant="secondary">{UNDO_TEXT.weightLastLabel}</AppText>
          <AppText style={styles.bold}>{weightLastText(check.last, ago)}</AppText>
        </View>
        <View style={styles.fact}>
          <AppText variant="secondary">{UNDO_TEXT.weightEnteredLabel}</AppText>
          <AppText style={styles.bold}>{weightEnteredText(check.entered)}</AppText>
        </View>
      </View>
      <AppText>{UNDO_TEXT.weightBody1}</AppText>
      <AppText>{UNDO_TEXT.weightBody2}</AppText>
    </ConfirmCard>
  );
}

const styles = StyleSheet.create({
  // 글자가 커져도 값이 줄 아래로 내려가도록 라벨과 값을 묶어 세로로 쌓을 수 있게 둔다(flexWrap)
  facts: { gap: spacing.sm },
  fact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.md },
  bold: { fontWeight: '700' },
});
