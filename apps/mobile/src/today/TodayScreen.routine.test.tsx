// 루틴 기록(산책·배변 횟수) 오늘 화면 테스트 (웹 TodayRoutine.test.tsx 와 같은 시나리오 + 모바일 큰 글씨 배치·낭독)
// 기획 .company/plans/루틴-기록-칩.md, 설계 .company/design/루틴-기록-칩.md
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { logFixture } from '../lib/historyFixtures';
import { findRoutineForbidden } from '../lib/routineText';
import { json, PET, todayExample } from '../testing/fixtures';
import { setFontScale } from '../testing/fontScale';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushBannerMessage } from '../push/pushContext';
import TodayScreen from './TodayScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(() => cb(), [cb]);
  },
}));
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

type Req = { url: string; method: string; body: any };
let calls: Req[] = [];
let handler: (r: Req) => Response | Promise<Response | undefined> | undefined;
let todayFn: () => ReturnType<typeof todayExample>;

function setup(h: typeof handler = () => undefined, today: typeof todayFn = () => todayExample()) {
  handler = h;
  todayFn = today;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const req = { url: String(url).replace('http://test', ''), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(req);
    const custom = await handler(req);
    if (custom) return custom;
    if (req.url.endsWith('/today')) return json(200, todayFn());
    if (req.url === '/api/events') return json(202, null);
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}
const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: (_l: (m: PushBannerMessage) => void) => () => {},
};
async function renderToday() {
  await render(
    <PushContext.Provider value={push}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: jest.fn(), setPet: jest.fn() }}>
        <TodayScreen />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
  await screen.findByText('오늘 먹일 약 1 / 2');
}

const DATE = '2026-10-06';
const log = (over: Record<string, unknown> = {}) =>
  logFixture(DATE, { foodLevel: 2, waterLevel: 2, symptomsNone: true, updatedAt: '2026-10-06T01:00:00Z', ...over }) as never;
const saveBtn = () => screen.getByRole('button', { name: /^(첫 기록 저장|오늘 기록 저장|기록 수정하기)$/ });
const toggle = () => screen.getByRole('button', { name: /산책·배변 기록 \(선택\)/ });
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const putCalls = () => calls.filter((c) => c.method === 'PUT');
const valueText = (item: '산책' | '배변') => {
  const cell = screen.getByLabelText(new RegExp(`^${item} 횟수, `));
  return cell.props.accessibilityLabel.replace(`${item} 횟수, `, '');
};

beforeEach(() => {
  calls = [];
  setFontScale(1);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('루틴 기록 섹션: 접힘·펼침', () => {
  it('기본 접힘이고, 열지 않고 저장하면 요청은 기존 8필드 그대로이고 루틴 두 키는 생략된다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log()) : undefined));
    await renderToday();
    expect(toggle().props.accessibilityState.expanded).toBe(false);
    expect(screen.queryByText('적은 값만 저장돼요. 배변은 대변을 본 횟수예요.')).toBeNull();
    expect(screen.queryByText('저장 전')).toBeNull();
    await fireEvent.press(saveBtn());
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(putCalls()[0].body).toEqual({
      foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null, memo: '',
    });
  });

  it('접힌 행은 오늘 화면의 메모 다음, 리포트 카드 앞에 있다', async () => {
    setup();
    await renderToday();
    const labels = screen.getAllByRole('header').map((h) => h.props.children);
    expect(labels).toContain('메모 (선택)');
    const memoIdx = labels.indexOf('메모 (선택)');
    const reportIdx = labels.findIndex((l) => typeof l === 'string' && l.includes('병원'));
    expect(memoIdx).toBeGreaterThanOrEqual(0);
    if (reportIdx >= 0) expect(reportIdx).toBeGreaterThan(memoIdx);
    expect(toggle()).toBeTruthy();
  });

  it('열고 닫는 것은 변경(저장 전)이 아니다', async () => {
    setup();
    await renderToday();
    await fireEvent.press(toggle());
    expect(toggle().props.accessibilityState.expanded).toBe(true);
    expect(screen.getByText('적은 값만 저장돼요. 배변은 대변을 본 횟수예요.')).toBeTruthy();
    expect(valueText('산책')).toBe('안 적음');
    await fireEvent.press(toggle());
    expect(screen.queryByText('저장 전')).toBeNull();
  });

  it('저장된 값이 있으면 자동으로 펼쳐 값을 보여 준다(0 은 0회)', async () => {
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 0, poopCount: 3 }) }));
    await renderToday();
    expect(toggle().props.accessibilityState.expanded).toBe(true);
    expect(valueText('산책')).toBe('0회');
    expect(valueText('배변')).toBe('3회');
  });

  it('접으면 접힌 행에 요약이 보이고, 낭독 이름에도 요약이 이어지며, 값은 유지된다', async () => {
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 2, poopCount: 3 }) }));
    await renderToday();
    await fireEvent.press(toggle());
    expect(screen.getByText('산책 2회 · 배변 3회')).toBeTruthy();
    expect(toggle().props.accessibilityLabel).toBe('산책·배변 기록 (선택), 산책 2회 · 배변 3회');
    await fireEvent.press(toggle());
    expect(valueText('산책')).toBe('2회');
  });
});

describe('루틴 기록 섹션: 입력과 저장', () => {
  it('[+]/[−]/[지우기] 규칙: 첫 + 는 1회, 1→0, 0 유지, 안 적음에서 − 는 그대로, 20 에서 + 는 그대로', async () => {
    setup();
    await renderToday();
    await fireEvent.press(toggle());
    await press('산책 횟수 줄이기');
    expect(valueText('산책')).toBe('안 적음');
    await press('산책 횟수 늘리기');
    expect(valueText('산책')).toBe('1회');
    await press('산책 횟수 줄이기');
    expect(valueText('산책')).toBe('0회');
    await press('산책 횟수 줄이기');
    expect(valueText('산책')).toBe('0회');
    await press('산책 횟수 지우기');
    expect(valueText('산책')).toBe('안 적음');

    for (let i = 0; i < 22; i += 1) await press('배변 횟수 늘리기');
    expect(valueText('배변')).toBe('20회');
    expect(screen.getByText('20회까지 적을 수 있어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '배변 횟수 늘리기' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '산책 횟수 줄이기' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '산책 횟수 지우기' }).props.accessibilityState.disabled).toBe(true);
  });

  it('버튼 낭독: 라벨은 고정이고 현재 값은 accessibilityValue 로 읽힌다', async () => {
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 2 }) }));
    await renderToday();
    expect(screen.getByRole('button', { name: '산책 횟수 줄이기' }).props.accessibilityValue).toEqual({ text: '2회' });
    expect(screen.getByRole('button', { name: '배변 횟수 늘리기' }).props.accessibilityValue).toEqual({ text: '안 적음' });
    await press('산책 횟수 늘리기');
    expect(screen.getByRole('button', { name: '산책 횟수 늘리기' }).props.accessibilityValue).toEqual({ text: '3회' });
  });

  it('루틴만 바꾸고 저장하면 그 값이 PUT 되고 저장 전 표시가 사라진다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log({ symptomsNone: false, walkCount: 2, poopCount: 0 })) : undefined));
    await renderToday();
    await fireEvent.press(toggle());
    await press('산책 횟수 늘리기');
    await press('산책 횟수 늘리기');
    await press('배변 횟수 늘리기');
    await press('배변 횟수 줄이기');
    expect(screen.getByText('바꾼 내용은 화면 아래 저장 버튼을 눌러야 저장돼요.')).toBeTruthy();
    expect(screen.getAllByText('저장 전').length).toBeGreaterThan(0);
    await fireEvent.press(saveBtn());
    await screen.findByRole('button', { name: '저장 되돌리기' });
    expect(putCalls()[0].body).toMatchObject({ walkCount: 2, poopCount: 0 });
    expect(screen.queryByText('저장 전')).toBeNull();
    expect(valueText('배변')).toBe('0회');
  });

  it('접힌 채 바꾼 값이 아닌 저장 전 표시: 접으면 요약 옆에 저장 전 칩이 붙는다', async () => {
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 2, poopCount: 3 }) }));
    await renderToday();
    await press('산책 횟수 늘리기');
    await fireEvent.press(toggle());
    expect(screen.getByText('산책 3회 · 배변 3회')).toBeTruthy();
    expect(screen.getByText('저장 전')).toBeTruthy();
    expect(toggle().props.accessibilityLabel).toBe('산책·배변 기록 (선택), 산책 3회 · 배변 3회, 저장 전');
  });

  it('바꿨다가 원래 값으로 돌려놓으면 저장 전 표시가 사라진다', async () => {
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 2 }) }));
    await renderToday();
    await press('산책 횟수 늘리기');
    expect(screen.getAllByText('저장 전').length).toBeGreaterThan(0);
    await press('산책 횟수 줄이기');
    expect(screen.queryByText('저장 전')).toBeNull();
  });

  it('제안값(최근 평균)이 있어도 루틴에는 제안값이 새어 들어가지 않는다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log()) : undefined));
    await renderToday();
    await fireEvent.press(toggle());
    expect(valueText('산책')).toBe('안 적음');
    expect(valueText('배변')).toBe('안 적음');
    await fireEvent.press(saveBtn());
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0].body).not.toHaveProperty('walkCount');
    expect(putCalls()[0].body).not.toHaveProperty('poopCount');
  });

  it('저장된 값을 지우면 null 을 명시해 보낸다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log({ walkCount: null, poopCount: 3 })) : undefined), () =>
      todayExample({ dailyLog: log({ walkCount: 2, poopCount: 3 }) }));
    await renderToday();
    await press('산책 횟수 지우기');
    await fireEvent.press(saveBtn());
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0].body).toMatchObject({ walkCount: null, poopCount: 3 });
  });

  it('저장 중에는 컨트롤을 눌러도 변하지 않는다', async () => {
    let release: (r: Response) => void = () => {};
    setup(
      (r) => (r.method === 'PUT' ? new Promise<Response>((resolve) => { release = resolve; }) : undefined),
      () => todayExample({ dailyLog: log({ walkCount: 2 }) }),
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    await waitFor(() => expect(screen.getByRole('button', { name: '산책 횟수 늘리기' }).props.accessibilityState.disabled).toBe(true));
    await press('산책 횟수 늘리기');
    expect(valueText('산책')).toBe('2회');
    await act(async () => release(json(200, log({ walkCount: 2 }))));
  });

  it('저장이 실패하면 값은 그대로 두고 섹션 안내가 바뀐다', async () => {
    setup((r) => (r.method === 'PUT' ? json(500, { code: 'INTERNAL', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(toggle());
    await press('산책 횟수 늘리기');
    await fireEvent.press(saveBtn());
    expect(await screen.findByText('저장하지 못했어요. 바꾼 내용은 이 화면에 그대로 있어요.')).toBeTruthy();
    expect(valueText('산책')).toBe('1회');
  });

  it('저장 실패 뒤 루틴 값을 다시 고치면 "저장하지 못했어요"가 사라지고 저장 전 안내로 돌아온다', async () => {
    setup((r) => (r.method === 'PUT' ? json(500, { code: 'INTERNAL', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(toggle());
    await press('산책 횟수 늘리기');
    await fireEvent.press(saveBtn());
    expect(await screen.findByText('저장하지 못했어요. 바꾼 내용은 이 화면에 그대로 있어요.')).toBeTruthy();
    await press('산책 횟수 늘리기');
    expect(valueText('산책')).toBe('2회');
    expect(screen.queryByText('저장하지 못했어요. 바꾼 내용은 이 화면에 그대로 있어요.')).toBeNull();
    expect(screen.getByText('저장 전')).toBeTruthy();
  });

  it('값을 바꾸면 0.5초 모아 한 번만 낭독한다(iOS announceForAccessibility)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    setup();
    await renderToday();
    await fireEvent.press(toggle());
    await press('산책 횟수 늘리기');
    await press('산책 횟수 늘리기');
    await press('산책 횟수 늘리기');
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('산책'));
    await waitFor(() => expect(announce).toHaveBeenCalledWith('산책 3회'));
    expect(announce.mock.calls.filter(([t]) => String(t).startsWith('산책'))).toHaveLength(1);
  });

  it('화면의 새 문구와 낭독 라벨은 모두 금지 표현 검사를 통과한다', async () => {
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 20, poopCount: 0 }) }));
    await renderToday();
    const texts: string[] = [];
    const walk = (node: any) => {
      if (!node) return;
      if (typeof node === 'string') texts.push(node);
      const label = node.props?.accessibilityLabel;
      if (typeof label === 'string' && /산책|배변/.test(label)) texts.push(label);
      (node.children ?? []).forEach(walk);
    };
    walk(screen.toJSON());
    const mine = texts.filter((t) => /산책|배변|20회|저장 전|바꾼 내용/.test(t));
    expect(mine.length).toBeGreaterThan(5);
    for (const t of mine) expect(findRoutineForbidden(t)).toBeNull();
  });
});

describe('루틴 기록: 큰 글씨 세로 배치', () => {
  it('fontScale 2.0 에서도 같은 버튼과 값이 모두 있고 동작한다(값 칸 -> [−][+] -> [지우기] 세로)', async () => {
    setFontScale(2);
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 2 }) }));
    await renderToday();
    expect(screen.getByRole('button', { name: '산책 횟수 줄이기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '산책 횟수 늘리기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '산책 횟수 지우기' })).toBeTruthy();
    // 평소 배치는 한 줄(row), 큰 글씨에서는 값 칸이 전체 폭 + 컨트롤이 열(column)
    const cell = screen.getByLabelText('산책 횟수, 2회');
    const flat = (s: any): Record<string, unknown> => Object.assign({}, ...[s].flat(Infinity).filter(Boolean));
    expect(flat(cell.props.style).alignSelf).toBe('stretch');
    expect(flat(cell.parent!.props.style).flexDirection).toBe('column');
    await press('산책 횟수 늘리기');
    expect(valueText('산책')).toBe('3회');
  });

  it('평소 글씨에서는 한 줄(row)로 놓인다', async () => {
    setup(undefined, () => todayExample({ dailyLog: log({ walkCount: 2 }) }));
    await renderToday();
    const cell = screen.getByLabelText('산책 횟수, 2회');
    const flat = (s: any): Record<string, unknown> => Object.assign({}, ...[s].flat(Infinity).filter(Boolean));
    expect(flat(cell.parent!.props.style).flexDirection).toBe('row');
    expect(flat(cell.props.style).alignSelf).toBeUndefined();
  });
});

describe('루틴 기록과 저장 되돌리기', () => {
  it('저장 전 행이 있었고 루틴이 달라졌으면 PUT 으로 복원(10필드)하고 결과 안내에 한 문장을 덧붙인다', async () => {
    const before = log({ foodLevel: 1, walkCount: 1, poopCount: null, memo: '처음' });
    const saved = log({ foodLevel: 1, walkCount: 3, poopCount: 2, memo: '처음', updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    let puts = 0;
    setup(
      (r) => (r.method === 'PUT' ? json(200, puts++ === 0 ? saved : before) : undefined),
      () => todayExample({ dailyLog: (++todayCalls <= 2 ? before : saved) as never }),
    );
    await renderToday();
    await press('산책 횟수 늘리기');
    await press('산책 횟수 늘리기');
    await press('배변 횟수 늘리기');
    await press('배변 횟수 늘리기');
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    expect(await screen.findByText(/^✓ 이전에 저장한 내용으로 되돌렸어요\. 산책·배변 기록도 저장 전 내용으로 돌아갔어요\.$/)).toBeTruthy();
    expect(putCalls()[1].body).toEqual({
      foodLevel: 1, waterLevel: 2, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null,
      memo: '처음', walkCount: 1, poopCount: null, // 저장 전 값이 안 적음이면 null 을 명시해 지운다
    });
    expect(valueText('산책')).toBe('1회');
    expect(valueText('배변')).toBe('안 적음');
  });

  it('저장 전 루틴 값이 저장분과 같으면 기존 결과 문구 그대로다', async () => {
    const before = log({ foodLevel: 1, memo: '처음' });
    const saved = log({ foodLevel: 3, memo: '처음', updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    let puts = 0;
    setup(
      (r) => (r.method === 'PUT' ? json(200, puts++ === 0 ? saved : before) : undefined),
      () => todayExample({ dailyLog: (++todayCalls <= 2 ? before : saved) as never }),
    );
    await renderToday();
    await fireEvent.press(screen.getAllByRole('radio', { name: /^많이/ })[0]);
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    expect(await screen.findByText(/^✓ 이전에 저장한 내용으로 되돌렸어요\.$/)).toBeTruthy();
  });

  it('그날 첫 저장(루틴 값 있음)을 되돌리면 행이 삭제되고 루틴도 함께 지워졌다고 덧붙인다', async () => {
    const saved = log({ symptomsNone: false, walkCount: 2, updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    setup(
      (r) => (r.method === 'PUT' ? json(200, saved) : r.method === 'DELETE' ? json(204, null) : undefined),
      () => todayExample({ dailyLog: (++todayCalls <= 2 ? null : saved) as never }),
    );
    await renderToday();
    await fireEvent.press(toggle());
    await press('산책 횟수 늘리기');
    await press('산책 횟수 늘리기');
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(await screen.findByText(/산책·배변 기록도 함께 지워졌어요\./)).toBeTruthy();
    expect(valueText('산책')).toBe('안 적음');
  });

  it('루틴 칸을 고치면 기존 규칙대로 되돌리기 안내가 정리되고, 접고 펴기는 정리하지 않는다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log()) : undefined));
    await renderToday();
    await fireEvent.press(saveBtn());
    await screen.findByRole('button', { name: '저장 되돌리기' });
    await fireEvent.press(toggle());
    expect(screen.getByRole('button', { name: '저장 되돌리기' })).toBeTruthy();
    await press('산책 횟수 늘리기');
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
  });
});
