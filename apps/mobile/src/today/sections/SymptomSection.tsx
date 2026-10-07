// 증상: 태그 6개(다중 선택, 기타 선택 시 입력칸) + "특이사항 없음"(상호 배타)
import { StyleSheet, View } from 'react-native';
import { AppInput, AppText, ChoiceButton } from '../../components/ui';
import {
  SYMPTOM_CODES,
  SYMPTOM_LABELS,
  SYMPTOM_NONE_LABEL,
  SYMPTOM_OTHER_MAX_LENGTH,
  type SymptomCode,
  type SymptomState,
} from '../../lib/symptoms';
import { spacing } from '../../theme';

export function SymptomSection({
  symptoms,
  onToggle,
  onToggleNone,
  onChangeOther,
}: {
  symptoms: SymptomState;
  onToggle: (code: SymptomCode) => void;
  onToggleNone: () => void;
  onChangeOther: (text: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <AppText variant="title" accessibilityRole="header" style={styles.h2}>
        {'오늘 보인 증상 '}
        <AppText variant="secondary">(여러 개 선택 가능)</AppText>
      </AppText>
      <View style={styles.tags}>
        {SYMPTOM_CODES.map((code) => {
          const on = symptoms.codes.includes(code);
          return (
            <ChoiceButton
              key={code}
              role="tag"
              label={SYMPTOM_LABELS[code]}
              prefix={code === 'other' ? '+ ' : ''}
              selected={on}
              onPress={() => onToggle(code)}
            />
          );
        })}
      </View>
      {symptoms.codes.includes('other') && (
        <AppInput
          accessibilityLabel="기타 증상 내용"
          maxLength={SYMPTOM_OTHER_MAX_LENGTH}
          placeholder={`기타 내용 (${SYMPTOM_OTHER_MAX_LENGTH}자까지)`}
          value={symptoms.other}
          onChangeText={onChangeOther}
        />
      )}
      <ChoiceButton role="tag" label={SYMPTOM_NONE_LABEL} selected={symptoms.none} onPress={onToggleNone} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  h2: { fontSize: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
