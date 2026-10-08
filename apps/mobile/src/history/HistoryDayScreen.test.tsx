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

describe('H2 하루 상세 (모바일)', () => {
  it('from=to 로 호출하고 읽기 전용 값·메모·투약을 보여 준다', async () => {
    const day = daysFixture(
      '2026-10-03',
      1,
      { '2026-10-03': { weightKg: 4.4, foodLevel: 2, symptoms: ['other'], symptomOther: '절뚝', memo: '밥을 잘 먹음' } },
      { '2026-10-03': { scheduledCount: 3, takenCount: 3 } },
    );
    setup(() => json(200, historyFixture(day, { recordDate: END })));
    await renderDay('2026-10-03');
    expect(await screen.findByText('4.4kg')).toBeTruthy();
    expect(calls).toEqual(['/api/pets/pet-1/daily-logs?from=2026-10-03&to=2026-10-03']);
    expect(screen.getByText('10월 3일 (토)')).toBeTruthy();
    expect(screen.getByText('◆ 기타(절뚝)')).toBeTruthy();
    expect(screen.getByText('밥을 잘 먹음')).toBeTruthy();
    expect(screen.getByText('먹임 체크 3회 / 예정 3회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('전날/다음 날은 replace 로 이동한다', async () => {
    setup(() => json(200, historyFixture(daysFixture('2026-10-03', 1), { recordDate: END })));
    await renderDay('2026-10-03');
    await screen.findByText('이 날은 기록이 없어요.');
    await fireEvent.press(screen.getByRole('button', { name: '전날' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/history/2026-10-02');
    await fireEvent.press(screen.getByRole('button', { name: '다음 날' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/history/2026-10-04');
  });

  it('오늘이면 다음 날 비활성 + 오늘 화면 링크', async () => {
    setup(() => json(200, historyFixture(daysFixture(END, 1), { recordDate: END })));
    await renderDay(END);
    expect(await screen.findByText('아직 기록 중인 날이에요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다음 날' }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면에서 기록하기' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/');
  });

  it('오늘이라도 기록이 있으면 "기록 중" 문구는 숨기고 버튼만 보인다', async () => {
    setup(() => json(200, historyFixture(daysFixture(END, 1, { [END]: { weightKg: 4.2 } }), { recordDate: END })));
    await renderDay(END);
    expect(await screen.findByText('4.2kg')).toBeTruthy();
    expect(screen.queryByText('아직 기록 중인 날이에요.')).toBeNull();
    expect(screen.getByRole('button', { name: '오늘 화면에서 기록하기' })).toBeTruthy();
  });

  it('형식이 잘못된 날짜는 H1 으로 보내고 호출하지 않는다', async () => {
    setup(() => json(200, {}));
    await renderDay('2026-02-30');
    expect(mockRouter.replace).toHaveBeenCalledWith('/history');
    expect(calls).toEqual([]);
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it('INVALID_DATE_RANGE 는 "이 날짜는 볼 수 없어요", 오류 중에도 면책', async () => {
    setup(() => json(400, { code: 'INVALID_DATE_RANGE', message: '미래 날짜예요.' }));
    await renderDay('2030-01-01');
    expect(await screen.findByText('이 날짜는 볼 수 없어요.')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });
});
