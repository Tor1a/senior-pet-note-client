// 반려동물 등록·수정 폼의 입력 상태 ↔ API 본문 변환, 1차 검증, 저장 오류 분류
// (계약: docs/api-today.md 반려동물 API, 화면 설계: .company/design/모바일-반려동물-등록.md 4장)
// - 웹 PetFormPage 에서 추출했다. 웹 동작은 그대로(위치만 이동). 이름·종류·태어난 해·질환 규칙만 다룬다(사진 제외).
import { ApiError, toUserMessage, type ErrorContext } from './api';
import type { Pet, PetInput, Species } from './petApi';
import {
  compareYmd,
  daysInMonth,
  isRealDate,
  parseIsoDate,
  PET_DATE_MIN_YEAR,
  toIsoDate,
  type PetProfileType,
  type PetToday,
  type YmdParts,
  todayParts,
} from './petProfile';
import { PET_PROFILE_TEXT as PT } from './petProfileText';

export const PET_NAME_MAX = 30;
export const PET_CONDITIONS_MAX = 200;
export const PET_MIN_YEAR = PET_DATE_MIN_YEAR;
/** 질환 입력이 이 글자 수에 가까워지면 남은 글자 수를 알린다 */
export const CONDITIONS_COUNT_FROM = 180;

export const PET_FORM_ERRORS = {
  nameRequired: '이름을 적어 주세요.',
  nameTooLong: `이름은 ${PET_NAME_MAX}자까지 적을 수 있어요.`,
  speciesRequired: '개인지 고양이인지 골라 주세요.',
} as const;

/**
 * 입력칸 상태. 태어난 해는 글자('' = 모르거나 적지 않음), 종류는 고르기 전 null.
 * 유형은 null = 나중에 정할게요. 월·일·입양일은 글자('' = 선택 안 함, '1'~'12' 처럼 0 없이).
 * 생일의 연도는 birthYear 한 곳만 쓴다. 날짜 칸을 접고 펴는 것은 draft 에 넣지 않는다(dirty 아님).
 */
export interface PetDraft {
  name: string;
  species: Species | null;
  birthYear: string;
  conditions: string;
  profileType: PetProfileType | null;
  birthMonth: string;
  birthDay: string;
  adoptedYear: string;
  adoptedMonth: string;
  adoptedDay: string;
}

export const EMPTY_PET_DRAFT: PetDraft = {
  name: '',
  species: null,
  birthYear: '',
  conditions: '',
  profileType: null,
  birthMonth: '',
  birthDay: '',
  adoptedYear: '',
  adoptedMonth: '',
  adoptedDay: '',
};

/** 저장된 반려동물로 입력칸을 채운다(없으면 빈 폼) */
export function draftFromPet(pet: Pet | null): PetDraft {
  if (!pet) return { ...EMPTY_PET_DRAFT };
  const birth = parseIsoDate(pet.birthDate);
  const adopted = parseIsoDate(pet.adoptedOn);
  return {
    name: pet.name,
    species: pet.species,
    birthYear: pet.birthYear ? String(pet.birthYear) : '',
    conditions: pet.conditions ?? '',
    profileType: pet.profileType ?? null,
    birthMonth: birth ? String(birth.month) : '',
    birthDay: birth ? String(birth.day) : '',
    adoptedYear: adopted ? String(adopted.year) : '',
    adoptedMonth: adopted ? String(adopted.month) : '',
    adoptedDay: adopted ? String(adopted.day) : '',
  };
}

export interface PetFieldErrors {
  name?: string;
  species?: string;
  /** 생일 월·일 칸 아래 */
  birth?: string;
  /** 입양일 칸 아래 */
  adopted?: string;
}

const num = (value: string): number | null => (value ? Number(value) : null);

/** 생일 전체 날짜(태어난 해 + 월 + 일). 하나라도 비면 null */
function birthParts(draft: PetDraft): YmdParts | null {
  const year = num(draft.birthYear);
  const month = num(draft.birthMonth);
  const day = num(draft.birthDay);
  return year != null && month != null && day != null ? { year, month, day } : null;
}

/** 입양일 전체 날짜. 하나라도 비면 null */
function adoptedParts(draft: PetDraft): YmdParts | null {
  const year = num(draft.adoptedYear);
  const month = num(draft.adoptedMonth);
  const day = num(draft.adoptedDay);
  return year != null && month != null && day != null ? { year, month, day } : null;
}

/** 날짜 칸 요약용: 생일 월·일(둘 다 있을 때) */
export function birthMonthDay(draft: PetDraft): { month: number; day: number } | null {
  const month = num(draft.birthMonth);
  const day = num(draft.birthDay);
  return month != null && day != null ? { month, day } : null;
}

export function adoptedDate(draft: PetDraft): YmdParts | null {
  return adoptedParts(draft);
}

/** 날짜 칸에 값이 하나라도 있나(화면을 열 때 접힌 행을 펼칠지 정한다) */
export function hasDateValues(draft: PetDraft): boolean {
  return !!(draft.birthMonth || draft.birthDay || draft.adoptedYear || draft.adoptedMonth || draft.adoptedDay);
}

function validateBirth(draft: PetDraft, today: PetToday): string | undefined {
  const { birthMonth, birthDay, birthYear } = draft;
  if (!birthMonth && !birthDay) return undefined;
  if (!birthMonth || !birthDay) return PT.errBirthPartial;
  if (!birthYear) return PT.errBirthNeedsYear;
  const full = birthParts(draft);
  if (!full || !isRealDate(full.year, full.month, full.day)) return PT.errNoSuchDate;
  if (compareYmd(full, today) > 0) return PT.errFuture;
  return undefined;
}

function validateAdopted(draft: PetDraft, today: PetToday): string | undefined {
  const { adoptedYear, adoptedMonth, adoptedDay } = draft;
  if (!adoptedYear && !adoptedMonth && !adoptedDay) return undefined;
  if (!adoptedYear || !adoptedMonth || !adoptedDay) return PT.errAdoptPartial;
  const full = adoptedParts(draft);
  if (!full || !isRealDate(full.year, full.month, full.day)) return PT.errNoSuchDate;
  if (compareYmd(full, today) > 0) return PT.errFuture;
  // 생일이 전체 날짜일 때만 비교한다. 입양일 연도만 태어난 해보다 이른 경우는 서버처럼 막지 않는다
  const birth = birthParts(draft);
  if (birth && isRealDate(birth.year, birth.month, birth.day) && compareYmd(full, birth) < 0) {
    return PT.errAdoptBeforeBirth;
  }
  return undefined;
}

/**
 * 제출할 때 하는 1차 검증. 오류가 없으면 빈 객체.
 * today 는 기기의 달력 날짜(todayParts(new Date())). 빼면 지금 날짜를 쓴다 — 테스트에서는 고정해서 넘긴다.
 */
export function validatePetDraft(draft: PetDraft, today: PetToday = todayParts(new Date())): PetFieldErrors {
  const errors: PetFieldErrors = {};
  if (!draft.name.trim()) errors.name = PET_FORM_ERRORS.nameRequired;
  else if (draft.name.trim().length > PET_NAME_MAX) errors.name = PET_FORM_ERRORS.nameTooLong;
  if (!draft.species) errors.species = PET_FORM_ERRORS.speciesRequired;
  const birth = validateBirth(draft, today);
  if (birth) errors.birth = birth;
  const adopted = validateAdopted(draft, today);
  if (adopted) errors.adopted = adopted;
  return errors;
}

export function hasPetFieldErrors(errors: PetFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * API 본문. 종류를 고르지 않았으면 null (validatePetDraft 로 먼저 걸러진다).
 * base = 저장된 반려동물(등록이면 null). 유형·생일·입양일은 base 와 달라졌을 때만 키를 넣는다
 * (안 건드리면 생략 = 서버가 값 유지, 지울 때만 null). birthYear 는 기존대로 항상 보낸다.
 */
export function toPetInput(draft: PetDraft, base: Pet | null = null): PetInput | null {
  if (!draft.species) return null;
  const input: PetInput = {
    name: draft.name.trim(),
    species: draft.species,
    birthYear: draft.birthYear ? Number(draft.birthYear) : null,
    conditions: draft.conditions.trim() ? draft.conditions.trim() : null,
  };
  if (draft.profileType !== (base?.profileType ?? null)) input.profileType = draft.profileType;

  const birth = birthParts(draft);
  const birthDate = birth && isRealDate(birth.year, birth.month, birth.day) ? toIsoDate(birth.year, birth.month, birth.day) : null;
  if (birthDate !== (base?.birthDate ?? null)) input.birthDate = birthDate;

  const adopted = adoptedParts(draft);
  const adoptedOn =
    adopted && isRealDate(adopted.year, adopted.month, adopted.day) ? toIsoDate(adopted.year, adopted.month, adopted.day) : null;
  if (adoptedOn !== (base?.adoptedOn ?? null)) input.adoptedOn = adoptedOn;
  return input;
}

/** 날짜 칸을 바꾼 뒤 화면에 알릴 안내. 없으면 null */
export type PetDateNotice = 'dayCleared' | 'birthCleared' | null;

export interface PetDraftChange {
  draft: PetDraft;
  notice: PetDateNotice;
}

/** 태어난 해를 바꾼다. 지우면 생일 월·일도 비우고, 새 해에 없는 날(2/29)이면 일만 비운다 */
export function changeBirthYear(draft: PetDraft, birthYear: string): PetDraftChange {
  const next = { ...draft, birthYear };
  if (!birthYear) {
    if (!draft.birthMonth && !draft.birthDay) return { draft: next, notice: null };
    return { draft: { ...next, birthMonth: '', birthDay: '' }, notice: 'birthCleared' };
  }
  if (draft.birthMonth && draft.birthDay && Number(draft.birthDay) > daysInMonth(Number(birthYear), Number(draft.birthMonth))) {
    return { draft: { ...next, birthDay: '' }, notice: 'dayCleared' };
  }
  return { draft: next, notice: null };
}

/** 생일 월·일을 바꾼다. 월을 바꿔 일이 말일을 넘으면 일만 비운다 */
export function changeBirthPart(draft: PetDraft, part: 'birthMonth' | 'birthDay', value: string): PetDraftChange {
  const next = { ...draft, [part]: value };
  if (part === 'birthMonth' && value && next.birthDay) {
    if (Number(next.birthDay) > daysInMonth(num(next.birthYear), Number(value))) {
      return { draft: { ...next, birthDay: '' }, notice: 'dayCleared' };
    }
  }
  return { draft: next, notice: null };
}

/** 입양일 연·월·일을 바꾼다. 연·월을 바꿔 일이 말일을 넘으면 일만 비운다 */
export function changeAdoptedPart(
  draft: PetDraft,
  part: 'adoptedYear' | 'adoptedMonth' | 'adoptedDay',
  value: string,
): PetDraftChange {
  const next = { ...draft, [part]: value };
  if (part !== 'adoptedDay' && next.adoptedMonth && next.adoptedDay) {
    if (Number(next.adoptedDay) > daysInMonth(num(next.adoptedYear), Number(next.adoptedMonth))) {
      return { draft: { ...next, adoptedDay: '' }, notice: 'dayCleared' };
    }
  }
  return { draft: next, notice: null };
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
    draft.conditions !== base.conditions ||
    draft.profileType !== base.profileType ||
    draft.birthMonth !== base.birthMonth ||
    draft.birthDay !== base.birthDay ||
    draft.adoptedYear !== base.adoptedYear ||
    draft.adoptedMonth !== base.adoptedMonth ||
    draft.adoptedDay !== base.adoptedDay
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
