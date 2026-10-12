// QA: PetProvider 상태 전이·계정 전환, PetGate 분기, 새 문구(소스에 직접 적힌 것 포함) 금지어 검사
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Text } from 'react-native';
import { findForbidden } from '../lib/historyText';
import { json, PET } from '../testing/fixtures';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import { PetGate } from './PetGate';
import { PetProvider, usePet } from './PetProvider';
import { findPetForbidden } from './petText';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

beforeEach(() => resetRouterMocks());

function Probe() {
  const { status, pet, setPet, reload } = usePet();
  return (
    <>
      <Text testID="state">{`${status}|${pet?.name ?? '-'}`}</Text>
      <Text onPress={() => setPet({ ...PET, name: '새아이' })}>setPet</Text>
      <Text onPress={() => void reload()}>reload</Text>
    </>
  );
}
const state = () => screen.getByTestId('state').props.children;

describe('PetProvider 상태', () => {
  it('목록이 비면 none, 있으면 ready(첫 번째), 2마리여도 첫 번째만 쓴다', async () => {
    global.fetch = jest.fn(async () => json(200, [PET, { ...PET, id: 'p2', name: '둘째' }])) as never;
    await render(<PetProvider><Probe /></PetProvider>);
    await waitFor(() => expect(state()).toBe('ready|보리'));
  });

  it('none → setPet 하면 서버를 다시 부르지 않고 ready', async () => {
    const f = jest.fn(async () => json(200, []));
    global.fetch = f as never;
    await render(<PetProvider><Probe /></PetProvider>);
    await waitFor(() => expect(state()).toBe('none|-'));
    await fireEvent.press(screen.getByText('setPet'));
    expect(state()).toBe('ready|새아이');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류는 offline, 500·401 은 error', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await render(<PetProvider><Probe /></PetProvider>);
    await waitFor(() => expect(state()).toBe('offline|-'));
    global.fetch = jest.fn(async () => json(500, { code: 'X', message: 'x' })) as never;
    await fireEvent.press(screen.getByText('reload'));
    await waitFor(() => expect(state()).toBe('error|-'));
    global.fetch = jest.fn(async () => json(401, { code: 'UNAUTHORIZED', message: 'x' })) as never;
    await fireEvent.press(screen.getByText('reload'));
    await waitFor(() => expect(state()).toBe('error|-'));
  });

  it('ready 에서 reload 가 정보 없음([])을 받으면 none 으로 바뀌고 이름이 사라진다(수정 중 404 이후 흐름)', async () => {
    const f = jest.fn(async () => json(200, [PET]));
    global.fetch = f as never;
    await render(<PetProvider><Probe /></PetProvider>);
    await waitFor(() => expect(state()).toBe('ready|보리'));
    f.mockImplementation(async () => json(200, []));
    await fireEvent.press(screen.getByText('reload'));
    await waitFor(() => expect(state()).toBe('none|-'));
  });

  it('로그아웃(Provider 제거) 뒤 다른 계정으로 로그인하면 이전 반려동물 이름이 남지 않는다', async () => {
    function App({ user }: { user: 'a' | 'b' | null }) {
      // _layout 과 같은 구조: 로그인한 동안에만 PetProvider
      return user ? <PetProvider key={user}><Probe /></PetProvider> : <Text testID="login">로그인</Text>;
    }
    const f = jest.fn(async () => json(200, [PET]));
    global.fetch = f as never;
    const view = await render(<App user="a" />);
    await waitFor(() => expect(state()).toBe('ready|보리'));
    await view.rerender(<App user={null} />);
    expect(screen.queryByTestId('state')).toBeNull();
    f.mockImplementation(async () => json(200, []));
    await view.rerender(<App user="b" />);
    // 이전 계정의 이름이 남지 않는다
    expect(state()).not.toContain('보리');
    await waitFor(() => expect(state()).toBe('none|-'));
  });

  it('같은 구조로 로그아웃 후 같은 계정이 다시 로그인해도 loading 부터 다시 확인한다', async () => {
    function App({ on }: { on: boolean }) {
      return on ? <PetProvider><Probe /></PetProvider> : null;
    }
    const f = jest.fn(async () => json(200, [PET]));
    global.fetch = f as never;
    const view = await render(<App on />);
    await waitFor(() => expect(state()).toBe('ready|보리'));
    await view.rerender(<App on={false} />);
    await view.rerender(<App on />);
    await waitFor(() => expect(state()).toBe('ready|보리'));
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('PetGate 분기', () => {
  const gate = () => (
    <PetProvider>
      <PetGate>
        <Text>오늘 화면</Text>
      </PetGate>
    </PetProvider>
  );

  it('반려동물 없음 → 시작 화면(오늘 화면 없음)', async () => {
    global.fetch = jest.fn(async () => json(200, [])) as never;
    await render(gate());
    await screen.findByText('함께 지내는 아이를 소개해 주세요');
    expect(screen.queryByText('오늘 화면')).toBeNull();
  });

  it('반려동물 있음 → 오늘 화면(시작 화면 없음)', async () => {
    global.fetch = jest.fn(async () => json(200, [PET])) as never;
    await render(gate());
    await screen.findByText('오늘 화면');
    expect(screen.queryByText('함께 지내는 아이를 소개해 주세요')).toBeNull();
  });

  it('불러오는 동안에는 시작 화면이 깜빡이지 않는다(loading)', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    global.fetch = jest.fn(async () => {
      await hold;
      return json(200, [PET]);
    }) as never;
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(gate());
    });
    expect(screen.queryByText('함께 지내는 아이를 소개해 주세요')).toBeNull();
    expect(screen.getByLabelText('불러오는 중')).toBeTruthy();
    await act(async () => release());
    await screen.findByText('오늘 화면');
    void view;
  });

  it('500 오류: 시작 화면이 아니라 "불러오지 못했어요" 안내(등록 버튼 없음)', async () => {
    global.fetch = jest.fn(async () => json(500, { code: 'X', message: 'x' })) as never;
    await render(gate());
    await screen.findByText('반려동물 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    expect(screen.queryByRole('button', { name: '반려동물 등록하기' })).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});

describe('금지어 — 새 문구 전부', () => {
  it('findPetForbidden 은 PET_TEXT·검증 오류·조립 함수 문구를 검사한다(깨끗함)', () => {
    expect(findPetForbidden()).toBeNull();
  });

  it('이름이 들어가는 문구 조립에 금지어가 들어가는 이름을 넣어도 앱 문구 자체는 깨끗하다(이름은 사용자 입력이라 검사 대상 아님)', () => {
    const { createdTitle } = require('./petText');
    expect(createdTitle('정상')).toContain('정상'); // 사용자 입력 그대로: 검사 대상에서 제외한다는 점의 확인
    expect(findForbidden('이름이 정상이에요')).not.toBeNull();
  });

  // 소스에 직접 적힌 한글 문구(상수 밖)도 놓치지 않도록 새 화면 파일의 한글 조각을 모두 검사한다
  const ROOT = join(__dirname, '..');
  const FILES = [
    ...readdirSync(__dirname).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f)).map((f) => join(__dirname, f)),
    join(ROOT, 'lib/petForm.ts'),
    join(ROOT, 'today/sections/DeviceFooter.tsx'),
    join(ROOT, 'today/sections/TodayHeader.tsx'),
    join(ROOT, 'account/AccountScreen.tsx'),
    join(ROOT, 'medications/MedicationsScreen.tsx'),
  ];
  function koreanPieces(src: string): string[] {
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/\s.*$/, ''))
      .join('\n');
    return code.match(/[가-힣][^'"`<>{}\n]*/g) ?? [];
  }

  it('새 화면·수정한 화면의 소스에 적힌 한글 문구에 금지어가 없다', () => {
    const hits: string[] = [];
    let checked = 0;
    for (const file of FILES) {
      for (const piece of koreanPieces(readFileSync(file, 'utf8'))) {
        checked += 1;
        const hit = findForbidden(piece);
        if (hit) hits.push(`${file.split('/src/')[1]}: "${piece}" → ${hit}`);
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(hits).toEqual([]);
  });
});
