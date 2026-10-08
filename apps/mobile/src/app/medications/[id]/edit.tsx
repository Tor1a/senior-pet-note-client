// 약 수정 라우트(/medications/[id]/edit). 알림 설정에서 오면 ?from=reminder
import { useLocalSearchParams } from 'expo-router';
import MedicationFormScreen from '../../../medications/MedicationFormScreen';
import { PetGate } from '../../../pet/PetGate';

export default function EditMedicationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PetGate title="약 고치기">
      <MedicationFormScreen key={id} id={id} />
    </PetGate>
  );
}
