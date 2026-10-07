import { render, screen } from '@testing-library/react-native';
import { act } from '@testing-library/react-native';
import { Keyboard, Platform, Text } from 'react-native';
import { PushContext, type PushContextValue } from '../push/pushContext';
import { nextOpenNonce, todayPushHref } from '../push/pushContext';
import { Screen, screenEdges, shouldHideFooter } from './ui';

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: (p: object) => <View {...p} /> };
});

const ctx = (bannerVisible: boolean): PushContextValue => ({
  state: 'unavailable',
  requestPermission: async () => 'unavailable',
  recheck: async () => 'unavailable',
  bannerVisible,
  subscribe: () => () => {},
});

describe('화면 프레임 안전 영역', () => {
  it('screenEdges: 배너가 있으면 top 을 뺀다', () => {
    expect(screenEdges(['top', 'bottom'], false)).toEqual(['top', 'bottom']);
    expect(screenEdges(['top', 'bottom'], true)).toEqual(['bottom']);
  });

  it.each([[false, ['top', 'bottom']], [true, ['bottom']]])('bannerVisible=%s 이면 edges=%j', async (visible, edges) => {
    await render(
      <PushContext.Provider value={ctx(visible)}>
        <Screen footer={<Text>저장 바</Text>}>
          <Text>내용</Text>
        </Screen>
      </PushContext.Provider>,
    );
    expect(screen.getByTestId('screen-frame').props.edges).toEqual(edges);
    expect(screen.getByText('저장 바')).toBeTruthy();
  });

  it('Provider 밖(로그인 화면)에서는 top 을 유지한다', async () => {
    await render(<Screen><Text>내용</Text></Screen>);
    expect(screen.getByTestId('screen-frame').props.edges).toEqual(['top', 'bottom']);
  });
});

describe('키보드 대응', () => {
  it('screenEdges: 키보드가 올라와 있으면 bottom 을 뺀다(하단 안전 영역 이중 적용 방지)', () => {
    expect(screenEdges(['top', 'bottom'], false, true)).toEqual(['top']);
    expect(screenEdges(['top', 'bottom'], true, true)).toEqual([]);
  });

  it('shouldHideFooter: 키보드가 올라와 있고 글자가 크면 하단 고정 영역을 숨긴다', () => {
    expect(shouldHideFooter(true, 1.0)).toBe(false);
    expect(shouldHideFooter(true, 2.0)).toBe(true);
    expect(shouldHideFooter(false, 2.0)).toBe(false);
  });

  it('키보드 이벤트에 따라 Screen 의 edges 가 바뀐다', async () => {
    const handlers: Record<string, () => void> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, cb: () => void) => {
      handlers[name] = cb;
      return { remove: jest.fn() };
    }) as never);
    await render(<Screen footer={<Text>저장 바</Text>}><Text>내용</Text></Screen>);
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    await act(async () => handlers[show]());
    expect(screen.getByTestId('screen-frame').props.edges).toEqual(['top']);
    await act(async () => handlers[hide]());
    expect(screen.getByTestId('screen-frame').props.edges).toEqual(['top', 'bottom']);
    jest.restoreAllMocks();
  });
});

describe('알림 이동 주소', () => {
  it('todayPushHref: med 가 있으면 n(nonce)을 함께 싣고, 열 때마다 nonce 가 다르다', () => {
    expect(todayPushHref('m1')).toBe('/?source=push&med=m1');
    expect(todayPushHref('m1', 'abc')).toBe('/?source=push&med=m1&n=abc');
    expect(todayPushHref(undefined, 'abc')).toBe('/?source=push');
    expect(nextOpenNonce()).not.toBe(nextOpenNonce());
  });
});
