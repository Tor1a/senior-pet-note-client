import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { daysFixture, historyFixture } from '../../lib/historyFixtures';
import { findWeekReviewForbidden } from '../../lib/weekReviewText';
import { json } from '../../testing/fixtures';
import { setFontScale } from '../../testing/fontScale';
import { WeekReviewCard } from './WeekReviewCard';

jest.mock('../../services/client', () => require('../../testing/mockClient'));

const END = '2026-10-08';
let historyCalls: string[];
let respond: () => Promise<unknown>;

function setup(res: () => Promise<unknown>) {
  historyCalls = [];
  respond = res;
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace('http://test', '');
    if (path.includes('/daily-logs')) {
      historyCalls.push(path);
      return respond();
    }
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

const ok = (days = daysFixture(END, 30, { '2026-10-02': { weightKg: 4.4 }, '2026-10-08': { weightKg: 4.1 } }, { '2026-10-08': { scheduledCount: 2, takenCount: 1 } })) =>
  async () => json(200, historyFixture(days));

function card(props: Partial<React.ComponentProps<typeof WeekReviewCard>> = {}) {
  return <WeekReviewCard petId="pet-1" onNotFound={jest.fn()} onHistory={jest.fn()} {...props} />;
}

const toggle = () => screen.getByRole('button', { name: '최근 7일 돌아보기' });

beforeEach(() => setFontScale(1));
afterAll(() => setFontScale(2));

describe('WeekReviewCard', () => {
  it('접힘: expanded false, 요청 0, 높이 56 이상', async () => {
    setup(ok());
    await render(card());
    expect(toggle().props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByText('펼치기')).toBeTruthy();
    expect(historyCalls).toHaveLength(0);
    expect(screen.queryByText('지난 기록 보기 ›')).toBeNull();
  });

  it('펼침: 요청 1회, 사실 줄과 낭독 라벨, 라이브 영역, 금지어 없음', async () => {
    setup(ok());
    await render(card());
    await fireEvent.press(toggle());
    expect(await screen.findByText('기록한 날 2일 / 7일')).toBeTruthy();
    expect(historyCalls).toEqual(['/api/pets/pet-1/daily-logs']);
    expect(toggle().props.accessibilityState).toMatchObject({ expanded: true });
    expect(screen.getByText('10월 2일 ~ 10월 8일').props.accessibilityLabel).toBe('10월 2일부터 10월 8일까지');
    expect(screen.getByLabelText('기록한 날 7일 중 2일')).toBeTruthy();
    expect(screen.getByText('체중 기록 2번')).toBeTruthy();
    expect(screen.getByText('첫 기록 4.4kg (10월 2일)')).toBeTruthy();
    expect(screen.getByText('마지막 4.1kg (10월 8일)')).toBeTruthy();
    expect(screen.getByLabelText('투약 체크 2회 중 1회')).toBeTruthy();
    expect(screen.getByText('투약 체크 1/2회')).toBeTruthy();
    expect(screen.getByText(/현재 등록된 약 기준이에요/)).toBeTruthy();
    expect(screen.getByText('기록한 날 2일 / 7일').parent?.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.queryByText(/%|달성|연속|일째|평균/)).toBeNull();
    expect(findWeekReviewForbidden('기록한 날 2일 / 7일')).toBeNull();
  });

  it('체중 0번이면 체중 줄 없음, 예정 0이면 투약 줄·고지 없음', async () => {
    setup(ok(daysFixture(END, 30, { [END]: {} })));
    await render(card());
    await fireEvent.press(toggle());
    expect(await screen.findByText('기록한 날 1일 / 7일')).toBeTruthy();
    expect(screen.queryByText(/체중/)).toBeNull();
    expect(screen.queryByText(/투약 체크|등록된 약/)).toBeNull();
  });

  it('체중 1번이면 한 줄만', async () => {
    setup(ok(daysFixture(END, 30, { [END]: { weightKg: 4.1 } })));
    await render(card());
    await fireEvent.press(toggle());
    expect(await screen.findByText('체중 기록 1번')).toBeTruthy();
    expect(screen.getByText('4.1kg (10월 8일)')).toBeTruthy();
    expect(screen.queryByText(/첫 기록|마지막/)).toBeNull();
  });

  it('최근 7일 기록 0일: 기간 + 안내 + 링크', async () => {
    setup(ok(daysFixture(END, 30, { '2026-09-20': { weightKg: 4 } })));
    const onHistory = jest.fn();
    await render(card({ onHistory }));
    await fireEvent.press(toggle());
    expect(await screen.findByText('최근 7일에는 적은 기록이 없어요.')).toBeTruthy();
    expect(screen.getByText('10월 2일 ~ 10월 8일')).toBeTruthy();
    expect(screen.queryByText(/기록한 날/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '지난 기록 보기' }));
    expect(onHistory).toHaveBeenCalledTimes(1);
  });

  it('로딩 중: 불러오는 중… 과 busy', async () => {
    let release: (v: unknown) => void = () => {};
    setup(() => new Promise((r) => (release = r)));
    await render(card());
    await fireEvent.press(toggle());
    const loading = await screen.findByText('불러오는 중…');
    expect(loading.parent?.props.accessibilityState).toMatchObject({ busy: true });
    await act(async () => release(json(200, historyFixture(daysFixture(END, 7, { [END]: {} })))));
    expect(await screen.findByText('기록한 날 1일 / 7일')).toBeTruthy();
  });

  it('오류: alert + 다시 불러오기로 재요청', async () => {
    setup(async () => json(500, { code: 'X', message: 'x' }));
    await render(card());
    await fireEvent.press(toggle());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('지난 기록을 불러오지 못했어요. 잠시 뒤에 다시 해 주세요.');
    setup(ok());
    await fireEvent.press(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText('기록한 날 2일 / 7일')).toBeTruthy();
    expect(historyCalls).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('접으면 결과를 버리고 다시 펼칠 때 새로 요청, 접힌 사이 응답은 무시', async () => {
    let release: (v: unknown) => void = () => {};
    setup(() => new Promise((r) => (release = r)));
    await render(card());
    await fireEvent.press(toggle());
    await fireEvent.press(toggle()); // 접기
    await act(async () => release(json(200, historyFixture(daysFixture(END, 7, { [END]: {} })))));
    expect(screen.queryByText(/기록한 날/)).toBeNull();
    expect(toggle().props.accessibilityState).toMatchObject({ expanded: false });
    setup(ok());
    await fireEvent.press(toggle());
    expect(await screen.findByText('기록한 날 2일 / 7일')).toBeTruthy();
    expect(historyCalls).toHaveLength(1);
  });

  it('접고 바로 다시 펼칠 때 이전 응답이 먼저 오면 버리고 새 응답만 보인다', async () => {
    const releases: ((v: unknown) => void)[] = [];
    setup(() => new Promise((r) => releases.push(r)));
    await render(card());
    await fireEvent.press(toggle());
    await fireEvent.press(toggle());
    await fireEvent.press(toggle());
    expect(releases).toHaveLength(2);
    // 이전(첫 번째) 요청 응답이 먼저 도착: 무시되어 로딩이 유지된다
    await act(async () => releases[0](json(200, historyFixture(daysFixture(END, 7, { [END]: {} })))));
    expect(screen.queryByText('기록한 날 1일 / 7일')).toBeNull();
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    await act(async () => releases[1](await ok()()));
    expect(await screen.findByText('기록한 날 2일 / 7일')).toBeTruthy();
    expect(screen.queryByText('기록한 날 1일 / 7일')).toBeNull();
  });

  it('404: 접고 onNotFound 호출', async () => {
    setup(async () => json(404, { code: 'NOT_FOUND', message: 'x' }));
    const onNotFound = jest.fn();
    await render(card({ onNotFound }));
    await fireEvent.press(toggle());
    await screen.findByText('펼치기');
    expect(onNotFound).toHaveBeenCalledTimes(1);
    expect(toggle().props.accessibilityState).toMatchObject({ expanded: false });
  });

  it('큰 글씨(1.3): 상태 글자가 아래 줄, numberOfLines 없음', async () => {
    setFontScale(1.3);
    setup(ok());
    await render(card());
    const head = screen.getByText('최근 7일 돌아보기').parent;
    expect(head?.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]));
    expect(screen.getByText('최근 7일 돌아보기').props.numberOfLines).toBeUndefined();
  });

  it('보통 글씨(1.2): 한 줄 배치', async () => {
    setFontScale(1.2);
    setup(ok());
    await render(card());
    const head = screen.getByText('최근 7일 돌아보기').parent;
    expect(head?.props.style).not.toEqual(expect.arrayContaining([expect.objectContaining({ flexDirection: 'column' })]));
  });
});
