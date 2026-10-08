import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Share } from 'react-native';
import { DISCLAIMER } from '../lib/constants';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import type { HistoryResponse } from '../lib/petApi';
import { findReportForbidden } from '../lib/reportText';
import { PetContext } from '../pet/PetProvider';
import { json, MED, PET } from '../testing/fixtures';
import { setFontScale } from '../testing/fontScale';
import { mockRouter, resetRouterMocks, state } from '../testing/mockRouter';
import ReportScreen from './ReportScreen';

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
const MEMO = '사료를 잘게 불려 줬어요. 이상해 보여서 병원에 가 봤어요';
const reloadPet = jest.fn();
let calls: string[] = [];

function history30(): HistoryResponse {
  return historyFixture(
    daysFixture(
      END,
      30,
      {
        '2026-09-12': { weightKg: 4.8, memo: '14일 밖 메모' },
        '2026-09-26': { weightKg: 4.4, foodLevel: 2, waterMl: 300 },
        '2026-10-03': { weightKg: 4.0, symptoms: ['cough', 'other'], symptomOther: '절뚝', memo: MEMO },
        '2026-10-04': { symptomsNone: true },
        '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
      },
      {},
      { scheduledCount: 3, takenCount: 2 },
    ),
  );
}

function setup(handlers: { history?: () => Response; meds?: () => Response } = {}) {
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace('http://test', '');
    calls.push(path);
    if (path.includes('/medications')) return (handlers.meds ?? (() => json(200, [MED])))();
    return (handlers.history ?? (() => json(200, history30())))();
  }) as never;
}

async function renderScreen() {
  await render(
    <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet }}>
      <ReportScreen />
    </PetContext.Provider>,
  );
}

function visibleText(): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(screen.toJSON());
  return out.join(' ');
}

/** 사용자 입력(이름·질환·약·메모)을 뺀 화면 글에서 금지 표현을 찾는다 */
function expectNoForbidden() {
  const text = visibleText().replace(MEMO, '').replace('14일 밖 메모', '').replace(PET.conditions ?? '', '').replace('보리', '');
  expect({ hit: findReportForbidden(text) }).toEqual({ hit: null });
}

let shareSpy: jest.SpyInstance;

beforeEach(() => {
  calls = [];
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});

afterEach(() => jest.restoreAllMocks());

describe('R1 병원 방문 리포트 (모바일)', () => {
  it('daily-logs 1번 + 약 목록 1번, 기본 14일, 7/30 전환은 재요청 없이 자른다', async () => {
    setup();
    await renderScreen();
    expect(await screen.findByText('9월 25일 ~ 10월 8일 (14일)')).toBeTruthy();
    expect(calls.filter((c) => c.includes('daily-logs'))).toEqual(['/api/pets/pet-1/daily-logs']);
    expect(calls.filter((c) => c.includes('medications'))).toHaveLength(1);
    expect(screen.getByRole('radio', { name: '14일' }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('14일 중 4일 기록했어요.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: '30일' }));
    expect(screen.getByText('9월 9일 ~ 10월 8일 (30일)')).toBeTruthy();
    expect(screen.getByText('14일 밖 메모')).toBeTruthy();
    expect(screen.getByText('30일 보기로 바꿨어요. 30일 중 5일 기록했어요.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    expect(screen.getByText('10월 2일 ~ 10월 8일 (7일)')).toBeTruthy();
    expect(screen.queryByText('14일 밖 메모')).toBeNull();
    expect(calls.filter((c) => c.includes('daily-logs'))).toHaveLength(1);
    expectNoForbidden();
  });

  it('range 파라미터를 이어받는다', async () => {
    state.params = { range: '30', from: 'history' };
    setup();
    await renderScreen();
    expect(await screen.findByText('9월 9일 ~ 10월 8일 (30일)')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '지난 기록 화면으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('돌아오기: from 이 없으면 오늘, canGoBack 이 아니면 지난 기록/오늘로 이동', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    state.params = { from: 'history' };
    setup();
    await renderScreen();
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    await fireEvent.press(screen.getByRole('button', { name: '지난 기록 화면으로 돌아가기' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/history');
  });

  it('본문: 기본 정보, 체중 네 값, 식사·물, 증상(기타), 투약 고지, 약 목록, 메모, 기록 없는 날, 면책', async () => {
    setup();
    await renderScreen();
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    expect(screen.getByText('보리 · 강아지 · 2012년생')).toBeTruthy();
    expect(screen.getByText('보호자가 적은 질환: 신부전')).toBeTruthy();
    expect(screen.getByText('기록 기준일: 10월 8일')).toBeTruthy();
    expect(screen.getByText('체중을 적은 날 3일')).toBeTruthy();
    expect(screen.getByText('첫 기록 4.4kg (9월 26일) · 마지막 기록 4.1kg (10월 8일)')).toBeTruthy();
    expect(screen.getByText('가장 낮은 기록 4kg (10월 3일) · 가장 높은 기록 4.4kg (9월 26일)')).toBeTruthy();
    expect(screen.getByText('식사: 조금 0일 · 보통 1일 · 많이 1일 · 안 적은 날 12일')).toBeTruthy();
    expect(screen.getByText('◆ 10월 3일 (토) 기침, 기타(절뚝)')).toBeTruthy();
    expect(screen.getByText('특이사항 없음으로 적은 날 1일')).toBeTruthy();
    expect(screen.getByText('먹임 체크 28회 / 예정 42회')).toBeTruthy();
    expect(screen.getByText('현재 등록된 약 기준이에요.')).toBeTruthy();
    expect(screen.getByText('체크하지 않은 날도 약을 먹였을 수 있어요.')).toBeTruthy();
    expect(screen.getByText('아조딜 · 1캡슐')).toBeTruthy();
    expect(screen.getByText('세로축은 0kg부터 시작하지 않아요.')).toBeTruthy();
    expect(screen.getByText('기록 없는 날 10일')).toBeTruthy();
    expect(screen.getByText(MEMO)).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(visibleText()).not.toContain('%');
    const chart = screen.getByTestId('weight-chart');
    expect(chart.props.accessible).toBe(true);
    expectNoForbidden();
  });

  it('표 보기: 기본 접힘, 열면 행마다 한 문장 라벨, 가로 스크롤 표 없음', async () => {
    setup();
    await renderScreen();
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    expect(screen.queryByLabelText(/^10월 8일 \(목\), 체중/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '날짜별 체중 표 보기' }));
    expect(screen.getByLabelText('10월 8일 (목), 체중 4.1킬로그램')).toBeTruthy();
    expect(screen.getByLabelText('10월 3일 (토), 체중 4킬로그램, 증상을 적음 기침, 기타(절뚝)')).toBeTruthy();
    expect(screen.getByLabelText('10월 7일 (수), 체중 기록 없음')).toBeTruthy();
    expect(screen.getByRole('button', { name: '날짜별 체중 표 닫기' })).toBeTruthy();
  });

  it('스크린리더가 켜져 있으면 표가 기본으로 펼쳐진다', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    setup();
    await renderScreen();
    expect(await screen.findByLabelText('10월 8일 (목), 체중 4.1킬로그램')).toBeTruthy();
  });

  it('글자 2배: 표가 기본 펼침, 요약 문장이 그래프보다 먼저', async () => {
    setFontScale(2);
    setup();
    await renderScreen();
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    expect(screen.getByLabelText('10월 8일 (목), 체중 4.1킬로그램')).toBeTruthy();
    const text = visibleText();
    expect(text.indexOf('체중을 적은 날 3일')).toBeLessThan(text.indexOf('세로축은 0kg부터 시작하지 않아요.'));
  });

  it('글자 1.3배: 그래프 + 접힌 표, 값은 세로 배치(행이 깨지지 않음)', async () => {
    setFontScale(1.3);
    setup();
    await renderScreen();
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    expect(screen.getByTestId('weight-chart')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '날짜별 체중 표 보기' }));
    expect(screen.getByLabelText('10월 8일 (목), 체중 4.1킬로그램')).toBeTruthy();
  });

  it('메모 끄기: 본문에서 메모가 사라지고 안내만 남는다', async () => {
    setup();
    await renderScreen();
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    const toggle = screen.getByRole('switch', { name: '메모 포함, 켜짐' });
    await fireEvent.press(toggle);
    expect(screen.getByRole('switch', { name: '메모 포함, 꺼짐' })).toBeTruthy();
    expect(screen.queryByText(MEMO)).toBeNull();
    expect(screen.getByText('메모는 담지 않았어요.')).toBeTruthy();
  });

  it('기록 0일: 빈 상태, 공유 비활성 + 이유, 오늘 기록하러 가기', async () => {
    setup({ history: () => json(200, historyFixture(daysFixture(END, 30))) });
    await renderScreen();
    expect(await screen.findByText('이 기간에는 남긴 기록이 없어요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '공유하기' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('기록이 없어서 만들 수 없어요.')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '오늘 기록하러 가기' }));
    expect(mockRouter.replace).toHaveBeenLastCalledWith('/');
    expectNoForbidden();
  });

  it('불러오는 중에는 공유가 비활성이고 면책은 보인다', async () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as never;
    await renderScreen();
    expect(screen.getByText('불러오는 중…')).toBeTruthy();
    expect(screen.getByText('불러온 뒤에 할 수 있어요.')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });

  it('첫 불러오기 실패: 안내와 다시 불러오기', async () => {
    let fail = true;
    setup({
      history: () => {
        if (fail) throw new TypeError('Network request failed');
        return json(200, history30());
      },
    });
    await renderScreen();
    expect(await screen.findByText(/서버에 연결할 수 없어요/)).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByText('9월 25일 ~ 10월 8일 (14일)')).toBeTruthy();
  });

  it('약 목록만 실패해도 나머지는 보이고 문구가 남는다', async () => {
    setup({ meds: () => json(500, { code: 'INTERNAL', message: 'x' }) });
    await renderScreen();
    expect(await screen.findByText('약 목록을 불러오지 못했어요.')).toBeTruthy();
    expect(screen.getByText('먹임 체크 28회 / 예정 42회')).toBeTruthy();
  });
});

describe('공유 (Share.share, 텍스트만)', () => {
  async function openConfirm() {
    setup();
    await renderScreen();
    await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
    await fireEvent.press(screen.getByRole('button', { name: '공유하기' }));
  }

  it('공유하기 → 확인 카드(담기는 내용·안내) 전에는 Share 를 부르지 않는다', async () => {
    await openConfirm();
    expect(shareSpy).not.toHaveBeenCalled();
    expect(screen.getByText('공유 전에 확인해 주세요')).toBeTruthy();
    expect(screen.getByText('건강 기록이 선택한 앱으로 전달돼요.')).toBeTruthy();
    expect(screen.getByText('담기는 내용')).toBeTruthy();
    expect(screen.getByText('· 보리 · 강아지 · 2012년생')).toBeTruthy();
    expect(screen.getByText('· 현재 등록된 약 1개')).toBeTruthy();
    expect(screen.getByText('· 메모 1건')).toBeTruthy();
    expect(screen.getByRole('switch', { name: '메모 포함, 켜짐' })).toBeTruthy();
    expectNoForbidden();
  });

  it('취소하면 Share 를 부르지 않고 카드가 닫힌다', async () => {
    await openConfirm();
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(shareSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('공유 전에 확인해 주세요')).toBeNull();
    expect(screen.getByRole('button', { name: '공유하기' })).toBeTruthy();
  });

  it('공유 시트 열기 → message 에 텍스트 요약(출처·면책·약 기준 포함), 파일/URL 없음', async () => {
    await openConfirm();
    await fireEvent.press(screen.getByRole('button', { name: '공유 시트 열기' }));
    expect(shareSpy).toHaveBeenCalledTimes(1);
    const arg = shareSpy.mock.calls[0][0] as { message: string; url?: string };
    expect(Object.keys(arg)).toEqual(['message']);
    expect(arg.message.startsWith('[병원 방문 요약] 보리 (강아지, 2012년생)')).toBe(true);
    expect(arg.message).toContain('기록 기준일: 10월 8일');
    expect(arg.message).toContain(DISCLAIMER);
    expect(arg.message).toContain('현재 등록된 약 기준이에요.');
    expect(arg.message).toContain(MEMO);
    expect(await screen.findByText('✓ 공유 시트를 열었어요.')).toBeTruthy();
  });

  it('메모 포함을 끄면 공유 텍스트에서 메모가 빠진다', async () => {
    await openConfirm();
    await fireEvent.press(screen.getByRole('switch', { name: '메모 포함, 켜짐' }));
    expect(screen.getByText('· 메모는 담지 않았어요.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '공유 시트 열기' }));
    const arg = shareSpy.mock.calls[0][0] as { message: string };
    expect(arg.message).not.toContain('사료를 잘게');
    expect(arg.message).toContain('메모는 담지 않았어요.');
  });

  it('미리 보기를 열면 보낼 텍스트 전체가 보인다', async () => {
    await openConfirm();
    await fireEvent.press(screen.getByRole('button', { name: '미리 보기' }));
    expect(visibleText()).toContain('[병원 방문 요약] 보리 (강아지, 2012년생)');
    expect(screen.getByRole('button', { name: '미리 보기 닫기' })).toBeTruthy();
  });

  it('공유 시트 호출 실패: 안내 문구', async () => {
    shareSpy.mockRejectedValue(new Error('x'));
    await openConfirm();
    await fireEvent.press(screen.getByRole('button', { name: '공유 시트 열기' }));
    expect(await screen.findByText('! 공유하지 못했어요. 다시 해 주세요.')).toBeTruthy();
  });

  it('시트를 열었다가 닫으면(dismissedAction) 안내 없이 끝난다', async () => {
    shareSpy.mockResolvedValue({ action: Share.dismissedAction });
    await openConfirm();
    await fireEvent.press(screen.getByRole('button', { name: '공유 시트 열기' }));
    await screen.findByRole('button', { name: '공유하기' });
    expect(screen.queryByText(/공유 시트를 열었어요/)).toBeNull();
  });
});
