import { describe, expect, it } from 'vitest';
import { DISCLAIMER } from './constants';
import { DELETE_GUIDE_TEXT, deleteGuideTexts } from './deleteGuide';
import { findPrivacyForbidden } from './privacyText';
import { findReportForbidden, REPORT_TEXT } from './reportText';
import { findVisitQuestionForbidden, VISIT_QUESTION_LABEL_PREFIXES, VISIT_QUESTION_TEXT } from './visitQuestionText';
import { doneLabel, editLabel, problemText, removeLabel, saveEditLabel, undoLabel } from './visitQuestionText';
import { TODO_TEXT } from './todoText';
import { findForbidden } from './historyText';

const ALL = Object.entries(VISIT_QUESTION_TEXT);

describe('진료 때 물어볼 것 문구', () => {
  it('앱이 만든 문구 전수가 findVisitQuestionForbidden 을 통과한다(findForbidden + TODO_FORBIDDEN)', () => {
    for (const [key, text] of ALL) {
      expect({ key, hit: findVisitQuestionForbidden(text) }).toEqual({ key, hit: null });
    }
    // 조립 함수의 앱 문구 부분
    for (const prefix of VISIT_QUESTION_LABEL_PREFIXES) expect(findVisitQuestionForbidden(prefix)).toBeNull();
    expect(findVisitQuestionForbidden(problemText('empty'))).toBeNull();
    expect(findVisitQuestionForbidden(problemText('tooLong'))).toBeNull();
    expect(findVisitQuestionForbidden(`${VISIT_QUESTION_TEXT.errorAdd} ${VISIT_QUESTION_TEXT.errorRetryHint}`)).toBeNull();
  });

  it('검사기는 실제로 금지 표현을 잡는다(기존 18개 + 할 일 목록)', () => {
    expect(findVisitQuestionForbidden('정상이에요')).toBe('정상');
    expect(findVisitQuestionForbidden('꼭 적으세요')).toBe('꼭');
    expect(findVisitQuestionForbidden('기록하세요')).toBe('하세요');
    expect(findForbidden('이상해 보임')).toBe('이상');
  });

  it('화면 문구에 "질문"이라는 낱말과 개수·진행률 표현이 없다', () => {
    for (const [key, text] of ALL) {
      expect({ key, hit: /질문|남음|남았|\d+\s*\/\s*30|아직|진행/.test(text) }).toEqual({ key, hit: false });
    }
  });

  it('설계 7-2 의 핵심 문구가 그대로다', () => {
    const T = VISIT_QUESTION_TEXT;
    expect(T.title).toBe('진료 때 물어볼 것');
    expect(T.tabOpen).toBe('남은 것');
    expect(T.tabDone).toBe('물어본 것');
    expect(T.emptyOpen).toBe('적어 둔 것이 없어요.');
    expect(T.emptyDone).toBe('물어봤다고 체크한 것이 없어요.');
    expect(T.limitReached).toBe('물어볼 것은 30개까지 적어 둘 수 있어요. 지난 것을 지운 뒤 다시 시도해 주세요.');
    expect(T.removeNo).toBe('그대로 두기');
    expect(T.checklistLink).toBe('내가 물어볼 것 적어 두기 ›');
  });

  it('기존 문구와 같은 글자를 재사용하는 것은 그대로 같다', () => {
    expect(VISIT_QUESTION_TEXT.stale).toBe(TODO_TEXT.stale);
    expect(VISIT_QUESTION_TEXT.leaveTitle).toBe(TODO_TEXT.leaveTitle);
    expect(VISIT_QUESTION_TEXT.leaveBody).toBe(TODO_TEXT.leaveBody);
    expect(VISIT_QUESTION_TEXT.leaveStay).toBe(TODO_TEXT.leaveStay);
    expect(VISIT_QUESTION_TEXT.leaveGo).toBe(TODO_TEXT.leaveGo);
    expect(VISIT_QUESTION_TEXT.errorRetryHint).toBe(TODO_TEXT.errorRetryHint);
    expect(VISIT_QUESTION_TEXT.backToTodos).toBe(TODO_TEXT.backToList);
    expect(VISIT_QUESTION_TEXT.loadFailed).toBe(REPORT_TEXT.questionsFailed);
    expect(findVisitQuestionForbidden(DISCLAIMER)).toBeNull();
  });

  it('개인정보 도움말은 memoHelp 틀이고 개인정보 금칙어 검사를 통과한다', () => {
    expect(findPrivacyForbidden(VISIT_QUESTION_TEXT.privacyHelp)).toBeNull();
    expect(VISIT_QUESTION_TEXT.privacyHelp).toContain('보호자 본인의 건강 정보는 적지 마세요.');
  });

  it('접근성 이름은 "앱 문구, 글" 형식이고 사용자 글은 검사 대상이 아니다', () => {
    const text = '정상인가요? 이상해 보임';
    expect(doneLabel(text)).toBe('물어봤어요, 정상인가요? 이상해 보임');
    expect(undoLabel(text)).toBe('정상인가요? 이상해 보임 물어봤어요 되돌리기');
    expect(editLabel(text)).toBe('고치기, 정상인가요? 이상해 보임');
    expect(removeLabel(text)).toBe('지우기, 정상인가요? 이상해 보임');
    expect(saveEditLabel(text)).toContain('고친 내용 저장');
    // 사용자 글에는 금칙어가 있어도 앱 문구 부분은 깨끗하다
    expect(findVisitQuestionForbidden(text)).not.toBeNull();
    for (const label of [doneLabel, undoLabel, editLabel, removeLabel, saveEditLabel]) {
      expect(label('')).not.toMatch(/\d+개 중|남은 \d+개/);
    }
  });

  it('리포트 문구(7-3)는 findReportForbidden(= findForbidden + REPORT_FORBIDDEN)을 통과한다', () => {
    const keys = [
      'questionsTitle',
      'questionsNote',
      'questionsSwitch',
      'questionsHintWeb',
      'questionsHintApp',
      'questionsFailed',
      'questionsExcluded',
    ] as const;
    for (const key of keys) expect({ key, hit: findReportForbidden(REPORT_TEXT[key]) }).toEqual({ key, hit: null });
    expect(findReportForbidden('물어볼 것 12건')).toBeNull();
    expect(REPORT_TEXT.questionsSwitch).toBe('물어볼 것 포함');
  });

  it('탈퇴 안내(공개 /delete-account)에 진료 때 물어볼 것이 들어 있고 금칙어가 없다', () => {
    expect(DELETE_GUIDE_TEXT.dataItems.some((i) => i.includes('진료 때 물어볼 것'))).toBe(true);
    for (const t of deleteGuideTexts()) expect({ t, hit: findPrivacyForbidden(t) }).toEqual({ t, hit: null });
    // 맨 끝 포괄 항목은 그대로
    expect(DELETE_GUIDE_TEXT.dataItems.at(-1)).toBe('그 밖에 서비스 이용 중 쌓인 데이터(이용 기록, 알림 발송 기록 등)');
  });
});
