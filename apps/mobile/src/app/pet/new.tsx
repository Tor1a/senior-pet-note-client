// 반려동물 등록 라우트(/pet/new). PetGate 로 감싸지 않는다: 반려동물이 없는 상태에서 열려야 한다.
import PetFormScreen from '../../pet/PetFormScreen';

export default function NewPetRoute() {
  return <PetFormScreen mode="new" />;
}
