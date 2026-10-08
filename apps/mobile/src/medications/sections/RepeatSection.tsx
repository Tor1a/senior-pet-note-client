// "얼마나 자주": 반복 라디오 3행 + (정한 요일만) 요일 격자 + (며칠마다) 간격 스테퍼 (설계 5-3, 5-4)
// 큰 글씨에서는 요일 열 수를 4 → 3 → 2 로 줄이고 스테퍼를 세로로 쌓는다. 터치 칸은 줄이지 않는다.
import { StyleSheet, View } from 'react-native';
import { AppButton, AppText, ChoiceButton } from '../../components/ui';
import { DAYS_OF_WEEK, INTERVAL_DAYS_MAX, INTERVAL_DAYS_MIN, type DayOfWeek, type RepeatType } from '../../lib/reminderApi';
import {
  DAY_LABELS,
  DAY_NAMES,
  intervalHint,
  REPEAT_LABELS,
  stepInterval,
  toggleDay,
  type ReminderForm,
  type ReminderProblem,
} from '../../lib/reminderForm';
import { spacing } from '../../theme';
import { dayGridColumns, isLargeFont } from '../layout';

const REPEATS: RepeatType[] = ['daily', 'weekly', 'interval'];

/** 라디오 세로 그룹(높이 56, 간격 8). 컨테이너 role radiogroup */
export function RadioRows<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.rows}>
      {options.map((o, i) => (
        <ChoiceButton
          key={o.value}
          role="radio"
          tall
          label={o.label}
          accessibilityLabel={`${o.label}, ${i + 1}번째, 전체 ${options.length}개`}
          selected={o.value === value}
          disabled={disabled}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

export function RepeatSection({
  form,
  problem,
  disabled,
  fontScale,
  onChange,
  registerField,
}: {
  form: ReminderForm;
  problem: ReminderProblem | null;
  disabled: boolean;
  fontScale: number;
  onChange: (patch: Partial<ReminderForm>) => void;
  /** 검증 실패 시 접근성 포커스·스크롤을 보낼 칸 */
  registerField: (field: 'daysOfWeek' | 'intervalDays', node: View | null) => void;
}) {
  const cols = dayGridColumns(fontScale);
  const rows: DayOfWeek[][] = [];
  for (let i = 0; i < DAYS_OF_WEEK.length; i += cols) rows.push(DAYS_OF_WEEK.slice(i, i + cols));
  const large = isLargeFont(fontScale);

  return (
    <View style={styles.section}>
      <AppText variant="title" accessibilityRole="header" style={styles.h2}>
        얼마나 자주
      </AppText>
      <RadioRows
        label="얼마나 자주"
        value={form.repeat}
        options={REPEATS.map((r) => ({ value: r, label: REPEAT_LABELS[r] }))}
        disabled={disabled}
        onChange={(repeat) => onChange({ repeat })}
      />

      {form.repeat === 'weekly' ? (
        <View ref={(n) => registerField('daysOfWeek', n)} collapsable={false} accessibilityLabel="알림 받을 요일" style={styles.section}>
          <View style={styles.rows}>
            {rows.map((row) => (
              <View key={row[0]} style={styles.dayRow}>
                {row.map((d) => (
                  <ChoiceButton
                    key={d}
                    role="checkbox"
                    tall
                    grow
                    label={DAY_LABELS[d]}
                    accessibilityLabel={DAY_NAMES[d]}
                    selected={form.daysOfWeek.includes(d)}
                    disabled={disabled}
                    onPress={() => onChange({ daysOfWeek: toggleDay(form.daysOfWeek, d) })}
                  />
                ))}
                {row.length < cols ? Array.from({ length: cols - row.length }, (_, k) => <View key={`pad${k}`} style={styles.pad} />) : null}
              </View>
            ))}
          </View>
          {problem?.field === 'daysOfWeek' ? (
            <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${problem.message}`}</AppText>
          ) : null}
        </View>
      ) : null}

      {form.repeat === 'interval' ? (
        <View ref={(n) => registerField('intervalDays', n)} collapsable={false} style={styles.section}>
          <View style={[styles.stepper, large && styles.stepperLarge]}>
            {large ? <IntervalValue n={form.intervalDays} /> : null}
            <View style={large ? styles.stepperButtons : styles.stepperInline}>
              <View style={styles.stepBtn}>
                <AppButton
                  label="−"
                  variant="secondary"
                  accessibilityLabel="하루 줄이기"
                  disabled={disabled || form.intervalDays <= INTERVAL_DAYS_MIN}
                  onPress={() => onChange({ intervalDays: stepInterval(form.intervalDays, -1) })}
                />
              </View>
              {large ? null : <IntervalValue n={form.intervalDays} />}
              <View style={styles.stepBtn}>
                <AppButton
                  label="+"
                  variant="secondary"
                  accessibilityLabel="하루 늘리기"
                  disabled={disabled || form.intervalDays >= INTERVAL_DAYS_MAX}
                  onPress={() => onChange({ intervalDays: stepInterval(form.intervalDays, 1) })}
                />
              </View>
            </View>
          </View>
          <AppText variant="secondary">{intervalHint(form.intervalDays)}</AppText>
          {problem?.field === 'intervalDays' ? (
            <AppText variant="secondary" accessibilityLiveRegion="polite">{`! ${problem.message}`}</AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function IntervalValue({ n }: { n: number }) {
  return (
    <AppText accessibilityLiveRegion="polite" style={styles.interval}>
      {`${n}일마다`}
    </AppText>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  h2: { fontSize: 20 },
  rows: { gap: spacing.sm },
  dayRow: { flexDirection: 'row', gap: spacing.sm },
  pad: { flexGrow: 1, flexBasis: 0 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stepperLarge: { flexDirection: 'column', gap: spacing.sm },
  stepperInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepperButtons: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  stepBtn: { minWidth: 72, flexGrow: 1 },
  interval: { fontWeight: '700', textAlign: 'center', minWidth: 96 },
});
