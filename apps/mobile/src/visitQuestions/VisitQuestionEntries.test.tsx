import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import ChecklistScreen from '../checklist/ChecklistScreen';
import { daysFixture, historyFixture } from '../lib/historyFixtures';
import type { Pet } from '../lib/petApi';
import { todoListExample } from '../lib/todoFixtures';
import { VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { PetContext } from '../pet/PetProvider';
import { PushContext } from '../push/pushContext';
import { setFontScale } from '../testing/fontScale';
import { json, PET, todayExample } from '../testing/fixtures';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import TodayScreen from '../today/TodayScreen';
import TodosScreen from '../todos/TodosScreen';
import { VisitQuestionsLink } from './VisitQuestionsLink';

// 진입점 3곳(오늘 화면 · 할 일 목록 · 체크리스트 질문 탭): 위치·이름·이동·네트워크 호출 0 (웹 VisitQuestionEntries.test 와 같은 시나리오)

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('../services/preferences', () => ({ readPreferMl: async () => false, writePreferMl: async () => {} }));
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut: jest.fn() }) }));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());
jest.mock('../services/checklistStorage', () => ({
  loadChecklist: async () => ({}),
  saveChecklist: async () => {},
}));

const push = {
  state: 'unavailable' as const,
  requestPermission: async () => 'unavailable' as const,
  recheck: async () => 'unavailable' as const,
  bannerVisible: false,
  subscribe: () => () => {},
};
let urls: string[] = [];

function server() {
  urls = [];
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace('http://test', '');
    urls.push(path);
    if (path.endsWith('/today')) return json(200, todayExample());
    if (path.includes('/todos')) return json(200, todoListExample([]));
    if (path.includes('/daily-logs')) return json(200, historyFixture(daysFixture('2026-10-06', 30, {})));
    return json(404, { code: 'NOT_FOUND', message: 'x' });
  }) as never;
}

const wrap = (ui: React.ReactElement, pet: Pet = PET) => (
  <PushContext.Provider value={push}>
    <PetContext.Provider value={{ status: 'ready', pet, reload: jest.fn(), setPet: jest.fn() }}>{ui}</PetContext.Provider>
  </PushContext.Provider>
);

beforeEach(() => {
  resetRouterMocks();
  setFontScale(1);
  server();
});
afterAll(() => setFontScale(2));

function textsInOrder(): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(screen.toJSON());
  return out;
}

const noVisitCalls = () => expect(urls.filter((u) => u.includes('visit-questions'))).toEqual([]);

describe('E1 오늘 화면 링크 행', () => {
  it('할 일 카드 아래·체크리스트 카드 위에 있고 이름은 진료 때 물어볼 것. 개수·배지가 없다', async () => {
    await render(wrap(<TodayScreen />, { ...PET, profileType: 'first_time' } as Pet));
    const link = await screen.findByRole('link', { name: T.title });
    const texts = textsInOrder();
    const todo = texts.indexOf('내 할 일 일정');
    const visit = texts.indexOf(T.title);
    const checklist = texts.indexOf('처음 키워요 체크리스트');
    expect(todo).toBeGreaterThan(-1);
    expect(visit).toBeGreaterThan(todo);
    expect(checklist).toBeGreaterThan(visit);
    expect(link.props.accessibilityLabel).toBe(T.title);
    expect(screen.queryByText(/\d+개|남음/)).toBeNull();
    noVisitCalls();
  });

  it('first_time 이 아니어도 보이고, 누르면 /visit-questions 로 간다', async () => {
    await render(wrap(<TodayScreen />));
    await fireEvent.press(await screen.findByRole('link', { name: T.title }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/visit-questions');
    noVisitCalls();
  });
});

describe('E2 할 일 목록 링크 행', () => {
  it('안내 바로 아래에 있고 목록이 비어 있어도 보인다. ?from=todos, API 호출 없음', async () => {
    await render(wrap(<TodosScreen />));
    const link = await screen.findByRole('link', { name: T.title });
    await fireEvent.press(link);
    expect(mockRouter.push).toHaveBeenLastCalledWith('/visit-questions?from=todos');
    noVisitCalls();
  });
});

describe('E3 체크리스트 질문 탭 링크 행', () => {
  it('준비물 탭에는 없고 병원에 물어볼 질문 탭 목록 아래에만 있다. ?from=checklist, 네트워크 호출 0', async () => {
    await render(wrap(<ChecklistScreen />));
    expect(screen.queryByRole('link', { name: T.checklistTitle })).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: '병원에 물어볼 질문' }));
    const link = screen.getByRole('link', { name: T.checklistTitle });
    await fireEvent.press(link);
    expect(mockRouter.push).toHaveBeenLastCalledWith('/visit-questions?from=checklist');
    expect(urls).toEqual([]);
  });
});

describe('링크 행 접근성', () => {
  it('높이 56 이상, › 는 스크린리더에서 숨긴다', async () => {
    await render(wrap(<VisitQuestionsLink />));
    const link = screen.getByRole('link', { name: T.title });
    expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(56);
  });
});
