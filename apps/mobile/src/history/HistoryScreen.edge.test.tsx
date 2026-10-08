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

describe('H1 경계·오류 (모바일, QA 추가)', () => {
  it('글자 2배: 7일↔30일 전환해도 표 보기 유지, 재요청 없음, 금지어 없음', async () => {
    setFontScale(2);
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날 5일 \/ 30일/);
    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    expect(screen.getByText(/기록한 날 4일 \/ 7일/)).toBeTruthy();
    expect(screen.queryByTestId('weight-chart')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: '30일' }));
    expect(screen.getByText(/기록한 날 5일 \/ 30일/)).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect({ hit: findForbidden(visibleText()) }).toEqual({ hit: null });
  });

  it('글자 2배에서도 "그래프로 보기"를 누르면 그래프가 나온다', async () => {
    setFontScale(2);
    setup(() => json(200, fullHistory()));
    await renderScreen();
    await screen.findByText(/기록한 날/);
    await fireEvent.press(screen.getByRole('button', { name: '그래프로 보기' }));
    expect(screen.getByTestId('weight-chart')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '표로 보기' }));
    expect(screen.queryByTestId('weight-chart')).toBeNull();
  });

  it('체중이 모두 같은 값이어도 그래프가 그려지고 "같아요" 문장이 나온다', async () => {
    const days = daysFixture(END, 30, {
      '2026-10-05': { weightKg: 4.2 },
      '2026-10-08': { weightKg: 4.2 },
    });
    setup(() => json(200, historyFixture(days)));
    await renderScreen();
    await screen.findByText(/기록한 날 2일/);
    expect(screen.getByTestId('weight-chart')).toBeTruthy();
    expect(screen.getByText(/직전 7일 평균 4.2kg과 같아요/)).toBeTruthy();
  });

  it('90일 응답이 와도 30일만 보여 준다(마지막 30개)', async () => {
    const days = daysFixture(END, 90, { '2026-07-11': { weightKg: 5 }, '2026-10-08': { weightKg: 4.1 } });
    setup(() => json(200, historyFixture(days)));
    await renderScreen();
    expect(await screen.findByText(/기록한 날 1일 \/ 30일/)).toBeTruthy();
  });

  it.each([[400, 'INVALID_DATE_RANGE'], [401, 'UNAUTHORIZED'], [500, 'INTERNAL']] as const)(
    '%i 은 한국어 안내와 면책, 다시 불러오기 버튼',
    async (status, code) => {
      setup(() => json(status, { code, message: 'x' }));
      await renderScreen();
      expect(await screen.findByText(/지난 기록을 불러오지 못했어요/)).toBeTruthy();
      expect(screen.getByText(DISCLAIMER)).toBeTruthy();
      expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy();
    },
  );
});
