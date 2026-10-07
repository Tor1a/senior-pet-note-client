// 내 반려동물(MVP 는 0~1마리)을 로그인 후 화면들이 함께 쓴다. 웹 src/pet.tsx 의 모바일판(사진 훅 제외).
//   loading : GET /api/pets 확인 중
//   none    : 아직 등록 안 함 → 웹에서 먼저 등록 안내(등록 화면은 앱에 아직 없음)
//   ready   : pet 있음
//   offline : 서버에 연결하지 못함
//   error   : 그 밖의 오류
// 로그인 상태일 때만 마운트되므로(_layout) 로그아웃하면 상태가 사라진다.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isNetworkError } from '../lib/api';
import type { Pet } from '../lib/petApi';
import { petApi } from '../services/client';

export type PetStatus = 'loading' | 'none' | 'ready' | 'offline' | 'error';

export interface PetContextValue {
  status: PetStatus;
  pet: Pet | null;
  /** 서버에서 다시 읽는다 (예: 오늘 화면이 404 를 받았을 때) */
  reload: () => Promise<void>;
}

export const PetContext = createContext<PetContextValue | null>(null);

export function PetProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PetStatus>('loading');
  const [pet, setPet] = useState<Pet | null>(null);

  const reload = useCallback(async () => {
    // 이미 반려동물을 보여 주고 있으면 화면(PetGate 자식)을 언마운트하지 않도록 ready 를 유지한다(조용한 재확인)
    setStatus((prev) => (prev === 'ready' ? prev : 'loading'));
    try {
      const pets = await petApi.listPets();
      const first = pets?.[0] ?? null;
      setPet(first);
      setStatus(first ? 'ready' : 'none');
    } catch (err) {
      setStatus(isNetworkError(err) ? 'offline' : 'error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <PetContext.Provider value={{ status, pet, reload }}>{children}</PetContext.Provider>;
}

export function usePet(): PetContextValue {
  const ctx = useContext(PetContext);
  if (!ctx) throw new Error('usePet 은 PetProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
