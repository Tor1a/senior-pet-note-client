// 약 등록 라우트(/medications/new)
import MedicationFormScreen from '../../medications/MedicationFormScreen';
import { PetGate } from '../../pet/PetGate';

export default function NewMedicationRoute() {
  return (
    <PetGate title="약 추가">
      <MedicationFormScreen />
    </PetGate>
  );
}
