import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { json, PET } from '../testing/fixtures';
import { PetGate } from './PetGate';
import { PetProvider, usePet } from './PetProvider';
import { Text } from 'react-native';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

const ui = () => (
  <PetProvider>
    <PetGate>
      <Text>오늘 화면</Text>
    </PetGate>
  </PetProvider>
);

it('GET /pets 가 비어 있으면 웹 등록 안내와 [새로 확인]을 보여 주고, 누르면 다시 확인한다', async () => {
  const fetchMock = jest.fn(async () => json(200, []));
  global.fetch = fetchMock as never;
  await render(ui());
  await screen.findByText('웹에서 반려동물을 먼저 등록해 주세요');
  fetchMock.mockImplementation(async () => json(200, [PET]));
  await fireEvent.press(screen.getByRole('button', { name: '새로 확인' }));
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
  let reloadFn!: () => Promise<void>;
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
  let p!: Promise<void>;
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

it('안내 화면 제목을 화면마다 정할 수 있고(기본 "오늘"), 안내 화면에는 약 관리 버튼이 없다', async () => {
  global.fetch = jest.fn(async () => json(200, [])) as never;
  const { unmount } = await render(
    <PetProvider>
      <PetGate title="먹이는 약">
        <Text>약 목록</Text>
      </PetGate>
    </PetProvider>,
  );
  await screen.findByText('웹에서 반려동물을 먼저 등록해 주세요');
  expect(screen.getByText('먹이는 약')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '약 관리 · 알림 설정' })).toBeNull();
  await unmount();
  await render(ui());
  await screen.findByText('웹에서 반려동물을 먼저 등록해 주세요');
  expect(screen.getByText('오늘')).toBeTruthy();
});
