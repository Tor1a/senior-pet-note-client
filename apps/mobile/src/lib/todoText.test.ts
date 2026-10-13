// [공유 로직 테스트 사본] 원본: web/src/lib/todoText.test.ts (2026-10-13 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했고(describe/it/expect 는 jest 전역 사용) 나머지 본문은 동일하다.
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { DISCLAIMER } from './constants';
import { toUserMessage, ApiError } from './api';
import { todoExample } from './todoFixtures';
import {
  bannerTitle,
  cancelDoneLabel,
  collapsedLabel,
  completeLabel,
  countText,
  dateTimeLine,
  findTodoForbidden,
  groupTitle,
  openLabel,
  remindInfoText,
  remindLine,
  rowLabel,
  TODO_FORBIDDEN,
  TODO_TEXT,
  undoLabel,
} from './todoText';
import { TODO_FORM_MESSAGES } from './todoForm';

describe('findTodoForbidden', () => {
  it('기존 findForbidden 목록을 그대로 막는다', () => {
    for (const w of ['이상', '위험', '진단', '정상', '경고', '주의', '악화', '호전', '증가', '감소', '10%']) {
      expect(findTodoForbidden(`할 일 ${w} 안내`)).not.toBeNull();
    }
  });
  it('권유형·독촉 추가 목록을 막는다', () => {
    const bad = [
      '접종할 시간입니다',
      '접종할 시간이에요',
      '오늘 하세요',
      '약을 드세요',
      '접종 받으세요',
      '주사 맞으세요',
      '해야 해요',
      '꼭 가요',
      '놓치지 마요',
      '잊지 마요',
      '미루지 마요',
      '접종이 필요해요',
      '권장 일정',
      '접종을 추천해요',
    ];
    for (const t of bad) expect([t, findTodoForbidden(t) !== null]).toEqual([t, true]);
    expect(TODO_FORBIDDEN.length).toBeGreaterThanOrEqual(14);
  });
  it('"추천하지 않아요"의 추천 자체는 막지 않는다(면책 문장에 필요)', () => {
    expect(findTodoForbidden('일정을 정해 주거나 추천하지 않아요.')).toBeNull();
  });
});

describe('todoText — 모든 문구가 금지 표현 검사를 통과한다', () => {
  it('문구 상수', () => {
    for (const [key, value] of Object.entries(TODO_TEXT)) {
      expect([key, findTodoForbidden(value)]).toEqual([key, null]);
    }
  });
  it('조립 함수 출력', () => {
    const t = todoExample({ remind: false, dueTime: null });
    const samples = [
      remindInfoText(),
      ...(['past', 'today', 'tomorrow', 'future'] as const).map(groupTitle),
      dateTimeLine(todoExample()),
      dateTimeLine(t),
      remindLine(t),
      remindLine(todoExample()),
      rowLabel(t),
      completeLabel('x'),
      undoLabel('x'),
      cancelDoneLabel('x'),
      openLabel('x'),
      collapsedLabel('x'),
      countText(3, 40),
      bannerTitle('day_before'),
      bannerTitle('due_day'),
    ];
    for (const s of samples) expect([s, findTodoForbidden(s)]).toEqual([s, null]);
  });
  it('폼 검사 문구와 오류 문구(API 오류 변환)도 통과한다', () => {
    for (const m of Object.values(TODO_FORM_MESSAGES)) expect(findTodoForbidden(m)).toBeNull();
    const errs = [
      new ApiError('network', 0, null, 'x'),
      new ApiError('http', 400, 'VALIDATION_ERROR', 'x'),
      new ApiError('http', 409, 'TODO_LIMIT_REACHED', 'x'),
      new ApiError('http', 404, 'NOT_FOUND', 'x'),
      new ApiError('http', 500, null, 'x'),
    ];
    for (const e of errs) expect([e.code ?? e.kind, findTodoForbidden(toUserMessage(e, 'todo'))]).toEqual([e.code ?? e.kind, null]);
  });
  it('면책과 "정해 주거나 추천하지 않는다"는 안내가 상시 문구에 들어 있다', () => {
    expect(TODO_TEXT.guide).toContain('추천하지 않아요');
    expect(TODO_TEXT.guide).toContain('수의사 안내');
    expect(findTodoForbidden(DISCLAIMER)).toBeNull();
  });
  it('권유형·독촉 말투가 하나도 없다: ~시간입니다/시간이에요/하세요 류 0건', () => {
    const all = Object.values(TODO_TEXT).join(' ');
    expect(all).not.toMatch(/시간입니다|시간이에요|하세요|밀렸|얼른|지났어요|놓/);
  });
  it('추천 칩·예시 글자(접종/구충/검진 버튼)가 문구에 없다', () => {
    const all = Object.values(TODO_TEXT).join(' ');
    expect(all).not.toMatch(/접종|구충|검진/);
  });
});

describe('todoText — 완료 버튼 이름·알림 줄 오해 방지', () => {
  it('완료 버튼의 접근 가능한 이름은 보이는 글자로 시작한다', () => {
    expect(completeLabel('정기 검진').startsWith(TODO_TEXT.complete)).toBe(true);
    expect(findTodoForbidden(completeLabel(''))).toBeNull();
  });
  it('알림 줄은 이 기기가 아니라 이 할 일의 설정임을 드러낸다', () => {
    expect(remindLine({ remind: true })).not.toBe('알림 켜짐');
    expect(remindLine({ remind: true })).toContain('받기로');
  });
});

describe('todoText — 문장 조립', () => {
  it('날짜·시각 줄과 알림 줄', () => {
    expect(dateTimeLine({ dueDate: '2026-10-20', dueTime: '15:00' })).toBe('10월 20일 (화) · 오후 3:00');
    expect(dateTimeLine({ dueDate: '2026-10-20', dueTime: null })).toBe('10월 20일 (화)');
    expect(remindLine({ remind: true })).toBe('알림 받기로 해 둠');
    expect(remindLine({ remind: false })).toBe('알림 안 받기로 해 둠');
  });
  it('알림 안내는 기획서 시각(하루 전 20:00, 당일 09:00)을 보여 준다', () => {
    expect(remindInfoText()).toBe('하루 전 오후 8:00, 당일 오전 9:00에 알려 드려요.');
  });
  it('묶음 제목과 배너 제목', () => {
    expect(groupTitle('past')).toBe('지난 일정');
    expect(groupTitle('today')).toBe('오늘');
    expect(groupTitle('tomorrow')).toBe('내일');
    expect(groupTitle('future')).toBe('그 이후');
    expect(bannerTitle('day_before')).toBe('내일 일정이 있어요');
    expect(bannerTitle('due_day')).toBe('오늘 일정이 있어요');
    expect(bannerTitle('due_day', '서버 제목')).toBe('서버 제목');
  });
});

describe('toUserMessage — 할 일', () => {
  it('한도 초과(409 TODO_LIMIT_REACHED)는 전용 문구, 다른 409 는 기존 문구', () => {
    expect(toUserMessage(new ApiError('http', 409, 'TODO_LIMIT_REACHED', 'x'), 'todo')).toBe(TODO_TEXT.errorLimit);
    expect(toUserMessage(new ApiError('http', 409, null, 'x'), 'todo')).toContain('이미 처리된 요청');
  });
  it('400 은 글자 수 안내', () => {
    const m = toUserMessage(new ApiError('http', 400, 'VALIDATION_ERROR', 'x'), 'todo');
    expect(m).toContain('40자');
    expect(m).toContain('200자');
    expect(m).toContain('500자');
  });
});
