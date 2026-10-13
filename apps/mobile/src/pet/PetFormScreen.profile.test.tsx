// 온보딩 C단계: 유형 라디오 · 날짜 자세히 적기(생일 월·일, 입양일 연·월·일) — 모바일 PetFormScreen
// 기기 달력 날짜는 2026-10-13 으로 고정한다(Date 만 가짜로 바꾸고 타이머는 그대로 둔다).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as petForm from '../lib/petForm';
import { setFontScale } from '../testing/fontScale';
import { json, PET } from '../testing/fixtures';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from './PetProvider';
import PetFormScreen from './PetFormScreen';
import { findPetForbidden } from './petText';
import type { Pet } from '../lib/petApi';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const reloadPet = jest.fn(async () => true);
const setPet = jest.fn();
let calls: { url: string; method: string; body: any }[] = [];

function setup(routes: Record<string, () => Response | Promise<Response>> = {}) {
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace('http://test', '');
    const method = init?.method ?? 'GET';
    calls.push({ url: path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = routes[`${method} ${path}`];
    if (handler) return handler();
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

async function renderForm(mode: 'new' | 'edit', pet: Pet | null = mode === 'edit' ? PET : null) {
  await render(
    <PetContext.Provider value={{ status: mode === 'edit' ? 'ready' : 'none', pet, reload: reloadPet, setPet }}>
      <PetFormScreen mode={mode} />
    </PetContext.Provider>,
  );
}

const NOT_TIMERS = [
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'cancelIdleCallback', 'performance', 'hrtime',
] as const;

const SAVED: Pet = { ...PET, id: 'pet-9' };
const WITH_PROFILE: Pet = { ...PET, profileType: 'senior', birthDate: '2012-03-02', adoptedOn: '2014-05-06' };
const saveNew = () => screen.getByRole('button', { name: '등록하기' });
const saveEdit = () => screen.getByRole('button', { name: '고친 내용 저장' });
const toggle = () => screen.getByRole('button', { name: /^날짜 자세히 적기, 선택 항목/ });

async function pick(fieldName: string, optionName: string) {
  await fireEvent.press(screen.getByRole('button', { name: fieldName }));
  await fireEvent.press(screen.getByRole('radio', { name: optionName }));
  await fireEvent.press(screen.getByRole('button', { name: '완료' }));
}

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setPet.mockClear();
  setFontScale(1);
  jest.useFakeTimers({ now: new Date(2026, 9, 13, 12, 0, 0), doNotFake: [...NOT_TIMERS] });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// 시트가 닫힌 뒤 300ms 지연 포커스 타이머가 환경이 내려간 다음 돌지 않게 마지막에 한 번 기다린다
afterAll(() => new Promise<void>((resolve) => setTimeout(resolve, 400)));

describe('유형 선택', () => {
  it('"함께 지내는 상황 (선택)" 아래 라디오 3개, 기본은 "나중에 정할게요"이고 읽는 문장은 "N개 중 M번째"', async () => {
    await renderForm('new');
    expect(screen.getByText('함께 지내는 상황 (선택)')).toBeTruthy();
    const group = screen.getByLabelText('함께 지내는 상황');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: '처음 키워요, 3개 중 1번째' }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByRole('radio', { name: '나이 든 아이예요, 3개 중 2번째' }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByRole('radio', { name: '나중에 정할게요, 3개 중 3번째' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('✓ 나중에 정할게요')).toBeTruthy();
    expect(screen.getByText('화면에서 보이는 안내만 달라져요. 나이 기준은 없고, 언제든 바꿀 수 있어요.')).toBeTruthy();
  });

  it('아무것도 안 건드리고 등록하면 POST 본문에 새 키가 없다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리');
    await fireEvent.press(screen.getByRole('radio', { name: /^개,/ }));
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: null, conditions: null });
  });

  it('"처음 키워요"를 고르면 profileType 이 실려 가고 선택 표시(✓)가 따라온다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리');
    await fireEvent.press(screen.getByRole('radio', { name: /^개,/ }));
    await fireEvent.press(screen.getByRole('radio', { name: '처음 키워요, 3개 중 1번째' }));
    expect(screen.getByText('✓ 처음 키워요')).toBeTruthy();
    expect(screen.queryByText('✓ 나중에 정할게요')).toBeNull();
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.profileType).toBe('first_time');
  });

  it('기존 사용자(유형 없음): 수정 폼은 "나중에 정할게요"가 선택된 채 열리고, 그대로 저장하면 PUT 에 새 키가 없다', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(200, PET) });
    await renderForm('edit');
    expect(screen.getByRole('radio', { name: '나중에 정할게요, 3개 중 3번째' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전' });
  });

  it('저장된 유형을 "나중에 정할게요"로 바꾸면 profileType:null 만 더 간다', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(200, PET) });
    await renderForm('edit', WITH_PROFILE);
    expect(screen.getByRole('radio', { name: '나이 든 아이예요, 3개 중 2번째' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: '나중에 정할게요, 3개 중 3번째' }));
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전', profileType: null });
  });
});

describe('날짜 자세히 적기', () => {
  it('값이 없으면 접힌 채 열리고 안쪽 칸은 렌더되지 않는다(읽기 순서에서도 빠진다). 열고 닫아도 값은 남는다', async () => {
    await renderForm('new');
    expect(toggle().props.accessibilityState.expanded).toBe(false);
    expect(screen.getByText('날짜 자세히 적기 (선택)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '생일 월, 선택 안 함' })).toBeNull();
    await fireEvent.press(toggle());
    expect(toggle().props.accessibilityState.expanded).toBe(true);
    expect(screen.getByText('정확한 날짜를 모르면 비워 두어도 괜찮아요.')).toBeTruthy();
    expect(screen.getByText('생일 (선택)')).toBeTruthy();
    expect(screen.getByText('태어난 해는 위에서 고른 값을 써요.')).toBeTruthy();
    expect(screen.getByText('입양일 (선택)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '입양일 연도, 선택 안 함' }).props.accessibilityHint).toBe('누르면 고를 수 있어요');
    await pick('태어난 해, 선택 안 함', '2012년');
    await pick('생일 월, 선택 안 함', '10월');
    await fireEvent.press(toggle());
    expect(screen.queryByRole('button', { name: '생일 월, 10월' })).toBeNull(); // 접으면 칸이 사라진다
    await fireEvent.press(toggle());
    expect(screen.getByRole('button', { name: '생일 월, 10월' })).toBeTruthy();
  });

  it('저장된 날짜가 있으면 펼쳐진 채 열리고, 그대로 저장하면 날짜 키는 PUT 에 없다', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(200, WITH_PROFILE) });
    await renderForm('edit', WITH_PROFILE);
    expect(toggle().props.accessibilityState.expanded).toBe(true);
    expect(screen.getByRole('button', { name: '생일 월, 3월' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '생일 일, 2일' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '입양일 연도, 2014년' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '입양일 월, 5월' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '입양일 일, 6일' })).toBeTruthy();
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전' });
  });

  it('접힌 행의 읽는 문장은 "날짜 자세히 적기, 선택 항목" 뒤에 값 요약이 붙고, 접힌 때는 요약 줄이 보인다', async () => {
    await renderForm('edit', WITH_PROFILE);
    expect(toggle().props.accessibilityLabel).toBe('날짜 자세히 적기, 선택 항목, 생일 3월 2일 · 입양 2014년 5월 6일');
    expect(screen.queryByText('생일 3월 2일 · 입양 2014년 5월 6일')).toBeNull();
    await fireEvent.press(toggle());
    expect(screen.getByText('생일 3월 2일 · 입양 2014년 5월 6일')).toBeTruthy();
  });

  it('생일 월·일과 입양일을 고르면 birthDate·adoptedOn 이 실려 가고, 시트는 [완료]에서 반영·읽어 준다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await renderForm('new');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리');
    await fireEvent.press(screen.getByRole('radio', { name: /^개,/ }));
    await pick('태어난 해, 선택 안 함', '2012년');
    await fireEvent.press(toggle());
    await fireEvent.press(screen.getByRole('button', { name: '생일 월, 선택 안 함' }));
    await fireEvent.press(screen.getByRole('radio', { name: '3월' }));
    expect(screen.queryByRole('button', { name: '생일 월, 3월' })).toBeNull(); // [완료] 전에는 반영하지 않는다
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    expect(announce).toHaveBeenCalledWith('3월로 정했어요');
    await pick('생일 일, 선택 안 함', '2일');
    expect(announce).toHaveBeenCalledWith('2일로 정했어요');
    await pick('입양일 연도, 선택 안 함', '2014년');
    expect(announce).toHaveBeenCalledWith('2014년으로 정했어요');
    await pick('입양일 월, 선택 안 함', '5월');
    await pick('입양일 일, 선택 안 함', '6일');
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      name: '보리',
      species: 'dog',
      birthYear: 2012,
      conditions: null,
      birthDate: '2012-03-02',
      adoptedOn: '2014-05-06',
    });
  });

  it('시트를 "적지 않음"으로 비우면 저장된 날짜는 null 로 지워진다', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(200, PET) });
    await renderForm('edit', WITH_PROFILE);
    await pick('입양일 연도, 2014년', '적지 않음');
    await pick('입양일 월, 5월', '적지 않음');
    await pick('입양일 일, 6일', '적지 않음');
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: 2012, conditions: '신부전', adoptedOn: null });
  });

  it('일 목록은 고른 해·월의 말일까지다(2월은 윤년이면 29일). 입양일 연도 목록은 올해부터 1980년까지', async () => {
    await renderForm('new');
    await pick('태어난 해, 선택 안 함', '2024년');
    await fireEvent.press(toggle());
    await pick('생일 월, 선택 안 함', '2월');
    await fireEvent.press(screen.getByRole('button', { name: '생일 일, 선택 안 함' }));
    expect(screen.getByRole('radio', { name: '29일' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: '30일' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    await fireEvent.press(screen.getByRole('button', { name: '입양일 연도, 선택 안 함' }));
    expect(screen.getByRole('radio', { name: '2026년' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: '2027년' })).toBeNull();
    expect(screen.getByRole('radio', { name: '1980년' })).toBeTruthy();
  });

  it('태어난 해를 바꿔 2월 29일이 없는 날이 되면 일만 비우고 안내한다', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await renderForm('new');
    await pick('태어난 해, 선택 안 함', '2024년');
    await fireEvent.press(toggle());
    await pick('생일 월, 선택 안 함', '2월');
    await pick('생일 일, 선택 안 함', '29일');
    await pick('태어난 해, 2024년', '2023년');
    expect(screen.getByRole('button', { name: '생일 월, 2월' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '생일 일, 선택 안 함' })).toBeTruthy();
    expect(screen.getByText('고른 날짜가 없는 날이라 일을 비웠어요. 일을 다시 골라 주세요.')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('고른 날짜가 없는 날이라 일을 비웠어요. 일을 다시 골라 주세요.');
  });

  it('태어난 해를 "선택 안 함"으로 되돌리면 생일 월·일도 비우고 안내한다', async () => {
    await renderForm('new');
    await pick('태어난 해, 선택 안 함', '2012년');
    await fireEvent.press(toggle());
    await pick('생일 월, 선택 안 함', '3월');
    await pick('생일 일, 선택 안 함', '2일');
    await pick('태어난 해, 2012년', '모르거나 적지 않음');
    expect(screen.getByRole('button', { name: '생일 월, 선택 안 함' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '생일 일, 선택 안 함' })).toBeTruthy();
    expect(screen.getByText('태어난 해를 지워서 생일 월·일도 비웠어요.')).toBeTruthy();
  });
});

describe('저장 시 검사와 포커스', () => {
  it('접힌 채 저장해도 오류가 날짜 안에 있으면 펼치고 문구를 보여 주며 요청은 가지 않는다', async () => {
    setup();
    await renderForm('edit', { ...PET, profileType: null, birthDate: null, adoptedOn: null });
    await fireEvent.press(toggle()); // 열고
    await pick('입양일 연도, 선택 안 함', '2020년');
    await fireEvent.press(toggle()); // 접는다
    expect(screen.queryByRole('button', { name: '입양일 월, 선택 안 함' })).toBeNull();
    await fireEvent.press(saveEdit());
    expect(toggle().props.accessibilityState.expanded).toBe(true);
    expect(screen.getByText('! 입양일은 연도, 월, 일을 모두 골라 주세요. 모르면 비워 두어도 괜찮아요.')).toBeTruthy();
    expect(screen.getByText('빠진 곳이 있어요. 표시된 칸을 확인해 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('생일 월만 고르면 오류, 다시 고르면 그 오류가 사라진다', async () => {
    setup();
    await renderForm('edit');
    await fireEvent.press(toggle());
    await pick('생일 월, 선택 안 함', '3월');
    await fireEvent.press(saveEdit());
    expect(screen.getByText('! 생일은 월과 일을 함께 골라 주세요.')).toBeTruthy();
    await pick('생일 일, 선택 안 함', '2일');
    expect(screen.queryByText('! 생일은 월과 일을 함께 골라 주세요.')).toBeNull();
  });

  it('태어난 해 없이 생일 월·일만 있으면 안내 문구', async () => {
    setup();
    await renderForm('new');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리');
    await fireEvent.press(screen.getByRole('radio', { name: /^개,/ }));
    await fireEvent.press(toggle());
    await pick('생일 월, 선택 안 함', '3월');
    await pick('생일 일, 선택 안 함', '2일');
    await fireEvent.press(saveNew());
    expect(screen.getByText('! 생일의 월과 일을 적으려면 태어난 해를 먼저 골라 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('validatePetDraft 에 기기 달력 날짜를 명시해서 넘긴다(기본값에 맡기지 않는다)', async () => {
    setup();
    const spy = jest.spyOn(petForm, 'validatePetDraft');
    await renderForm('edit');
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toHaveLength(2);
    expect(spy.mock.calls[0][1]).toEqual({ year: 2026, month: 10, day: 13 });
  });

  it('오늘(2026-10-13)은 고를 수 있고 내일은 "미래 날짜는 고를 수 없어요."', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(200, PET) });
    await renderForm('edit');
    await fireEvent.press(toggle());
    await pick('입양일 연도, 선택 안 함', '2026년');
    await pick('입양일 월, 선택 안 함', '10월');
    await pick('입양일 일, 선택 안 함', '14일');
    await fireEvent.press(saveEdit());
    expect(screen.getByText('! 미래 날짜는 고를 수 없어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
    await pick('입양일 일, 14일', '13일');
    await fireEvent.press(saveEdit());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.adoptedOn).toBe('2026-10-13');
  });

  it('입양일이 생일보다 빠르면 오류', async () => {
    setup();
    await renderForm('edit');
    await fireEvent.press(toggle());
    await pick('생일 월, 선택 안 함', '3월');
    await pick('생일 일, 선택 안 함', '2일');
    await pick('입양일 연도, 선택 안 함', '2012년');
    await pick('입양일 월, 선택 안 함', '1월');
    await pick('입양일 일, 선택 안 함', '5일');
    await fireEvent.press(saveEdit());
    expect(screen.getByText('! 입양일이 생일보다 빠를 수 없어요.')).toBeTruthy();
  });

  it('생일 칸을 바꾸면 낡은 "입양일이 생일보다 빠를 수 없어요" 오류도 지운다', async () => {
    setup();
    await renderForm('edit');
    await fireEvent.press(toggle());
    await pick('생일 월, 선택 안 함', '3월');
    await pick('생일 일, 선택 안 함', '2일');
    await pick('입양일 연도, 선택 안 함', '2012년');
    await pick('입양일 월, 선택 안 함', '1월');
    await pick('입양일 일, 선택 안 함', '5일');
    await fireEvent.press(saveEdit());
    expect(screen.getByText('! 입양일이 생일보다 빠를 수 없어요.')).toBeTruthy();
    await pick('생일 일, 2일', '1일');
    expect(screen.queryByText('! 입양일이 생일보다 빠를 수 없어요.')).toBeNull();
  });

  it('이름 오류가 있으면 이름이 먼저다(날짜 접힘을 펼치지 않는다)', async () => {
    setup();
    await renderForm('new');
    await fireEvent.press(saveNew());
    expect(screen.getByText('! 이름을 적어 주세요.')).toBeTruthy();
    expect(toggle().props.accessibilityState.expanded).toBe(false);
  });
});

describe('나가기 확인과 글자 확대', () => {
  it('유형만 바꿔도 뒤로 가면 확인 카드가 뜬다', async () => {
    await renderForm('edit');
    await fireEvent.press(screen.getByRole('radio', { name: '처음 키워요, 3개 중 1번째' }));
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
  });

  it('날짜 칸을 고치고 뒤로 가면 확인 카드, 열었다 닫기만 했으면 바로 나간다', async () => {
    await renderForm('edit');
    await fireEvent.press(toggle());
    await fireEvent.press(toggle());
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('날짜를 고르고 뒤로 가면 확인 카드, 원래 값으로 되돌리면 변경 없음', async () => {
    await renderForm('edit', WITH_PROFILE);
    await pick('입양일 일, 6일', '7일');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '계속 고치기' }));
    await pick('입양일 일, 7일', '6일');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
  });

  it('글자 100%: 월·일(2칸), 연·월·일(3칸)은 가로 배치. 글자 확대(1.3 이상)에서는 세로로 쌓는다', async () => {
    await renderForm('new');
    await fireEvent.press(toggle());
    expect(screen.getByTestId('birth-row').props.style.flexDirection).toBe('row');
    expect(screen.getByTestId('adopted-row').props.style.flexDirection).toBe('row');
  });

  it('글자 배율 1.29 는 가로 배치', async () => {
    setFontScale(1.29);
    await renderForm('edit', WITH_PROFILE);
    expect(screen.getByTestId('birth-row').props.style.flexDirection).toBe('row');
  });

  it('글자 배율 1.3 부터 세로 배치(경계값)', async () => {
    setFontScale(1.3);
    await renderForm('edit', WITH_PROFILE);
    expect(screen.getByTestId('birth-row').props.style.flexDirection).toBe('column');
  });

  it('글자 200%: 새로 연 화면은 세로 배치', async () => {
    setFontScale(2);
    await renderForm('edit', WITH_PROFILE);
    expect(screen.getByTestId('birth-row').props.style.flexDirection).toBe('column');
    expect(screen.getByTestId('adopted-row').props.style.flexDirection).toBe('column');
  });
});

describe('문구', () => {
  it('새 문구와 접근성 라벨에 금지어가 없다', () => {
    expect(findPetForbidden()).toBeNull();
  });
});
