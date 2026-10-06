import type { Pet } from '../lib/petApi';
import { usePetPhotoUrl } from '../pet';

// 반려동물 사진(원형). 사진이 없으면 🐾 (대표 결정: 사진 MVP 포함, 없으면 아이콘)
export default function PetAvatar({ pet, size = 40 }: { pet: Pet | null; size?: number }) {
  const url = usePetPhotoUrl(pet);
  const style = { width: size, height: size };
  if (url) return <img className="avatar" src={url} alt={pet ? `${pet.name} 사진` : ''} style={style} />;
  return (
    <span className="avatar avatar-empty" style={style} role="img" aria-label="사진 없음">
      🐾
    </span>
  );
}
