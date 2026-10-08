// 날짜·시각 선택 칸: 현재 값이 글자로 보이는 버튼 + 선택기 (설계 4-2, 5-5)
// - Android: 시스템 대화상자(DateTimePickerAndroid.open)가 접근성·글자 크기를 처리한다.
// - iOS: 하단 시트(Modal) 안에 휠(시각)/달력(날짜) + [완료] [취소]. [완료]를 눌러야 값이 바뀐다.
// - 웹 미리보기: 선택기가 없어 글자 입력칸으로 대신한다(개발 확인용).
// 값은 'YYYY-MM-DD' / 'HH:mm' 글자로만 주고받는다(services/datePickerValue.ts).
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dateToHHmm, dateToYmd, hhmmToDate, ymdToDate } from '../services/datePickerValue';
import { colors, spacing, touch } from '../theme';
import { AppButton, AppInput, LinkButton } from './ui';

export interface DateTimeFieldProps {
  mode: 'date' | 'time';
  /** 'YYYY-MM-DD' 또는 'HH:mm'. 비어 있으면 아직 안 고른 상태 */
  value: string;
  onChange: (value: string) => void;
  /** 버튼에 보이는 글자(예: '오전 8:00', '2026년 10월 8일 (목)') */
  displayText: string;
  /** 시트 제목(예: '1번째 시각') */
  sheetTitle: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  /** 선택 범위(date 모드, 'YYYY-MM-DD') */
  minimumDate?: string;
  maximumDate?: string;
  disabled?: boolean;
  testID?: string;
}

export const DateTimeField = forwardRef<View, DateTimeFieldProps>(function DateTimeField(props, ref) {
  const { mode, value, onChange, displayText, sheetTitle, accessibilityLabel, accessibilityHint, minimumDate, maximumDate, disabled, testID } = props;
  const [sheetOpen, setSheetOpen] = useState(false);

  const initialDate = () => (mode === 'date' ? ymdToDate(value || dateToYmd(new Date())) : hhmmToDate(value));
  const toText = (d: Date) => (mode === 'date' ? dateToYmd(d) : dateToHHmm(d));

  function open() {
    Keyboard.dismiss(); // 열려 있던 키보드는 닫는다
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialDate(),
        mode,
        is24Hour: false,
        minimumDate: minimumDate ? ymdToDate(minimumDate) : undefined,
        maximumDate: maximumDate ? ymdToDate(maximumDate) : undefined,
        // 9.x 는 onChange 가 deprecated: 값이 정해지면 onValueChange, 취소는 onDismiss(무시)
        onValueChange: (_event, date: Date) => onChange(toText(date)),
      });
    } else {
      setSheetOpen(true);
    }
  }

  if (Platform.OS === 'web') {
    return (
      <AppInput
        accessibilityLabel={accessibilityLabel}
        value={value}
        placeholder={mode === 'date' ? 'YYYY-MM-DD' : 'HH:mm'}
        editable={!disabled}
        onChangeText={onChange}
      />
    );
  }

  return (
    <>
      <Pressable
        ref={ref}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={open}
        style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
      >
        <Text style={[styles.text, !value && styles.placeholder]}>{displayText}</Text>
        <Text style={styles.text} accessibilityElementsHidden importantForAccessibility="no">
          ▾
        </Text>
      </Pressable>
      {sheetOpen && (
        <PickerSheet
          mode={mode}
          title={sheetTitle}
          initial={initialDate()}
          minimumDate={minimumDate ? ymdToDate(minimumDate) : undefined}
          maximumDate={maximumDate ? ymdToDate(maximumDate) : undefined}
          onCancel={() => setSheetOpen(false)}
          onDone={(d) => {
            setSheetOpen(false);
            onChange(toText(d));
          }}
        />
      )}
    </>
  );
});

/** iOS 선택기 시트. 휠을 돌리는 동안에는 칸의 글자를 바꾸지 않고, [완료]에서만 값을 넘긴다 */
function PickerSheet({
  mode,
  title,
  initial,
  minimumDate,
  maximumDate,
  onCancel,
  onDone,
}: {
  mode: 'date' | 'time';
  title: string;
  initial: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  onCancel: () => void;
  onDone: (d: Date) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const titleRef = useRef<Text>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <Modal transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <Pressable style={styles.backdropTap} onPress={onCancel} accessibilityLabel="닫기" accessibilityRole="button" />
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Text ref={titleRef} accessibilityRole="header" style={[styles.text, styles.sheetTitle]}>
              {title}
            </Text>
            <DateTimePicker
              testID="datetimepicker"
              value={draft}
              mode={mode}
              display={mode === 'time' ? 'spinner' : 'inline'}
              locale="ko-KR"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              accessibilityLabel={title}
              onValueChange={(_e, d: Date) => setDraft(d)}
            />
          </ScrollView>
          <View style={styles.sheetActions}>
            <AppButton label="완료" onPress={() => onDone(draft)} />
            <LinkButton label="취소" onPress={onCancel} center />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: touch.primaryHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dimmed: { opacity: 0.6 },
  text: { fontSize: 18, lineHeight: 27, color: colors.text, flexShrink: 1 },
  placeholder: { color: colors.textSecondary },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43,36,32,0.5)' },
  backdropTap: { flex: 1 },
  sheet: {
    maxHeight: '90%',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
  },
  sheetBody: { gap: spacing.sm },
  sheetTitle: { fontWeight: '700' },
  sheetActions: { gap: spacing.sm },
});
