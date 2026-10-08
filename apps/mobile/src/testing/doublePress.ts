// 같은 프레임 연타 흉내: 한 번의 act 안에서 Pressable 의 onClick(→onPress)을 연달아 부른다(그 사이에 state 가 반영되지 않는다)
import { act, type screen } from '@testing-library/react-native';

type Instance = ReturnType<typeof screen.getByRole>;

export async function pressTwiceInOneFrame(button: Instance) {
  const click = button.props.onClick as (e: unknown) => void;
  const event = { nativeEvent: {}, stopPropagation: () => {}, preventDefault: () => {} };
  await act(async () => {
    click(event);
    click(event);
  });
}
