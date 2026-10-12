import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { json, PET } from '../testing/fixtures';
import { mockRouter, resetRouterMocks, state } from '../testing/mockRouter';
import { PetGate } from './PetGate';
import { PetProvider, usePet } from './PetProvider';
import { Text } from 'react-native';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

beforeEach(() => resetRouterMocks());

const ui = () => (
  <PetProvider>
    <PetGate>
      <Text>오늘 화면</Text>
    </PetGate>
  </PetProvider>
);

it('GET /pets 가 비어 있으면 시작 화면(등록하기)을 보여 주고, [다시 확인하기]를 누르면 다시 확인한다', async () => {
  const fetchMock = jest.fn(async () => json(200, []));
  global.fetch = fetchMock as never;
  await render(ui());
  await screen.findByText('함께 지내는 아이를 소개해 주세요');
  expect(screen.queryByText(/웹에서 반려동물을 먼저 등록해 주세요/)).toBeNull();
  fetchMock.mockImplementation(async () => json(200, [PET]));
  await fireEvent.press(screen.getByRole('button', { name: '다시 확인하기' }));
  await screen.findByText('오늘 화면');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('네트워크 오류면 연결 안내와 재시도 버튼', async () => {
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  }) as never;
  await render(ui());
  await screen.findByText(/서버에 연결할 수 없어요/);
  expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
});

it('정상이면 오늘 화면을 렌더한다', async () => {
  global.fetch = jest.fn(async () => json(200, [PET])) as never;
  await render(ui());
  await screen.findByText('오늘 화면');
});

it('이미 ready 일 때 reload 가 돌아도 오늘 화면을 언마운트하지 않는다(조용한 재확인)', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let calls = 0;
  global.fetch = jest.fn(async () => {
    calls += 1;
    if (calls > 1) await gate;
    return json(200, [PET]);
  }) as never;
  let reloadFn!: () => Promise<boolean>;
  function Grab() {
    reloadFn = usePet().reload;
    return <Text>오늘 화면</Text>;
  }
  await render(
    <PetProvider>
      <PetGate>
        <Grab />
      </PetGate>
    </PetProvider>,
  );
  await screen.findByText('오늘 화면');
  let p!: Promise<boolean>;
  await act(async () => {
    p = reloadFn();
  });
  expect(screen.getByText('오늘 화면')).toBeTruthy();
  expect(screen.queryByText('불러오는 중…')).toBeNull();
  await act(async () => {
    release();
    await p;
  });
  expect(screen.getByText('오늘 화면')).toBeTruthy();
});

it('반려동물을 불러오지 못한 안내 화면 제목은 화면마다 정할 수 있고(기본 "오늘"), 약 관리 버튼이 없다', async () => {
  global.fetch = jest.fn(async () => json(500, { code: 'INTERNAL', message: 'x' })) as never;
  const { unmount } = await render(
    <PetProvider>
      <PetGate title="먹이는 약">
        <Text>약 목록</Text>
      </PetGate>
    </PetProvider>,
  );
  await screen.findByRole('button', { name: '다시 불러오기' });
  expect(screen.getByText('먹이는 약')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '약 관리 · 알림 설정' })).toBeNull();
  await unmount();
  await render(ui());
  await screen.findByRole('button', { name: '다시 불러오기' });
  expect(screen.getByText('오늘')).toBeTruthy();
});

describe('반려동물이 없을 때 시작 화면', () => {
  it('어느 화면(title)에서든 같은 시작 화면: 제목·카드·[반려동물 등록하기]·웹 확인 줄·[계정]·[로그아웃], 알림 받기 카드와 약 관리 버튼은 없다', async () => {
    global.fetch = jest.fn(async () => json(200, [])) as never;
    await render(
      <PetProvider>
        <PetGate title="먹이는 약">
          <Text>약 목록</Text>
        </PetGate>
      </PetProvider>,
    );
    await screen.findByText('함께 지내는 아이를 소개해 주세요');
    expect(screen.getByText('시니어펫 노트')).toBeTruthy();
    expect(screen.queryByText('먹이는 약')).toBeNull();
    expect(screen.getByText('이름과 종류만 적어도 시작할 수 있어요.')).toBeTruthy();
    expect(screen.getByText('등록하고 나면 하루 기록과 약 체크를 시작할 수 있어요.')).toBeTruthy();
    expect(screen.getByText('한 계정에 한 마리까지 등록할 수 있어요.')).toBeTruthy();
    expect(screen.getByText('웹에서 이미 등록했나요?')).toBeTruthy();
    expect(screen.getByRole('button', { name: '계정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy();
    expect(screen.queryByText('투약 알림 받기')).toBeNull();
    expect(screen.queryByRole('button', { name: '약 관리 · 알림 설정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '반려동물 정보' })).toBeNull();
  });

  it('[반려동물 등록하기]는 /pet/new 로 간다', async () => {
    global.fetch = jest.fn(async () => json(200, [])) as never;
    await render(ui());
    await fireEvent.press(await screen.findByRole('button', { name: '반려동물 등록하기' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/pet/new');
  });

  it('수정 화면에서 정보가 사라져 돌아온 경우(petGone) 안내 카드를 보이고 파라미터를 지운다', async () => {
    global.fetch = jest.fn(async () => json(200, [])) as never;
    state.params = { notice: 'petGone' };
    await render(ui());
    await screen.findByText('등록된 반려동물 정보를 찾지 못했어요. 다시 등록해 주세요.');
    expect(mockRouter.setParams).toHaveBeenCalledWith({ notice: undefined });
    await fireEvent.press(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('등록된 반려동물 정보를 찾지 못했어요. 다시 등록해 주세요.')).toBeNull();
  });
});
