// 저장 안 한 변경이 있을 때 화면을 떠나기 전에 확인한다 (기획 8-3, A15)
// - 시스템 뒤로가기·iOS 스와이프 뒤로: 내비게이션의 beforeRemove 를 가로채 막고, 확인 카드를 띄운다.
// - 화면 안 버튼(← 약 목록으로, 먹이는 시각 바꾸기 ›): guard(go) 로 같은 확인을 거친다.
// - [나가기]를 누르면 막았던 동작을 그대로 이어서 실행한다(가로채기를 끈다).
// - 주의: expo-router 의 router.back/push/dismissTo 는 즉시 실행되지 않고 큐에 쌓였다가 다음 렌더 뒤에 실행된다(routingQueue).
//   그래서 "함수 호출하는 동안만" 끄면 beforeRemove 가 꺼진 뒤에 도착해 확인 카드가 뜬다. 가로채기는 이 화면이 다시
//   보이거나(focus: 다른 화면을 위에 쌓았다가 돌아옴) 사라질 때까지 꺼 둔다.
import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useLeaveGuard(dirty: boolean) {
  const navigation = useNavigation();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypass = useRef(false);
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  /** 가로채기를 끄고 fn 을 실행한다(로그아웃·약 사라짐 같은 화면이 스스로 떠나는 경우, [나가기]). focus 때 다시 켠다 */
  const withoutGuard = useCallback((fn: () => void) => {
    bypass.current = true;
    fn();
  }, []);

  useEffect(() => {
    const off = navigation.addListener('focus' as never, (() => {
      bypass.current = false;
    }) as never);
    return off as unknown as () => void;
  }, [navigation]);

  useEffect(() => {
    const off = navigation.addListener('beforeRemove' as never, ((e: {
      preventDefault: () => void;
      data: { action: unknown };
    }) => {
      if (bypass.current || !dirtyRef.current) return;
      e.preventDefault();
      const action = e.data.action;
      setPending({ run: () => withoutGuard(() => navigation.dispatch(action as never)) });
    }) as never);
    return off as unknown as () => void;
  }, [navigation, withoutGuard]);

  /** 화면 안 버튼으로 떠날 때: 고친 내용이 있으면 확인 카드, 없으면 바로 간다 */
  const guard = useCallback(
    (go: () => void) => {
      if (dirtyRef.current) setPending({ run: () => withoutGuard(go) });
      else go();
    },
    [withoutGuard],
  );

  const confirmLeave = useCallback(() => {
    const p = pending;
    setPending(null);
    p?.run();
  }, [pending]);

  const stay = useCallback(() => setPending(null), []);

  return { leaving: pending !== null, confirmLeave, stay, guard, withoutGuard };
}
