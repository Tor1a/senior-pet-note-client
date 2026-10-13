// QA: 반려동물 폼 로직 경계값 (이름 글자 수 기준은 서버와 같은 UTF-16 길이인지 실제 서버로 확인했다 — QA 보고서 참고)
import { ApiError, NETWORK_ERROR_MESSAGE } from './api';
import type { Pet } from './petApi';
import {
  birthYearOptions,
  classifyPetSaveError,
  conditionsRemaining,
  draftFromPet,
  EMPTY_PET_DRAFT,
  isPetDraftDirty,
  PET_CONDITIONS_MAX,
  PET_FORM_ERRORS,
  PET_MIN_YEAR,
  PET_NAME_MAX,
  toPetInput,
  toSingleLine,
  validatePetDraft,
  type PetDraft,
} from './petForm';

const d = (p: Partial<PetDraft> = {}): PetDraft => ({ ...EMPTY_PET_DRAFT, species: 'dog', ...p });
const PET: Pet = {
  id: 'p', name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전', hasPhoto: false, createdAt: '', updatedAt: '',
};

describe('이름 길이 경계', () => {
  it.each([
    [0, 'nameRequired'],
    [1, undefined],
    [30, undefined],
    [31, 'nameTooLong'],
  ] as const)('한글 %i자 → %s', (n, key) => {
    const errors = validatePetDraft(d({ name: '가'.repeat(n) }));
    expect(errors.name).toBe(key ? PET_FORM_ERRORS[key] : undefined);
  });

  it('공백만(스페이스·탭·전각 공백·줄바꿈)은 이름 없음', () => {
    for (const name of ['   ', '\t', '　　', '\n', '   ']) {
      expect(validatePetDraft(d({ name })).name).toBe(PET_FORM_ERRORS.nameRequired);
    }
  });

  it('앞뒤 공백은 세지 않고 보낼 때 잘린다(30자 + 공백 5개 통과, 31자 + 공백은 오류)', () => {
    expect(validatePetDraft(d({ name: `  ${'가'.repeat(30)}   ` })).name).toBeUndefined();
    expect(toPetInput(d({ name: `  ${'가'.repeat(30)}   ` }))?.name).toBe('가'.repeat(30));
    expect(validatePetDraft(d({ name: ` ${'가'.repeat(31)} ` })).name).toBe(PET_FORM_ERRORS.nameTooLong);
  });

  it('이름 가운데 공백은 그대로 둔다', () => {
    expect(toPetInput(d({ name: ' 보 리 ' }))?.name).toBe('보 리');
  });

  // 서버(실측 2026-10-12): 이모지(서로게이트 쌍) 15개 = UTF-16 30 → 200, 16개 = 32 → 400. 서버는 UTF-16 길이로 센다.
  it('이모지(서로게이트 쌍 = 2칸)는 UTF-16 길이로 센다: 15개 통과, 16개 오류 — 서버 기준과 같다', () => {
    expect(validatePetDraft(d({ name: '😀'.repeat(15) })).name).toBeUndefined();
    expect(validatePetDraft(d({ name: '😀'.repeat(16) })).name).toBe(PET_FORM_ERRORS.nameTooLong);
  });

  it('한글 29자 + 이모지 1개(UTF-16 31)는 오류, 한글 28자 + 이모지 1개(30)는 통과', () => {
    expect(validatePetDraft(d({ name: `${'가'.repeat(29)}😀` })).name).toBe(PET_FORM_ERRORS.nameTooLong);
    expect(validatePetDraft(d({ name: `${'가'.repeat(28)}😀` })).name).toBeUndefined();
  });

  it('결합 문자(e + U+0301)도 UTF-16 로 센다. 한글 NFD(자모 분해) 이름은 글자당 2~3칸(여기서는 보리 = 4칸)', () => {
    expect(validatePetDraft(d({ name: `${'가'.repeat(29)}é` })).name).toBe(PET_FORM_ERRORS.nameTooLong);
    const nfd = '보리'.normalize('NFD'); // 4칸
    expect(nfd.length).toBe(4);
    expect(validatePetDraft(d({ name: nfd.repeat(7) })).name).toBeUndefined(); // 28
    expect(validatePetDraft(d({ name: nfd.repeat(8) })).name).toBe(PET_FORM_ERRORS.nameTooLong); // 32
  });

  it('영문·숫자·기호', () => {
    expect(validatePetDraft(d({ name: 'a'.repeat(30) })).name).toBeUndefined();
    expect(validatePetDraft(d({ name: 'a'.repeat(31) })).name).toBe(PET_FORM_ERRORS.nameTooLong);
    expect(validatePetDraft(d({ name: '<b>%;--' })).name).toBeUndefined();
  });

  it('이름 안의 줄바꿈은 검증하지 않는다(입력칸이 한 줄)', () => {
    expect(validatePetDraft(d({ name: '보\n리' })).name).toBeUndefined();
  });
});

describe('종류', () => {
  it('고르지 않으면 오류 + toPetInput null', () => {
    const draft = d({ name: '보리', species: null });
    expect(validatePetDraft(draft).species).toBe(PET_FORM_ERRORS.speciesRequired);
    expect(toPetInput(draft)).toBeNull();
  });
  it('개·고양이 모두 통과', () => {
    expect(validatePetDraft(d({ name: 'a', species: 'cat' }))).toEqual({});
    expect(validatePetDraft(d({ name: 'a', species: 'dog' }))).toEqual({});
  });
});

describe('태어난 해', () => {
  it('목록 경계: 1980 이 마지막, 1979 는 없다. 올해가 첫 번째', () => {
    const list = birthYearOptions(2026);
    expect(list[0]).toBe(2026);
    expect(list.at(-1)).toBe(PET_MIN_YEAR);
    expect(list).not.toContain(1979);
    expect(list).not.toContain(2027);
    expect(list).toHaveLength(2026 - 1980 + 1);
  });
  it('올해가 1980 이면 1개, 1979 이하면 빈 목록(방어)', () => {
    expect(birthYearOptions(1980)).toEqual([1980]);
    expect(birthYearOptions(1979)).toEqual([]);
  });
  it('보낼 때: 1979·1980·올해·미래도 있는 그대로 숫자로 바뀐다(범위 검사는 시트 목록과 서버가 한다), 선택 안 함은 null', () => {
    expect(toPetInput(d({ name: 'a', birthYear: '1979' }))?.birthYear).toBe(1979);
    expect(toPetInput(d({ name: 'a', birthYear: '1980' }))?.birthYear).toBe(1980);
    expect(toPetInput(d({ name: 'a', birthYear: '2026' }))?.birthYear).toBe(2026);
    expect(toPetInput(d({ name: 'a', birthYear: '2999' }))?.birthYear).toBe(2999);
    expect(toPetInput(d({ name: 'a', birthYear: '' }))?.birthYear).toBeNull();
  });
  it('draftFromPet: 해가 null 이면 빈 글자, 0 이어도 빈 글자(falsy)', () => {
    expect(draftFromPet({ ...PET, birthYear: null }).birthYear).toBe('');
    expect(draftFromPet({ ...PET, birthYear: 0 }).birthYear).toBe('');
  });
});

describe('질환', () => {
  it('0자(빈) · 공백만 · 줄바꿈만 → null', () => {
    for (const conditions of ['', '   ', '\n', ' \n \t ']) {
      expect(toPetInput(d({ name: 'a', conditions }))?.conditions).toBeNull();
    }
  });
  it('앞뒤 공백은 잘리고 가운데는 그대로', () => {
    expect(toPetInput(d({ name: 'a', conditions: '  신부전, 심장병  ' }))?.conditions).toBe('신부전, 심장병');
  });
  it('200자까지 남은 글자 0, 201자는 음수(입력칸 maxLength 가 막지만 붙여넣기 방어용 값 확인)', () => {
    expect(PET_CONDITIONS_MAX).toBe(200);
    expect(conditionsRemaining('가'.repeat(200))).toBe(0);
    expect(conditionsRemaining('가'.repeat(201))).toBe(-1);
    expect(conditionsRemaining('가'.repeat(179))).toBeNull();
    expect(conditionsRemaining('가'.repeat(180))).toBe(20);
    expect(conditionsRemaining('')).toBeNull();
  });
  it('이모지는 UTF-16 로 센다(서버도 이모지 100개 = 200칸 통과, 101개 오류로 같은 기준이어야 한다)', () => {
    expect(conditionsRemaining('😀'.repeat(90))).toBe(20);
  });
  it('줄바꿈 변환: \\r\\n · \\n · \\r · 연속 줄바꿈 · 앞뒤 줄바꿈', () => {
    expect(toSingleLine('a\r\nb')).toBe('a b');
    expect(toSingleLine('a\nb')).toBe('a b');
    expect(toSingleLine('a\rb')).toBe('a b');
    expect(toSingleLine('a\n\n\nb')).toBe('a b');
    expect(toSingleLine('a  \n  b')).toBe('a b');
    expect(toSingleLine('\nab\n')).toBe(' ab ');
    expect(toSingleLine('한 줄')).toBe('한 줄');
    expect(toSingleLine('')).toBe('');
  });
  it('줄바꿈만 붙여 넣으면 공백 하나가 남지만 보낼 때는 null', () => {
    const text = toSingleLine('\n\n');
    expect(text).toBe(' ');
    expect(toPetInput(d({ name: 'a', conditions: text }))?.conditions).toBeNull();
  });
});

describe('변경 여부(isPetDraftDirty)', () => {
  it('등록: 공백 한 칸만 입력해도 변경됨(저장하지 않고 나가면 확인)', () => {
    expect(isPetDraftDirty(d({ species: null, name: ' ' }), null)).toBe(true);
  });
  it('등록: 종류만 골라도 변경됨, 해만 골라도 변경됨', () => {
    expect(isPetDraftDirty({ ...EMPTY_PET_DRAFT, species: 'cat' }, null)).toBe(true);
    expect(isPetDraftDirty({ ...EMPTY_PET_DRAFT, birthYear: '2000' }, null)).toBe(true);
  });
  it('수정: 값을 바꿨다가 되돌리면 변경 없음', () => {
    const base = draftFromPet(PET);
    expect(isPetDraftDirty({ ...base, name: '콩이' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...base, name: '보리' }, PET)).toBe(false);
  });
  it('수정: 앞뒤 공백만 덧붙여도 변경됨(저장하면 trim 된 같은 값이 가는 점은 알려진 동작)', () => {
    expect(isPetDraftDirty({ ...draftFromPet(PET), name: '보리 ' }, PET)).toBe(true);
  });
  it('수정: 질환이 null 인 저장값과 빈 칸은 같다. 해 null 과 빈 칸도 같다', () => {
    const p = { ...PET, conditions: null, birthYear: null };
    expect(isPetDraftDirty(draftFromPet(p), p)).toBe(false);
  });
  it('수정: 해를 지우면(선택 안 함) 변경됨, 질환을 지우면 변경됨', () => {
    expect(isPetDraftDirty({ ...draftFromPet(PET), birthYear: '' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), conditions: '' }, PET)).toBe(true);
  });
  it('수정: 종류를 바꿨다 되돌리면 변경 없음', () => {
    expect(isPetDraftDirty({ ...draftFromPet(PET), species: 'cat' }, PET)).toBe(true);
    expect(isPetDraftDirty({ ...draftFromPet(PET), species: 'dog' }, PET)).toBe(false);
  });
});

describe('classifyPetSaveError — 상태 코드별 분류', () => {
  const http = (status: number, code: string | null = null) => new ApiError('http', status, code, 'x');
  const net = new ApiError('network', 0, null, 'x');

  it('400 VALIDATION_ERROR → 메시지(입력 확인 안내, 1~30자·1980년·200자 언급)', () => {
    const r = classifyPetSaveError(http(400, 'VALIDATION_ERROR'), true);
    expect(r.kind).toBe('message');
    expect(r.kind === 'message' && r.message).toMatch(/1~30자.*1980년.*200자/);
  });
  it('401 → 메시지(만료 문구). 화면은 401 을 조용히 무시하므로 이 문구는 보이지 않는다', () => {
    const r = classifyPetSaveError(http(401, 'UNAUTHORIZED'), true);
    expect(r).toEqual({ kind: 'message', message: '로그인이 만료됐어요. 다시 로그인해 주세요.' });
  });
  it('404: 수정이면 gone, 등록이면 일반 메시지', () => {
    expect(classifyPetSaveError(http(404, 'NOT_FOUND'), false)).toEqual({ kind: 'gone' });
    expect(classifyPetSaveError(http(404, 'NOT_FOUND'), true).kind).toBe('message');
  });
  it('409 PET_LIMIT_REACHED → limit (등록·수정 모두)', () => {
    expect(classifyPetSaveError(http(409, 'PET_LIMIT_REACHED'), true)).toEqual({ kind: 'limit' });
    expect(classifyPetSaveError(http(409, 'PET_LIMIT_REACHED'), false)).toEqual({ kind: 'limit' });
  });
  it('code 없는 409 는 limit 아님(처리됨 안내)', () => {
    const r = classifyPetSaveError(http(409), true);
    expect(r.kind).toBe('message');
  });
  it('네트워크 오류 → 연결 안내 문구', () => {
    expect(classifyPetSaveError(net, true)).toEqual({ kind: 'message', message: NETWORK_ERROR_MESSAGE });
    expect(classifyPetSaveError(net, false)).toEqual({ kind: 'message', message: NETWORK_ERROR_MESSAGE });
  });
  it('500·502·503 → 서버 문제 안내', () => {
    for (const s of [500, 502, 503]) {
      const r = classifyPetSaveError(http(s), false);
      expect(r).toEqual({ kind: 'message', message: '서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.' });
    }
  });
  it('429 · 418 처럼 모르는 코드 → 일반 안내', () => {
    expect(classifyPetSaveError(http(418), true).kind).toBe('message');
  });
  it('Error · null · undefined · 문자열 → 일반 안내(던지지 않는다)', () => {
    for (const e of [new Error('x'), null, undefined, 'boom']) {
      expect(classifyPetSaveError(e, true)).toEqual({ kind: 'message', message: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.' });
    }
  });
});

describe('저장 본문 전체', () => {
  it('필수만: 해·질환 null', () => {
    expect(toPetInput(d({ name: ' 보리 ' }))).toEqual({ name: '보리', species: 'dog', birthYear: null, conditions: null });
  });
  it('전부 입력', () => {
    expect(toPetInput(d({ name: '보리', species: 'cat', birthYear: '2012', conditions: ' 신부전 ' }))).toEqual({
      name: '보리', species: 'cat', birthYear: 2012, conditions: '신부전',
    });
  });
});
