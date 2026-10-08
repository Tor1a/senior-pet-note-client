// 계정 (/account): 로그인한 이메일, 비밀번호 바꾸기, 로그아웃, 회원 탈퇴 진입 (설계 3장)
// 면책 문구는 이 화면에만 둔다(설계 7-1). 하단 고정 영역 없이 전부 스크롤 → 글자 200% 에서도 잘리지 않는다.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { NoticeCard, NoticeTitle } from '../components/NoticeCard';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { DISCLAIMER } from '../lib/constants';
import { goBackOr } from '../medications/routes';
import { ScreenTop } from '../medications/ScreenTop';
import { colors } from '../theme';
import { PrivacyLink } from './AccountParts';
import { DELETE_ACCOUNT_HREF, isPasswordNotice, PASSWORD_HREF } from './routes';

export default function AccountScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <Screen>
      <ScreenTop backLabel="오늘로" backA11yLabel="오늘로 돌아가기" onBack={() => goBackOr(router, '/')} title="계정" />

      {isPasswordNotice(notice) ? (
        <NoticeCard kind="ok">
          <NoticeTitle ok>비밀번호를 바꿨어요.</NoticeTitle>
        </NoticeCard>
      ) : null}

      <Card>
        <AppText variant="secondary">이메일</AppText>
        {user ? (
          <AppText selectable style={{ fontWeight: '700' }}>
            {user.email}
          </AppText>
        ) : (
          <AppText>이메일을 불러오지 못했어요.</AppText>
        )}
      </Card>

      <AppButton label="비밀번호 바꾸기 ›" accessibilityLabel="비밀번호 바꾸기" variant="secondary" onPress={() => router.push(PASSWORD_HREF as never)} />
      <AppButton
        label={signingOut ? '로그아웃하는 중…' : '로그아웃'}
        variant="secondary"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut(); // 성공하면 _layout 이 로그인 화면으로 보낸다
        }}
      />
      <AppText variant="secondary">로그아웃하면 이 기기로 오던 투약 알림도 멈춰요.</AppText>

      <PrivacyLink />

      <View style={{ height: 1, backgroundColor: '#E8DFD4', marginTop: 8 }} />
      <AppText accessibilityRole="header" style={{ fontWeight: '700', color: colors.text }}>
        회원 탈퇴
      </AppText>
      <AppText variant="secondary">계정과 모든 기록이 지워져요.</AppText>
      <AppButton label="회원 탈퇴 ›" accessibilityLabel="회원 탈퇴" variant="secondary" onPress={() => router.push(DELETE_ACCOUNT_HREF as never)} />

      <AppText variant="caption" style={{ marginTop: 'auto' }}>
        {DISCLAIMER}
      </AppText>
    </Screen>
  );
}
