import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform } from 'react-native';
import { DateTimePickerAndroid } from '../testing/mockDateTimePicker';
import { DateTimeField } from './DateTimeField';

jest.mock('@react-native-community/datetimepicker', () => require('../testing/mockDateTimePicker'));

function field(onChange: (v: string) => void, props: Partial<React.ComponentProps<typeof DateTimeField>> = {}) {
  return (
    <DateTimeField
      mode="time"
      value="08:00"
      onChange={onChange}
      displayText="오전 8:00"
      sheetTitle="1번째 시각"
      accessibilityLabel="1번째 시각, 오전 8시"
      accessibilityHint="누르면 시각을 고를 수 있어요"
      {...props}
    />
  );
}

describe('DateTimeField — Android(시스템 대화상자)', () => {
  const original = Platform.OS;
  beforeEach(() => {
    Platform.OS = 'android';
    DateTimePickerAndroid.open.mockClear();
  });
  afterEach(() => {
    Platform.OS = original;
  });

  it('누르면 시스템 대화상자를 열고, 고른 시각을 HH:mm 글자로 돌려준다(UTC 로 밀리지 않음)', async () => {
    const onChange = jest.fn();
    await render(field(onChange));
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    expect(DateTimePickerAndroid.open).toHaveBeenCalledTimes(1);
    const opts = DateTimePickerAndroid.open.mock.calls[0][0];
    expect(opts.mode).toBe('time');
    expect(opts.value.getHours()).toBe(8);
    opts.onValueChange({ type: 'set' }, new Date(2026, 9, 8, 0, 5));
    expect(onChange).toHaveBeenCalledWith('00:05');
  });

  it('onValueChange 로 고른 값이 칸의 글자에 실제로 반영된다(value 를 들고 있는 부모와 함께)', async () => {
    function Host() {
      const [v, setV] = useState('08:00');
      return field(setV, { value: v, displayText: `시각 ${v}` });
    }
    await render(<Host />);
    expect(screen.getByText('시각 08:00')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    await act(async () => {
      DateTimePickerAndroid.open.mock.calls[0][0].onValueChange({ type: 'set' }, new Date(2026, 9, 8, 21, 30));
    });
    expect(screen.getByText('시각 21:30')).toBeTruthy();
    expect(screen.queryByText('시각 08:00')).toBeNull();
  });

  it('취소하면 값을 바꾸지 않는다(onValueChange 가 불리지 않는다)', async () => {
    const onChange = jest.fn();
    await render(field(onChange));
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    expect(DateTimePickerAndroid.open.mock.calls[0][0].onChange).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('날짜 모드: 범위(minimumDate·maximumDate)를 넘기고 YYYY-MM-DD 로 돌려준다', async () => {
    const onChange = jest.fn();
    await render(
      field(onChange, {
        mode: 'date',
        value: '2026-10-08',
        displayText: '2026년 10월 8일 (목)',
        accessibilityLabel: '시작하는 날, 2026년 10월 8일 목요일',
        minimumDate: '2026-10-01',
        maximumDate: '2027-10-08',
      }),
    );
    await fireEvent.press(screen.getByRole('button', { name: /^시작하는 날/ }));
    const opts = DateTimePickerAndroid.open.mock.calls[0][0];
    expect(opts.minimumDate.getDate()).toBe(1);
    expect(opts.maximumDate.getFullYear()).toBe(2027);
    opts.onValueChange({ type: 'set' }, new Date(2026, 11, 31, 23, 59));
    expect(onChange).toHaveBeenCalledWith('2026-12-31');
  });

  it('disabled 면 열리지 않는다', async () => {
    await render(field(jest.fn(), { disabled: true }));
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    expect(DateTimePickerAndroid.open).not.toHaveBeenCalled();
  });
});

describe('DateTimeField — iOS(하단 시트)', () => {
  it('시트에서 [완료]를 눌러야 값이 바뀌고, 휠을 돌리는 동안에는 바뀌지 않는다', async () => {
    const onChange = jest.fn();
    await render(field(onChange));
    await fireEvent.press(screen.getByRole('button', { name: '1번째 시각, 오전 8시' }));
    await fireEvent(screen.getByTestId('datetimepicker'), 'valueChange', { type: 'set' }, new Date(2026, 9, 8, 7, 5));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('datetimepicker').props.display).toBe('spinner');
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    expect(onChange).toHaveBeenCalledWith('07:05');
    expect(screen.queryByTestId('datetimepicker')).toBeNull();
  });

  it('날짜는 달력형(inline)으로 연다', async () => {
    await render(field(jest.fn(), { mode: 'date', value: '2026-10-08', accessibilityLabel: '시작하는 날' }));
    await fireEvent.press(screen.getByRole('button', { name: '시작하는 날' }));
    expect(screen.getByTestId('datetimepicker').props.display).toBe('inline');
  });
});
