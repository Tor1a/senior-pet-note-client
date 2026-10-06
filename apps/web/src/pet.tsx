import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { isNetworkError } from './lib/api';
import { petApi } from './lib/client';
import type { Pet } from './lib/petApi';

// 내 반려동물(MVP 는 0~1마리)을 로그인 후 화면들이 함께 쓴다.
//   loading : GET /api/pets 확인 중
//   none    : 아직 등록 안 함 → 등록 화면으로
//   ready   : pet 있음
//   offline : 서버에 연결하지 못함
//   error   : 그 밖의 오류
export type PetStatus = 'loading' | 'none' | 'ready' | 'offline' | 'error';

export interface PetContextValue {
  status: PetStatus;
  pet: Pet | null;
  /** 서버에서 다시 읽는다 (예: 오늘 화면이 404 를 받았을 때) */
  reload: () => Promise<void>;
  /** 저장·사진 변경 후 받은 Pet 으로 바로 바꾼다 */
  setPet: (pet: Pet) => void;
}

export const PetContext = createContext<PetContextValue | null>(null);

export function PetProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PetStatus>('loading');
  const [pet, setPetState] = useState<Pet | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const pets = await petApi.listPets();
      const first = pets?.[0] ?? null;
      setPetState(first);
      setStatus(first ? 'ready' : 'none');
    } catch (err) {
      setStatus(isNetworkError(err) ? 'offline' : 'error');
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

/**
 * 반려동물 사진을 토큰과 함께 받아 blob URL 로 돌려준다(계약 1장: 경로 비노출, GET /photo).
 * 사진이 없거나 못 받으면 null → 화면은 🐾 로 대신한다.
 * key 로 updatedAt 을 써서 사진을 바꾸면 다시 받는다.
 */
export function usePetPhotoUrl(pet: Pet | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const id = pet?.id;
  const hasPhoto = pet?.hasPhoto ?? false;
  const version = pet?.updatedAt;

  useEffect(() => {
    if (!id || !hasPhoto || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    petApi
      .getPhoto(id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, hasPhoto, version]);

  return url;
}
