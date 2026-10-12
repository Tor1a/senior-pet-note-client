// 내 반려동물(MVP 는 0~1마리)을 로그인 후 화면들이 함께 쓴다. 웹 src/pet.tsx 의 모바일판(사진 훅 제외).
//   loading : GET /api/pets 확인 중
//   none    : 아직 등록 안 함 → 시작 화면(PetStart)에서 등록
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
  /**
   * 서버에서 다시 읽는다 (예: 오늘 화면이 404 를 받았을 때). 읽었으면 true, 못 읽었으면 false.
   * keepOnError: 못 읽어도 상태(ready 의 화면)를 바꾸지 않는다 — 등록·수정 폼이 입력을 지키며 오류를 직접 보여 줄 때
   */
  reload: (opts?: { keepOnError?: boolean }) => Promise<boolean>;
  /** 등록·수정 후 받은 Pet 으로 바로 바꾼다(다시 읽지 않는다) */
  setPet: (pet: Pet) => void;
}

export const PetContext = createContext<PetContextValue | null>(null);

export function PetProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PetStatus>('loading');
  const [pet, setPetState] = useState<Pet | null>(null);

  const reload = useCallback(async (opts?: { keepOnError?: boolean }) => {
    // 이미 반려동물을 보여 주고 있으면 화면(PetGate 자식)을 언마운트하지 않도록 ready 를 유지한다(조용한 재확인)
    setStatus((prev) => (prev === 'ready' ? prev : 'loading'));
    try {
      const pets = await petApi.listPets();
      const first = pets?.[0] ?? null;
      setPetState(first);
      setStatus(first ? 'ready' : 'none');
      return true;
    } catch (err) {
      if (opts?.keepOnError) {
        setStatus((prev) => (prev === 'loading' ? (isNetworkError(err) ? 'offline' : 'error') : prev));
      } else {
        setStatus(isNetworkError(err) ? 'offline' : 'error');
      }
      return false;
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setPet = useCallback((p: Pet) => {
    setPetState(p);
    setStatus('ready');
  }, []);

  return <PetContext.Provider value={{ status, pet, reload, setPet }}>{children}</PetContext.Provider>;
}

export function usePet(): PetContextValue {
  const ctx = useContext(PetContext);
  if (!ctx) throw new Error('usePet 은 PetProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
