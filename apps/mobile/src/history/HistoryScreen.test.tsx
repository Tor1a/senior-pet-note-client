import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { DISCLAIMER } from '../lib/constants';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import { findForbidden } from '../lib/historyText';
import type { HistoryResponse } from '../lib/petApi';
import { setFontScale } from '../testing/fontScale';
import { json, PET } from '../testing/fixtures';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import { PetContext } from '../pet/PetProvider';
import HistoryScreen from './HistoryScreen';

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
// react-native-svg 는 네이티브 모듈이라 Jest 에서는 가벼운 껍데기로 바꾼다(좌표 계산은 chartGeometry 테스트가 보장)
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const make = (name: string) => (props: Record<string, unknown>) => React.createElement(View, { testID: `svg-${name}`, ...props });
  return { __esModule: true, default: make('root'), Circle: make('circle'), Path: make('path'), Line: make('line') };
});

const END = '2026-10-08';
const reloadPet = jest.fn();
let calls: string[] = [];

function fullHistory(): HistoryResponse {
  return historyFixture(
    daysFixture(
      END,
      30,
      {
        '2026-10-02': { weightKg: 4.4, foodLevel: 2, waterMl: 300, symptoms: ['vomit'] },
        '2026-10-03': { weightKg: 4.4, symptoms: ['cough', 'other'], symptomOther: '절뚝', memo: '비밀 메모' },
        '2026-10-04': { symptomsNone: true },
        '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
        '2026-09-10': { weightKg: 4.6, waterLevel: 1 },
      },
      {},
      { scheduledCount: 3, takenCount: 2 },
    ),
  );
}

function setup(handler: () => Response | Promise<Response>) {
  global.fetch = jest.fn(async (url: string) => {
    calls.push(String(url).replace('http://test', ''));
    return handler();
  }) as never;
}

async function renderScreen() {
  await render(
    <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
      <HistoryScreen />
    </PetContext.Provider>,
  );
}

/** 화면에 보이는 글자만 모은다(메모는 사용자 입력이라 검사 대상에서 뺀다) */
function visibleText(): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(screen.toJSON());
  return out.join(' ').replace('비밀 메모', '');
}

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('H1 지난 기록 (모바일)', () => {
  it('파라미터 없이 한 번 호출하고 30일 기본, 7일 전환은 재요청 없이 자른다', async () => {
    setup(() => json(200, fullHistory()));
    await renderScreen();
    expect(await screen.findByText(/기록한 날 5일 \/ 30일/)).toBeTruthy();
    expect(calls).toEqual(['/api/pets/pet-1/daily-logs']);
    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    expect(screen.getByText('10월 2일 ~ 10월 8일 · 기록한 날 4일 / 7일')).toBeTruthy();
    expect(screen.getByText('7일 보기로 바꿨어요')).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('체중 사실 문장·증상 날 ◆·투약 문구·면책, 퍼센트와 금지어 없음, 목록에 메모 없음', async () => {
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    expect(screen.getByText('이 기간 체중 기록 4번')).toBeTruthy();
    expect(screen.getByText(/직전 7일 평균 4.4kg보다 0.3kg 적어요/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '◆ 10월 3일 (토). 기침, 기타(절뚝)' })).toBeTruthy();
    expect(screen.getByText('먹임 체크 60회 / 예정 90회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(visibleText()).not.toContain('비밀');
    expect(visibleText()).not.toContain('%');
    expect({ hit: findForbidden(visibleText()) }).toEqual({ hit: null });
  });

  it('그래프는 한 덩어리 접근성 요소(요약 문장), 표로 보기를 누르면 행 목록으로 바뀐다', async () => {
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    const chart = screen.getByTestId('weight-chart');
    expect(chart.props.accessible).toBe(true);
    expect(chart.props.accessibilityLabel).toBe(
      '체중 그래프. 지난 30일 체중 기록 4번. 첫 기록 4.6kg(9월 10일), 마지막 기록 4.1kg(10월 8일)',
    );
    await fireEvent.press(screen.getByRole('button', { name: '표로 보기' }));
    expect(screen.queryByTestId('weight-chart')).toBeNull();
    expect(screen.getByRole('link', { name: '10월 3일 (토). 체중 4.4kg · ◆ 기침, 기타(절뚝)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '그래프로 보기' })).toBeTruthy();
  });

  it('스크린리더가 켜져 있으면 표 보기가 기본, 글자 2배여도 기본', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    expect(await screen.findByRole('button', { name: '그래프로 보기' })).toBeTruthy();
    expect(screen.queryByTestId('weight-chart')).toBeNull();
  });

  it('글자 2배: 표 보기가 기본이고, 1.3배는 그래프 기본', async () => {
    setFontScale(2);
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    expect(screen.queryByTestId('weight-chart')).toBeNull();
    expect(screen.getByRole('button', { name: '그래프로 보기' })).toBeTruthy();
  });

  it('글자 1.3배: 그래프 기본, 날짜 행은 제목과 요약이 세로로 나뉜 한 링크', async () => {
    setFontScale(1.3);
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    expect(screen.getByTestId('weight-chart')).toBeTruthy();
    const today = screen.getByRole('link', { name: /^10월 8일 \(목\) · 오늘 · 기록 중\. 체중 4.1kg/ });
    expect(within(today).getByText('10월 8일 (목) · 오늘 · 기록 중')).toBeTruthy();
  });

  it('날짜 줄을 누르면 하루 상세로, 기록 없음 줄은 점선·"기록 없음"', async () => {
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    await fireEvent.press(screen.getByRole('link', { name: /^10월 8일 \(목\) · 오늘/ }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/history/2026-10-08');
    expect(screen.getByRole('link', { name: '10월 7일 (수). 기록 없음 · 투약 2/3' })).toBeTruthy();
  });

  it('병원 방문 리포트 만들기: 보던 기간을 이어 리포트로 이동한다', async () => {
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    await fireEvent.press(screen.getByRole('button', { name: '병원 방문 리포트 만들기' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/report?range=30&from=history');
    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    await fireEvent.press(screen.getByRole('button', { name: '병원 방문 리포트 만들기' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/report?range=7&from=history');
  });

  it('기록 0일: 전체 빈 상태와 오늘 기록하러 가기', async () => {
    setup(() => json(200, historyFixture(daysFixture(END, 30))));
    await renderScreen();
    expect(await screen.findByText('이 기간에는 기록이 없어요.')).toBeTruthy();
    expect(screen.queryByText('체중')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록하러 가기' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/');
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it('체중 0번·1번, 기록 1~2일 안내, 약 없으면 투약 카드 숨김', async () => {
    setup(() => json(200, historyFixture(daysFixture(END, 30, { [END]: { foodLevel: 2 } }))));
    await renderScreen();
    expect(await screen.findByText('체중을 적으면 여기에 그래프가 그려져요.')).toBeTruthy();
    expect(screen.getByText('기록이 쌓이면 흐름을 더 볼 수 있어요.')).toBeTruthy();
    expect(screen.queryByText('투약 체크')).toBeNull();
  });

  it('체중 1번: 점만 있고 "한 번 더 적으면 선이 이어져요."', async () => {
    setup(() => json(200, historyFixture(daysFixture(END, 30, { [END]: { weightKg: 4.2 } }))));
    await renderScreen();
    expect(await screen.findByText('한 번 더 적으면 선이 이어져요.')).toBeTruthy();
    expect(screen.getByTestId('weight-chart')).toBeTruthy();
  });

  it('첫 불러오기 실패: 네트워크 안내와 다시 불러오기, 면책 표시', async () => {
    let fail = true;
    setup(() => {
      if (fail) throw new TypeError('Network request failed');
      return json(200, fullHistory());
    });
    await renderScreen();
    expect(await screen.findByText(/서버에 연결할 수 없어요/)).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText(/기록한 날 5일/)).toBeTruthy();
  });

  it('이미 본 내용은 연결이 끊겨도 남고 "마지막으로 불러온 시각"을 알린다(디스크 저장 없음)', async () => {
    let fail = false;
    setup(() => {
      if (fail) throw new TypeError('Network request failed');
      return json(200, fullHistory());
    });
    await renderScreen();
    await screen.findByText(/기록한 날/);
    fail = true;
    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    expect(calls).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: '새로 불러오기' }));
    expect(await screen.findByText(/^마지막으로 불러온 시각: .+ · 지금은 연결이 끊겨 있어요\.$/)).toBeTruthy();
    expect(screen.getByText(/기록한 날 4일 \/ 7일/)).toBeTruthy(); // 내용 유지
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it('404 면 반려동물을 다시 확인한다', async () => {
    setup(() => json(404, { code: 'NOT_FOUND', message: 'x' }));
    await renderScreen();
    await screen.findByText(DISCLAIMER);
    expect(reloadPet).toHaveBeenCalled();
  });
});
