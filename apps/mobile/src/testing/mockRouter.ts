// 컴포넌트 테스트용 expo-router 대체(화면 테스트에서 jest.mock('expo-router', () => require('../testing/mockRouter').factory()) 로 쓴다)
// - 라우터 함수는 mockRouter 로 확인한다.
// - useFocusEffect 는 처음 보일 때 한 번 실행한다(재포커스는 refocus() 로 흉내).
// - useNavigation 의 beforeRemove 리스너는 systemBack() 으로 호출해 시스템 뒤로가기를 흉내 낸다.
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
};

export const mockNavigation = {
  dispatch: jest.fn(),
  /** beforeRemove 리스너 */
  listener: null as null | ((e: { preventDefault: () => void; data: { action: unknown } }) => void),
  /** focus 리스너 */
  focusListener: null as null | (() => void),
};

/** 화면이 다시 보이게 된 것을 흉내 낸다(다른 화면을 닫고 돌아옴) */
export function focusScreen() {
  mockNavigation.focusListener?.();
}

/**
 * 실제 expo-router 처럼 이동 함수를 "큐에 쌓았다가 나중에" 실행하게 한다(routingQueue).
 * 나중에 beforeRemove 가 불려 막히면 blocked 에 기록한다. 가드는 가짜가 아니라 진짜 useLeaveGuard 가 판단한다.
 */
export const queued = { blocked: [] as string[] };
export function queueRouterActions() {
  queued.blocked = [];
  for (const name of ['dismissTo', 'dismissAll', 'back', 'replace', 'push'] as const) {
    mockRouter[name].mockImplementation((() => {
      setTimeout(() => {
        if (systemBack({ type: name })) queued.blocked.push(name);
      }, 0);
    }) as never);
  }
}

export const state = { params: {} as Record<string, string>, focusCb: null as null | (() => void) };

export function resetRouterMocks() {
  Object.values(mockRouter).forEach((f) => f.mockReset());
  queued.blocked = [];
  mockNavigation.focusListener = null;
  mockRouter.canGoBack.mockReturnValue(true);
  mockNavigation.dispatch.mockClear();
  mockNavigation.listener = null;
  state.params = {};
  state.focusCb = null;
}

/** 시스템 뒤로가기(beforeRemove)를 흉내 낸다. 막혔으면 true */
export function systemBack(action: unknown = { type: 'GO_BACK' }): boolean {
  const e = { preventDefault: jest.fn(), data: { action } };
  mockNavigation.listener?.(e);
  return e.preventDefault.mock.calls.length > 0;
}

export function factory() {
  const React = require('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => state.params,
    usePathname: () => '/medications',
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        state.focusCb = cb;
        return cb();
      }, [cb]);
    },
    useNavigation: () => ({
      addListener: (event: string, cb: never) => {
        const key = event === 'focus' ? 'focusListener' : 'listener';
        (mockNavigation as Record<string, unknown>)[key] = cb;
        return () => {
          (mockNavigation as Record<string, unknown>)[key] = null;
        };
      },
      dispatch: mockNavigation.dispatch,
    }),
  };
}
