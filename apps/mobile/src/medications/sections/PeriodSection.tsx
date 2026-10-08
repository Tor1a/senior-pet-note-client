// "기간": 시작하는 날 + 끝나는 날(정하지 않음 / 날짜 정하기) (설계 5-5)
// 날짜 버튼에는 현재 값이 글자로 보이고, 선택은 OS 선택기가 맡는다. 시작일 상한은 오늘+365일, 종료일 하한은 시작일.
import { View, StyleSheet } from 'react-native';
import { DateTimeField } from '../../components/DateTimeField';
import { AppText } from '../../components/ui';
import { addDays } from '../../lib/format';
import { START_DATE_MAX_DAYS, type ReminderForm, type ReminderProblem } from '../../lib/reminderForm';
import { formatFullDate, spokenDate } from '../../services/datePickerValue';
import { spacing } from '../../theme';
import { RadioRows } from './RepeatSection';

export function PeriodSection({
  form,
  problem,
  disabled,
  today,
  onChange,
  registerField,
}: {
  form: ReminderForm;
  problem: ReminderProblem | null;
  disabled: boolean;
  /** 서버 기준(서울) 오늘 날짜. 시작일 상한 계산에만 쓴다 */
  today: string;
  onChange: (patch: Partial<ReminderForm>) => void;
  registerField: (field: 'startDate' | 'endDate', node: View | null) => void;
}) {
  return (
    <View style={styles.section}>
      <AppText variant="title" accessibilityRole="header" style={styles.h2}>
        기간
      </AppText>

      <AppText style={styles.bold}>시작하는 날</AppText>
      {form.repeat === 'interval' ? <AppText variant="secondary">이 날이 첫 알림 날이에요.</AppText> : null}
      <View ref={(n) => registerField('startDate', n)} collapsable={false}>
        <DateTimeField
          mode="date"
          value={form.startDate}
          onChange={(startDate) => onChange({ startDate })}
          displayText={form.startDate ? formatFullDate(form.startDate) : '날짜 고르기'}
          sheetTitle="시작하는 날"
          accessibilityLabel={`시작하는 날, ${form.startDate ? spokenDate(form.startDate) : '아직 고르지 않았어요'}`}
          accessibilityHint="누르면 날짜를 고를 수 있어요"
          maximumDate={addDays(today, START_DATE_MAX_DAYS)}
          disabled={disabled}
          testID="start-date"
        />
      </View>
      {problem?.field === 'startDate' ? <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${problem.message}`}</AppText> : null}

      <AppText style={styles.bold}>끝나는 날</AppText>
      <RadioRows
        label="끝나는 날"
        value={form.hasEndDate ? 'set' : 'none'}
        options={[
          { value: 'none', label: '정하지 않음(계속 알림)' },
          { value: 'set', label: '날짜 정하기' },
        ]}
        disabled={disabled}
        // 처음 날짜를 정할 때는 시작일로 채워 두고 고르게 한다
        onChange={(v) => onChange(v === 'set' ? { hasEndDate: true, endDate: form.endDate || form.startDate } : { hasEndDate: false })}
      />
      {form.hasEndDate ? (
        <View ref={(n) => registerField('endDate', n)} collapsable={false} style={styles.section}>
          <DateTimeField
            mode="date"
            value={form.endDate}
            onChange={(endDate) => onChange({ endDate })}
            displayText={form.endDate ? formatFullDate(form.endDate) : '날짜 고르기'}
            sheetTitle="끝나는 날"
            accessibilityLabel={`끝나는 날, ${form.endDate ? spokenDate(form.endDate) : '아직 고르지 않았어요'}`}
            accessibilityHint="누르면 날짜를 고를 수 있어요"
            minimumDate={form.startDate || undefined}
            disabled={disabled}
            testID="end-date"
          />
          <AppText variant="secondary">이 날까지 알려 드려요.</AppText>
        </View>
      ) : null}
      {problem?.field === 'endDate' ? <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${problem.message}`}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  h2: { fontSize: 20 },
  bold: { fontWeight: '700' },
});
