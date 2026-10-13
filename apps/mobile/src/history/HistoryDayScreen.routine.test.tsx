// 지난 기록 하루 상세의 산책·배변 한 줄 (읽기 전용, 값이 없으면 줄 숨김). 웹 HistoryDayRoutine.test.tsx 와 같은 시나리오
import { render, screen } from '@testing-library/react-native';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { findRoutineForbidden } from '../lib/routineText';
import { setFontScale } from '../testing/fontScale';
import { json, PET } from '../testing/fixtures';
import { resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import HistoryDayScreen from './HistoryDayScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const DAY = '2026-10-03';

async function renderDay(log: Record<string, unknown> | null) {
  const res = historyFixture(daysFixture(DAY, 1, log ? { [DAY]: log } : {}), { recordDate: '2026-10-08' });
  global.fetch = jest.fn(async () => json(200, res)) as never;
  await render(
    <PetContext.Provider value={{ status: 'ready', pet: PET, reload: jest.fn(), setPet: jest.fn() }}>
      <HistoryDayScreen recordDate={DAY} />
    </PetContext.Provider>,
  );
}

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
});

describe('하루 상세의 산책·배변 한 줄 (모바일)', () => {
  it('값이 있으면 라벨과 사실 한 줄을 증상 다음, 메모 앞에 보여 준다', async () => {
    await renderDay({ weightKg: 4.1, walkCount: 2, poopCount: 3, memo: '잘 걸었어요' });
    const line = await screen.findByText('산책 2회 · 배변 3회');
    expect(findRoutineForbidden(line.props.children as string)).toBeNull();
    expect(screen.getByLabelText('산책·배변: 산책 2회 · 배변 3회')).toBeTruthy();
    const order = ['증상', '산책·배변', '메모'].map((t) => JSON.stringify(screen.toJSON()).indexOf(`"${t}"`));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('0 은 숨기지 않고, 한쪽만 있으면 그쪽만 보인다', async () => {
    await renderDay({ walkCount: 0, poopCount: null });
    expect(await screen.findByText('산책 0회')).toBeTruthy();
  });

  it('둘 다 없으면 줄 자체를 그리지 않는다', async () => {
    await renderDay({ weightKg: 4.1, walkCount: null, poopCount: null });
    await screen.findByText('4.1kg');
    expect(screen.queryByText('산책·배변')).toBeNull();
  });

  it('큰 글씨에서도 라벨 아래 값이 그대로 보인다(Field 는 원래 세로 배치)', async () => {
    setFontScale(2);
    await renderDay({ walkCount: 2, poopCount: 3 });
    expect(await screen.findByText('산책 2회 · 배변 3회')).toBeTruthy();
    expect(screen.getByText('산책·배변')).toBeTruthy();
  });
});
