import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, ScrollView } from 'react-native';
import { visitQuestionExample as ex, visitQuestionListExample as list } from '../lib/visitQuestionFixtures';
import { findVisitQuestionForbidden, VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { doneLabel } from '../lib/visitQuestionText';
import { PetContext } from '../pet/PetProvider';
import { PushContext } from '../push/pushContext';
import { json, PET } from '../testing/fixtures';
import { resetRouterMocks } from '../testing/mockRouter';
import { mockServer, pushValue, reloadPet, renderWith, type Handler } from '../todos/todoTestKit';
import VisitQuestionsScreen from './VisitQuestionsScreen';

// 진료 질문 화면 코드 리뷰 회귀: 목록 응답 경합, create 중복·다른 동물, 409 한도 안내 1개, 이탈 카드 스크롤,
// 추가 비활성 사유, iOS 에서만 announce. 웹 VisitQuestionsPage.test 의 경합 시나리오와 같은 방식(지연 fetch).

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const Q1 = ex({ id: 'q1', text: '약을 식전에 줘도 되는지 물어보기', createdAt: '2026-10-15T01:00:00Z' });
const Q2 = ex({ id: 'q2', text: '사료를 바꿔도 되는지', createdAt: '2026-10-15T02:00:00Z' });
const LIST_URL = 'GET /api/pets/pet-1/visit-questions';
const LIST_URL2 = 'GET /api/pets/pet-2/visit-questions';
const POST_URL = 'POST /api/pets/pet-1/visit-questions';
const PET2 = { ...PET, id: 'pet-2', name: '두번째' };

function deferred<V>() {
  let resolve!: (v: V) => void;
  const promise = new Promise<V>((r) => (resolve = r));
  return { promise, resolve };
}
const input = () => screen.getByLabelText(T.fieldLabel);
const flush = () => act(async () => {});
const shown = () => screen.queryAllByText(T.limitReached);

beforeEach(() => {
  resetRouterMocks();
  reloadPet.mockClear();
});
afterEach(() => jest.restoreAllMocks());

describe('목록 응답 경합', () => {
  it('변경 진행 중에 도착한 오래된 목록 응답은 버리고 변경이 끝난 뒤 한 번 다시 받는다', async () => {
    const stale = deferred<Response>();
    const patch = deferred<Response>();
    let gets = 0;
    mockServer({
      [LIST_URL]: () => {
        gets += 1;
        if (gets === 1) return json(200, list([Q1]));
        if (gets === 2) return stale.promise; // 한도 409 뒤 재조회(느림)
        return json(200, list([{ ...Q1, completed: true, completedAt: '2026-10-15T03:00:00Z' }]));
      },
      [POST_URL]: () => json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: 'x' }),
      'PUT /api/visit-questions/q1/completion': () => patch.promise,
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await fireEvent.changeText(input(), '하나 더');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    await flush();
    expect(gets).toBe(2);

    await fireEvent.press(screen.getByRole('button', { name: doneLabel(Q1.text) }));
    await flush();
    await act(async () => stale.resolve(json(200, list([Q1])))); // 체크 전 목록
    await flush();
    expect(gets).toBe(2); // 변경 중이라 바로 다시 받지 않고 버렸다
    await act(async () => patch.resolve(json(200, { ...Q1, completed: true, completedAt: '2026-10-15T03:00:00Z' })));
    await flush();
    expect(gets).toBe(3);
    expect(screen.queryByText(Q1.text)).toBeNull(); // 남은 것에서 빠진 채로 유지
  });

  it('체크 중 404 는 변경이 끝난 뒤 한 번만 다시 받는다', async () => {
    let gets = 0;
    mockServer({
      [LIST_URL]: () => (++gets, json(200, list(gets === 1 ? [Q1, Q2] : [Q2]))),
      'PUT /api/visit-questions/q1/completion': () => json(404, { code: 'NOT_FOUND', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await fireEvent.press(screen.getByRole('button', { name: doneLabel(Q1.text) }));
    await flush();
    expect(await screen.findByText(T.gone, { exact: false })).toBeTruthy();
    expect(gets).toBe(2);
    expect(screen.queryByText(Q1.text)).toBeNull();
  });
});

describe('추가 응답 처리', () => {
  it('create 응답 id 가 이미 있으면 교체하고 중복으로 추가하지 않는다', async () => {
    mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      [POST_URL]: () => json(201, { ...Q1, text: '고쳐진 글' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await fireEvent.changeText(input(), '새 글');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(await screen.findByText('고쳐진 글')).toBeTruthy();
    expect(screen.queryByText(Q1.text)).toBeNull();
    expect(screen.getAllByText('고쳐진 글')).toHaveLength(1);
  });

  it('반려동물이 바뀌면 목록·입력 상태를 비우고 늦게 온 create 응답은 새 동물 목록에 넣지 않는다', async () => {
    const create = deferred<Response>();
    mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      [LIST_URL2]: () => json(200, list([])),
      [POST_URL]: () => create.promise,
    });
    const tree = (pet: typeof PET) => (
      <PushContext.Provider value={pushValue('registered')}>
        <PetContext.Provider value={{ status: 'ready', pet, reload: reloadPet, setPet: jest.fn() }}>
          <VisitQuestionsScreen />
        </PetContext.Provider>
      </PushContext.Provider>
    );
    const view = await render(tree(PET));
    await screen.findByText(Q1.text);
    await fireEvent.changeText(input(), '새 글');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    await flush();
    await view.rerender(tree(PET2));
    expect(await screen.findByText(T.emptyOpen)).toBeTruthy();
    expect(screen.queryByText(Q1.text)).toBeNull();
    await act(async () => create.resolve(json(201, Q2)));
    await flush();
    expect(screen.queryByText(Q2.text)).toBeNull();
    expect(screen.getByText(T.emptyOpen)).toBeTruthy();
  });
});

describe('409 한도 안내', () => {
  it('서버 409 로 알게 되면 안내는 alert 1개뿐이고, 입력을 고치면 다시 추가할 수 있다', async () => {
    mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      [POST_URL]: () => json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await fireEvent.changeText(input(), '하나 더');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    await flush();
    expect(shown()).toHaveLength(1);
    expect(shown()[0].props.accessibilityRole).toBe('alert');
    const add = screen.getByRole('button', { name: T.addLabel });
    expect(add.props.accessibilityState.disabled).toBe(true);
    expect(add.props.accessibilityHint).toBe(T.limitReached);
    await fireEvent.changeText(input(), '하나 더 고침');
    expect(screen.getByRole('button', { name: T.addLabel }).props.accessibilityState.disabled).toBeFalsy();
    expect(shown()).toHaveLength(0);
  });
});

describe('추가 버튼 비활성 사유', () => {
  it('불러오는 중에는 불러오는 중, 실패하면 실패 문구가 버튼 설명이다', async () => {
    const first = deferred<Response>();
    let n = 0;
    mockServer({ [LIST_URL]: () => (n++ === 0 ? first.promise : json(200, list([]))) });
    await renderWith(<VisitQuestionsScreen />);
    const add = () => screen.getByRole('button', { name: T.addLabel });
    expect(add().props.accessibilityState.disabled).toBe(true);
    expect(add().props.accessibilityHint).toBe(T.loading);
    await act(async () => first.resolve(json(500, { code: 'INTERNAL', message: 'x' })));
    await flush();
    expect(add().props.accessibilityHint).toBe(T.loadFailed);
    await fireEvent.press(screen.getByRole('button', { name: T.retry }));
    await flush();
    expect(add().props.accessibilityHint).toBeUndefined();
    for (const v of [T.loading, T.loadFailed]) expect(findVisitQuestionForbidden(v)).toBeNull();
  });
});

describe('낭독', () => {
  for (const [os, calls] of [
    ['ios', 1],
    ['android', 0],
  ] as const) {
    it(`${os}: announceForAccessibility 는 iOS 에서만 부르고 liveRegion 은 항상 있다`, async () => {
      const original = Platform.OS;
      Platform.OS = os;
      const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
      spy.mockClear();
      try {
        mockServer({ [LIST_URL]: () => json(200, list([])), [POST_URL]: () => json(201, Q2) });
        await renderWith(<VisitQuestionsScreen />);
        await screen.findByText(T.emptyOpen);
        await fireEvent.changeText(input(), '새 글');
        await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
        expect(await screen.findByText(`✓ ${T.added}`)).toBeTruthy();
        expect(spy.mock.calls.filter(([text]) => text === T.added)).toHaveLength(calls);
        expect(JSON.stringify(screen.toJSON())).toContain('"accessibilityLiveRegion":"polite"');
      } finally {
        Platform.OS = original;
        spy.mockRestore();
      }
    });
  }
});

describe('이탈 확인 카드 스크롤', () => {
  it('카드가 뜨면 카드 위치로 화면을 스크롤한다', async () => {
    const scrollTo = jest.fn();
    jest.spyOn(ScrollView.prototype as never, 'scrollTo' as never).mockImplementation(scrollTo as never);
    (ScrollView.prototype as unknown as { getInnerViewRef: () => unknown }).getInnerViewRef = () => ({});
    const View = require('react-native').View;
    const measure = jest.fn((_rel: unknown, ok: (x: number, y: number) => void) => ok(0, 900));
    (View.prototype ?? {}).measureLayout = measure;
    mockServer({ [LIST_URL]: () => json(200, list([Q1])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await fireEvent.changeText(input(), '적던 글');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(await screen.findByText(T.leaveTitle)).toBeTruthy();
    expect(measure).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ y: 780, animated: true });
    delete (ScrollView.prototype as unknown as Record<string, unknown>).getInnerViewRef;
  });
});
