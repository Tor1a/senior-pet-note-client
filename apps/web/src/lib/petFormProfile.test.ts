import { describe, expect, it } from 'vitest';
import type { Pet } from './petApi';
import {
  changeAdoptedPart,
  changeBirthPart,
  changeBirthYear,
  draftFromPet,
  EMPTY_PET_DRAFT,
  hasDateValues,
  isPetDraftDirty,
  toPetInput,
  validatePetDraft,
  type PetDraft,
} from './petForm';
import { PET_PROFILE_TEXT as PT } from './petProfileText';

const TODAY = { year: 2026, month: 10, day: 13 };
const PET: Pet = {
  id: 'pet-1',
  name: '초코',
  species: 'dog',
  birthYear: 2015,
  conditions: null,
  hasPhoto: false,
  profileType: 'first_time',
  birthDate: '2015-03-02',
  adoptedOn: '2016-01-10',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};
const OLD_PET: Pet = { ...PET, profileType: null, birthDate: null, adoptedOn: null };
const base: PetDraft = { ...EMPTY_PET_DRAFT, name: '보리', species: 'dog' };
const errorsOf = (d: Partial<PetDraft>) => validatePetDraft({ ...base, ...d }, TODAY);

describe('draftFromPet — 새 필드', () => {
  it('저장된 유형·생일·입양일을 칸으로 나눈다(0 없이)', () => {
    expect(draftFromPet(PET)).toMatchObject({
      profileType: 'first_time',
      birthYear: '2015',
      birthMonth: '3',
      birthDay: '2',
      adoptedYear: '2016',
      adoptedMonth: '1',
      adoptedDay: '10',
    });
  });
  it('옛 서버 응답(키 없음)·null 은 모두 빈 칸', () => {
    const legacy = { ...OLD_PET } as Partial<Pet>;
    delete legacy.profileType;
    delete legacy.birthDate;
    delete legacy.adoptedOn;
    for (const p of [OLD_PET, legacy as Pet]) {
      expect(draftFromPet(p)).toMatchObject({ profileType: null, birthMonth: '', birthDay: '', adoptedYear: '', adoptedMonth: '', adoptedDay: '' });
    }
    expect(hasDateValues(draftFromPet(OLD_PET))).toBe(false);
    expect(hasDateValues(draftFromPet(PET))).toBe(true);
  });
});

describe('validatePetDraft — 날짜', () => {
  it('아무것도 안 고르면 오류 없음', () => {
    expect(errorsOf({})).toEqual({});
  });
  it('생일: 월만/일만 → 함께 골라 주세요, 연도 없음 → 먼저 고르기, 미래 불가, 오늘은 가능', () => {
    expect(errorsOf({ birthYear: '2015', birthMonth: '3' }).birth).toBe(PT.errBirthPartial);
    expect(errorsOf({ birthYear: '2015', birthDay: '3' }).birth).toBe(PT.errBirthPartial);
    expect(errorsOf({ birthMonth: '3', birthDay: '2' }).birth).toBe(PT.errBirthNeedsYear);
    expect(errorsOf({ birthYear: '2026', birthMonth: '10', birthDay: '14' }).birth).toBe(PT.errFuture);
    expect(errorsOf({ birthYear: '2026', birthMonth: '10', birthDay: '13' }).birth).toBeUndefined();
    expect(errorsOf({ birthYear: '2026', birthMonth: '11', birthDay: '1' }).birth).toBe(PT.errFuture);
  });
  it('생일: 없는 날짜(2/30, 비윤년 2/29)', () => {
    expect(errorsOf({ birthYear: '2025', birthMonth: '2', birthDay: '30' }).birth).toBe(PT.errNoSuchDate);
    expect(errorsOf({ birthYear: '2023', birthMonth: '2', birthDay: '29' }).birth).toBe(PT.errNoSuchDate);
    expect(errorsOf({ birthYear: '2024', birthMonth: '2', birthDay: '29' }).birth).toBeUndefined();
  });
  it('입양일: 일부만 → 오류, 모두 비움 → 오류 아님, 미래 불가, 없는 날짜', () => {
    expect(errorsOf({ adoptedYear: '2020' }).adopted).toBe(PT.errAdoptPartial);
    expect(errorsOf({ adoptedYear: '2020', adoptedMonth: '5' }).adopted).toBe(PT.errAdoptPartial);
    expect(errorsOf({ adoptedMonth: '5', adoptedDay: '5' }).adopted).toBe(PT.errAdoptPartial);
    expect(errorsOf({ adoptedYear: '', adoptedMonth: '', adoptedDay: '' }).adopted).toBeUndefined();
    expect(errorsOf({ adoptedYear: '2026', adoptedMonth: '10', adoptedDay: '14' }).adopted).toBe(PT.errFuture);
    expect(errorsOf({ adoptedYear: '2026', adoptedMonth: '10', adoptedDay: '13' }).adopted).toBeUndefined();
    expect(errorsOf({ adoptedYear: '2025', adoptedMonth: '2', adoptedDay: '30' }).adopted).toBe(PT.errNoSuchDate);
  });
  it('입양일 < 생일은 오류, 같은 날은 허용, 생일이 전체 날짜가 아니면 비교하지 않는다', () => {
    const birth = { birthYear: '2015', birthMonth: '3', birthDay: '2' };
    expect(errorsOf({ ...birth, adoptedYear: '2015', adoptedMonth: '3', adoptedDay: '1' }).adopted).toBe(PT.errAdoptBeforeBirth);
    expect(errorsOf({ ...birth, adoptedYear: '2015', adoptedMonth: '3', adoptedDay: '2' }).adopted).toBeUndefined();
    expect(errorsOf({ birthYear: '2015', adoptedYear: '2010', adoptedMonth: '1', adoptedDay: '1' }).adopted).toBeUndefined();
  });
  it('입양일 연도가 태어난 해보다 이르고 생일 월·일이 없으면 막지 않는다(서버와 동일)', () => {
    expect(errorsOf({ birthYear: '2012', adoptedYear: '2010', adoptedMonth: '5', adoptedDay: '5' })).toEqual({});
  });
  it('이름·종류 오류와 날짜 오류가 함께 나온다', () => {
    const e = validatePetDraft({ ...EMPTY_PET_DRAFT, adoptedYear: '2020' }, TODAY);
    expect(Object.keys(e).sort()).toEqual(['adopted', 'name', 'species']);
  });
});

describe('칸끼리 연동', () => {
  const d = (x: Partial<PetDraft>): PetDraft => ({ ...base, ...x });
  it('태어난 해를 바꿔 2/29 가 사라지면 일만 비우고 알린다', () => {
    const r = changeBirthYear(d({ birthYear: '2024', birthMonth: '2', birthDay: '29' }), '2023');
    expect(r.draft).toMatchObject({ birthYear: '2023', birthMonth: '2', birthDay: '' });
    expect(r.notice).toBe('dayCleared');
  });
  it('태어난 해를 바꿔도 있는 날이면 월·일 유지, 안내 없음', () => {
    const r = changeBirthYear(d({ birthYear: '2024', birthMonth: '2', birthDay: '28' }), '2023');
    expect(r.draft).toMatchObject({ birthMonth: '2', birthDay: '28' });
    expect(r.notice).toBeNull();
  });
  it('태어난 해를 지우면 월·일도 비우고 알린다. 월·일이 없었으면 안내 없음', () => {
    const r = changeBirthYear(d({ birthYear: '2024', birthMonth: '2', birthDay: '29' }), '');
    expect(r.draft).toMatchObject({ birthYear: '', birthMonth: '', birthDay: '' });
    expect(r.notice).toBe('birthCleared');
    expect(changeBirthYear(d({ birthYear: '2024' }), '').notice).toBeNull();
  });
  it('월을 바꿔 일이 말일을 넘으면 일만 비운다(생일·입양일 모두)', () => {
    const b = changeBirthPart(d({ birthYear: '2025', birthMonth: '1', birthDay: '31' }), 'birthMonth', '4');
    expect(b.draft.birthDay).toBe('');
    expect(b.notice).toBe('dayCleared');
    const a = changeAdoptedPart(d({ adoptedYear: '2025', adoptedMonth: '1', adoptedDay: '31' }), 'adoptedMonth', '2');
    expect(a.draft.adoptedDay).toBe('');
    const y = changeAdoptedPart(d({ adoptedYear: '2024', adoptedMonth: '2', adoptedDay: '29' }), 'adoptedYear', '2023');
    expect(y.draft.adoptedDay).toBe('');
    expect(changeAdoptedPart(d({ adoptedYear: '2024', adoptedMonth: '2', adoptedDay: '29' }), 'adoptedDay', '1').notice).toBeNull();
  });
});

describe('toPetInput — 바꾼 것만 보낸다', () => {
  it('등록: 안 건드리면 새 키 없음(키 자체가 없다)', () => {
    const body = toPetInput(base)!;
    expect(Object.keys(body).sort()).toEqual(['birthYear', 'conditions', 'name', 'species']);
  });
  it('등록: 유형·생일·입양일을 고르면 계약 모양 그대로', () => {
    expect(
      toPetInput({
        ...base,
        birthYear: '2015',
        profileType: 'first_time',
        birthMonth: '3',
        birthDay: '2',
        adoptedYear: '2016',
        adoptedMonth: '1',
        adoptedDay: '10',
      }),
    ).toEqual({
      name: '보리',
      species: 'dog',
      birthYear: 2015,
      conditions: null,
      profileType: 'first_time',
      birthDate: '2015-03-02',
      adoptedOn: '2016-01-10',
    });
  });
  it('등록: 연도만 알면 birthYear 만(birthDate 키 없음)', () => {
    const body = toPetInput({ ...base, birthYear: '2015' })!;
    expect('birthDate' in body).toBe(false);
    expect(body.birthYear).toBe(2015);
  });
  it('수정: 기존 사용자(전부 null)가 아무것도 안 바꾸면 본문은 옛 4개 키 그대로', () => {
    const body = toPetInput(draftFromPet(OLD_PET), OLD_PET)!;
    expect(Object.keys(body).sort()).toEqual(['birthYear', 'conditions', 'name', 'species']);
  });
  it('수정: 값이 있는 pet 도 안 바꾸면 새 키 없음(접힘 여부와 무관)', () => {
    const body = toPetInput(draftFromPet(PET), PET)!;
    expect(Object.keys(body).sort()).toEqual(['birthYear', 'conditions', 'name', 'species']);
  });
  it('수정: 지울 때만 null 을 명시한다', () => {
    const body = toPetInput(
      { ...draftFromPet(PET), profileType: null, birthMonth: '', birthDay: '', adoptedYear: '', adoptedMonth: '', adoptedDay: '' },
      PET,
    )!;
    expect(body).toMatchObject({ birthYear: 2015, profileType: null, birthDate: null, adoptedOn: null });
  });
  it('수정: 유형만 바꾸면 profileType 만 추가', () => {
    const body = toPetInput({ ...draftFromPet(OLD_PET), profileType: 'senior' }, OLD_PET)!;
    expect(Object.keys(body).sort()).toEqual(['birthYear', 'conditions', 'name', 'profileType', 'species']);
    expect(body.profileType).toBe('senior');
  });
  it('수정: 태어난 해만 바꾸고 월·일을 유지하면 새 birthDate 를 함께 보낸다', () => {
    const body = toPetInput(changeBirthYear(draftFromPet(PET), '2016').draft, PET)!;
    expect(body).toMatchObject({ birthYear: 2016, birthDate: '2016-03-02' });
    expect('adoptedOn' in body).toBe(false);
  });
  it('수정: 2/29 생일에서 비윤년으로 바꾸면 birthDate:null', () => {
    const leap: Pet = { ...PET, birthYear: 2024, birthDate: '2024-02-29' };
    const body = toPetInput(changeBirthYear(draftFromPet(leap), '2023').draft, leap)!;
    expect(body).toMatchObject({ birthYear: 2023, birthDate: null });
  });
  it('수정: 태어난 해를 지우면 birthYear:null, birthDate:null', () => {
    const body = toPetInput(changeBirthYear(draftFromPet(PET), '').draft, PET)!;
    expect(body).toMatchObject({ birthYear: null, birthDate: null });
  });
  it('수정: 옛 서버 응답(키 없음)에서 안 바꾸면 새 키 없음', () => {
    const legacy = { ...OLD_PET } as Partial<Pet>;
    delete legacy.profileType;
    delete legacy.birthDate;
    delete legacy.adoptedOn;
    const body = toPetInput(draftFromPet(legacy as Pet), legacy as Pet)!;
    expect(Object.keys(body)).toHaveLength(4);
  });
});

describe('isPetDraftDirty — 새 필드', () => {
  it('유형·월·일·입양일이 달라지면 변경됨, 같으면 아님(접힘은 draft 에 없다)', () => {
    expect(isPetDraftDirty(draftFromPet(PET), PET)).toBe(false);
    expect(isPetDraftDirty({ ...draftFromPet(PET), profileType: 'senior' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), birthMonth: '4' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), birthDay: '' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), adoptedYear: '2017' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), adoptedMonth: '' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), adoptedDay: '11' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...EMPTY_PET_DRAFT, profileType: 'first_time' }, null)).toBe(true);
  });
});
