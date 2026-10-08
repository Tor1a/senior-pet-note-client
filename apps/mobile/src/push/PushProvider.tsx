// 이 기기의 알림 상태, 포그라운드 배너, 알림 탭 이동 (기획서 C2~C9)
// - 로그인한 화면(signedIn)에서만 마운트된다. 권한이 이미 허용돼 있으면 시작할 때 조용히 토큰을 등록한다.
// - 권한을 아직 안 물었으면 묻지 않는다. 화면의 [알림 받기] 버튼(requestPermission)에서만 묻는다.
// - Expo Go·웹 미리보기·설정 파일 없는 빌드에서는 state 가 'unavailable' 이고 아무 일도 하지 않는다.
import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton, AppText } from '../components/ui';
import { formatTime } from '../lib/format';
import { parseMedReminderData } from '../lib/reminderApi';
import { push } from '../services/push';
import type { PushMessage } from '../services/pushTypes';
import { RegistrationSupersededError } from '../lib/pushDevice';
import { registerMobileDevice } from '../services/pushDevice';
import { colors, spacing } from '../theme';
import {
  PushContext,
  nextOpenNonce,
  todayPushHref,
  type PushBannerMessage,
  type PushContextValue,
  type PushDeviceState,
} from './pushContext';

export function PushProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<PushDeviceState>(push.available ? 'checking' : 'unavailable');
  const [messages, setMessages] = useState<PushBannerMessage[]>([]);
  const listeners = useRef(new Set<(m: PushBannerMessage) => void>());
  const pathname = usePathname();
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

  // 휴대폰 설정에서 알림을 허용하고 앱으로 돌아오면 다시 확인한다(약 관리의 [설정 열기] 흐름).
  // default/denied/error 일 때만 확인한다. registered 면 이미 등록돼 있어 기기 등록(PUT)을 또 보내지 않는다.
  // 확인은 권한 조회뿐이라(허용된 경우에만 등록) 짧은 간격으로 돌아와도 부담이 없고, 겹치면 recheck 가 한 번으로 합친다.
  useEffect(() => {
    if (!push.available) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const s = stateRef.current;
      if (s === 'default' || s === 'denied' || s === 'error') void recheck();
    });
    return () => sub.remove();
  }, [recheck]);

  // 오늘 화면으로 이동. replace 로는 약 관리 스택(목록·폼·알림 설정)이 그 아래 남아 뒤로가기로 되살아나므로,
  // 스택 맨 아래의 오늘 화면까지 되돌아가며(POP_TO, 한 번의 이동) 알림 파라미터를 싣는다.
  // 저장 안 한 알림 설정이 있으면 그 화면의 이탈 확인 카드가 먼저 뜬다(의도).
  const goToday = useCallback(
    (medicationId?: string) => router.dismissTo(todayPushHref(medicationId, nextOpenNonce()) as never),
    [router],
  );

  // 토큰 갱신 → 다시 PUT, 포그라운드 알림 → 배너, 알림 탭 → 오늘 화면
  useEffect(() => {
    if (!push.available) return;
    const openToday = (msg: PushMessage) => {
      const data = parseMedReminderData(msg.data);
      if (data) goToday(data.medicationId);
    };
    const offs = [
      push.onTokenRefresh(() => void recheck()),
      push.onForeground((msg) => {
        const data = parseMedReminderData(msg.data);
        if (!data) return; // 알 수 없는 알림은 무시
        const item: PushBannerMessage = {
          ...data,
          key: `${data.medicationId}:${data.recordDate}:${data.scheduledTime}`,
          title: msg.title ?? '투약 시간이에요',
          body: msg.body ?? '',
        };
        setMessages((list) => [...list.filter((m) => m.key !== item.key), item]);
        listeners.current.forEach((l) => l(item));
      }),
      push.onOpened(openToday),
    ];
    void push.getInitial().then((msg) => msg && openToday(msg));
    return () => offs.forEach((off) => off());
  }, [recheck, goToday]);

  const subscribe = useCallback((listener: (m: PushBannerMessage) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const bannerVisible = messages.length > 0;
  const value = useMemo<PushContextValue>(
    () => ({ state, requestPermission, recheck, bannerVisible, subscribe }),
    [state, requestPermission, recheck, bannerVisible, subscribe],
  );

  // 웹 PushBanner 와 같이: 오늘 화면이면 [체크하기] 버튼 대신 안내 문구만 보인다
  const onToday = pathname === '/';

  return (
    <PushContext.Provider value={value}>
      {bannerVisible && (
        <PushBanner
          messages={messages}
          onToday={onToday}
          onClose={() => setMessages([])}
          onOpenToday={() => {
            const last = messages[messages.length - 1];
            setMessages([]);
            goToday(last?.medicationId);
          }}
        />
      )}
      {children}
    </PushContext.Provider>
  );
}

const BANNER_MAX_LINES = 3;

/** S8 인앱 배너. 자동으로 사라지지 않는다(읽을 시간 보장). 상단 안전 영역은 여기서만 채운다(화면 프레임은 bannerVisible 이면 top 을 뺀다) */
export function PushBanner({
  messages,
  onToday,
  onClose,
  onOpenToday,
}: {
  messages: PushBannerMessage[];
  onToday: boolean;
  onClose: () => void;
  onOpenToday: () => void;
}) {
  const insets = useSafeAreaInsets();
  const shown = messages.slice(0, BANNER_MAX_LINES);
  const rest = messages.length - shown.length;
  const single = messages.length === 1;

  return (
    <View style={[styles.banner, { paddingTop: spacing.md + insets.top }]} accessibilityRole="alert">
      <AppText style={styles.bold}>{messages[messages.length - 1].title}</AppText>
      {shown.map((m) => (
        <AppText key={m.key}>
          {m.body}
          {single && m.scheduledTime ? ` · ${formatTime(m.scheduledTime)}` : ''}
        </AppText>
      ))}
      {rest > 0 && <AppText variant="secondary">{`외 ${rest}개`}</AppText>}
      {onToday ? (
        <AppText>아래 목록에서 [먹였어요]를 눌러 주세요.</AppText>
      ) : (
        <AppButton label="오늘 화면에서 체크하기" onPress={onOpenToday} />
      )}
      <AppButton label="닫기" variant="secondary" onPress={onClose} />
    </View>
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
