// [공유 로직 테스트 사본] 원본: web/src/lib/petForm.test.ts (2026-10-13 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { ApiError, NETWORK_ERROR_MESSAGE } from './api';
import type { Pet } from './petApi';
import {
  birthYearOptions,
  classifyPetSaveError,
  conditionsRemaining,
  draftFromPet,
  EMPTY_PET_DRAFT,
  hasPetFieldErrors,
  isPetDraftDirty,
  PET_FORM_ERRORS,
  toPetInput,
  toSingleLine,
  validatePetDraft,
} from './petForm';

const PET: Pet = {
  id: 'pet-1',
  name: '보리',
  species: 'dog',
  birthYear: 2012,
  conditions: '신부전',
  hasPhoto: true,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const ok = { ...EMPTY_PET_DRAFT, name: '보리', species: 'dog' as const };

describe('draftFromPet', () => {
  it('없으면 빈 폼(종류는 고르지 않은 상태), 있으면 저장된 값', () => {
    expect(draftFromPet(null)).toEqual({ ...EMPTY_PET_DRAFT, name: '', species: null, birthYear: '', conditions: '' });
    expect(draftFromPet(PET)).toEqual({ ...EMPTY_PET_DRAFT, name: '보리', species: 'dog', birthYear: '2012', conditions: '신부전' });
    expect(draftFromPet({ ...PET, birthYear: null, conditions: null })).toEqual({
      ...EMPTY_PET_DRAFT,
      name: '보리',
      species: 'dog',
      birthYear: '',
      conditions: '',
    });
  });

  it('EMPTY_PET_DRAFT 를 복사해 주므로 바꿔도 원본이 안 바뀐다', () => {
    const d = draftFromPet(null);
    d.name = 'x';
    expect(EMPTY_PET_DRAFT.name).toBe('');
  });
});

describe('validatePetDraft', () => {
  it('이름·종류가 있으면 오류 없음', () => {
    expect(validatePetDraft(ok)).toEqual({});
    expect(hasPetFieldErrors(validatePetDraft(ok))).toBe(false);
  });

  it('이름이 비었거나 공백뿐', () => {
    expect(validatePetDraft({ ...ok, name: '' }).name).toBe('이름을 적어 주세요.');
    expect(validatePetDraft({ ...ok, name: '   ' }).name).toBe('이름을 적어 주세요.');
  });

  it('이름 30자까지 통과(앞뒤 공백은 세지 않음), 31자는 오류', () => {
    expect(validatePetDraft({ ...ok, name: 'a'.repeat(30) }).name).toBeUndefined();
    expect(validatePetDraft({ ...ok, name: ` ${'a'.repeat(30)} ` }).name).toBeUndefined();
    expect(validatePetDraft({ ...ok, name: 'a'.repeat(31) }).name).toBe('이름은 30자까지 적을 수 있어요.');
  });

  it('한글도 30자 통과, 31자 오류', () => {
    expect(validatePetDraft({ ...ok, name: '가'.repeat(30) }).name).toBeUndefined();
    expect(validatePetDraft({ ...ok, name: '가'.repeat(31) }).name).toBe(PET_FORM_ERRORS.nameTooLong);
  });

  // 서버는 UTF-16 길이로 센다(실측 2026-10-12): 이모지(서로게이트 쌍) 15개 = 30 → 통과, 16개 = 32 → 거절
  it('이모지는 UTF-16 길이로 센다: 15개 통과, 16개 오류', () => {
    expect(validatePetDraft({ ...ok, name: '😀'.repeat(15) }).name).toBeUndefined();
    expect(validatePetDraft({ ...ok, name: '😀'.repeat(16) }).name).toBe(PET_FORM_ERRORS.nameTooLong);
  });

  it('종류를 고르지 않으면 오류', () => {
    const errors = validatePetDraft({ ...ok, species: null });
    expect(errors).toEqual({ species: '개인지 고양이인지 골라 주세요.' });
    expect(hasPetFieldErrors(errors)).toBe(true);
  });

  it('둘 다 빠지면 두 오류', () => {
    expect(validatePetDraft(EMPTY_PET_DRAFT)).toEqual({
      name: PET_FORM_ERRORS.nameRequired,
      species: PET_FORM_ERRORS.speciesRequired,
    });
  });
});

describe('toPetInput', () => {
  it('이름·질환은 다듬고 해는 숫자로, 비면 null', () => {
    expect(toPetInput({ ...EMPTY_PET_DRAFT, name: ' 보리 ', species: 'cat', birthYear: '2015', conditions: ' 심장병 ' })).toEqual({
      name: '보리',
      species: 'cat',
      birthYear: 2015,
      conditions: '심장병',
    });
    expect(toPetInput({ ...ok, conditions: '   ' })).toEqual({
      name: '보리',
      species: 'dog',
      birthYear: null,
      conditions: null,
    });
  });

  it('종류가 없으면 null', () => {
    expect(toPetInput({ ...ok, species: null })).toBeNull();
  });
});

describe('birthYearOptions', () => {
  it('올해부터 1980년까지 내림차순', () => {
    const list = birthYearOptions(2026);
    expect(list[0]).toBe(2026);
    expect(list[list.length - 1]).toBe(1980);
    expect(list).toHaveLength(47);
    expect(list.every((y, i) => i === 0 || y === list[i - 1] - 1)).toBe(true);
  });
});

describe('isPetDraftDirty', () => {
  it('등록: 비어 있으면 아님, 무엇이든 입력하면 변경됨', () => {
    expect(isPetDraftDirty(EMPTY_PET_DRAFT, null)).toBe(false);
    expect(isPetDraftDirty({ ...EMPTY_PET_DRAFT, name: 'a' }, null)).toBe(true);
    expect(isPetDraftDirty({ ...EMPTY_PET_DRAFT, species: 'cat' }, null)).toBe(true);
    expect(isPetDraftDirty({ ...EMPTY_PET_DRAFT, birthYear: '2010' }, null)).toBe(true);
    expect(isPetDraftDirty({ ...EMPTY_PET_DRAFT, conditions: 'x' }, null)).toBe(true);
  });

  it('수정: 저장된 값과 같으면 아님, 하나라도 다르면 변경됨', () => {
    expect(isPetDraftDirty(draftFromPet(PET), PET)).toBe(false);
    expect(isPetDraftDirty({ ...draftFromPet(PET), name: '보리2' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), species: 'cat' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), birthYear: '' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), conditions: '' }, PET)).toBe(true);
  });
});

describe('toSingleLine · conditionsRemaining', () => {
  it('줄바꿈은 공백 하나로', () => {
    expect(toSingleLine('신부전\n심장병')).toBe('신부전 심장병');
    expect(toSingleLine('신부전 \r\n\r\n 심장병')).toBe('신부전 심장병');
    expect(toSingleLine('한 줄')).toBe('한 줄');
  });

  it('180자부터 남은 글자 수', () => {
    expect(conditionsRemaining('a'.repeat(179))).toBeNull();
    expect(conditionsRemaining('a'.repeat(180))).toBe(20);
    expect(conditionsRemaining('a'.repeat(200))).toBe(0);
  });
});

describe('classifyPetSaveError', () => {
  const http = (status: number, code: string | null) => new ApiError('http', status, code, 'x');

  it('수정 중 404 는 gone, 등록 중 404 는 일반 문구', () => {
    expect(classifyPetSaveError(http(404, 'NOT_FOUND'), false)).toEqual({ kind: 'gone' });
    expect(classifyPetSaveError(http(404, 'NOT_FOUND'), true).kind).toBe('message');
  });

  it('409 PET_LIMIT_REACHED 는 limit (등록·수정 모두)', () => {
    expect(classifyPetSaveError(http(409, 'PET_LIMIT_REACHED'), true)).toEqual({ kind: 'limit' });
    expect(classifyPetSaveError(http(409, 'PET_LIMIT_REACHED'), false)).toEqual({ kind: 'limit' });
  });

  it('400 은 pet 문맥 문구, 연결 실패는 공통 문구, 사진 문맥은 사진 문구', () => {
    expect(classifyPetSaveError(http(400, 'VALIDATION_ERROR'), true)).toEqual({
      kind: 'message',
      message: '입력한 내용을 확인해 주세요. 이름은 1~30자, 태어난 해와 날짜는 1980년 이후부터 오늘까지, 질환은 200자까지 적을 수 있어요.',
    });
    expect(classifyPetSaveError(new ApiError('network', 0, null, 'x'), false)).toEqual({
      kind: 'message',
      message: NETWORK_ERROR_MESSAGE,
    });
    expect(classifyPetSaveError(http(413, 'FILE_TOO_LARGE'), false, 'photo')).toEqual({
      kind: 'message',
      message: '사진이 너무 커요. 5MB 이하 사진을 골라 주세요.',
    });
  });

  it('ApiError 가 아니면 일반 문구', () => {
    expect(classifyPetSaveError(new Error('x'), true)).toEqual({
      kind: 'message',
      message: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    });
  });
});
