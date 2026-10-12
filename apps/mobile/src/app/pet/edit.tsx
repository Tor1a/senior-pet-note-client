// 반려동물 정보 수정 라우트(/pet/edit?from=today|medications|account)
import { useLocalSearchParams } from 'expo-router';
import { PetGate } from '../../pet/PetGate';
import PetFormScreen from '../../pet/PetFormScreen';

export default function EditPetRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  return (
    <PetGate title="반려동물 정보">
      <PetFormScreen mode="edit" from={from} />
    </PetGate>
  );
}
