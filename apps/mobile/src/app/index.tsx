// "오늘" 화면 (자리표시)
// 실제 구성(투약 카드 → 식사·물 → 증상 → 체중·메모)은 design/today-wireframe.md 를 따른다.
// 지금은 공통 로직(증상 초기 상태)이 웹과 같게 동작하는지만 보여 준다. 기록 날짜는 서버가 계산한다.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AppButton, AppText, Screen } from '../components/ui';
import { usePush } from '../push/PushProvider';
import { DISCLAIMER } from '../lib/constants';
import { INITIAL_SYMPTOM_STATE, SYMPTOM_NONE_LABEL } from '../lib/symptoms';
import { colors, spacing } from '../theme';

export default function TodayScreen() {
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const { state, requestPermission, recheck } = usePush();
  const [asking, setAsking] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut(); // 성공하면 _layout 이 로그인 화면으로 보낸다
  }

  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        오늘
      </AppText>
      <AppText variant="secondary">
        {user ? `${user.email} 님` : '서버에 연결하지 못해 계정 정보를 확인하지 못했어요.'}
      </AppText>

      <View style={styles.card}>
        <AppText style={styles.bold}>준비 중이에요</AppText>
        <AppText>투약 체크, 식사·물, 증상, 체중·메모 기록이 여기에 들어갈 예정이에요.</AppText>
        <AppText variant="secondary">
          {`증상 기본값: ${INITIAL_SYMPTOM_STATE.none ? SYMPTOM_NONE_LABEL : '선택 없음'}`}
        </AppText>
      </View>

      {state !== 'unavailable' && state !== 'checking' && (
        <View style={styles.card}>
          <AppText style={styles.bold}>투약 알림 받기</AppText>
          {state === 'registered' || state === 'registering' ? (
            <AppText>이 휴대폰으로 투약 알림을 받아요.</AppText>
          ) : state === 'denied' ? (
            <AppText>알림이 막혀 있어요. 휴대폰 설정에서 이 앱의 알림을 허용해 주세요.</AppText>
          ) : (
            <>
              <AppText>약 먹일 시간에 알려 드려요. 알림을 받으려면 다음 화면에서 허용해 주세요.</AppText>
              {state === 'error' && <AppText variant="secondary">알림 등록에 실패했어요. 다시 시도해 주세요.</AppText>}
              <AppButton
                label={state === 'error' ? '다시 시도' : '알림 받기'}
                loading={asking}
                onPress={async () => {
                  setAsking(true);
                  await (state === 'error' ? recheck() : requestPermission());
                  setAsking(false);
                }}
              />
            </>
          )}
          <AppText variant="secondary">알림 규칙은 웹에서 설정해요.</AppText>
        </View>
      )}

      <AppButton label="로그아웃" variant="secondary" onPress={handleSignOut} loading={signingOut} />

      <AppText variant="caption" style={styles.disclaimer}>
        {DISCLAIMER}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bold: { fontWeight: '700' },
  disclaimer: { marginTop: 'auto' },
});
