// 등록·수정 화면이 돌아오며 실어 준 안내 코드(notice)를 한 번만 받고 파라미터는 지운다 (설계 4-6, 5-1)
// - kinds: 이 화면이 받는 종류만. 다른 종류(약 관리의 created 등)는 건드리지 않는다.
// - 코드는 앱을 다시 열면 사라진다(저장하지 않음). 닫기(dismiss)로 카드를 없앤다.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { isPetNoticeKind, type PetNoticeKind } from './routes';

export function usePetNotice(kinds: readonly PetNoticeKind[], announce?: (kind: PetNoticeKind) => string | null) {
  const router = useRouter();
  const { notice: param } = useLocalSearchParams<{ notice?: string }>();
  const [notice, setNotice] = useState<PetNoticeKind | null>(null);

  useEffect(() => {
    if (!isPetNoticeKind(param)) return;
    if (kinds.includes(param)) {
      setNotice(param);
      const text = announce?.(param);
      if (text) AccessibilityInfo.announceForAccessibility?.(text);
    }
    router.setParams({ notice: undefined } as never);
    // kinds·announce 는 화면마다 고정이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param, router]);

  return { notice, dismiss: () => setNotice(null) };
}
