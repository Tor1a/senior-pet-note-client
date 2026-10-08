// 약 폼의 시각 한 줄: "N번째 시각" + 시각 선택 버튼 + (2개 이상이면) 이 시각 빼기 (설계 4-3)
import { forwardRef } from 'react';
import { View } from 'react-native';
import { DateTimeField } from '../../components/DateTimeField';
import { AppText, Card, LinkButton } from '../../components/ui';
import { formatTime } from '../../lib/format';
import { spokenTime } from '../../services/datePickerValue';

export const TimeRow = forwardRef<
  View,
  {
    index: number;
    value: string;
    removable: boolean;
    onChange: (hhmm: string) => void;
    onRemove: () => void;
  }
>(function TimeRow({ index, value, removable, onChange, onRemove }, ref) {
  const n = index + 1;
  return (
    <Card>
      <AppText variant="secondary">{`${n}번째 시각`}</AppText>
      <DateTimeField
        ref={ref}
        mode="time"
        value={value}
        onChange={onChange}
        displayText={value ? formatTime(value) : '시각 고르기'}
        sheetTitle={`${n}번째 시각`}
        accessibilityLabel={`${n}번째 시각, ${value ? spokenTime(value) : '아직 고르지 않았어요'}`}
        accessibilityHint="누르면 시각을 고를 수 있어요"
        testID={`time-${index}`}
      />
      {removable ? <LinkButton label="이 시각 빼기" accessibilityLabel={`${n}번째 시각 빼기`} onPress={onRemove} /> : null}
    </Card>
  );
});
