import { fireEvent, render, screen } from '@testing-library/react-native';
import { DISCLAIMER } from '../lib/constants';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { setFontScale } from '../testing/fontScale';
import { json, PET } from '../testing/fixtures';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import HistoryDayScreen from './HistoryDayScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const END = '2026-10-08';
const reloadPet = jest.fn();
let calls: string[] = [];

function setup(handler: () => Response) {
  global.fetch = jest.fn(async (url: string) => {
    calls.push(String(url).replace('http://test', ''));
    return handler();
  }) as never;
}

async function renderDay(recordDate: string | undefined) {
  await render(
    <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
      <HistoryDayScreen recordDate={recordDate} />
    </PetContext.Provider>,
  );
}

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
});

describe('H2 경계·오류 (모바일, QA 추가)', () => {
  it('월 경계(10-01)에서 전날은 09-30, 30일 전 첫날도 이동 가능', async () => {
    setup(() => json(200, historyFixture(daysFixture('2026-10-01', 1), { recordDate: END })));
    await renderDay('2026-10-01');
    await screen.findByText('이 날은 기록이 없어요.');
    await fireEvent.press(screen.getByRole('button', { name: '전날' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/history/2026-09-30');
  });

  it('어제에서 다음 날은 오늘로 이동하고, 오늘에서는 이동 안 한다', async () => {
    setup(() => json(200, historyFixture(daysFixture('2026-10-07', 1), { recordDate: END })));
    await renderDay('2026-10-07');
    await screen.findByText('이 날은 기록이 없어요.');
    await fireEvent.press(screen.getByRole('button', { name: '다음 날' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/history/2026-10-08');
  });

  it('글자 2배에서도 값·면책·이동 버튼이 모두 있다', async () => {
    setFontScale(2);
    setup(() => json(200, historyFixture(daysFixture('2026-10-03', 1, { '2026-10-03': { weightKg: 4.4 } }), { recordDate: END })));
    await renderDay('2026-10-03');
    expect(await screen.findByText('4.4kg')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(screen.getByRole('button', { name: '전날' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '다음 날' })).toBeTruthy();
  });

  it('401 / 네트워크 / 404', async () => {
    setup(() => json(401, { code: 'UNAUTHORIZED', message: 'x' }));
    await renderDay('2026-10-03');
    expect(await screen.findByText(DISCLAIMER)).toBeTruthy();
    expect(screen.queryByText('4.4kg')).toBeNull();
    setup(() => json(404, { code: 'NOT_FOUND', message: 'x' }));
    await renderDay('2026-10-03');
    await screen.findAllByText(DISCLAIMER);
    expect(reloadPet).toHaveBeenCalled();
  });
});
