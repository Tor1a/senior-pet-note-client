// 이 기기의 알림 상태, 포그라운드 배너, 알림 탭 이동 (기획서 C2~C9)
// - 로그인한 화면(signedIn)에서만 마운트된다. 권한이 이미 허용돼 있으면 시작할 때 조용히 토큰을 등록한다.
// - 권한을 아직 안 물었으면 묻지 않는다. 화면의 [알림 받기] 버튼(requestPermission)에서만 묻는다.
// - Expo Go·웹 미리보기·설정 파일 없는 빌드에서는 state 가 'unavailable' 이고 아무 일도 하지 않는다.
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton, AppText } from '../components/ui';
import { parseMedReminderData } from '../lib/reminderApi';
import { push } from '../services/push';
import type { PushMessage } from '../services/pushTypes';
import { RegistrationSupersededError } from '../lib/pushDevice';
import { registerMobileDevice } from '../services/pushDevice';
import { colors, spacing } from '../theme';

export type PushDeviceState = 'checking' | 'unavailable' | 'default' | 'denied' | 'registering' | 'registered' | 'error';

interface PushContextValue {
  state: PushDeviceState;
  /** 권한 요청 → 허용되면 기기 등록. 버튼을 누른 뒤에만 부른다 */
  requestPermission: () => Promise<PushDeviceState>;
  recheck: () => Promise<PushDeviceState>;
}

const PushContext = createContext<PushContextValue | null>(null);

export function usePush(): PushContextValue {
  return (
    useContext(PushContext) ?? {
      state: 'unavailable',
      requestPermission: async () => 'unavailable',
      recheck: async () => 'unavailable',
    }
  );
}

/** 알림 탭 시 갈 곳(웹 /today?source=push 와 같은 지표 source) */
export const TODAY_PUSH_HREF = '/?source=push';

/** 알림 탭·배너 버튼으로 갈 곳. 해당 약을 강조할 수 있도록 medicationId 를 싣는다 */
export const todayPushHref = (medicationId?: string) =>
  medicationId ? `${TODAY_PUSH_HREF}&med=${encodeURIComponent(medicationId)}` : TODAY_PUSH_HREF;

export function PushProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<PushDeviceState>(push.available ? 'checking' : 'unavailable');
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<{ title: string; body: string; medicationId: string } | null>(null);
  // 등록·권한 확인이 겹쳐 불려도(시작 recheck·onTokenRefresh·버튼) 한 번만 돈다
  const registerInflight = useRef<Promise<PushDeviceState> | null>(null);
  const recheckInflight = useRef<Promise<PushDeviceState> | null>(null);
  const stateRef = useRef<PushDeviceState>(state);
  stateRef.current = state;

  const register = useCallback((): Promise<PushDeviceState> => {
    if (registerInflight.current) return registerInflight.current;
    setState('registering');
    const p = (async (): Promise<PushDeviceState> => {
      try {
        await registerMobileDevice();
        setState('registered');
        return 'registered';
      } catch (err) {
        // 등록 도중 로그아웃됨: 결과를 버리고 상태를 건드리지 않는다
        if (err instanceof RegistrationSupersededError) return stateRef.current;
        setState('error'); // 화면을 막지 않는다. 다음 시작 때 다시 등록한다
        return 'error';
      } finally {
        registerInflight.current = null;
      }
    })();
    registerInflight.current = p;
    return p;
  }, []);

  const recheck = useCallback((): Promise<PushDeviceState> => {
    if (!push.available) return Promise.resolve('unavailable');
    if (recheckInflight.current) return recheckInflight.current;
    const p = (async (): Promise<PushDeviceState> => {
      try {
        const permission = await push.getPermission();
        if (permission === 'granted') return await register();
        const next = permission === 'denied' ? 'denied' : 'default';
        setState(next);
        return next;
      } finally {
        recheckInflight.current = null;
      }
    })();
    recheckInflight.current = p;
    return p;
  }, [register]);

  const requestPermission = useCallback(async (): Promise<PushDeviceState> => {
    if (!push.available) return 'unavailable';
    const result = await push.requestPermission();
    if (result === 'granted') return register();
    const next = result === 'denied' ? 'denied' : 'default';
    setState(next);
    return next;
  }, [register]);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  // 토큰 갱신 → 다시 PUT, 포그라운드 알림 → 배너, 알림 탭 → 오늘 화면
  useEffect(() => {
    if (!push.available) return;
    const openToday = (msg: PushMessage) => {
      const data = parseMedReminderData(msg.data);
      if (data) router.replace(todayPushHref(data.medicationId) as never);
    };
    const offs = [
      push.onTokenRefresh(() => void recheck()),
      push.onForeground((msg) => {
        const data = parseMedReminderData(msg.data);
        if (!data) return; // 알 수 없는 알림은 무시
        setBanner({ title: msg.title ?? '투약 시간이에요', body: msg.body ?? '', medicationId: data.medicationId });
      }),
      push.onOpened(openToday),
    ];
    void push.getInitial().then((msg) => msg && openToday(msg));
    return () => offs.forEach((off) => off());
  }, [recheck, router]);

  const value = useMemo(() => ({ state, requestPermission, recheck }), [state, requestPermission, recheck]);

  return (
    <PushContext.Provider value={value}>
      {banner && (
        <View style={[styles.banner, { paddingTop: spacing.md + insets.top }]} accessibilityRole="alert">
          <AppText style={styles.bold}>{banner.title}</AppText>
          {banner.body ? <AppText>{banner.body}</AppText> : null}
          <AppButton
            label="오늘 화면에서 체크하기"
            onPress={() => {
              setBanner(null);
              router.replace(todayPushHref(banner.medicationId) as never);
            }}
          />
          <AppButton label="닫기" variant="secondary" onPress={() => setBanner(null)} />
        </View>
      )}
      {children}
    </PushContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  bold: { fontWeight: '700' },
});
