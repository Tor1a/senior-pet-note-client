// 푸시 상태 Context 와 훅 (PushProvider 와 화면 프레임이 함께 쓴다)
// - ui.tsx(Screen)가 bannerVisible 을 읽어야 해서 Provider 와 분리했다(Provider 는 ui.tsx 를 쓰므로 한 파일에 두면 순환 참조).
import { createContext, useContext, useEffect, useRef } from 'react';
import type { MedReminderData } from '../lib/reminderApi';

export type PushDeviceState = 'checking' | 'unavailable' | 'default' | 'denied' | 'registering' | 'registered' | 'error';

/**
 * 이 기기가 알림을 받을 수 없는 상태인지(약 목록 상태 줄 2줄째, 저장 후 안내 문구에 쓴다).
 * 웹 PushProvider 의 같은 이름 함수와 같은 정의지만 상태 집합이 달라 사본이 아니라 플랫폼 코드다.
 */
export function cannotReceive(state: PushDeviceState): boolean {
  return state !== 'registered' && state !== 'registering' && state !== 'checking';
}

/** 포그라운드에서 받은 투약 알림 (웹 PushBannerMessage 와 같은 모양) */
export interface PushBannerMessage extends MedReminderData {
  key: string;
  title: string;
  body: string;
}

export interface PushContextValue {
  state: PushDeviceState;
  /** 권한 요청 → 허용되면 기기 등록. 버튼을 누른 뒤에만 부른다 */
  requestPermission: () => Promise<PushDeviceState>;
  recheck: () => Promise<PushDeviceState>;
  /** 상단 알림 배너가 떠 있는지. 화면 프레임이 상단 안전 영역을 중복으로 잡지 않게 한다 */
  bannerVisible: boolean;
  /** 포그라운드 투약 알림 구독(오늘 화면 재동기용). 해제 함수를 돌려준다 */
  subscribe: (listener: (msg: PushBannerMessage) => void) => () => void;
}

/** Provider 밖(로그인·회원가입 화면, 화면 단독 테스트)에서 쓰는 값: 알림 사용 불가 */
const FALLBACK: PushContextValue = {
  state: 'unavailable',
  requestPermission: async () => 'unavailable',
  recheck: async () => 'unavailable',
  bannerVisible: false,
  subscribe: () => () => {},
};

export const PushContext = createContext<PushContextValue | null>(null);

export function usePush(): PushContextValue {
  return useContext(PushContext) ?? FALLBACK;
}

/** 포그라운드 투약 알림을 받을 때마다 부른다(최신 콜백 유지) */
export function usePushMessages(listener: (msg: PushBannerMessage) => void): void {
  const { subscribe } = usePush();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((m) => ref.current(m)), [subscribe]);
}

/** 알림 탭 시 갈 곳(웹 /today?source=push 와 같은 지표 source) */
export const TODAY_PUSH_HREF = '/?source=push';

let openSeq = 0;
/** 알림이 열릴 때마다 바뀌는 값. 같은 약의 알림을 다시 탭해도 파라미터가 달라져 강조·2분 타이머가 다시 켜진다 */
export const nextOpenNonce = () => `${Date.now().toString(36)}${(openSeq++).toString(36)}`;

/**
 * 알림 탭·배너 버튼으로 갈 곳. 해당 약을 강조할 수 있도록 medicationId 를 싣고,
 * nonce(n)로 같은 약을 다시 열어도 화면이 새 알림으로 알아보게 한다.
 */
export const todayPushHref = (medicationId?: string, nonce?: string) =>
  medicationId
    ? `${TODAY_PUSH_HREF}&med=${encodeURIComponent(medicationId)}${nonce ? `&n=${encodeURIComponent(nonce)}` : ''}`
    : TODAY_PUSH_HREF;
