import { act, fireEvent, screen } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';
import { StyleSheet } from 'react-native';
import { DISCLAIMER } from '../lib/constants';
import { visitQuestionExample as ex, visitQuestionListExample as list } from '../lib/visitQuestionFixtures';
import { findVisitQuestionForbidden, VISIT_QUESTION_TEXT as T } from '../lib/visitQuestionText';
import { setFontScale } from '../testing/fontScale';
import { mockRouter, resetRouterMocks, state, systemBack } from '../testing/mockRouter';
import { json, mockServer, reloadPet, renderWith, type Call } from '../todos/todoTestKit';
import VisitQuestionsScreen from './VisitQuestionsScreen';

// 진료 때 물어볼 것 화면: 계약 예시 JSON 으로 fetch 를 가짜로 바꿔 검사한다 (웹 VisitQuestionsPage.test 와 같은 시나리오).

jest.mock('../services/client', () => require('../testing/mockClient'));
jest.mock('expo-router', () => require('../testing/mockRouter').factory());

const Q1 = ex({ id: 'q1', text: '약을 식전에 줘도 되는지 물어보기', createdAt: '2026-10-15T01:00:00Z' });
const Q2 = ex({ id: 'q2', text: '정상인가요? 이상해 보임 <b>그대로</b>', createdAt: '2026-10-15T02:00:00Z' });
const D1 = ex({ id: 'd1', text: '밤에 자주 깨는 것도 얘기하기', completed: true, completedAt: '2026-10-14T05:00:00Z', createdAt: '2026-10-10T00:00:00Z' });
const D2 = ex({ id: 'd2', text: '체중이 줄었는지 물어보기', completed: true, completedAt: '2026-10-14T09:00:00Z', createdAt: '2026-10-09T00:00:00Z' });

const LIST_URL = 'GET /api/pets/pet-1/visit-questions';
const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET');

beforeEach(() => {
  resetRouterMocks();
  reloadPet.mockClear();
  setFontScale(1);
});

const input = () => screen.getByLabelText(T.fieldLabel);

async function type(text: string) {
  await fireEvent.changeText(input(), text);
}

describe('목록 · 정상', () => {
  it('status=all 을 1번 받고 남은 것(등록 순)만 보인다. 완료는 물어본 탭에 있고 최근 체크가 위', async () => {
    const calls = mockServer({ [LIST_URL]: () => json(200, list([Q2, D1, Q1, D2])) });
    await renderWith(<VisitQuestionsScreen />);
    expect(await screen.findByText(Q1.text)).toBeTruthy();
    expect(calls.filter((c) => c.method === 'GET').map((c) => c.search)).toEqual(['?status=all']);
    const texts = [Q1.text, Q2.text].map((t) => screen.getByText(t));
    expect(texts).toHaveLength(2);
    expect(texts[0].props.children).toBe(Q1.text);
    const body = JSON.stringify(screen.toJSON());
    expect(body.indexOf(Q1.text)).toBeLessThan(body.indexOf(JSON.stringify(Q2.text).slice(1, 8)));
    expect(screen.queryByText(new RegExp(D1.text))).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: T.tabDone }));
    const done = screen
      .getAllByText(/^✓ /)
      .map((n) => n.props.children)
      .filter((t) => t !== `✓ ${T.tabDone}`);
    expect(done).toEqual([`✓ ${D2.text}`, `✓ ${D1.text}`]);
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(1);
  });

  it('제목·안내·면책·탭이 있고 입력에는 placeholder 가 없다. 개수·배지·N개 남음이 없다', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1, Q2, D1])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    expect(screen.getByRole('header', { name: T.title })).toBeTruthy();
    expect(screen.getByText(T.guide)).toBeTruthy();
    expect(screen.getByText(T.privacyHelp)).toBeTruthy();
    expect(screen.getByText(T.fieldHelp)).toBeTruthy();
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(input().props.placeholder).toBeUndefined();
    expect(screen.getByRole('tab', { name: T.tabOpen }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('tab', { name: T.tabDone }).props.accessibilityState.selected).toBe(false);
    expect(screen.queryByText(/개 남|\d+\/30|\d+개/)).toBeNull();
    expect(screen.getByText('0 / 100')).toBeTruthy();
  });

  it('앱이 만든 화면 문구에는 금칙어가 없다. 사용자 글(이상해 보임, <b>)은 가공 없이 그대로 보인다', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q2])) });
    await renderWith(<VisitQuestionsScreen />);
    expect(await screen.findByText(Q2.text)).toBeTruthy();
    for (const value of Object.values(T)) expect({ value, hit: findVisitQuestionForbidden(value) }).toEqual({ value, hit: null });
  });

  it('빈 상태 문구. 응답이 비정상(null)이어도 빈 목록', async () => {
    mockServer({ [LIST_URL]: () => json(200, null) });
    await renderWith(<VisitQuestionsScreen />);
    expect(await screen.findByText(T.emptyOpen)).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: T.tabDone }));
    expect(screen.getByText(T.emptyDone)).toBeTruthy();
  });

  it('디스크에 저장하지 않는다: 화면 소스에 저장소 사용이 없고 보안 저장소도 호출되지 않는다', async () => {
    for (const f of ['VisitQuestionsScreen.tsx', 'VisitQuestionRow.tsx', 'VisitQuestionsLink.tsx']) {
      const src = readFileSync(join(__dirname, f), 'utf8')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(src).not.toMatch(/AsyncStorage|SecureStore|localStorage|checklistStorage|tokenStorage|FileSystem|MMKV/);
    }
    mockServer({ [LIST_URL]: () => json(200, list([Q1])), 'POST /api/pets/pet-1/visit-questions': () => json(201, Q2) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await type('새로 적기');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(await screen.findByText(Q2.text)).toBeTruthy();
  });
});

describe('추가', () => {
  it('키보드 완료로 추가: 정규화된 글을 POST 하고 입력을 비우며 안내를 보인다', async () => {
    const calls = mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      'POST /api/pets/pet-1/visit-questions': () => json(201, ex({ id: 'q3', text: '사료 바꿔도 되는지', createdAt: '2026-10-15T05:00:00Z' })),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await type('  사료 바꿔도\n되는지  ');
    expect(screen.getByText('10 / 100')).toBeTruthy();
    await fireEvent(input(), 'submitEditing');
    expect(await screen.findByText('사료 바꿔도 되는지')).toBeTruthy();
    expect(writes(calls)).toEqual([
      expect.objectContaining({ method: 'POST', path: '/api/pets/pet-1/visit-questions', body: { text: '사료 바꿔도 되는지' } }),
    ]);
    expect(input().props.value).toBe('');
    expect(screen.getByText(`✓ ${T.added}`)).toBeTruthy();
    expect(input().props.blurOnSubmit).toBe(false);
    expect(input().props.returnKeyType).toBe('done');
  });

  it('추가 버튼은 보이는 글자 추가, 접근성 이름 물어볼 것 추가', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(T.emptyOpen);
    expect(screen.getByText(T.add)).toBeTruthy();
    expect(screen.getByRole('button', { name: T.addLabel })).toBeTruthy();
  });

  it('빈 입력: 서버 호출 없이 오류 줄', async () => {
    const calls = mockServer({ [LIST_URL]: () => json(200, list([])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(T.emptyOpen);
    await type('   ');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(screen.getByRole('alert')).toHaveTextContent(`! ${T.errorEmpty}`);
    expect(writes(calls)).toHaveLength(0);
  });

  it('100자는 보내고 101자는 자르지 않고 오류 줄(101 / 100). 이모지는 1자', async () => {
    const calls = mockServer({
      [LIST_URL]: () => json(200, list([])),
      'POST /api/pets/pet-1/visit-questions': (body) => json(201, ex({ id: 'q9', text: (body as { text: string }).text })),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(T.emptyOpen);
    await type('가'.repeat(101));
    expect(screen.getByText('101 / 100')).toBeTruthy();
    expect(input().props.value).toHaveLength(101);
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(screen.getByRole('alert')).toHaveTextContent(`! ${T.errorTooLong}`);
    expect(writes(calls)).toHaveLength(0);

    await type('🐶'.repeat(100));
    expect(screen.getByText('100 / 100')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    await screen.findByText(`✓ ${T.added}`);
    expect(writes(calls)).toHaveLength(1);
  });

  it('추가 실패: 입력한 글이 남고 사유와 다시 누르라는 안내', async () => {
    mockServer({
      [LIST_URL]: () => json(200, list([])),
      'POST /api/pets/pet-1/visit-questions': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(T.emptyOpen);
    await type('적던 글');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(await screen.findByText(new RegExp(T.errorAdd))).toBeTruthy();
    expect(screen.getByText(new RegExp(T.errorRetryHint))).toBeTruthy();
    expect(input().props.value).toBe('적던 글');
  });

  it('서버 409(VISIT_QUESTION_LIMIT_REACHED): 한도 문구, 글은 유지하고 목록을 다시 받는다', async () => {
    const calls = mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      'POST /api/pets/pet-1/visit-questions': () => json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await type('하나 더');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(await screen.findByText(T.limitReached)).toBeTruthy();
    expect(input().props.value).toBe('하나 더');
    await act(async () => {});
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('30개면 한도 안내가 보이고 추가가 비활성이며 안내가 버튼 설명이다. 입력은 쓸 수 있다', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ex({ id: `m${i}`, text: `항목 ${i}`, createdAt: `2026-10-15T00:${String(i).padStart(2, '0')}:00Z` }));
    const calls = mockServer({ [LIST_URL]: () => json(200, list(many)) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText('항목 0');
    expect(screen.getByText(T.limitReached)).toBeTruthy();
    const add = screen.getByRole('button', { name: T.addLabel });
    expect(add.props.accessibilityState.disabled).toBe(true);
    expect(add.props.accessibilityHint).toBe(T.limitReached);
    await type('쓸 수는 있어요');
    expect(input().props.value).toBe('쓸 수는 있어요');
    await fireEvent.press(add);
    expect(writes(calls)).toHaveLength(0);
  });

  it('물어본 탭에서 추가하면 남은 것에서 볼 수 있다는 안내', async () => {
    mockServer({
      [LIST_URL]: () => json(200, list([D1])),
      'POST /api/pets/pet-1/visit-questions': () => json(201, Q1),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByRole('tab', { name: T.tabDone });
    await fireEvent.press(screen.getByRole('tab', { name: T.tabDone }));
    await type(Q1.text);
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(await screen.findByText(`✓ ${T.addedElsewhere}`)).toBeTruthy();
  });
});

describe('물어봤어요 · 되돌리기', () => {
  const completion = (calls: { done: boolean[] }) => (body: unknown) => {
    const completed = (body as { completed: boolean }).completed;
    calls.done.push(completed);
    return json(200, { ...Q1, completed, completedAt: completed ? '2026-10-15T06:00:00Z' : null });
  };

  it('체크하면 줄이 접히고 되돌리기가 생긴다. 되돌리면 같은 자리로 돌아온다', async () => {
    const seen = { done: [] as boolean[] };
    mockServer({ [LIST_URL]: () => json(200, list([Q1, Q2])), 'PUT /api/visit-questions/q1/completion': completion(seen) });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.done}, ${Q1.text}` }));
    expect(await screen.findByText(`✓ ${Q1.text} · ${T.doneState}`)).toBeTruthy();
    expect(screen.getByText(`✓ ${T.doneNotice}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: `${T.done}, ${Q1.text}` })).toBeNull();
    expect(screen.getByText(Q2.text)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: `${Q1.text} ${T.done} ${T.undo}` }));
    expect(await screen.findByRole('button', { name: `${T.done}, ${Q1.text}` })).toBeTruthy();
    expect(seen.done).toEqual([true, false]);
    expect(screen.getByText(`✓ ${T.undoneNotice}`)).toBeTruthy();
  });

  it('탭을 바꿨다 오면 접힌 줄이 사라지고 물어본 탭에서 되돌릴 수 있다', async () => {
    const seen = { done: [] as boolean[] };
    mockServer({ [LIST_URL]: () => json(200, list([Q1])), 'PUT /api/visit-questions/q1/completion': completion(seen) });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.done}, ${Q1.text}` }));
    await screen.findByText(`✓ ${Q1.text} · ${T.doneState}`);
    await fireEvent.press(screen.getByRole('tab', { name: T.tabDone }));
    await fireEvent.press(screen.getByRole('tab', { name: T.tabOpen }));
    expect(screen.queryByText(Q1.text)).toBeNull();
    expect(screen.getByText(T.emptyOpen)).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: T.tabDone }));
    await fireEvent.press(screen.getByRole('button', { name: `${Q1.text} ${T.done} ${T.undo}` }));
    await fireEvent.press(screen.getByRole('tab', { name: T.tabOpen }));
    expect(await screen.findByRole('button', { name: `${T.done}, ${Q1.text}` })).toBeTruthy();
    expect(seen.done).toEqual([true, false]);
  });

  it('체크 실패: 그 줄 안 alert, 줄은 원래 상태', async () => {
    mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      'PUT /api/visit-questions/q1/completion': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.done}, ${Q1.text}` }));
    expect(await screen.findByText(new RegExp(T.errorDone))).toBeTruthy();
    expect(screen.getByRole('button', { name: `${T.done}, ${Q1.text}` })).toBeTruthy();
  });

  it('404(다른 기기에서 지움): 안내 후 목록을 다시 받는다', async () => {
    let n = 0;
    const calls = mockServer({
      [LIST_URL]: () => json(200, list(n++ === 0 ? [Q1, Q2] : [Q2])),
      'PUT /api/visit-questions/q1/completion': () => json(404, { code: 'NOT_FOUND', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.done}, ${Q1.text}` }));
    expect(await screen.findByText(`✓ ${T.gone}`)).toBeTruthy();
    await act(async () => {});
    expect(screen.queryByText(Q1.text)).toBeNull();
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });
});

describe('고치기', () => {
  it('같은 줄이 입력 칸으로 바뀌고 저장하면 PUT 후 줄로 돌아온다', async () => {
    const calls = mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      'PUT /api/visit-questions/q1': (body) => json(200, { ...Q1, text: (body as { text: string }).text }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.edit}, ${Q1.text}` }));
    const edit = screen.getByLabelText(`${T.fieldLabel}, ${Q1.text}`);
    expect(edit.props.value).toBe(Q1.text);
    expect(edit.props.autoFocus).toBe(true);
    expect(screen.getByText(`${Q1.text.length} / 100`)).toBeTruthy();
    await fireEvent.changeText(edit, '식후에 줘도 되는지');
    await fireEvent.press(screen.getByRole('button', { name: `식후에 줘도 되는지 고친 내용 ${T.editSave}`.replace('식후에 줘도 되는지', Q1.text) }));
    expect(await screen.findByText('식후에 줘도 되는지')).toBeTruthy();
    expect(writes(calls)).toEqual([expect.objectContaining({ method: 'PUT', body: { text: '식후에 줘도 되는지' } })]);
    expect(screen.getByText(`✓ ${T.edited}`)).toBeTruthy();
  });

  it('바꾼 게 없으면 서버 호출 없이 줄로 돌아간다. 취소는 초안을 버린다', async () => {
    const calls = mockServer({ [LIST_URL]: () => json(200, list([Q1])) });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.edit}, ${Q1.text}` }));
    await fireEvent.press(screen.getByRole('button', { name: `${Q1.text} 고친 내용 ${T.editSave}` }));
    expect(screen.getByRole('button', { name: `${T.edit}, ${Q1.text}` })).toBeTruthy();
    expect(writes(calls)).toHaveLength(0);

    await fireEvent.press(screen.getByRole('button', { name: `${T.edit}, ${Q1.text}` }));
    await fireEvent.changeText(screen.getByLabelText(`${T.fieldLabel}, ${Q1.text}`), '바꾼 글');
    await fireEvent.press(screen.getByRole('button', { name: T.editCancel }));
    expect(screen.getByText(Q1.text)).toBeTruthy();
    expect(screen.queryByText('바꾼 글')).toBeNull();
  });

  it('줄마다 초안을 따로 가진다', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1, Q2])) });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.edit}, ${Q1.text}` }));
    await fireEvent.changeText(screen.getByLabelText(`${T.fieldLabel}, ${Q1.text}`), '첫 줄 초안');
    await fireEvent.press(screen.getByRole('button', { name: `${T.edit}, ${Q2.text}` }));
    expect(screen.getByLabelText(`${T.fieldLabel}, ${Q1.text}`).props.value).toBe('첫 줄 초안');
    expect(screen.getByLabelText(`${T.fieldLabel}, ${Q2.text}`).props.value).toBe(Q2.text);
  });

  it('빈 값·100자 초과·저장 실패는 줄 안 오류, 초안 유지', async () => {
    mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      'PUT /api/visit-questions/q1': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.edit}, ${Q1.text}` }));
    const edit = () => screen.getByLabelText(`${T.fieldLabel}, ${Q1.text}`);
    const save = () => screen.getByRole('button', { name: `${Q1.text} 고친 내용 ${T.editSave}` });
    await fireEvent.changeText(edit(), '  ');
    await fireEvent.press(save());
    expect(screen.getByText(`! ${T.errorEmpty}`)).toBeTruthy();
    await fireEvent.changeText(edit(), '나'.repeat(101));
    await fireEvent.press(save());
    expect(screen.getByText(`! ${T.errorTooLong}`)).toBeTruthy();
    await fireEvent.changeText(edit(), '고친 글');
    await fireEvent.press(save());
    expect(await screen.findByText(new RegExp(`! ${T.errorEdit}`))).toBeTruthy();
    expect(edit().props.value).toBe('고친 글');
  });
});

describe('지우기', () => {
  it('확인 카드에 글을 그대로 보여 주고 그대로 두기가 위에 있다. 지우면 DELETE 후 줄이 사라진다', async () => {
    const calls = mockServer({
      [LIST_URL]: () => json(200, list([Q1, Q2])),
      'DELETE /api/visit-questions/q1': () => json(204, null),
    });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.remove}, ${Q1.text}` }));
    expect(screen.getByText(Q1.text)).toBeTruthy();
    expect(screen.getByText(T.removeTitle)).toBeTruthy();
    expect(screen.getByText(T.removeBody)).toBeTruthy();
    const names = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(names.indexOf(T.removeNo)).toBeLessThan(names.indexOf(T.removeYes));
    await fireEvent.press(screen.getByRole('button', { name: T.removeYes }));
    await screen.findByText(`✓ ${T.removed}`);
    expect(screen.queryByText(Q1.text)).toBeNull();
    expect(writes(calls).map((c) => c.method)).toEqual(['DELETE']);
  });

  it('그대로 두기는 요청 없이 닫는다. 지우기 실패는 확인 카드 안에 오류를 두고 닫지 않는다', async () => {
    const calls = mockServer({
      [LIST_URL]: () => json(200, list([Q1])),
      'DELETE /api/visit-questions/q1': () => json(500, { code: 'INTERNAL', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.remove}, ${Q1.text}` }));
    await fireEvent.press(screen.getByRole('button', { name: T.removeNo }));
    expect(writes(calls)).toHaveLength(0);
    expect(screen.queryByText(T.removeTitle)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: `${T.remove}, ${Q1.text}` }));
    await fireEvent.press(screen.getByRole('button', { name: T.removeYes }));
    expect(await screen.findByText(new RegExp(T.errorRemove))).toBeTruthy();
    expect(screen.getByText(T.removeTitle)).toBeTruthy();
  });
});

describe('불러오기 오류', () => {
  it('네트워크 오류: 공통 문구 + 다시 불러오기, 추가는 비활성이지만 입력은 된다. 다시 누르면 목록', async () => {
    let fail = true;
    mockServer({ [LIST_URL]: () => (fail ? json(200, null) : json(200, list([Q1]))) });
    (global.fetch as jest.Mock).mockImplementationOnce(async () => {
      throw new TypeError('Network request failed');
    });
    await renderWith(<VisitQuestionsScreen />);
    expect(await screen.findByRole('button', { name: T.retry })).toBeTruthy();
    expect(screen.getByRole('button', { name: T.addLabel }).props.accessibilityState.disabled).toBe(true);
    await type('적는 중');
    expect(input().props.value).toBe('적는 중');
    fail = false;
    await fireEvent.press(screen.getByRole('button', { name: T.retry }));
    expect(await screen.findByText(Q1.text)).toBeTruthy();
  });

  it('그 밖의 오류는 loadFailed 문구', async () => {
    mockServer({ [LIST_URL]: () => json(500, { code: 'INTERNAL', message: 'x' }) });
    await renderWith(<VisitQuestionsScreen />);
    expect(await screen.findByText(T.loadFailed)).toBeTruthy();
  });

  it('이미 목록이 있는데 다시 불러오기가 실패하면 목록은 두고 최신이 아닐 수 있다는 문구', async () => {
    let n = 0;
    mockServer({
      [LIST_URL]: () => (n++ === 0 ? json(200, list([Q1])) : json(500, { code: 'INTERNAL', message: 'x' })),
      'POST /api/pets/pet-1/visit-questions': () => json(409, { code: 'VISIT_QUESTION_LIMIT_REACHED', message: 'x' }),
    });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await type('글');
    await fireEvent.press(screen.getByRole('button', { name: T.addLabel }));
    expect(await screen.findByText(T.stale)).toBeTruthy();
    expect(screen.getByText(Q1.text)).toBeTruthy();
  });

  it('404(반려동물 없음)이면 반려동물 정보를 다시 읽는다', async () => {
    mockServer({ [LIST_URL]: () => json(404, { code: 'NOT_FOUND', message: 'x' }) });
    await renderWith(<VisitQuestionsScreen />);
    await act(async () => {});
    expect(reloadPet).toHaveBeenCalled();
  });
});

describe('뒤로 가기 · 이탈 확인', () => {
  it('from 에 따라 뒤로 문구와 목적지가 다르다', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([])) });
    mockRouter.canGoBack.mockReturnValue(false);
    for (const [from, label, href] of [
      [undefined, '오늘 화면으로 돌아가기', '/'],
      ['todos', '할 일 목록으로 돌아가기', '/todos'],
      ['checklist', '처음 키워요 체크리스트로 돌아가기', '/checklist'],
    ] as const) {
      state.params = from ? { from } : {};
      mockRouter.replace.mockClear();
      await renderWith(<VisitQuestionsScreen />);
      const buttons = await screen.findAllByRole('button', { name: label });
      await fireEvent.press(buttons[0]);
      expect(mockRouter.replace).toHaveBeenLastCalledWith(href);
      await screen.unmount();
    }
  });

  it('입력이 비어 있으면 확인 없이 나간다', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    expect(systemBack()).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(screen.queryByText(T.leaveTitle)).toBeNull();
  });

  it('적던 글이 있으면 버튼·시스템 뒤로 모두 확인한다. 계속 고치기는 머물고 나가기는 이동', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    await type('적던 글');
    await fireEvent.press(screen.getByRole('button', { name: '오늘 화면으로 돌아가기' }));
    expect(screen.getByText(T.leaveTitle)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: T.leaveStay }));
    expect(screen.queryByText(T.leaveTitle)).toBeNull();
    expect(input().props.value).toBe('적던 글');

    let blocked = false;
    await act(async () => {
      blocked = systemBack();
    });
    expect(blocked).toBe(true);
    expect(await screen.findByText(T.leaveTitle)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: T.leaveGo }));
    expect(mockNavigationDispatched()).toBe(true);
  });

  it('고치던 글이 바뀌어 있어도 확인한다(바꾸지 않았으면 확인 없음)', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1])) });
    await renderWith(<VisitQuestionsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: `${T.edit}, ${Q1.text}` }));
    expect(systemBack()).toBe(false);
    await fireEvent.changeText(screen.getByLabelText(`${T.fieldLabel}, ${Q1.text}`), '바꿈');
    let blocked = false;
    await act(async () => {
      blocked = systemBack();
    });
    expect(blocked).toBe(true);
  });
});

function mockNavigationDispatched() {
  return require('../testing/mockRouter').mockNavigation.dispatch.mock.calls.length > 0;
}

describe('접근성 · 큰 글씨', () => {
  it('글자 1.0배: 탭은 가로, 줄 안 버튼은 높이 56 이상', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    const tablist = screen.getByLabelText(T.tabGroup);
    expect(StyleSheet.flatten(tablist.props.style).flexDirection).toBe('row');
    for (const name of [`${T.done}, ${Q1.text}`, `${T.edit}, ${Q1.text}`, `${T.remove}, ${Q1.text}`, T.addLabel]) {
      const style = StyleSheet.flatten(screen.getByRole('button', { name }).props.style);
      expect({ name, h: style.minHeight }).toEqual({ name, h: expect.any(Number) });
      expect(style.minHeight).toBeGreaterThanOrEqual(56);
    }
    for (const t of [T.tabOpen, T.tabDone]) {
      expect(StyleSheet.flatten(screen.getByRole('tab', { name: t }).props.style).minHeight).toBeGreaterThanOrEqual(56);
    }
  });

  it('글자 1.3배 이상: 탭과 줄 안 버튼을 세로로 쌓는다. 1.3 미만은 가로', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1])) });
    setFontScale(1.3);
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    expect(StyleSheet.flatten(screen.getByLabelText(T.tabGroup).props.style).flexDirection).toBe('column');
    const edit = screen.getByRole('button', { name: `${T.edit}, ${Q1.text}` });
    const row = edit.parent!.parent!;
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('column');
    await screen.unmount();
    setFontScale(1.29);
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    expect(StyleSheet.flatten(screen.getByLabelText(T.tabGroup).props.style).flexDirection).toBe('row');
  });

  it('스크린리더 이름: 줄 버튼은 앱 문구 + 글, 탭은 선택 상태, 안내는 live region', async () => {
    mockServer({ [LIST_URL]: () => json(200, list([Q1, D1])) });
    await renderWith(<VisitQuestionsScreen />);
    await screen.findByText(Q1.text);
    expect(screen.getByRole('button', { name: `물어봤어요, ${Q1.text}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `고치기, ${Q1.text}` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `지우기, ${Q1.text}` })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: T.tabDone }));
    expect(screen.getByRole('button', { name: `${D1.text} 물어봤어요 되돌리기` })).toBeTruthy();
    expect(screen.getByRole('button', { name: `지우기, ${D1.text}` })).toBeTruthy();
  });
});
