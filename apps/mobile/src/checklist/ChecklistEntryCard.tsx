// 오늘 화면 진입 카드 (온보딩 F단계). profileType 이 first_time 일 때만 그린다: senior·null·로딩 중이면 아무것도 없다.
// 체크 상태는 읽지 않는다(진행 상태·개수·배지 없음).
import { useRouter } from 'expo-router';
import { AppButton, AppText, Card } from '../components/ui';
import { CHECKLIST_TEXT } from '../lib/checklistText';
import { CHECKLIST_HREF } from './routes';

export function ChecklistEntryCard({ profileType }: { profileType: string | null | undefined }) {
  const router = useRouter();
  if (profileType !== 'first_time') return null;
  return (
    <Card>
      <AppText variant="title" accessibilityRole="header">
        {CHECKLIST_TEXT.title}
      </AppText>
      <AppButton
        label={CHECKLIST_TEXT.entryButton}
        accessibilityLabel={CHECKLIST_TEXT.entryButtonLabel}
        variant="secondary"
        onPress={() => router.push(CHECKLIST_HREF as never)}
      />
    </Card>
  );
}
