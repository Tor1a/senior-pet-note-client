// [공유 로직 사본] 원본: web/src/lib/petForm.ts (2026-10-12 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 반려동물 등록·수정 폼의 입력 상태 ↔ API 본문 변환, 1차 검증, 저장 오류 분류
// (계약: docs/api-today.md 반려동물 API, 화면 설계: .company/design/모바일-반려동물-등록.md 4장)
// - 웹 PetFormPage 에서 추출했다. 웹 동작은 그대로(위치만 이동). 이름·종류·태어난 해·질환 규칙만 다룬다(사진 제외).
import { ApiError, toUserMessage, type ErrorContext } from './api';
import type { Pet, PetInput, Species } from './petApi';

export const PET_NAME_MAX = 30;
export const PET_CONDITIONS_MAX = 200;
export const PET_MIN_YEAR = 1980;
/** 질환 입력이 이 글자 수에 가까워지면 남은 글자 수를 알린다 */
export const CONDITIONS_COUNT_FROM = 180;

export const PET_FORM_ERRORS = {
  nameRequired: '이름을 적어 주세요.',
  nameTooLong: `이름은 ${PET_NAME_MAX}자까지 적을 수 있어요.`,
  speciesRequired: '개인지 고양이인지 골라 주세요.',
} as const;

/** 입력칸 상태. 태어난 해는 글자('' = 모르거나 적지 않음), 종류는 고르기 전 null */
export interface PetDraft {
  name: string;
  species: Species | null;
  birthYear: string;
  conditions: string;
}

export const EMPTY_PET_DRAFT: PetDraft = { name: '', species: null, birthYear: '', conditions: '' };

/** 저장된 반려동물로 입력칸을 채운다(없으면 빈 폼) */
export function draftFromPet(pet: Pet | null): PetDraft {
  if (!pet) return { ...EMPTY_PET_DRAFT };
  return {
    name: pet.name,
    species: pet.species,
    birthYear: pet.birthYear ? String(pet.birthYear) : '',
    conditions: pet.conditions ?? '',
  };
}

export interface PetFieldErrors {
  name?: string;
  species?: string;
}

/** 제출할 때 하는 1차 검증. 오류가 없으면 빈 객체 */
export function validatePetDraft(draft: PetDraft): PetFieldErrors {
  const errors: PetFieldErrors = {};
  if (!draft.name.trim()) errors.name = PET_FORM_ERRORS.nameRequired;
  else if (draft.name.trim().length > PET_NAME_MAX) errors.name = PET_FORM_ERRORS.nameTooLong;
  if (!draft.species) errors.species = PET_FORM_ERRORS.speciesRequired;
  return errors;
}

export function hasPetFieldErrors(errors: PetFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** API 본문. 종류를 고르지 않았으면 null (validatePetDraft 로 먼저 걸러진다) */
export function toPetInput(draft: PetDraft): PetInput | null {
  if (!draft.species) return null;
  return {
    name: draft.name.trim(),
    species: draft.species,
    birthYear: draft.birthYear ? Number(draft.birthYear) : null,
    conditions: draft.conditions.trim() ? draft.conditions.trim() : null,
  };
}

/** 태어난 해 고르기 목록: 올해부터 1980년까지 내림차순 */
export function birthYearOptions(thisYear: number): number[] {
  const years: number[] = [];
  for (let y = thisYear; y >= PET_MIN_YEAR; y--) years.push(y);
  return years;
}

/** 저장 전 변경 여부. pet 이 없으면(등록) 무엇이든 입력했는지, 있으면(수정) 저장된 값과 다른지 */
export function isPetDraftDirty(draft: PetDraft, pet: Pet | null): boolean {
  const base = draftFromPet(pet);
  return (
    draft.name !== base.name ||
    draft.species !== base.species ||
    draft.birthYear !== base.birthYear ||
    draft.conditions !== base.conditions
  );
}

/** 여러 줄 입력(붙여넣기 등)의 줄바꿈을 공백 하나로 바꾼다. 질환은 한 줄로 저장한다 */
export function toSingleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ');
}

/** 질환 남은 글자 수. 아직 알릴 때가 아니면 null */
export function conditionsRemaining(conditions: string): number | null {
  return conditions.length >= CONDITIONS_COUNT_FROM ? PET_CONDITIONS_MAX - conditions.length : null;
}

/**
 * 저장 실패를 화면이 할 일로 나눈다.
 * - gone  : 수정하던 반려동물이 사라졌다(404) → 다시 읽는다
 * - limit : 이미 등록돼 있다(409 PET_LIMIT_REACHED) → 다시 읽는다
 * - message : 그 밖의 오류 → 문구를 보여 준다
 */
export type PetSaveFailure = { kind: 'gone' } | { kind: 'limit' } | { kind: 'message'; message: string };

export function classifyPetSaveError(err: unknown, isNew: boolean, context: ErrorContext = 'pet'): PetSaveFailure {
  if (err instanceof ApiError && err.status === 404 && !isNew) return { kind: 'gone' };
  if (err instanceof ApiError && err.code === 'PET_LIMIT_REACHED') return { kind: 'limit' };
  return { kind: 'message', message: toUserMessage(err, context) };
}
