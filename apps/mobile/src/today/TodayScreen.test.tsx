import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { json, PET, todayExample } from '../testing/fixtures';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushBannerMessage } from '../push/pushContext';
import TodayScreen, { DATE_CHANGED_NOTICE } from './TodayScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
// 화면이 처음 보일 때 한 번 실행하고, mockRefocus() 로 "다른 화면에 다녀온" 재포커스를 흉내 낸다
let mockFocusCb: (() => void) | null = null;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/',
  useRouter: () => ({ replace: jest.fn(), push: mockPush }),
  useFocusEffect: (cb: () => void) => {
    require('react').useEffect(() => {
      mockFocusCb = cb;
      return cb();
    }, [cb]);
  },
}));
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));

type Handler = (req: { url: string; method: string; body: unknown }) => Response | Promise<Response | undefined> | undefined;
let calls: { url: string; method: string; body: unknown }[] = [];
let handler: Handler;
let pushListeners: Set<(m: PushBannerMessage) => void>;
let appStateHandler: (s: string) => void;
const reloadPet = jest.fn();

function setup(h: Handler = () => undefined) {
  handler = h;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const req = { url: String(url).replace('http://test', ''), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(req);
    const custom = await handler(req);
    if (custom) return custom;
    if (req.url.endsWith('/today')) return json(200, todayExample());
    if (req.url === '/api/events') return json(202, null);
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: (l: (m: PushBannerMessage) => void) => {
    pushListeners.add(l);
    return () => pushListeners.delete(l);
  },
};

async function renderToday() {
  await render(
    <PushContext.Provider value={push}>
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
        <TodayScreen />
      </PetContext.Provider>
    </PushContext.Provider>,
  );
  await screen.findByText('오늘 먹일 약 1 / 2');
}

const saved = (body: Record<string, unknown> = {}) => ({
  id: 'l', petId: 'pet-1', recordDate: '2026-10-06', foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null,
  symptoms: [], symptomsNone: true, symptomOther: null, memo: '', updatedAt: '', ...body,
});

beforeEach(() => {
  calls = [];
  mockParams = {};
  pushListeners = new Set();
  reloadPet.mockClear();
  mockPush.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    appStateHandler = cb;
    return { remove: jest.fn() };
  }) as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('오늘 화면 — 조회와 제안값', () => {
  it('서버가 준 recordDate·cutoffNotice 를 표시하고, 제안값은 "최근 평균" 글자로 보여 준다', async () => {
    setup();
    await renderToday();
    expect(screen.getByText('10월 6일 (화)')).toBeTruthy();
    expect(screen.getByText('새벽 4시 전 투약은 전날 기록으로 저장돼요')).toBeTruthy();
    expect(screen.getByText('보리 · 14살 · 신부전')).toBeTruthy();
    expect(screen.getAllByText('최근 평균').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '오늘 기록 저장' })).toBeTruthy();
  });

  it('[저장]을 누르면 제안값을 확정해 계약과 같은 본문으로 PUT 하고, "기록 수정하기"로 바뀐다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved()) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await screen.findByText('✓ 오늘 기록을 남겼어요. 수고하셨어요');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.url).toBe('/api/pets/pet-1/daily-logs/2026-10-06');
    expect(put.body).toEqual({ foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null, symptoms: [], symptomsNone: true, symptomOther: null, memo: '' });
    expect(screen.getByRole('button', { name: '기록 수정하기' })).toBeTruthy();
    expect(calls.some((c) => c.url === '/api/events' && (c.body as { name: string }).name === 'daily_log_saved')).toBe(true);
  });

  it('저장된 dailyLog 가 있으면 그 값을 실선으로 보여 준다(제안값보다 우선)', async () => {
    setup((r) =>
      r.url.endsWith('/today') ? json(200, todayExample({ dailyLog: saved({ foodLevel: 1, waterLevel: null, waterMl: 350, weightKg: 4.3 }) as never })) : undefined,
    );
    await renderToday();
    const food = screen.getByRole('radio', { name: /^조금/ });
    expect(food.props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('radio', { name: /^보통/ }).props.accessibilityState.checked).toBe(false);
    expect(screen.getByLabelText('물 마신 양 (ml)').props.value).toBe('350'); // 저장된 기록이 ml 이면 ml 입력
    expect(screen.getByRole('checkbox', { name: '오늘 쟀어요' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('button', { name: '기록 수정하기' })).toBeTruthy();
  });

  it('저장 응답이 오기 전에 화면이 새 날짜로 바뀌면 구 날짜 저장 결과로 되돌리지 않는다', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: 1_000_000 });
    let releasePut!: () => void;
    const putGate = new Promise<void>((r) => (releasePut = r));
    let n = 0;
    setup(async (r) => {
      if (r.method === 'PUT') {
        await putGate;
        return json(200, saved());
      }
      if (r.url.endsWith('/today')) return json(200, todayExample(++n === 1 ? {} : { recordDate: '2026-10-07', doses: [] }));
    });
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await act(async () => {
      jest.setSystemTime(1_000_000 + 31_000);
      appStateHandler('active');
    });
    await screen.findByText(DATE_CHANGED_NOTICE);
    await act(async () => releasePut());
    expect(screen.getByText('10월 7일 (수)')).toBeTruthy();
    expect(screen.queryByText(/오늘 기록을 남겼어요/)).toBeNull();
    expect(screen.getByRole('button', { name: /기록 저장/ })).toBeTruthy(); // "기록 수정하기"로 바뀌지 않음
  });

  it('체중은 [오늘 쟀어요]를 눌러야 저장 본문에 들어간다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ weightKg: 4.35 })) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: '오늘 쟀어요' }));
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect((calls.find((c) => c.method === 'PUT')!.body as { weightKg: number }).weightKg).toBe(4.35);
  });

  it('체중 입력의 쉼표는 점으로 보정된다', async () => {
    setup();
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), '4,35');
    expect(screen.getByLabelText('체중 (kg)').props.value).toBe('4.35');
  });

  it('첫 사용이면 환영 문구와 "첫 기록 저장"을 보여 준다', async () => {
    setup((r) =>
      r.url.endsWith('/today')
        ? json(200, todayExample({ doses: [], suggestions: { foodLevel: null, waterLevel: null, waterMl: null, weightKg: null }, lastWeight: null }))
        : undefined,
    );
    await render(
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
        <TodayScreen />
      </PetContext.Provider>,
    );
    await screen.findByText('보리와의 첫 기록을 시작해 볼까요?');
    expect(screen.getByText('등록하면 여기서 한 번에 체크할 수 있어요.')).toBeTruthy();
    expect(screen.queryByText(/웹에서/)).toBeNull();
    // 약 없음 카드에서 바로 등록 화면으로
    await fireEvent.press(screen.getByRole('button', { name: '약 등록하기' }));
    expect(mockPush).toHaveBeenCalledWith('/medications/new');
    expect(screen.getByRole('button', { name: '첫 기록 저장' })).toBeTruthy();
  });
});

describe('오늘 화면 — 약 관리 진입', () => {
  it('[지난 기록 보기 ›]가 [약 관리 ›] 옆에 있고 지난 기록 화면으로 간다', async () => {
    setup();
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '지난 기록 보기' }));
    expect(mockPush).toHaveBeenLastCalledWith('/history');
  });

  it('병원 방문 리포트 카드의 [리포트 보기]가 리포트 화면으로 간다', async () => {
    setup();
    await renderToday();
    expect(screen.getByText('진료 때 보여 드릴 한 장 요약이에요.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '리포트 보기' }));
    expect(mockPush).toHaveBeenLastCalledWith('/report');
  });

  it('[약 관리 ›]·[약 관리 · 알림 설정]이 약 목록으로 가고, "웹에서 설정해요" 문구는 없다', async () => {
    setup();
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '약 관리' }));
    expect(mockPush).toHaveBeenLastCalledWith('/medications');
    await fireEvent.press(screen.getByRole('button', { name: '약 관리 · 알림 설정' }));
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/웹에서 (설정|등록)해요/)).toBeNull();
  });

  it('약 관리 화면에 다녀와 다시 보이면 투약 목록만 서버와 다시 맞춘다(첫 진입은 다시 읽지 않는다)', async () => {
    setup();
    await renderToday();
    const todayCalls = () => calls.filter((c) => c.url.endsWith('/today')).length;
    expect(todayCalls()).toBe(1);
    // 약을 하나 더 등록하고 돌아온 상황
    setup((r) =>
      r.url.endsWith('/today')
        ? json(200, todayExample({ doses: [...todayExample().doses, { medicationId: 'med-b', name: '레나메진', doseText: null, scheduledTime: '21:00', taken: false, medLogId: null, takenAt: null }] }))
        : undefined,
    );
    await act(async () => {
      mockFocusCb?.();
    });
    await screen.findByText('오늘 먹일 약 1 / 3');
    expect(todayCalls()).toBe(2);
  });
});

describe('오늘 화면 — 증상', () => {
  it('"특이사항 없음"이 기본 선택이고 다른 태그를 고르면 자동 해제된다', async () => {
    setup();
    await renderToday();
    expect(screen.getByRole('button', { name: '특이사항 없음' }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: '구토' }));
    expect(screen.getByRole('button', { name: '특이사항 없음' }).props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: '기타' }));
    expect(screen.getByLabelText('기타 증상 내용').props.maxLength).toBe(30);
  });
});

describe('오늘 화면 — 투약 체크', () => {
  it('탭하면 응답 전에 바로 체크되고, 계약대로 POST 한 뒤 med_checked 를 보낸다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup((r) => (r.method === 'POST' && r.url === '/api/med-logs' ? (undefined as never) : undefined));
    const orig = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && String(url).endsWith('/api/med-logs')) {
        calls.push({ url: '/api/med-logs', method: 'POST', body: JSON.parse(String(init.body)) });
        await gate;
        return json(201, { id: 'log-9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:00:00Z' });
      }
      return orig(url, init);
    }) as never;
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오후 8:00 아조딜 1캡슐, 아직 체크하지 않았어요/ }));
    await screen.findByText('오늘 먹일 약 2 / 2');
    release();
    await waitFor(() => expect(calls.some((c) => c.url === '/api/events' && (c.body as { name: string }).name === 'med_checked')).toBe(true));
    expect(calls.find((c) => c.url === '/api/med-logs')!.body).toEqual({ medicationId: 'med-a', scheduledTime: '20:00' });
  });

  it('저장에 실패하면 체크를 되돌리고 안내한다', async () => {
    setup((r) => (r.url === '/api/med-logs' ? json(500, { code: 'INTERNAL', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오후 8:00/ }));
    await screen.findByText(/체크하지 못했어요/);
    expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy();
  });

  it('409 ALREADY_CHECKED 면 체크를 유지하고 서버 상태로 다시 맞춘다', async () => {
    const synced = todayExample();
    synced.doses[1] = { ...synced.doses[1], taken: true, medLogId: 'log-2', takenAt: '2026-10-06T11:00:00Z' };
    let todayCalls = 0;
    setup((r) => {
      if (r.url === '/api/med-logs') return json(409, { code: 'ALREADY_CHECKED', message: 'x' });
      if (r.url.endsWith('/today')) return ++todayCalls === 1 ? json(200, todayExample()) : json(200, synced);
    });
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오후 8:00/ }));
    await screen.findByText(/이미 체크된 약이라 화면을 맞췄어요/);
    await screen.findByText('오늘 먹일 약 2 / 2');
  });

  it('체크한 약을 다시 탭하면 DELETE 로 취소한다', async () => {
    setup((r) => (r.method === 'DELETE' ? json(204, null) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오전 8:00 아조딜 1캡슐, 8:05 먹임/ }));
    await screen.findByText('오늘 먹일 약 0 / 2');
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/med-logs/log-1')).toBe(true);
  });
});

describe('오늘 화면 — 오류 처리', () => {
  it('pet 404 면 반려동물 정보를 다시 읽는다', async () => {
    setup((r) => (r.url.endsWith('/today') ? json(404, { code: 'NOT_FOUND', message: 'x' }) : undefined));
    await render(
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
        <TodayScreen />
      </PetContext.Provider>,
    );
    await waitFor(() => expect(reloadPet).toHaveBeenCalled());
  });

  it('저장 400 은 한국어 안내를 보여 준다', async () => {
    setup((r) => (r.method === 'PUT' ? json(400, { code: 'VALIDATION_ERROR', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await screen.findByText(/입력한 내용을 확인해 주세요/);
  });

  it('INVALID_RECORD_DATE 면 안내하고 새 날짜로 다시 불러온다', async () => {
    let n = 0;
    setup((r) => {
      if (r.method === 'PUT') return json(400, { code: 'INVALID_RECORD_DATE', message: 'x' });
      if (r.url.endsWith('/today')) return json(200, todayExample(++n > 1 ? { recordDate: '2026-10-07' } : {}));
    });
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await screen.findByText(/기록 날짜가 바뀌었어요/);
    await screen.findByText('10월 7일 (수)');
  });

  it('서버가 꺼져 있으면 연결 안내와 다시 불러오기 버튼을 보여 준다', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await render(
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
        <TodayScreen />
      </PetContext.Provider>,
    );
    await screen.findByText(/서버에 연결할 수 없어요/);
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
  });

  it('이벤트 전송이 실패해도 화면은 그대로 동작한다', async () => {
    setup((r) => (r.url === '/api/events' ? json(500, { code: 'X', message: 'x' }) : r.method === 'PUT' ? json(200, saved()) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await screen.findByText(/오늘 기록을 남겼어요/);
  });
});

describe('오늘 화면 — 푸시로 열었을 때', () => {
  it('source=push&med=<id> 면 아직 안 먹인 해당 약 카드를 강조한다', async () => {
    mockParams = { source: 'push', med: 'med-a' };
    setup();
    await renderToday();
    expect(screen.getByText('방금 알림 온 약')).toBeTruthy();
    expect(calls.find((c) => c.url === '/api/events')!.body).toEqual({ name: 'today_opened', props: { source: 'push' } });
  });

  it('없는 약 id 이거나 source 가 push 가 아니면 강조하지 않는다', async () => {
    for (const p of [{ source: 'push', med: 'nope' }, { med: 'med-a' }] as Record<string, string>[]) {
      mockParams = p;
      setup();
      await renderToday();
      expect(screen.queryByText('방금 알림 온 약')).toBeNull();
      await screen.unmount();
    }
  });

  it('이미 체크한 약(모든 회차 완료)이면 강조하지 않는다', async () => {
    mockParams = { source: 'push', med: 'med-a' };
    setup((r) => {
      if (!r.url.endsWith('/today')) return undefined;
      const t = todayExample();
      t.doses[1] = { ...t.doses[1], taken: true, medLogId: 'log-2', takenAt: '2026-10-06T11:00:00Z' };
      return json(200, t);
    });
    await render(
      <PushContext.Provider value={push}>
        <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
          <TodayScreen />
        </PetContext.Provider>
      </PushContext.Provider>,
    );
    await screen.findByText('오늘 먹일 약 2 / 2');
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
  });

  it('강조된 약 카드의 접근성 라벨은 "방금 알림 온 약, "으로 시작한다', async () => {
    mockParams = { source: 'push', med: 'med-a' };
    setup();
    await renderToday();
    expect(screen.getByRole('checkbox', { name: /^방금 알림 온 약, .*오후 8:00/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /^오전 8:00/ })).toBeTruthy();
  });

  it('2분 뒤 강조가 풀리고, 같은 약이라도 알림을 다시 열면(n 이 바뀌면) 다시 강조하고 2분 뒤 다시 풀린다', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    mockParams = { source: 'push', med: 'med-a', n: '1' };
    setup();
    const ui = () => (
      <PushContext.Provider value={push}>
        <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
          <TodayScreen />
        </PetContext.Provider>
      </PushContext.Provider>
    );
    const { rerender } = await render(ui());
    await screen.findByText('방금 알림 온 약');
    await act(async () => {
      jest.advanceTimersByTime(2 * 60 * 1000 + 1);
    });
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
    mockParams = { source: 'push', med: 'med-a', n: '2' };
    await rerender(ui());
    expect(screen.getByText('방금 알림 온 약')).toBeTruthy(); // 새 알림 → 다시 강조
    await act(async () => {
      jest.advanceTimersByTime(60 * 1000);
    });
    expect(screen.getByText('방금 알림 온 약')).toBeTruthy(); // 타이머도 새로 시작(1분 지남)
    await act(async () => {
      jest.advanceTimersByTime(60 * 1000 + 1);
    });
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
  });

  it('포그라운드 투약 알림을 받으면 GET /today 로 투약 상태만 다시 맞춘다', async () => {
    const synced = todayExample();
    synced.doses[1] = { ...synced.doses[1], taken: true, medLogId: 'log-2', takenAt: '2026-10-06T11:00:00Z' };
    let n = 0;
    setup((r) => (r.url.endsWith('/today') ? json(200, ++n === 1 ? todayExample() : synced) : undefined));
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), '입력 중');
    await act(async () => {
      pushListeners.forEach((l) => l({ key: 'k', title: 't', body: 'b', type: 'med_reminder', medicationId: 'med-a', petId: 'pet-1', recordDate: '2026-10-06', scheduledTime: '20:00' }));
    });
    await screen.findByText('오늘 먹일 약 2 / 2');
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('입력 중');
  });
});

describe('오늘 화면 — 앱 복귀(날짜 변경 감지)', () => {
  async function renderAt(t0: number) {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: t0 });
    await renderToday();
  }

  it('30초 안에는 다시 부르지 않는다', async () => {
    setup();
    await renderAt(1_000_000);
    const before = calls.filter((c) => c.url.endsWith('/today')).length;
    await act(async () => appStateHandler('active'));
    expect(calls.filter((c) => c.url.endsWith('/today')).length).toBe(before);
  });

  it('같은 날짜면 투약만 반영하고 입력은 유지한다', async () => {
    const synced = todayExample();
    synced.doses[1] = { ...synced.doses[1], taken: true, medLogId: 'log-2', takenAt: '2026-10-06T11:00:00Z' };
    let n = 0;
    setup((r) => (r.url.endsWith('/today') ? json(200, ++n === 1 ? todayExample() : synced) : undefined));
    await renderAt(1_000_000);
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), '입력 중');
    await act(async () => {
      jest.setSystemTime(1_000_000 + 31_000);
      appStateHandler('active');
    });
    await screen.findByText('오늘 먹일 약 2 / 2');
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('입력 중');
    expect(screen.queryByText(DATE_CHANGED_NOTICE)).toBeNull();
  });

  it('다른 날짜면 전체를 교체하고 안내한다', async () => {
    let n = 0;
    setup((r) => (r.url.endsWith('/today') ? json(200, todayExample(++n === 1 ? {} : { recordDate: '2026-10-07', doses: [] })) : undefined));
    await renderAt(1_000_000);
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), '입력 중');
    await act(async () => {
      jest.setSystemTime(1_000_000 + 31_000);
      appStateHandler('active');
    });
    await screen.findByText(DATE_CHANGED_NOTICE);
    expect(screen.getByText('10월 7일 (수)')).toBeTruthy();
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('');
  });

  it('오프라인이면 조용히 무시한다', async () => {
    setup();
    await renderAt(1_000_000);
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as never;
    await act(async () => {
      jest.setSystemTime(1_000_000 + 31_000);
      appStateHandler('active');
    });
    expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy();
    expect(screen.queryByText(/서버에 연결할 수 없어요/)).toBeNull();
  });
});
