// 저장 되돌리기·실수 방지(U1~U3) 화면 테스트: 일일 기록 저장 되돌리기, 체중 숫자 확인, 투약 [다시 체크], 큰 글씨 배치
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
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
const log = (b: Record<string, unknown> = {}) => ({
  id: 'l', petId: 'pet-1', recordDate: '2026-10-06', foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null,
  symptoms: [], symptomsNone: true, symptomOther: null, memo: '', updatedAt: '2026-10-06T01:00:00Z', ...b,
});
const withLog = (l: ReturnType<typeof log> | null) => () => todayExample({ dailyLog: l as never });
const PUT_URL = '/api/pets/pet-1/daily-logs/2026-10-06';
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
/** 하단 저장 막대(윗선이 있는 칸) */
const saveBarNode = () => {
  for (let n: any = saveBtn(); n; n = n.parent) {
    if (StyleSheet.flatten(n.props?.style)?.borderTopWidth === 1) return n;
  }
  throw new Error('저장 막대를 찾지 못했어요');
};
const saveBtn = () => screen.getByRole('button', { name: /^(첫 기록 저장|오늘 기록 저장|기록 수정하기)$/ });

beforeEach(() => {
  calls = [];
  setFontScale(1);
});
afterAll(() => setFontScale(2));

describe('일일 기록 저장 되돌리기', () => {
  it('하루의 첫 저장이면 서버 기록을 확인한 뒤 DELETE 로 되돌린다', async () => {
    const savedLog = log({ updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    setup(
      (r) => {
        if (r.method === 'PUT') return json(200, savedLog);
        if (r.method === 'DELETE' && r.url === PUT_URL) return json(204, null);
      },
      () => (++todayCalls <= 2 ? todayExample() : todayExample({ dailyLog: savedLog as never })), // 1: 첫 조회, 2: 저장 직전 확인, 3: 되돌리기 직전 확인
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    await screen.findByText(/오늘 기록을 남겼어요/);
    await press('저장 되돌리기');
    await screen.findByText(/저장하기 전 상태로 되돌렸어요/);
    const order = calls.filter((c) => c.url !== '/api/events').map((c) => `${c.method} ${c.url.replace('/api/pets/pet-1', '')}`);
    expect(order).toEqual(['GET /today', 'GET /today', 'PUT /daily-logs/2026-10-06', 'GET /today', 'DELETE /daily-logs/2026-10-06']);
    expect(saveBtn().props.accessibilityLabel).toBe('오늘 기록 저장');
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
  });

  it('수정이었다면 직전 서버 값을 PUT 으로 복원한다', async () => {
    const before = log({ foodLevel: 1, memo: '처음 메모', updatedAt: '2026-10-06T01:00:00Z' });
    const savedLog = log({ foodLevel: 3, memo: '처음 메모', updatedAt: '2026-10-06T02:00:00.133Z' });
    // 서버 수정 후 저장 응답의 updatedAt 은 DB 저장값이라 이어서 부른 GET /today 와 문자열까지 같다
    let todayCalls = 0;
    let puts = 0;
    setup(
      (r) => (r.method === 'PUT' ? json(200, puts++ === 0 ? savedLog : before) : undefined),
      () => todayExample({ dailyLog: (++todayCalls <= 2 ? before : savedLog) as never }),
    );
    await renderToday();
    await fireEvent.press(screen.getAllByRole('radio', { name: /^많이/ })[0]); // 식사 많이(첫 번째 그룹)
    await fireEvent.press(saveBtn());
    await screen.findByText(/고친 내용을 저장했어요/);
    await press('저장 되돌리기');
    await screen.findByText(/이전에 저장한 내용으로 되돌렸어요/);
    const putCalls = calls.filter((c) => c.method === 'PUT');
    expect(putCalls).toHaveLength(2);
    expect(putCalls[1].body).toEqual({
      foodLevel: 1, waterLevel: 2, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null, memo: '처음 메모', walkCount: null, poopCount: null,
    });
  });

  it('서버의 updatedAt 이 다르면(다른 곳에서 고침) 덮어쓰지 않고 안내한다', async () => {
    const savedLog = log({ updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    setup(
      (r) => (r.method === 'PUT' ? json(200, savedLog) : undefined),
      () =>
        todayExample({
          dailyLog: (++todayCalls <= 2 ? null : log({ memo: '다른 기기', updatedAt: '2026-10-06T02:05:00Z' })) as never,
        }),
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    await screen.findByText(/다른 곳에서 고친 기록이라 되돌리지 않았어요/);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('다른 기기');
  });

  it('04시를 넘겨 400 INVALID_RECORD_DATE 면 "시간이 지나 되돌릴 수 없어요"', async () => {
    const savedLog = log({ updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    setup(
      (r) => {
        if (r.method === 'PUT') return json(200, savedLog);
        if (r.method === 'DELETE') return json(400, { code: 'INVALID_RECORD_DATE', message: 'x' });
      },
      () => todayExample({ dailyLog: (++todayCalls >= 3 ? savedLog : null) as never }),
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    await screen.findByText(/시간이 지나 되돌릴 수 없어요/);
  });

  it('연결 실패면 안내를 유지하고 [다시 시도]로 한 번 더 할 수 있다', async () => {
    const savedLog = log({ updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    setup(
      (r) => {
        if (r.method === 'PUT') return json(200, savedLog);
        if (r.method === 'DELETE') return json(204, null);
        if (r.url.endsWith('/today') && ++todayCalls === 3) throw new TypeError('Network request failed'); // 1: 첫 조회, 2: 저장 직전 확인, 3: 되돌리기 직전 확인
      },
      () => todayExample({ dailyLog: (todayCalls >= 3 ? savedLog : null) as never }),
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    await screen.findByText(/되돌리지 못했어요\. 서버에 연결할 수 없어요\. 방금 저장한 내용은 그대로 남아 있어요\./);
    await press('다시 시도');
    await screen.findByText(/저장하기 전 상태로 되돌렸어요/);
  });

  it('폼을 고치면 되돌리기 안내가 사라지고, [닫기]로도 닫힌다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log()) : undefined));
    await renderToday();
    await fireEvent.press(saveBtn());
    await screen.findByRole('button', { name: '저장 되돌리기' });
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), '산책');
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
    await fireEvent.press(saveBtn());
    await press('닫기');
    expect(screen.queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
  });

  it('글자 배율 1.3 이상이면 안내를 스크롤 맨 위로 옮기고, 저장 막대에는 버튼만 둔다', async () => {
    setFontScale(1.5);
    setup((r) => (r.method === 'PUT' ? json(200, log()) : undefined));
    await renderToday();
    await fireEvent.press(saveBtn());
    await screen.findByText(/오늘 기록을 남겼어요/);
    // 안내(와 저장 되돌리기 버튼)는 스크롤 영역에 있고, 저장 막대에는 저장 버튼만 남는다
    expect(screen.getByRole('button', { name: '저장 되돌리기' })).toBeTruthy();
    expect(within(saveBarNode()).queryByRole('button', { name: '저장 되돌리기' })).toBeNull();
    expect(within(saveBarNode()).queryByText(/남겼어요/)).toBeNull();
  });

  it('글자 배율이 작으면 안내가 저장 막대 안에 있다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log()) : undefined));
    await renderToday();
    await fireEvent.press(saveBtn());
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(within(saveBarNode()).getByRole('button', { name: '저장 되돌리기' })).toBeTruthy();
  });
});

describe('일일 기록 저장 되돌리기 - 두 기기 경쟁', () => {
  it('A·B 가 모두 "기록 없음"으로 열고 A 가 먼저 저장한 뒤 B 가 저장해도, B 의 되돌리기는 A 의 기록을 지우지 않고 A 의 기록으로 복원한다', async () => {
    const aLog = log({ foodLevel: 1, memo: 'A 기기', updatedAt: '2026-10-06T01:00:00.100Z' });
    const bLog = log({ foodLevel: 3, memo: 'B 기기', updatedAt: '2026-10-06T02:00:00.200Z' });
    let todayCalls = 0;
    let puts = 0;
    setup(
      (r) => {
        if (r.method === 'PUT') return json(200, puts++ === 0 ? bLog : aLog);
        if (r.method === 'DELETE') return json(204, null);
      },
      // 1: B 가 연 시점(기록 없음), 2: B 가 저장하기 직전(A 가 이미 저장), 3: 되돌리기 직전(B 가 저장한 상태)
      () => todayExample({ dailyLog: (++todayCalls === 1 ? null : todayCalls === 2 ? aLog : bLog) as never }),
    );
    await renderToday();
    await fireEvent.press(screen.getAllByRole('radio', { name: /^많이/ })[0]);
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), 'B 기기');
    await fireEvent.press(saveBtn());
    await screen.findByText(/고친 내용을 저장했어요/);
    await press('저장 되돌리기');
    await screen.findByText(/이전에 저장한 내용으로 되돌렸어요/);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false); // A·B 기록이 모두 사라지지 않는다
    const putCalls = calls.filter((c) => c.method === 'PUT');
    expect(putCalls).toHaveLength(2);
    expect(putCalls[1].body).toEqual({
      foodLevel: 1, waterLevel: 2, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null, memo: 'A 기기', walkCount: null, poopCount: null,
    });
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('A 기기');
  });

  it('저장 직전 확인이 실패하면 화면이 알던 기록으로 되돌리되, 그 사이 다른 기기가 고쳤으면 덮어쓰지 않는다', async () => {
    const bLog = log({ memo: 'B 기기', updatedAt: '2026-10-06T02:00:00.200Z' });
    let todayCalls = 0;
    setup(
      (r) => {
        if (r.method === 'PUT') return json(200, bLog);
        if (r.method === 'DELETE') return json(204, null);
        if (r.url.endsWith('/today') && ++todayCalls === 2) throw new TypeError('Network request failed'); // 저장 직전 확인 실패
      },
      () => todayExample({ dailyLog: (todayCalls >= 3 ? log({ memo: 'C 기기', updatedAt: '2026-10-06T03:00:00Z' }) : null) as never }),
    );
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), 'B 기기');
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    await screen.findByText(/다른 곳에서 고친 기록이라 되돌리지 않았어요/);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('되돌리는 중에 입력한 내용은 완료되어도 지워지지 않는다', async () => {
    const savedLog = log({ updatedAt: '2026-10-06T02:00:00Z' });
    let todayCalls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    setup(
      async (r) => {
        if (r.method === 'PUT') return json(200, savedLog);
        if (r.method === 'DELETE') return json(204, null);
        if (r.url.endsWith('/today') && ++todayCalls === 3) await gate; // 되돌리기 직전 확인을 붙잡아 "되돌리는 중"을 만든다
      },
      () => todayExample({ dailyLog: (todayCalls >= 3 ? savedLog : null) as never }),
    );
    await renderToday();
    await fireEvent.press(saveBtn());
    await press('저장 되돌리기');
    await screen.findByRole('button', { name: '되돌리는 중…' });
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), '되돌리는 중 입력');
    await act(async () => {
      release();
    });
    await screen.findByText(/저장하기 전 상태로 되돌렸어요/);
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('되돌리는 중 입력');
    expect(saveBtn().props.accessibilityLabel).toBe('오늘 기록 저장'); // savedLog 는 서버 상태(기록 없음)로 갱신됐다
  });
});

describe('체중 자릿수 확인', () => {
  const typeWeight = (text: string) => fireEvent.changeText(screen.getByLabelText('체중 (kg)'), text);

  it('지난 기록(4.4kg)의 5배 이상이면 저장 전에 숫자 두 개를 나란히 보여 주고 요청을 보내지 않는다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log({ weightKg: 43 })) : undefined));
    await renderToday();
    await typeWeight('43');
    await fireEvent.press(saveBtn());
    await screen.findByText('체중 숫자를 한 번 확인해 주세요');
    expect(screen.getByText('4.4kg (3일 전)')).toBeTruthy();
    expect(screen.getByText('43kg')).toBeTruthy();
    expect(screen.getByText('숫자 자리나 소수점이 맞는지 봐 주세요.')).toBeTruthy();
    expect(screen.getByText(/체중 숫자를 확인하는 중이에요\. 위 카드를 확인해 주세요\./, { includeHiddenElements: true })).toBeTruthy();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('[다시 입력]은 값을 지우지 않고 카드를 닫는다', async () => {
    setup();
    await renderToday();
    await typeWeight('43');
    await fireEvent.press(saveBtn());
    await press('다시 입력');
    expect(screen.queryByText('체중 숫자를 한 번 확인해 주세요')).toBeNull();
    expect(screen.getByLabelText('체중 (kg)').props.value).toBe('43');
  });

  it('[그대로 저장]은 한 번에 저장하고, 같은 값으로는 다시 묻지 않는다', async () => {
    let n = 0;
    setup((r) => (r.method === 'PUT' ? json(200, log({ weightKg: 43, updatedAt: `2026-10-06T02:0${++n}:00Z` })) : undefined));
    await renderToday();
    await typeWeight('43');
    await fireEvent.press(saveBtn());
    await press('그대로 저장');
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PUT')!.body.weightKg).toBe(43);
    await screen.findByRole('button', { name: '저장 되돌리기' });
    await fireEvent.press(saveBtn());
    await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(2));
    expect(screen.queryByText('체중 숫자를 한 번 확인해 주세요')).toBeNull();
  });

  it('보통 범위(4.8)나 값을 고친 뒤에는 묻지 않는다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, log({ weightKg: 4.8 })) : undefined));
    await renderToday();
    await typeWeight('43');
    await fireEvent.press(saveBtn());
    await screen.findByText('체중 숫자를 한 번 확인해 주세요');
    await typeWeight('4.8');
    expect(screen.queryByText('체중 숫자를 한 번 확인해 주세요')).toBeNull();
    await fireEvent.press(saveBtn());
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
  });
});

describe('체중 확인값 초기화', () => {
  it('"그대로 저장"으로 확인한 값은 날짜가 바뀌어 새로 불러오면 다시 묻는다', async () => {
    let todayCalls = 0;
    setup(
      (r) => {
        if (r.method === 'PUT') return json(400, { code: 'INVALID_RECORD_DATE', message: 'x' });
        if (r.url.endsWith('/today')) todayCalls += 1;
      },
      () => (todayCalls >= 3 ? todayExample({ recordDate: '2026-10-07', doses: [] }) : todayExample()),
    );
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), '43');
    await fireEvent.press(saveBtn());
    await press('그대로 저장');
    await waitFor(() => expect(todayCalls).toBe(3)); // 새 날짜로 다시 불러옴
    await waitFor(() => expect(screen.queryByText('체중 숫자를 한 번 확인해 주세요')).toBeNull());
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), '43');
    await fireEvent.press(saveBtn());
    await screen.findByText('체중 숫자를 한 번 확인해 주세요'); // 이전 날짜의 확인값이 남아 있으면 묻지 않는다
  });
});

describe('투약 [다시 체크]와 접힌 줄 오탭 방지', () => {
  it('되돌리기가 실패해 줄이 다시 접히면 접근성 포커스를 [되돌리기] 버튼으로 돌려준다', async () => {
    const handle = jest.spyOn(require('react-native/Libraries/ReactNative/RendererProxy'), 'findNodeHandle').mockReturnValue(7); // 테스트 렌더러에는 네이티브 노드가 없다
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => {});
    setup((r) => (r.method === 'DELETE' ? json(500, { code: 'INTERNAL', message: 'x' }) : undefined));
    await renderToday();
    focus.mockClear();
    await press(/체크 되돌리기/);
    await screen.findByText(/되돌리지 못했어요|못했어요/);
    await screen.findByRole('button', { name: /체크 되돌리기/ });
    expect(focus).toHaveBeenCalled(); // 카드로 갔다가 다시 접힌 뒤에도 포커스를 다시 요청한다(null 로 취소하지 않는다)
    expect(focus.mock.calls.length).toBeGreaterThanOrEqual(2);
    focus.mockRestore();
    handle.mockRestore();
  });

  it('[다시 체크]는 지금 시각으로 다시 기록한다', async () => {
    setup((r) => {
      if (r.method === 'DELETE') return json(204, null);
      if (r.method === 'POST' && r.url === '/api/med-logs')
        return json(201, { id: 'log-9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '08:00', takenAt: '2026-10-06T02:30:00Z' });
    });
    await renderToday();
    await press(/체크 되돌리기/);
    await press('다시 체크');
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/med-logs')).toBe(true));
    expect(calls.find((c) => c.method === 'POST' && c.url === '/api/med-logs')!.body).toEqual({ medicationId: 'med-a', scheduledTime: '08:00' });
    await screen.findByText('오늘 먹일 약 1 / 2');
    expect(screen.queryByRole('button', { name: '다시 체크' })).toBeNull();
  });

  it('방금 체크한 줄은 접히는 동안 두 번째 탭을 무시한다(더블탭이 되돌리기로 이어지지 않는다)', async () => {
    setup((r) => (r.method === 'POST' && r.url === '/api/med-logs'
      ? json(201, { id: 'log-9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:00:00Z' })
      : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오후 8:00/ }));
    await screen.findByText('오늘 먹일 약 2 / 2');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350)); // 접힌 직후(0.3초) ~ 0.45초 사이
    });
    await fireEvent.press(screen.getByRole('button', { name: /오후 8:00 체크 되돌리기/ }));
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    expect(screen.getByText('오늘 먹일 약 2 / 2')).toBeTruthy();
  });
});
