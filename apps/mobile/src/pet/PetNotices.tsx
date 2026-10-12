// 등록·수정 뒤에 화면 맨 위에 보이는 안내 카드들 (설계 4-5, 4-6, 5-1)
import { NoticeCard, NoticeTitle } from '../components/NoticeCard';
import { AppButton, AppText, LinkButton } from '../components/ui';
import { createdTitle, PET_TEXT, updatedTitle } from './petText';
import type { PetNoticeKind } from './routes';

/** 수정 저장 후 (오늘·약 관리·계정 맨 위). onDismiss 가 있으면 [닫기] */
export function PetUpdatedNotice({ name, onDismiss }: { name: string; onDismiss?: () => void }) {
  return (
    <NoticeCard kind="ok">
      <NoticeTitle ok>{updatedTitle(name)}</NoticeTitle>
      {onDismiss ? <LinkButton label={PET_TEXT.close} onPress={onDismiss} /> : null}
    </NoticeCard>
  );
}

/** 등록 직후 오늘 화면 맨 위: 등록했어요 + 약 등록 안내(약이 이미 있으면 첫 줄만) */
export function PetCreatedNotice({
  name,
  showMedication,
  onAddMedication,
  onDismiss,
}: {
  name: string;
  showMedication: boolean;
  onAddMedication: () => void;
  onDismiss: () => void;
}) {
  return (
    <NoticeCard kind="ok">
      <NoticeTitle ok>{createdTitle(name)}</NoticeTitle>
      {showMedication ? (
        <>
          <AppText variant="secondary">{PET_TEXT.createdLine1}</AppText>
          <AppText variant="secondary">{PET_TEXT.createdLine2}</AppText>
          <AppButton label={PET_TEXT.createdAddMedication} onPress={onAddMedication} />
        </>
      ) : null}
      <LinkButton label={showMedication ? PET_TEXT.createdLater : PET_TEXT.createdClose} onPress={onDismiss} />
    </NoticeCard>
  );
}

/** 409(이미 등록됨)·404(정보가 없어짐) 안내. onDismiss 가 있으면 [닫기] */
export function PetInfoNotice({
  kind,
  onDismiss,
}: {
  kind: Extract<PetNoticeKind, 'petLimit' | 'petGone'>;
  onDismiss?: () => void;
}) {
  return (
    <NoticeCard kind="info" alert>
      <AppText style={{ fontWeight: '700' }}>{kind === 'petLimit' ? PET_TEXT.limit : PET_TEXT.gone}</AppText>
      {onDismiss ? <LinkButton label={PET_TEXT.close} onPress={onDismiss} /> : null}
    </NoticeCard>
  );
}
