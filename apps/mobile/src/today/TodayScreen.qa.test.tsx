// QA 추가 테스트: 투약 연타·롤백, 저장 값 변환·경계, 401, 반려동물 없음, 푸시 강조 경계
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { json, PET, todayExample } from '../testing/fixtures';
import { PetContext } from '../pet/PetProvider';
import { PushContext, type PushBannerMessage } from '../push/pushContext';
import TodayScreen from './TodayScreen';

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

type Req = { url: string; method: string; body: any };
let calls: Req[] = [];
let handler: (r: Req) => Response | Promise<Response | undefined> | undefined;

function setup(h: typeof handler = () => undefined, today = todayExample) {
  handler = h;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const req = { url: String(url).replace('http://test', ''), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(req);
    const custom = await handler(req);
    if (custom) return custom;
    if (req.url.endsWith('/today')) return json(200, today());
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
const reloadPet = jest.fn();
const tree = (pet: typeof PET | null = PET) => (
  <PushContext.Provider value={push}>
    <PetContext.Provider value={{ status: 'ready', pet, reload: reloadPet }}>
      <TodayScreen />
    </PetContext.Provider>
  </PushContext.Provider>
);
async function renderToday() {
  await render(tree());
  await screen.findByText(/오늘 먹일 약/);
  await screen.findByText('오늘 먹일 약 1 / 2');
}
const saved = (b: Record<string, unknown> = {}) => ({
  id: 'l', petId: 'pet-1', recordDate: '2026-10-06', foodLevel: 2, waterLevel: 2, waterMl: null, weightKg: null,
  symptoms: [], symptomsNone: true, symptomOther: null, memo: '', updatedAt: '', ...b,
});
const puts = () => calls.filter((c) => c.method === 'PUT');
const evening = () => screen.getByRole('checkbox', { name: /오후 8:00/ });

beforeEach(() => {
  calls = [];
  mockParams = {};
  reloadPet.mockClear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('QA 투약 — 연타·롤백', () => {
  it('응답을 기다리는 중 같은 약을 연타해도 POST 는 한 번만 나간다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup(async (r) => {
      if (r.url === '/api/med-logs' && r.method === 'POST') {
        await gate;
        return json(201, { id: 'log-9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:00:00Z' });
      }
    });
    await renderToday();
    await fireEvent.press(evening());
    await fireEvent.press(evening());
    await fireEvent.press(evening());
    release();
    await screen.findByText('오늘 먹일 약 2 / 2');
    expect(calls.filter((c) => c.url === '/api/med-logs' && c.method === 'POST')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
  });

  it('체크 후 응답이 오면 바로 취소(DELETE)할 수 있고 서버 medLogId 를 쓴다', async () => {
    setup((r) => {
      if (r.method === 'POST' && r.url === '/api/med-logs') return json(201, { id: 'log-9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:00:00Z' });
      if (r.method === 'DELETE') return json(204, null);
    });
    await renderToday();
    await fireEvent.press(evening());
    await screen.findByText('오늘 먹일 약 2 / 2');
    await fireEvent.press(screen.getByRole('checkbox', { name: /오후 8:00/ }));
    await screen.findByText('오늘 먹일 약 1 / 2');
    expect(calls.find((c) => c.method === 'DELETE')!.url).toBe('/api/med-logs/log-9');
  });

  it('취소가 실패하면 체크 상태로 복원하고 안내한다', async () => {
    setup((r) => (r.method === 'DELETE' ? json(500, { code: 'INTERNAL', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오전 8:00/ }));
    await screen.findByText(/취소하지 못했어요/);
    expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy();
  });

  it('취소가 404 면 안내 없이 서버 상태로 다시 맞춘다', async () => {
    const synced = todayExample();
    synced.doses[0] = { ...synced.doses[0], taken: false, medLogId: null, takenAt: null };
    let n = 0;
    setup((r) => {
      if (r.method === 'DELETE') return json(404, { code: 'NOT_FOUND', message: 'x' });
      if (r.url.endsWith('/today')) return json(200, ++n === 1 ? todayExample() : synced);
    });
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오전 8:00/ }));
    await screen.findByText('오늘 먹일 약 0 / 2');
    expect(screen.queryByText(/취소하지 못했어요/)).toBeNull();
  });

  it('체크가 404 면 되돌리고 목록을 다시 맞춘다', async () => {
    setup((r) => (r.url === '/api/med-logs' ? json(404, { code: 'NOT_FOUND', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(evening());
    await screen.findByText(/목록에서 뺀 약이에요/);
    expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy();
  });

  it('체크가 400 이면 되돌리고 안내한다', async () => {
    setup((r) => (r.url === '/api/med-logs' ? json(400, { code: 'VALIDATION_ERROR', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(evening());
    await waitFor(() => expect(screen.getByText(/^! /)).toBeTruthy());
    expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy();
  });

  it('네트워크 오류로 체크가 실패하면 되돌리고 안내한다', async () => {
    setup((r) => {
      if (r.url === '/api/med-logs') throw new TypeError('Network request failed');
    });
    await renderToday();
    await fireEvent.press(evening());
    await screen.findByText(/체크하지 못했어요/);
    expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy();
  });

  it('401 이면 되돌리고 오류 문구는 띄우지 않는다(로그인 화면 이동은 client 몫)', async () => {
    setup((r) => (r.url === '/api/med-logs' ? json(401, { code: 'UNAUTHORIZED', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(evening());
    await waitFor(() => expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy());
    expect(screen.queryByText(/체크하지 못했어요/)).toBeNull();
  });

  it('취소가 401 이어도 문구 없이 복원한다', async () => {
    setup((r) => (r.method === 'DELETE' ? json(401, { code: 'UNAUTHORIZED', message: 'x' }) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오전 8:00/ }));
    await waitFor(() => expect(screen.getByText('오늘 먹일 약 1 / 2')).toBeTruthy());
    expect(screen.queryByText(/취소하지 못했어요/)).toBeNull();
  });
});

describe('투약 — 오래된 재동기 응답과 대기 상태', () => {
  const log9 = { id: 'log-9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:00:00Z' };

  it('체크 취소 중 늦게 도착한 오래된 GET /today 응답이 낙관적 상태를 덮어쓰지 않는다', async () => {
    let todayCalls = 0;
    let releaseStale!: () => void;
    const staleGate = new Promise<void>((r) => (releaseStale = r));
    setup(async (r) => {
      if (r.url.endsWith('/today')) {
        todayCalls += 1;
        if (todayCalls === 2) await staleGate; // 두 번째 조회: 느림, 응답은 취소 전 상태
      }
      if (r.method === 'POST' && r.url === '/api/med-logs') return json(409, { code: 'ALREADY_CHECKED', message: 'x' }); // → 재동기 시작
      if (r.method === 'DELETE') return json(204, null);
    });
    await renderToday();
    await fireEvent.press(evening());
    await waitFor(() => expect(todayCalls).toBe(2));
    await fireEvent.press(screen.getByRole('checkbox', { name: /오전 8:00/ })); // 취소 성공
    const morning = () => screen.getByRole('checkbox', { name: /오전 8:00/ });
    await waitFor(() => expect(morning().props.accessibilityState).toMatchObject({ checked: false, disabled: false }));
    await act(async () => releaseStale());
    expect(morning().props.accessibilityState.checked).toBe(false); // 오래된 응답(오전 체크됨)이 되살리지 않음
  });

  it('응답 대기 중인 회차는 재동기 응답이 와도 체크 상태를 유지하고, 응답이 오면 확정된다', async () => {
    let releasePost!: () => void;
    const postGate = new Promise<void>((r) => (releasePost = r));
    let todayCalls = 0;
    setup(async (r) => {
      if (r.url.endsWith('/today')) todayCalls += 1;
      if (r.method === 'POST' && r.url === '/api/med-logs') {
        await postGate;
        return json(201, log9);
      }
      if (r.method === 'DELETE') return json(404, { code: 'NOT_FOUND', message: 'x' }); // → 재동기(서버는 저녁 미체크로 앎)
    });
    await renderToday();
    await fireEvent.press(evening());
    await fireEvent.press(screen.getByRole('checkbox', { name: /오전 8:00/ }));
    await waitFor(() => expect(todayCalls).toBe(2));
    await act(async () => {});
    expect(screen.getByRole('checkbox', { name: /오후 8:00/ }).props.accessibilityState).toMatchObject({ checked: true, disabled: true });
    await act(async () => releasePost());
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /오후 8:00/ }).props.accessibilityState).toMatchObject({ checked: true, disabled: false }));
    expect(calls.filter((c) => c.method === 'POST' && c.url === '/api/med-logs')).toHaveLength(1);
  });

  it('취소가 404 이고 재동기도 실패해도 대기 상태가 풀려 다시 누를 수 있다', async () => {
    let todayCalls = 0;
    setup((r) => {
      if (r.url.endsWith('/today') && ++todayCalls > 1) return json(500, { code: 'INTERNAL', message: 'x' });
      if (r.method === 'DELETE') return json(404, { code: 'NOT_FOUND', message: 'x' });
    });
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오전 8:00/ }));
    await waitFor(() => expect(todayCalls).toBe(2));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /오전 8:00/ }).props.accessibilityState).toMatchObject({ checked: false, disabled: false }));
  });
});

describe('QA 저장 — 값 변환과 경계', () => {
  const pressSave = () => fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));

  it('물 ml 모드: 숫자 아닌 글자는 지워지고 waterLevel 은 null, waterMl 은 숫자로 전송', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ waterLevel: null, waterMl: 350 })) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: 'ml로 적기 ›' }));
    await fireEvent.changeText(screen.getByLabelText('물 마신 양 (ml)'), '3a5,0.');
    expect(screen.getByLabelText('물 마신 양 (ml)').props.value).toBe('350');
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body).toMatchObject({ waterLevel: null, waterMl: 350 });
  });

  it('물 ml 경계: 20000 은 저장, 20001 은 안내하고 PUT 하지 않는다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ waterLevel: null, waterMl: 20000 })) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: 'ml로 적기 ›' }));
    await fireEvent.changeText(screen.getByLabelText('물 마신 양 (ml)'), '20001');
    await pressSave();
    await screen.findByText('! 물은 0~20000 사이 숫자(ml)로 적어 주세요.');
    expect(puts()).toHaveLength(0);
    await fireEvent.changeText(screen.getByLabelText('물 마신 양 (ml)'), '20000');
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.waterMl).toBe(20000);
  });

  it('물 ml 을 비우면 waterMl 은 null', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved()) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: 'ml로 적기 ›' }));
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body).toMatchObject({ waterLevel: null, waterMl: null });
  });

  it('식사: 제안값(2)을 누르면 확정, 한 번 더 누르면 해제되어 null 로 전송', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ foodLevel: null })) : undefined));
    await renderToday();
    await fireEvent.press(screen.getAllByRole('radio', { name: /^보통/ })[0]); // 제안값 → 확정
    await fireEvent.press(screen.getAllByRole('radio', { name: /^보통/ })[0]); // 확정값 재탭 → 해제
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.foodLevel).toBeNull();
  });

  it('증상: 구토+기타(30자 초과 입력 제한) 선택이 symptoms·symptomsNone·symptomOther 로 변환된다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved()) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '구토' }));
    await fireEvent.press(screen.getByRole('button', { name: '기타' }));
    await fireEvent.changeText(screen.getByLabelText('기타 증상 내용'), '절뚝거림');
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body).toMatchObject({ symptoms: ['vomit', 'other'], symptomsNone: false, symptomOther: '절뚝거림' });
  });

  it('증상: "특이사항 없음"을 해제하고 아무것도 안 고르면 symptomsNone=false, symptoms=[]', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved()) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: '특이사항 없음' }));
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body).toMatchObject({ symptoms: [], symptomsNone: false, symptomOther: null });
  });

  it('체중: 쉼표 입력 "4,35" 는 4.35 로 저장, 입력하면 [오늘 쟀어요]가 자동으로 켜진다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ weightKg: 4.35 })) : undefined));
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), '4,35');
    expect(screen.getByRole('checkbox', { name: '오늘 쟀어요' }).props.accessibilityState.checked).toBe(true);
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.weightKg).toBe(4.35);
  });

  it('체중: 스테퍼 +0.1 은 4.45 로 저장된다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ weightKg: 4.45 })) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByLabelText('0.1kg 더하기'));
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.weightKg).toBe(4.45);
  });

  it('체중 입력칸이 "." 일 때 ± 스테퍼는 아무것도 바꾸지 않는다([오늘 쟀어요]도 켜지 않음)', async () => {
    setup();
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), '.');
    await fireEvent.press(screen.getByRole('checkbox', { name: '오늘 쟀어요' })); // "." 입력으로 켜진 것을 끔
    expect(screen.getByRole('checkbox', { name: '오늘 쟀어요' }).props.accessibilityState.checked).toBe(false);
    await fireEvent.press(screen.getByLabelText('0.1kg 더하기'));
    expect(screen.getByLabelText('체중 (kg)').props.value).toBe('.');
    expect(screen.getByRole('checkbox', { name: '오늘 쟀어요' }).props.accessibilityState.checked).toBe(false);
  });

  it('물 ml: 숫자가 아닌 글자만 입력하면(보정 후 빈 값) 빈 값으로 보고 waterMl 은 null 로 전송', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ waterLevel: null, waterMl: null })) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('button', { name: 'ml로 적기 ›' }));
    await fireEvent.changeText(screen.getByLabelText('물 마신 양 (ml)'), 'abc');
    expect(screen.getByLabelText('물 마신 양 (ml)').props.value).toBe('');
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.waterMl).toBeNull();
  });

  it.each(['0', '200', '.', '0,0'])('체중 경계 "%s" 는 안내하고 PUT 하지 않는다', async (text) => {
    setup();
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), text);
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await screen.findByText('! 체중은 0보다 크고 200보다 작은 숫자(kg)로 적어 주세요.');
    expect(puts()).toHaveLength(0);
  });

  it('체중 199.99 는 저장된다', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved({ weightKg: 199.99 })) : undefined));
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), '199.99');
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.weightKg).toBe(199.99);
  });

  it('체중을 지우면(빈 입력) 저장 본문에서 null', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved()) : undefined));
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('체중 (kg)'), '');
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.weightKg).toBeNull();
  });

  it('메모: 입력칸은 200자 제한이고 글자 수가 표시된다, 200자는 그대로 전송', async () => {
    setup((r) => (r.method === 'PUT' ? json(200, saved()) : undefined));
    await renderToday();
    expect(screen.getByLabelText('메모 (선택)').props.maxLength).toBe(200);
    const memo = '가'.repeat(200);
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), memo);
    expect(screen.getByText('200 / 200')).toBeTruthy();
    await pressSave();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()[0].body.memo).toBe(memo);
  });

  it('저장 중 연타해도 PUT 은 한 번', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    setup(async (r) => {
      if (r.method === 'PUT') {
        await gate;
        return json(200, saved());
      }
    });
    await renderToday();
    await pressSave();
    await fireEvent.press(screen.getByRole('button', { name: '저장하는 중…' }));
    release();
    await screen.findByText(/오늘 기록을 남겼어요/);
    expect(puts()).toHaveLength(1);
  });

  it('저장 401 은 오류 문구를 띄우지 않는다', async () => {
    setup((r) => (r.method === 'PUT' ? json(401, { code: 'UNAUTHORIZED', message: 'x' }) : undefined));
    await renderToday();
    await pressSave();
    await waitFor(() => expect(screen.getByRole('button', { name: '오늘 기록 저장' })).toBeTruthy());
    expect(screen.queryByText(/확인해 주세요|문제가/)).toBeNull();
  });

  it('저장 네트워크 오류는 안내하고 입력값은 유지한다', async () => {
    setup((r) => {
      if (r.method === 'PUT') throw new TypeError('Network request failed');
    });
    await renderToday();
    await fireEvent.changeText(screen.getByLabelText('메모 (선택)'), '남길 메모');
    await pressSave();
    await screen.findByText(/서버에 연결할 수 없어요/);
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('남길 메모');
  });

  it('이미 저장된 기록을 다시 열면 저장값이 실선으로 보이고 "기록 수정하기"', async () => {
    setup(undefined, () => todayExample({ dailyLog: saved({ foodLevel: 3, waterLevel: null, waterMl: 250, weightKg: 4.5, memo: '잘 먹음' }) as never }));
    await renderToday();
    expect(screen.getByRole('button', { name: '기록 수정하기' })).toBeTruthy();
    expect(screen.getByLabelText('물 마신 양 (ml)').props.value).toBe('250');
    expect(screen.getByLabelText('체중 (kg)').props.value).toBe('4.5');
    expect(screen.getByLabelText('메모 (선택)').props.value).toBe('잘 먹음');
  });
});

describe('QA 조회 — 401·반려동물 없음', () => {
  it('GET /today 가 401 이면 오류 카드 없이(로그인 화면으로 이동 예정) 로딩 상태에 머문다', async () => {
    setup((r) => (r.url.endsWith('/today') ? json(401, { code: 'UNAUTHORIZED', message: 'x' }) : undefined));
    await render(tree());
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/today'))).toBe(true));
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
  });

  it('pet 이 null 이면 API 를 부르지 않는다(오류 없이 로딩 표시)', async () => {
    setup();
    await render(tree(null));
    expect(calls.filter((c) => c.url.endsWith('/today'))).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull();
  });

  it('GET /today 가 500 이면 서버 오류 안내와 다시 불러오기', async () => {
    setup((r) => (r.url.endsWith('/today') ? json(500, { code: 'INTERNAL', message: 'x' }) : undefined));
    await render(tree());
    await screen.findByRole('button', { name: '다시 불러오기' });
  });
});

describe('QA 푸시 강조 경계', () => {
  it('같은 약의 08:00 은 먹였고 20:00 만 안 먹였으면 20:00 카드만 강조된다', async () => {
    mockParams = { source: 'push', med: 'med-a' };
    setup();
    await renderToday();
    expect(screen.getAllByText('방금 알림 온 약')).toHaveLength(1);
  });

  it('그 약의 모든 회차를 이미 먹였으면 강조하지 않는다', async () => {
    mockParams = { source: 'push', med: 'med-a' };
    setup(undefined, () => {
      const t = todayExample();
      t.doses[1] = { ...t.doses[1], taken: true, medLogId: 'log-2', takenAt: '2026-10-06T11:00:00Z' };
      return t;
    });
    await render(tree());
    await screen.findByText('오늘 먹일 약 2 / 2');
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
  });

  it('강조 중인 약을 체크하면 강조가 사라진다', async () => {
    mockParams = { source: 'push', med: 'med-a' };
    setup((r) => (r.url === '/api/med-logs' ? json(201, { id: 'log-9', medicationId: 'med-a', recordDate: '2026-10-06', scheduledTime: '20:00', takenAt: '2026-10-06T11:00:00Z' }) : undefined));
    await renderToday();
    await fireEvent.press(screen.getByRole('checkbox', { name: /오후 8:00/ }));
    await screen.findByText('오늘 먹일 약 2 / 2');
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
  });

  it('source=push 만 있고 med 가 없거나 빈 문자열이면 강조 없음, today_opened 는 push', async () => {
    mockParams = { source: 'push', med: '' };
    setup();
    await renderToday();
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
    expect(calls.find((c) => c.url === '/api/events')!.body.props.source).toBe('push');
  });

  it('med 파라미터가 다른 약 id 로 바뀌면(재진입) 새 약 기준으로 다시 계산한다', async () => {
    mockParams = { source: 'push', med: 'nope' };
    setup();
    const { rerender } = await render(tree());
    await screen.findByText('오늘 먹일 약 1 / 2');
    expect(screen.queryByText('방금 알림 온 약')).toBeNull();
    mockParams = { source: 'push', med: 'med-a' };
    await rerender(tree());
    await screen.findByText('방금 알림 온 약');
  });
});

describe('QA 날짜 변경 복귀 — 추가', () => {
  it('다른 날짜로 복귀하면 이전 저장 오류·토스트는 지우고 새 날짜로 저장할 수 있다', async () => {
    let handlerAppState!: (s: string) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
      handlerAppState = cb;
      return { remove: jest.fn() };
    }) as never);
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'], now: 1_000_000 });
    let n = 0;
    setup((r) => {
      if (r.method === 'PUT') return json(200, saved({ recordDate: '2026-10-07' }));
      if (r.url.endsWith('/today')) return json(200, todayExample(++n === 1 ? {} : { recordDate: '2026-10-07' }));
    });
    await renderToday();
    await act(async () => {
      jest.setSystemTime(1_000_000 + 31_000);
      handlerAppState('active');
    });
    await screen.findByText('10월 7일 (수)');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록 저장' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0].url).toBe('/api/pets/pet-1/daily-logs/2026-10-07');
  });
});
