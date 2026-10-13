import { fireEvent, render, screen } from '@testing-library/react-native';
import { findTodoForbidden, TODO_TEXT } from '../lib/todoText';
import { mockRouter, resetRouterMocks } from '../testing/mockRouter';
import { TodayTodoCard } from './TodayTodoCard';

// 오늘 화면 맨 아래 진입 카드: 새 API 를 부르지 않고, 금지 표현이 없다.

jest.mock('expo-router', () => require('../testing/mockRouter').factory());

beforeEach(() => {
  resetRouterMocks();
  global.fetch = jest.fn() as never;
});

describe('오늘 화면 — 내 할 일 일정 진입 카드', () => {
  it('제목·안내·버튼이 있고 문구에 금지 표현이 없다', async () => {
    await render(<TodayTodoCard />);
    expect(screen.getByRole('header', { name: TODO_TEXT.entryTitle })).toBeTruthy();
    expect(screen.getByText(TODO_TEXT.entryBody)).toBeTruthy();
    expect(screen.getByRole('button', { name: '내 할 일 일정 보기' })).toBeTruthy();
    for (const text of [TODO_TEXT.entryTitle, TODO_TEXT.entryBody, TODO_TEXT.entryButton]) {
      expect(findTodoForbidden(text)).toBeNull();
    }
  });

  it('버튼을 누르면 /todos 로 가고, 서버를 부르지 않는다', async () => {
    await render(<TodayTodoCard />);
    await fireEvent.press(screen.getByRole('button', { name: '내 할 일 일정 보기' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/todos');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
