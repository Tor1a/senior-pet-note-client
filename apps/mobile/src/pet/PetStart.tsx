// P0 시작 화면: 반려동물이 없을 때 PetGate 가 그린다 (설계 3장). 오늘·약 관리·지난 기록·리포트가 모두 같은 화면을 본다.
// - 알림 받기 카드는 숨긴다(DeviceFooter compact). [계정]·로그아웃은 남긴다(등록 전에도 탈퇴·로그아웃 경로 유지).
// - [다시 확인하기]는 웹에서 이미 등록한 경우를 위한 기존 reload 기능.
import { useRouter } from 'expo-router';
import { AppButton, AppText, Card, Screen } from '../components/ui';
import { DeviceFooter } from '../today/sections/DeviceFooter';
import { PetInfoNotice } from './PetNotices';
import { PET_TEXT } from './petText';
import { usePet } from './PetProvider';
import { NEW_PET_HREF } from './routes';
import { usePetNotice } from './usePetNotice';

const KINDS = ['petGone'] as const;

export function PetStart() {
  const router = useRouter();
  const { reload } = usePet();
  const { notice, dismiss } = usePetNotice(KINDS, () => PET_TEXT.gone);

  return (
    <Screen>
      <AppText variant="title" accessibilityRole="header">
        {PET_TEXT.startTitle}
      </AppText>
      {notice === 'petGone' ? <PetInfoNotice kind="petGone" onDismiss={dismiss} /> : null}
      <Card>
        <AppText style={{ fontWeight: '700' }}>{PET_TEXT.startCardTitle}</AppText>
        <AppText variant="secondary">{PET_TEXT.startCardLead}</AppText>
        <AppText variant="secondary">{PET_TEXT.startCardBody}</AppText>
        <AppButton label={PET_TEXT.startButton} onPress={() => router.push(NEW_PET_HREF as never)} />
        <AppText variant="caption">{PET_TEXT.startLimitNote}</AppText>
      </Card>
      <AppText variant="secondary">{PET_TEXT.startWebAsk}</AppText>
      <AppButton label={PET_TEXT.startRecheck} variant="secondary" onPress={() => void reload()} />
      <DeviceFooter compact />
    </Screen>
  );
}
