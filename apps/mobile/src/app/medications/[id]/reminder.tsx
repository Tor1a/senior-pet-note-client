// 알림 설정 라우트(/medications/[id]/reminder)
import { useLocalSearchParams } from 'expo-router';
import ReminderScreen from '../../../medications/ReminderScreen';
import { PetGate } from '../../../pet/PetGate';

export default function ReminderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PetGate title="투약 알림">
      <ReminderScreen key={id} id={id} />
    </PetGate>
  );
}
