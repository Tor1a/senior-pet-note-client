import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { NETWORK_ERROR_MESSAGE } from '../lib/api';
import { pressTwiceInOneFrame } from '../testing/doublePress';
import { setFontScale } from '../testing/fontScale';
import { json, PET } from '../testing/fixtures';
import { mockRouter, resetRouterMocks, systemBack } from '../testing/mockRouter';
import { PetContext, type PetStatus } from './PetProvider';
import PetFormScreen from './PetFormScreen';
import type { Pet } from '../lib/petApi';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const reloadPet = jest.fn(async (_opts?: { keepOnError?: boolean }) => true);
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

async function renderForm(mode: 'new' | 'edit', opts: { from?: string; status?: PetStatus; pet?: Pet | null } = {}) {
  const status = opts.status ?? (mode === 'edit' ? 'ready' : 'none');
  const pet = opts.pet === undefined ? (mode === 'edit' ? PET : null) : opts.pet;
  await render(
    <PetContext.Provider value={{ status, pet, reload: reloadPet, setPet }}>
      <PetFormScreen mode={mode} from={opts.from} />
    </PetContext.Provider>,
  );
}

const SAVED: Pet = { ...PET, id: 'pet-9', name: '보리', species: 'cat', birthYear: 2015, conditions: '심장병' };
const saveNew = () => screen.getByRole('button', { name: '등록하기' });

async function fillNew(name = '보리', species = '개') {
  await fireEvent.changeText(screen.getByLabelText('이름'), name);
  await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${species},`) }));
}

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setPet.mockClear();
  setFontScale(1);
});

describe('반려동물 등록 폼', () => {
  it('제목·안내·필드·[등록하기]가 있고 종류는 아무것도 고르지 않은 상태이며 사진 언급이 없다', async () => {
    await renderForm('new');
    expect(screen.getByText('반려동물을 소개해 주세요')).toBeTruthy();
    expect(screen.getByText('이름과 종류만 적어도 시작할 수 있어요.')).toBeTruthy();
    expect(screen.getByText('← 이전으로')).toBeTruthy();
    expect(screen.getByLabelText('이름')).toBeTruthy();
    expect(screen.getByLabelText('종류').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByLabelText('종류').props.style.flexDirection).toBe('row');
    for (const r of within(screen.getByLabelText('종류')).getAllByRole('radio')) expect(r.props.accessibilityState.checked).toBe(false);
    expect(screen.getByText('선택 안 함')).toBeTruthy();
    expect(screen.getByLabelText('앓고 있는 질환 (선택)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '등록하기' })).toBeTruthy();
    expect(screen.queryByText(/사진/)).toBeNull();
  });

  it('종류 버튼은 "개, 2개 중 1번째" 처럼 읽히고, 고르면 ✓ 와 선택 상태가 된다', async () => {
    await renderForm('new');
    await fireEvent.press(screen.getByRole('radio', { name: '고양이, 2개 중 2번째' }));
    const cat = screen.getByRole('radio', { name: '고양이, 2개 중 2번째' });
    expect(cat.props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('✓ 고양이')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '개, 2개 중 1번째' }).props.accessibilityState.checked).toBe(false);
  });

  it('비워 두고 [등록하기]: 이름·종류 오류와 요약, 서버는 부르지 않는다', async () => {
    setup();
    await renderForm('new');
    await fireEvent.press(saveNew());
    expect(screen.getByText('! 이름을 적어 주세요.')).toBeTruthy();
    expect(screen.getByText('! 개인지 고양이인지 골라 주세요.')).toBeTruthy();
    expect(screen.getByText('빠진 곳이 있어요. 표시된 칸을 확인해 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('입력을 시작하면 그 칸의 오류는 지운다', async () => {
    setup();
    await renderForm('new');
    await fireEvent.press(saveNew());
    await fireEvent.changeText(screen.getByLabelText('이름'), '보');
    expect(screen.queryByText('! 이름을 적어 주세요.')).toBeNull();
    expect(screen.getByText('! 개인지 고양이인지 골라 주세요.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: '개, 2개 중 1번째' }));
    expect(screen.queryByText('! 개인지 고양이인지 골라 주세요.')).toBeNull();
  });

  it('이름이 30자를 넘으면(붙여넣기 등) 오류', async () => {
    setup();
    await renderForm('new');
    await fillNew('a'.repeat(31));
    await fireEvent.press(saveNew());
    expect(screen.getByText('! 이름은 30자까지 적을 수 있어요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('성공하면 다듬은 본문으로 POST 하고, setPet 후 오늘로 돌아가며 등록 안내 코드를 싣는다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fireEvent.changeText(screen.getByLabelText('이름'), '  보리 ');
    await fireEvent.press(screen.getByRole('radio', { name: '고양이, 2개 중 2번째' }));
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 선택 안 함' }));
    await fireEvent.press(screen.getByRole('radio', { name: '2015년' }));
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    await fireEvent.changeText(screen.getByLabelText('앓고 있는 질환 (선택)'), '  심장병 ');
    await fireEvent.press(saveNew());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(calls).toEqual([
      { url: '/api/pets', method: 'POST', body: { name: '보리', species: 'cat', birthYear: 2015, conditions: '심장병' } },
    ]);
    expect(setPet).toHaveBeenCalledWith(SAVED);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { notice: 'petCreated' } });
  });

  it('해·질환을 비우면 null 로 보낸다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fillNew('보리', '개');
    await fireEvent.changeText(screen.getByLabelText('앓고 있는 질환 (선택)'), '   ');
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ name: '보리', species: 'dog', birthYear: null, conditions: null });
  });

  it('저장 중에는 버튼이 "잠시만요…" 로 잠기고 같은 프레임 연타에도 요청은 한 번뿐이며 뒤로 버튼도 잠긴다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      'POST /api/pets': async () => {
        await gate;
        return json(201, SAVED);
      },
    });
    await renderForm('new');
    await fillNew();
    await pressTwiceInOneFrame(saveNew());
    await waitFor(() => expect(screen.getByRole('button', { name: '잠시만요…' }).props.accessibilityState.disabled).toBe(true));
    expect(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }).props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      release();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('서버 400 은 pet 문구로 알리고 입력값은 그대로, 이동하지 않으며 버튼이 다시 열린다', async () => {
    setup({ 'POST /api/pets': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await screen.findByText('입력한 내용을 확인해 주세요. 이름은 1~30자, 태어난 해와 날짜는 1980년 이후부터 오늘까지, 질환은 200자까지 적을 수 있어요.');
    expect(screen.getByLabelText('이름').props.value).toBe('보리');
    expect(screen.getByRole('button', { name: '등록하기' }).props.accessibilityState.disabled).toBe(false);
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(setPet).not.toHaveBeenCalled();
  });

  it('연결 실패는 연결 문구 + "입력한 내용은 그대로 있어요.", 같은 버튼으로 다시 시도하면 저장된다', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await screen.findByText(NETWORK_ERROR_MESSAGE);
    expect(screen.getByText('입력한 내용은 그대로 있어요.')).toBeTruthy();
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await fireEvent.press(saveNew());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
  });

  it('409 PET_LIMIT_REACHED: 반려동물을 다시 읽고 오늘로 가며 "이미 등록" 안내 코드를 싣는다', async () => {
    setup({ 'POST /api/pets': () => json(409, { code: 'PET_LIMIT_REACHED', message: 'x' }) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(reloadPet).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { notice: 'petLimit' } });
  });

  it('401 은 조용히 무시한다(로그인 화면은 AuthContext 가 처리)', async () => {
    setup({ 'POST /api/pets': () => json(401, { code: 'UNAUTHORIZED', message: 'x' }) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByText(/로그인이 만료/)).toBeNull();
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  it('이미 반려동물이 있는 상태로 열리면 오늘로 보낸다', async () => {
    await renderForm('new', { status: 'ready', pet: PET });
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });

  it('질환: 줄바꿈은 공백으로, 180자부터 남은 글자 수, 200자면 가득 안내', async () => {
    await renderForm('new');
    const input = screen.getByLabelText('앓고 있는 질환 (선택)');
    await fireEvent.changeText(input, '신부전\n심장병');
    expect(screen.getByLabelText('앓고 있는 질환 (선택)').props.value).toBe('신부전 심장병');
    expect(screen.queryByText(/남은 글자/)).toBeNull();
    await fireEvent.changeText(input, 'a'.repeat(180));
    expect(screen.getByText('남은 글자 20자')).toBeTruthy();
    await fireEvent.changeText(input, 'a'.repeat(200));
    expect(screen.getByText('질환은 200자까지 적을 수 있어요.')).toBeTruthy();
  });

  it('큰 글씨(1.3 이상)에서는 종류 버튼이 세로로 쌓이고 저장 버튼이 스크롤 맨 아래에 한 번 더 있다', async () => {
    setFontScale(1.5);
    await renderForm('new');
    expect(screen.getAllByRole('button', { name: '등록하기' })).toHaveLength(2);
    expect(screen.getByLabelText('종류').props.style.flexDirection).toBe('column');
  });
});

describe('태어난 해 시트', () => {
  it('열면 "모르거나 적지 않음"과 올해부터 1980년까지, 줄을 눌러도 [완료] 전에는 반영하지 않는다', async () => {
    await renderForm('new');
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 선택 안 함' }));
    const thisYear = new Date().getFullYear();
    expect(screen.getByRole('radio', { name: '모르거나 적지 않음' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('radio', { name: `${thisYear}년` })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '1980년' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: '2012년' }));
    expect(screen.getByRole('radio', { name: '2012년' }).props.accessibilityState.checked).toBe(true);
    expect(screen.queryByRole('button', { name: '태어난 해, 2012년' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    expect(screen.getByRole('button', { name: '태어난 해, 2012년' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: '2012년' })).toBeNull();
  });

  it('[취소]는 이전 값을 유지하고, 다시 열면 현재 값에서 시작한다. "모르거나 적지 않음"으로 되돌릴 수 있다', async () => {
    await renderForm('new');
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 선택 안 함' }));
    await fireEvent.press(screen.getByRole('radio', { name: '2010년' }));
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 2010년' }));
    await fireEvent.press(screen.getByRole('radio', { name: '2001년' }));
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '태어난 해, 2010년' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 2010년' }));
    expect(screen.getByRole('radio', { name: '2010년' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('radio', { name: '모르거나 적지 않음' }));
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    expect(screen.getByRole('button', { name: '태어난 해, 선택 안 함' })).toBeTruthy();
  });

  it('완료하면 접근성 안내로 "2012년으로 정했어요" 를 읽어 준다', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await renderForm('new');
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 선택 안 함' }));
    await fireEvent.press(screen.getByRole('radio', { name: '2012년' }));
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    expect(announce).toHaveBeenCalledWith('2012년으로 정했어요');
    announce.mockRestore();
  });
});

describe('이탈 확인', () => {
  it('입력이 없으면 [← 이전으로]가 바로 나간다', async () => {
    await renderForm('new');
    await fireEvent.press(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
  });

  it('입력이 있으면 확인 카드: [계속 고치기]는 머물고, [나가기]는 이어서 나간다', async () => {
    await renderForm('new');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보');
    await fireEvent.press(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
    expect(screen.getByText('적은 내용이 저장되지 않아요.')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: '계속 고치기' }));
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
    expect(screen.getByLabelText('이름').props.value).toBe('보');
    await fireEvent.press(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
    await fireEvent.press(screen.getByRole('button', { name: '나가기' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('시스템 뒤로·스와이프도 같은 확인을 거친다(입력이 있을 때만)', async () => {
    await renderForm('new');
    expect(systemBack()).toBe(false);
    await fireEvent.changeText(screen.getByLabelText('이름'), '보');
    let blocked = false;
    await act(async () => {
      blocked = systemBack();
    });
    expect(blocked).toBe(true);
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
  });

  it('저장 성공 뒤 이동은 확인을 거치지 않는다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
  });
});

describe('반려동물 수정 폼', () => {
  it('저장된 값이 채워져 있고 제목·버튼이 다르며 안내 문구 대신 사진 안내 한 줄이 있다', async () => {
    await renderForm('edit');
    expect(screen.getByText('반려동물 정보')).toBeTruthy();
    expect(screen.queryByText('이름과 종류만 적어도 시작할 수 있어요.')).toBeNull();
    expect(screen.getByLabelText('이름').props.value).toBe('보리');
    expect(screen.getByRole('radio', { name: '개, 2개 중 1번째' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('button', { name: '태어난 해, 2012년' })).toBeTruthy();
    expect(screen.getByLabelText('앓고 있는 질환 (선택)').props.value).toBe('신부전');
    expect(screen.getByRole('button', { name: '고친 내용 저장' })).toBeTruthy();
    expect(screen.getByText('사진은 지금은 웹에서만 바꿀 수 있어요.')).toBeTruthy();
  });

  it.each([
    [undefined, '← 오늘로', '/'],
    ['today', '← 오늘로', '/'],
    ['medications', '← 약 관리로', '/medications'],
    ['account', '← 계정으로', '/account'],
    ['엉뚱한값', '← 오늘로', '/'],
  ])('from=%s 면 맨 위 줄이 "%s", 저장하면 %s 로 돌아가며 수정 안내 코드를 싣는다', async (from, label, href) => {
    const updated: Pet = { ...PET, name: '보리2', species: 'cat', birthYear: null, conditions: null };
    setup({ 'PUT /api/pets/pet-1': () => json(200, updated) });
    await renderForm('edit', { from });
    expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리2');
    await fireEvent.press(screen.getByRole('radio', { name: '고양이, 2개 중 2번째' }));
    await fireEvent.press(screen.getByRole('button', { name: '태어난 해, 2012년' }));
    await fireEvent.press(screen.getByRole('radio', { name: '모르거나 적지 않음' }));
    await fireEvent.press(screen.getByRole('button', { name: '완료' }));
    await fireEvent.changeText(screen.getByLabelText('앓고 있는 질환 (선택)'), '');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(calls).toEqual([
      { url: '/api/pets/pet-1', method: 'PUT', body: { name: '보리2', species: 'cat', birthYear: null, conditions: null } },
    ]);
    expect(setPet).toHaveBeenCalledWith(updated);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: href, params: { notice: 'petUpdated' } });
  });

  it('고친 내용이 없으면 뒤로가 바로 들어왔던 화면으로, 있으면 확인 카드', async () => {
    await renderForm('edit', { from: 'account' });
    await fireEvent.press(screen.getByRole('button', { name: '계정 화면으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('고치다가 뒤로 가면 "저장하지 않고 나갈까요?"', async () => {
    await renderForm('edit');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리2');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
    // 원래 값으로 되돌리면 변경이 없는 것으로 본다
    await fireEvent.press(screen.getByRole('button', { name: '계속 고치기' }));
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('이름을 지우고 저장하면 오류, 서버를 부르지 않는다', async () => {
    setup();
    await renderForm('edit');
    await fireEvent.changeText(screen.getByLabelText('이름'), '');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    expect(screen.getByText('! 이름을 적어 주세요.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('PUT 404(정보가 없어짐): 다시 읽고 오늘(시작 화면)로 가며 안내 코드를 싣는다', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderForm('edit');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리2');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalled());
    expect(reloadPet).toHaveBeenCalledTimes(1);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { notice: 'petGone' } });
  });

  it('PUT 400 은 pet 문구, 입력값 유지', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    await renderForm('edit');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리2');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await screen.findByText(/입력한 내용을 확인해 주세요/);
    expect(screen.getByLabelText('이름').props.value).toBe('보리2');
  });
});

describe('등록 화면 직접 진입(콜드 스타트·딥링크)', () => {
  const withStatus = (status: PetStatus, pet: Pet | null) => (
    <PetContext.Provider value={{ status, pet, reload: reloadPet, setPet }}>
      <PetFormScreen mode="new" />
    </PetContext.Provider>
  );

  it('loading 이면 폼 대신 로딩을 보이고, ready(반려동물 있음)가 되면 폼을 그리지 않고 오늘로 보낸다', async () => {
    const view = await render(withStatus('loading', null));
    expect(screen.getByLabelText('불러오는 중')).toBeTruthy();
    expect(screen.queryByLabelText('이름')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    await view.rerender(withStatus('ready', PET));
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(screen.queryByLabelText('이름')).toBeNull();
  });

  it('loading 에서 none 으로 확정되면 폼을 보이고 이동하지 않는다', async () => {
    const view = await render(withStatus('loading', null));
    await view.rerender(withStatus('none', null));
    expect(screen.getByLabelText('이름')).toBeTruthy();
    expect(screen.queryByLabelText('불러오는 중')).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it.each(['offline', 'error'] as const)('loading 에서 %s 로 확정되어도 폼을 보인다', async (status) => {
    const view = await render(withStatus('loading', null));
    await view.rerender(withStatus(status, null));
    expect(screen.getByLabelText('이름')).toBeTruthy();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('폼이 뜬 뒤 재확인으로 잠깐 loading 이 되어도 입력한 폼을 없애지 않는다', async () => {
    const view = await render(withStatus('none', null));
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리');
    await view.rerender(withStatus('loading', null));
    expect(screen.getByLabelText('이름').props.value).toBe('보리');
  });

  it('등록에 성공해 ready 가 되어도 "이미 있음" replace 는 또 하지 않는다', async () => {
    setup({ 'POST /api/pets': () => json(201, SAVED) });
    const view = await render(withStatus('none', null));
    await fillNew();
    await fireEvent.press(saveNew());
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
    await view.rerender(withStatus('ready', SAVED));
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('저장 중 뒤로가기', () => {
  it('저장 중 시스템 뒤로·스와이프는 확인 카드 없이 막기만 한다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup({
      'POST /api/pets': async () => {
        await gate;
        return json(201, SAVED);
      },
    });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await waitFor(() => expect(screen.getByRole('button', { name: '잠시만요…' })).toBeTruthy());
    let blocked = false;
    await act(async () => {
      blocked = systemBack();
    });
    expect(blocked).toBe(true);
    expect(screen.queryByText('저장하지 않고 나갈까요?')).toBeNull();
    await act(async () => {
      release();
    });
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
  });

  it('저장이 끝난(실패한) 뒤에는 다시 평소 확인으로 돌아간다', async () => {
    setup({ 'POST /api/pets': () => json(400, { code: 'VALIDATION_ERROR', message: 'x' }) });
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await waitFor(() => expect(screen.getByRole('button', { name: '등록하기' }).props.accessibilityState.disabled).toBeFalsy());
    await act(async () => {
      systemBack();
    });
    expect(screen.getByText('저장하지 않고 나갈까요?')).toBeTruthy();
  });
});

describe('다시 읽기 실패 (409·404 뒤)', () => {
  it('수정 중 404 뒤 다시 읽기가 실패하면 이동하지 않고 폼에 머물며 오류와 [다시 시도]를 보이고, 성공하면 안내와 함께 이동한다', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    reloadPet.mockResolvedValueOnce(false);
    await renderForm('edit');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리2');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await screen.findByText('반려동물 정보를 다시 확인하지 못했어요.');
    expect(screen.getByText('입력한 내용은 그대로 있어요.')).toBeTruthy();
    expect(screen.getByLabelText('이름').props.value).toBe('보리2');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { notice: 'petGone' } }));
    expect(reloadPet).toHaveBeenCalledTimes(2);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1); // 다시 시도는 저장을 되풀이하지 않는다
  });

  it('등록 중 409 뒤 다시 읽기가 실패하면 폼에 머물고, 다시 시도가 성공하면 petLimit 안내와 함께 오늘로 간다', async () => {
    setup({ 'POST /api/pets': () => json(409, { code: 'PET_LIMIT_REACHED', message: 'x' }) });
    reloadPet.mockResolvedValueOnce(false);
    await renderForm('new');
    await fillNew();
    await fireEvent.press(saveNew());
    await screen.findByText('반려동물 정보를 다시 확인하지 못했어요.');
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    expect(screen.getByLabelText('이름').props.value).toBe('보리');
    await fireEvent.press(screen.getByRole('button', { name: '다시 시도' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith({ pathname: '/', params: { notice: 'petLimit' } }));
  });

  it('다시 읽기에 성공하면 이전처럼 한 번에 이동한다(오류 문구 없음)', async () => {
    setup({ 'PUT /api/pets/pet-1': () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderForm('edit');
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리2');
    await fireEvent.press(screen.getByRole('button', { name: '고친 내용 저장' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('반려동물 정보를 다시 확인하지 못했어요.')).toBeNull();
  });
});

describe('빠진 곳 요약', () => {
  it('칸별 오류를 모두 고치면 요약도 사라지고, 하나라도 남으면 유지된다', async () => {
    setup();
    await renderForm('new');
    await fireEvent.press(saveNew());
    const summary = '빠진 곳이 있어요. 표시된 칸을 확인해 주세요.';
    expect(screen.getByText(summary)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('이름'), '보리');
    expect(screen.getByText(summary)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: /^개,/ }));
    expect(screen.queryByText(summary)).toBeNull();
  });
});

describe('등록 안내 조사', () => {
  it('등록하면 받침에 맞는 조사를 쓴 안내 코드만 싣는다(문구는 오늘 화면이 이름으로 만든다)', () => {
    const { createdTitle } = require('./petText');
    expect(createdTitle('보리')).toBe('보리를 등록했어요.');
    expect(createdTitle('밤')).toBe('밤을 등록했어요.');
  });
});
