// [공유 로직 테스트 사본] 원본: web/src/lib/reportText.questions.test.ts (2026-10-15 복사)
// 웹 원본에서 첫 줄 `import ... from 'vitest'` 한 줄만 제거했다(나머지 본문은 동일).
// 웹 원본을 고치면 이 사본도 같이 고친다. 추후 packages/shared 로 통합 예정.
import { daysFixture } from './historyFixtures';
import type { DailyLog, Medication } from './petApi';
import {
  buildReport,
  findReportForbidden,
  REPORT_TEXT,
  shareContents,
  toPlainText,
  type MedicationsState,
  type ReportInput,
} from './reportText';

// 리포트 '물어볼 것 포함' (설계 5장, 기획서 5장): 꺼짐/0개/조회 실패일 때 기존 출력과 완전히 같고,
// 켜져 있고 항목이 있을 때만 메모 블록 다음·'기록 없는 날' 앞에 섹션이 들어간다.

const END = '2026-10-08';
const PET = { name: '초코', species: 'dog' as const, birthYear: 2014, conditions: '신장 관리 중' };
const med: Medication = { id: 'm1', petId: 'pet-1', name: '아조딜', doseText: '1캡슐', times: ['08:00', '20:00'], active: true };
const READY: MedicationsState = { status: 'ready', items: [med] };
const LOGS: Record<string, Partial<DailyLog>> = {
  '2026-10-03': { weightKg: 4.0, symptoms: ['vomit'], memo: '사료를 잘게 불려 줬어요.\n이상해 보여서' },
  '2026-10-08': { weightKg: 4.1, foodLevel: 3 },
};

function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    pet: PET,
    recordDate: END,
    days: daysFixture(END, 14, LOGS, {}, { scheduledCount: 3, takenCount: 2 }),
    medications: READY,
    includeMemo: true,
    ...over,
  };
}

describe('물어볼 것 — 꺼짐/0개/실패 회귀 동일성', () => {
  for (const includeMemo of [true, false]) {
    for (const restWording of ['app', 'paper'] as const) {
      it(`questions 없음·undefined·빈 배열은 모델과 공유 텍스트가 완전히 같다 (메모 ${includeMemo}, ${restWording})`, () => {
        const base = input({ includeMemo, restWording });
        const plain = buildReport(base);
        const withUndefined = buildReport({ ...base, questions: undefined });
        const withEmpty = buildReport({ ...base, questions: [] });
        expect(withUndefined).toStrictEqual(plain);
        expect(withEmpty).toStrictEqual(plain);
        expect('questions' in plain).toBe(false);
        expect('questions' in withEmpty).toBe(false);
        expect(toPlainText(withEmpty, base.days)).toBe(toPlainText(plain, base.days));
        expect(toPlainText(plain, base.days)).not.toContain('물어');
        expect(JSON.stringify(plain)).not.toContain('물어');
      });
    }
  }

  it('꺼짐 때 공유 텍스트에 "물어볼 것은 담지 않았어요."를 넣지 않는다', () => {
    const m = buildReport(input());
    expect(toPlainText(m, input().days)).not.toContain(REPORT_TEXT.questionsExcluded);
  });

  it('공유 확인 목록: 항목 0개·조회 실패(기본값 0)면 줄이 늘지 않는다', () => {
    const m = buildReport(input());
    expect(shareContents(m, 1)).toEqual(shareContents(m, 1, 0));
    expect(shareContents(m, 1).join('\n')).not.toContain('물어볼 것');
  });
});

describe('물어볼 것 — 켜졌을 때', () => {
  const Q = ['약을 식전에 줘도 되는지 물어보기', '밤에 자주 깨는 것도 얘기하기'];

  it('모델에 서버 순서 그대로의 글이 들어간다(가공·말줄임·개수 제한 없음)', () => {
    const many = Array.from({ length: 30 }, (_, i) => `질문 ${i + 1} 이상 정상 <b>그대로</b>`);
    const m = buildReport(input({ questions: many }));
    expect(m.questions?.items).toEqual(many);
    expect(m.questions?.items).toHaveLength(30);
  });

  it('공유 텍스트: 메모 블록 다음, 기록 없는 날 앞에 한 블록. 줄바꿈은 들여쓴다', () => {
    const days = input().days;
    const m = buildReport(input({ questions: [...Q, '첫 줄\n둘째 줄'] }));
    const text = toPlainText(m, days);
    const memoAt = text.indexOf('■ 메모 (적은 그대로)');
    const qAt = text.indexOf(`■ ${REPORT_TEXT.questionsTitle}`);
    const gapsAt = text.indexOf('기록 없는 날');
    expect(memoAt).toBeGreaterThan(-1);
    expect(qAt).toBeGreaterThan(memoAt);
    expect(gapsAt).toBeGreaterThan(qAt);
    expect(text).toContain(
      `■ 물어보고 싶은 것 (적은 그대로)\n보호자가 미리 적어 둔 내용이에요.\n☐ ${Q[0]}\n☐ ${Q[1]}\n☐ 첫 줄\n  > 둘째 줄`,
    );
  });

  it('섹션을 빼면 켠 출력이 꺼진 출력과 정확히 같다(다른 곳은 건드리지 않는다)', () => {
    const days = input().days;
    const off = toPlainText(buildReport(input()), days);
    const on = toPlainText(buildReport(input({ questions: Q })), days);
    const block = `\n■ ${REPORT_TEXT.questionsTitle}\n${REPORT_TEXT.questionsNote}\n☐ ${Q[0]}\n☐ ${Q[1]}\n`;
    expect(on.replace(block, '')).toBe(off);
  });

  it('메모를 끈 상태에서도 섹션이 들어간다', () => {
    const m = buildReport(input({ includeMemo: false, questions: Q }));
    expect(toPlainText(m, input().days)).toContain(`☐ ${Q[0]}`);
  });

  it('공유 확인 목록: 켜짐은 N건, 꺼짐 + 항목 있음은 담지 않았어요', () => {
    const on = buildReport(input({ questions: Q }));
    expect(shareContents(on, 1).at(-1)).toBe('물어볼 것 2건');
    const off = buildReport(input());
    expect(shareContents(off, 1, 2).at(-1)).toBe('물어볼 것은 담지 않았어요.');
  });

  it('앱이 만든 섹션 문구는 금칙어 검사를 통과한다(사용자 글 제외)', () => {
    const m = buildReport(input({ questions: ['이상해 보임'] }));
    const text = toPlainText(m, input().days);
    const appBlock = `■ ${REPORT_TEXT.questionsTitle}\n${REPORT_TEXT.questionsNote}`;
    expect(text).toContain(appBlock);
    expect(findReportForbidden(appBlock)).toBeNull();
    // 사용자 글은 가공·검열 없이 그대로
    expect(text).toContain('☐ 이상해 보임');
  });
});
