// 메모(선택): 200자, 글자 수 표시, 포커스하면 3줄로 확장
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppInput, AppText } from '../../components/ui';
import { MEMO_MAX_LENGTH } from '../../lib/constants';
import { spacing } from '../../theme';

export function MemoSection({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <AppText variant="title" accessibilityRole="header" style={styles.h2}>
        메모 (선택)
      </AppText>
      <AppInput
        accessibilityLabel="메모 (선택)"
        multiline
        maxLength={MEMO_MAX_LENGTH}
        placeholder="오늘 있었던 일을 짧게 남겨 두세요"
        value={value}
        onFocus={() => setOpen(true)}
        onChangeText={onChange}
        style={[styles.memo, (open || value) && styles.memoOpen]}
      />
      <AppText variant="secondary" style={styles.count}>{`${value.length} / ${MEMO_MAX_LENGTH}`}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  h2: { fontSize: 20 },
  memo: { minHeight: 56, textAlignVertical: 'top', paddingTop: 10 },
  memoOpen: { minHeight: 120 },
  count: { textAlign: 'right' },
});
