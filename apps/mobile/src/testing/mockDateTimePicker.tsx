// 컴포넌트 테스트용 @react-native-community/datetimepicker 대체. 네이티브 선택기 대신 속성을 그대로 가진 View 를 그린다.
// 테스트에서 pickDate()/pickTime() 으로 값을 고른 것처럼 onChange 를 부른다.
import { View } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';

export default function MockDateTimePicker(props: Record<string, unknown>) {
  return <View {...props} testID="datetimepicker" />;
}

export const DateTimePickerAndroid = { open: jest.fn(), dismiss: jest.fn() };

/** iOS 시트가 열린 상태에서 선택기에 Date 를 고르게 하고 [완료]를 누른다 */
export async function pickInSheet(date: Date) {
  await fireEvent(screen.getByTestId('datetimepicker'), 'valueChange', { type: 'set' }, date);
  await fireEvent.press(screen.getByRole('button', { name: '완료' }));
}
