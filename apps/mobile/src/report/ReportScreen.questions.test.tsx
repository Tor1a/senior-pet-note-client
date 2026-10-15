import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Share } from 'react-native';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import type { HistoryResponse } from '../lib/petApi';
import { findReportForbidden, REPORT_TEXT as T } from '../lib/reportText';
import { visitQuestionExample as ex } from '../lib/visitQuestionFixtures';
import { PetContext } from '../pet/PetProvider';
import { json, MED, PET } from '../testing/fixtures';
import { setFontScale } from '../testing/fontScale';
import { resetRouterMocks } from '../testing/mockRouter';
import ReportScreen from './ReportScreen';

// 병원 방문 리포트 '물어볼 것 포함' (웹 ReportPage.questions.test 와 같은 시나리오 + 공유 확인 카드):
// 기본 꺼짐, 미완료 항목만, 켜고 항목이 있을 때만 출력에 추가. 꺼짐/0개/조회 실패일 때 공유 텍스트는 한 글자도 다르지 않다.

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const make = (name: string) => (props: Record<string, unknown>) => React.createElement(View, { testID: `svg-${name}`, ...props });
  return { __esModule: true, default: make('root'), Circle: make('circle'), Path: make('path'), Line: make('line') };
});

const END = '2026-10-08';
const HISTORY: HistoryResponse = historyFixture(
  daysFixture(
    END,
    30,
    {
      '2026-10-03': { weightKg: 4.0, symptoms: ['cough'], memo: '사료를 잘게 불려 줬어요.' },
      '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
    } as never,
    {},
    { scheduledCount: 3, takenCount: 2 },
  ),
);
const EMPTY_HISTORY: HistoryResponse = historyFixture(daysFixture(END, 30, {} as never, {}, { scheduledCount: 0, takenCount: 0 }));

const Q1 = ex({ id: 'q1', text: '약을 식전에 줘도 되는지 물어보기' });
const Q2 = ex({ id: 'q2', text: '정상인가요? 이상해 보임 <b>그대로</b>' });

type Questions = { ok: unknown } | { status: number } | { network: true };
let urls: string[] = [];
const reloadPet = jest.fn();

function setup(questions: Questions, history: HistoryResponse = HISTORY) {
  urls = [];
  global.fetch = jest.fn(async (input: string) => {
    const path = String(input).replace('http://test', '');
    urls.push(path);
    if (path.includes('/visit-questions')) {
      if ('network' in questions) throw new TypeError('Network request failed');
      if ('status' in questions) return json(questions.status, { code: 'INTERNAL', message: 'x' });
      return json(200, questions.ok);
    }
    if (path.includes('/medications')) return json(200, [MED]);
    return json(200, history);
  }) as never;
}

async function renderScreen() {
  await render(
    <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet, setPet: jest.fn() }}>
      <ReportScreen />
    </PetContext.Provider>,
  );
  await screen.findByText('9월 25일 ~ 10월 8일 (14일)');
}

const questionsSwitch = (state: '켜짐' | '꺼짐') => screen.getByRole('switch', { name: `${T.questionsSwitch}, ${state}` });

let shareSpy: jest.SpyInstance;
beforeEach(() => {
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  shareSpy = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
});
afterEach(() => jest.restoreAllMocks());

/** 공유 확인 카드를 거쳐 실제로 Share 에 넘어간 텍스트와 카드의 '담기는 내용' 줄 */
async function sharedMessage() {
  await fireEvent.press(await screen.findByRole('button', { name: '공유하기' }));
  const contents = screen.queryAllByText(/^· /).map((n) => n.props.children as string);
  await fireEvent.press(screen.getByRole('button', { name: '공유 시트 열기' }));
  return { message: (shareSpy.mock.calls[0][0] as { message: string }).message, contents };
}

describe('물어볼 것 포함 — 요청과 스위치', () => {
  it('리포트를 열 때 status=open 을 1번만 부르고, 7/30일 전환에도 다시 부르지 않는다', async () => {
    setup({ ok: { questions: [Q1] } });
    await renderScreen();
    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    await fireEvent.press(screen.getByRole('radio', { name: '30일' }));
    expect(urls.filter((u) => u.includes('visit-questions'))).toEqual(['/api/pets/pet-1/visit-questions?status=open']);
  });

  it('기본은 꺼짐: 메모 스위치 아래에 스위치와 힌트가 있고 본문에는 섹션이 없다', async () => {
    setup({ ok: { questions: [Q1] } });
    await renderScreen();
    const sw = questionsSwitch('꺼짐');
    expect(sw.props.accessibilityState.checked).toBe(false);
    expect(screen.getByText(T.questionsHintApp)).toBeTruthy();
    expect(screen.queryByText(T.questionsTitle)).toBeNull();
    const order = screen.getAllByRole('switch').map((s) => s.props.accessibilityLabel);
    expect(order).toEqual(['메모 포함, 켜짐', `${T.questionsSwitch}, 꺼짐`]);
    expect(StyleLike(sw)).toBeGreaterThanOrEqual(56);
  });

  it('켜면 공유 텍스트에 메모 섹션 아래·면책 위로 적은 그대로 들어가고 확인 카드 안내 줄이 건수로 바뀐다', async () => {
    setup({ ok: { questions: [Q1, Q2] } });
    await renderScreen();
    await fireEvent.press(questionsSwitch('꺼짐'));
    expect(questionsSwitch('켜짐').props.accessibilityState.checked).toBe(true);
    const { message, contents } = await sharedMessage();
    expect(contents).toContain('· 물어볼 것 2건');
    expect(contents).not.toContain(`· ${T.questionsExcluded}`);
    // 메모 섹션 아래, 면책 위, 적은 그대로(가공·검열 없음)
    const head = message.indexOf(`■ ${T.questionsTitle}`);
    expect(head).toBeGreaterThan(message.indexOf('사료를 잘게 불려 줬어요.'));
    expect(message).toContain(`${T.questionsNote}\n☐ ${Q1.text}\n☐ ${Q2.text}`);
    expect(message.indexOf(Q2.text)).toBeLessThan(message.indexOf('본 기록은 의료적 판단을 대신하지 않습니다.'));
    expect(findReportForbidden([T.questionsTitle, T.questionsNote, T.questionsSwitch, T.questionsHintApp].join(' '))).toBeNull();
  });

  it('공유 확인 카드에도 같은 스위치가 있고 화면과 상태를 공유한다', async () => {
    setup({ ok: { questions: [Q1] } });
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: '공유하기' }));
    // 확인 카드가 열리면 화면 쪽 스위치는 숨고 카드 안에 하나만 있다
    expect(screen.getAllByRole('switch').map((s) => s.props.accessibilityLabel)).toEqual([
      '메모 포함, 켜짐',
      `${T.questionsSwitch}, 꺼짐`,
    ]);
    expect(screen.getByText(`· ${T.questionsExcluded}`)).toBeTruthy();
    await fireEvent.press(questionsSwitch('꺼짐'));
    expect(screen.getByText('· 물어볼 것 1건')).toBeTruthy();
    expect(screen.queryByText(`· ${T.questionsExcluded}`)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '취소' }));
    expect(questionsSwitch('켜짐')).toBeTruthy(); // 카드를 닫아도 켠 상태가 이어진다
  });

  it('끄면 다시 빠진다', async () => {
    setup({ ok: { questions: [Q1] } });
    await renderScreen();
    await fireEvent.press(questionsSwitch('꺼짐'));
    await fireEvent.press(questionsSwitch('켜짐'));
    const { message } = await sharedMessage();
    expect(message).not.toContain(T.questionsTitle);
    expect(message).not.toContain(Q1.text);
  });

  it('옵션은 어디에도 저장하지 않는다: 다시 열면 꺼짐', async () => {
    setup({ ok: { questions: [Q1] } });
    await renderScreen();
    await fireEvent.press(questionsSwitch('꺼짐'));
    await screen.unmount();
    await renderScreen();
    expect(questionsSwitch('꺼짐')).toBeTruthy();
  });
});

describe('물어볼 것 포함 — 조회 시점', () => {
  it('기록이 없는 리포트(recorded 0)에서는 물어볼 것을 조회하지 않는다', async () => {
    setup({ ok: { questions: [Q1] } }, EMPTY_HISTORY);
    await render(
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet, setPet: jest.fn() }}>
        <ReportScreen />
      </PetContext.Provider>,
    );
    await screen.findByText(T.emptyTitle);
    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    expect(urls.filter((u) => u.includes('visit-questions'))).toEqual([]);
  });

  it('조회가 실패해도 기간을 바꿔 자동으로 다시 조회하지 않는다(다시 불러오기만)', async () => {
    setup({ status: 500 });
    await renderScreen();
    await screen.findByText(T.questionsFailed);
    await fireEvent.press(screen.getByRole('radio', { name: '7일' }));
    await fireEvent.press(screen.getByRole('radio', { name: '30일' }));
    expect(urls.filter((u) => u.includes('visit-questions'))).toHaveLength(1);
  });
});

describe('물어볼 것 포함 — 꺼짐·0개·실패는 기존 출력과 완전 동일', () => {
  it('꺼짐이면 공유 텍스트가 0개일 때와 한 글자도 다르지 않다. 0개/비정상 응답은 스위치도 안내 줄도 없다', async () => {
    setup({ ok: { questions: [] } });
    await renderScreen();
    expect(screen.queryByRole('switch', { name: new RegExp(T.questionsSwitch) })).toBeNull();
    expect(screen.queryByText(T.questionsFailed)).toBeNull();
    const zero = await sharedMessage();
    expect(zero.contents.some((c) => c.includes('물어볼 것'))).toBe(false);
    await screen.unmount();

    setup({ ok: null });
    await renderScreen();
    expect(screen.queryByRole('switch', { name: new RegExp(T.questionsSwitch) })).toBeNull();
    shareSpy.mockClear();
    const nul = await sharedMessage();
    expect(nul.message).toBe(zero.message);
    expect(nul.contents).toEqual(zero.contents);
    await screen.unmount();

    setup({ ok: { questions: [Q1] } });
    await renderScreen();
    shareSpy.mockClear();
    const off = await sharedMessage();
    expect(off.message).toBe(zero.message);
    // 확인 카드에서만 "담지 않았어요" 한 줄이 더해진다
    expect(off.contents).toEqual([...zero.contents, `· ${T.questionsExcluded}`]);
  });

  for (const [label, failure] of [
    ['네트워크 오류', { network: true } as const],
    ['500', { status: 500 }],
  ] as const) {
    it(`조회 실패(${label}): 스위치 없음, 실패 줄 + 다시 불러오기, 공유 텍스트는 그대로`, async () => {
      setup({ ok: { questions: [] } });
      await renderScreen();
      const reference = await sharedMessage();
      await screen.unmount();

      setup(failure);
      await renderScreen();
      expect(await screen.findByText(T.questionsFailed)).toBeTruthy();
      expect(screen.queryByRole('switch', { name: new RegExp(T.questionsSwitch) })).toBeNull();
      expect(screen.getByRole('switch', { name: '메모 포함, 켜짐' })).toBeTruthy();
      shareSpy.mockClear();
      const failed = await sharedMessage();
      expect(failed.message).toBe(reference.message);
      expect(failed.contents).toEqual(reference.contents);
    });
  }

  it('다시 불러오기가 성공하면 스위치가 나타난다', async () => {
    setup({ status: 500 });
    await renderScreen();
    await screen.findByText(T.questionsFailed);
    setup({ ok: { questions: [Q1] } });
    await fireEvent.press(screen.getByRole('button', { name: T.retry }));
    expect(await screen.findByRole('switch', { name: `${T.questionsSwitch}, 꺼짐` })).toBeTruthy();
    expect(screen.queryByText(T.questionsFailed)).toBeNull();
  });

  it('기록이 없는 기간(recorded 0)에는 스위치·실패 줄을 숨긴다', async () => {
    setup({ ok: { questions: [Q1] } }, EMPTY_HISTORY);
    await render(
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet, setPet: jest.fn() }}>
        <ReportScreen />
      </PetContext.Provider>,
    );
    await screen.findByText(T.emptyTitle);
    expect(screen.queryByRole('switch', { name: new RegExp(T.questionsSwitch) })).toBeNull();
    await screen.unmount();
    setup({ status: 500 }, EMPTY_HISTORY);
    await render(
      <PetContext.Provider value={{ status: 'ready', pet: PET, reload: reloadPet, setPet: jest.fn() }}>
        <ReportScreen />
      </PetContext.Provider>,
    );
    await screen.findByText(T.emptyTitle);
    expect(screen.queryByText(T.questionsFailed)).toBeNull();
  });
});

function StyleLike(node: { props: { style?: unknown } }): number {
  const { StyleSheet } = require('react-native');
  return StyleSheet.flatten(typeof node.props.style === 'function' ? undefined : node.props.style)?.minHeight ?? 0;
}
