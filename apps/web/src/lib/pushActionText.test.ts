import { describe, expect, it } from 'vitest';
import { bigDoseButtonLabel, PUSH_ACTION_TEXT, recordedBodyText } from './pushActionText';
import { findUndoForbidden } from './undoText';

describe('알림에서 바로 체크 문구', () => {
  const all = [
    ...Object.values(PUSH_ACTION_TEXT),
    recordedBodyText('초코 · 아조딜 1캡슐', '2026-10-06T23:05:00Z'),
    bigDoseButtonLabel('아조딜 1캡슐', '오후 8:00'),
  ];

  it('금지 표현(의료 판단·평가·증감·퍼센트)이 하나도 없다', () => {
    for (const text of all) expect({ text, hit: findUndoForbidden(text) }).toEqual({ text, hit: null });
  });

  it('이모지가 없다', () => {
    for (const text of all) expect(/\p{Extended_Pictographic}/u.test(text)).toBe(false);
  });

  it('설계서 8장 문구 그대로', () => {
    expect(PUSH_ACTION_TEXT.actionLabel).toBe('먹였어요');
    expect(PUSH_ACTION_TEXT.recordingTitle).toBe('기록하는 중이에요');
    expect(PUSH_ACTION_TEXT.recordedTitle).toBe('먹였어요로 기록했어요');
    expect(PUSH_ACTION_TEXT.alreadyTitle).toBe('이미 먹였다고 기록돼 있어요');
    expect(PUSH_ACTION_TEXT.failedTitle).toBe('기록하지 못했어요');
    expect(PUSH_ACTION_TEXT.failNetwork).toBe('인터넷에 연결되지 않았어요. 눌러서 앱에서 확인해 주세요.');
    expect(PUSH_ACTION_TEXT.failServer).toBe('서버에 잠시 문제가 있어요. 눌러서 앱에서 확인해 주세요.');
    expect(PUSH_ACTION_TEXT.failGone).toBe('이 약은 이제 목록에 없어요. 눌러서 앱에서 확인해 주세요.');
    expect(PUSH_ACTION_TEXT.failStale).toBe('시간이 지난 알림이에요. 눌러서 앱에서 확인해 주세요.');
    expect(PUSH_ACTION_TEXT.loginTitle).toBe('다시 로그인이 필요해요');
    expect(PUSH_ACTION_TEXT.loginBody).toBe('눌러서 앱을 열어 주세요. 아직 기록되지 않았어요.');
    expect(PUSH_ACTION_TEXT.highlightFlag).toBe('방금 알림 온 약');
  });

  it('실패 문구에는 "기록했어요"가 들어가지 않는다', () => {
    const fails = [
      PUSH_ACTION_TEXT.failedTitle,
      PUSH_ACTION_TEXT.failNetwork,
      PUSH_ACTION_TEXT.failServer,
      PUSH_ACTION_TEXT.failGone,
      PUSH_ACTION_TEXT.failStale,
      PUSH_ACTION_TEXT.loginTitle,
      PUSH_ACTION_TEXT.loginBody,
    ];
    for (const t of fails) expect(t).not.toContain('기록했어요');
    expect(PUSH_ACTION_TEXT.recordingTitle).not.toContain('기록했어요'); // 아직 기록되기 전이다
  });

  it('recordedBodyText: 서버 기록 시각(KST)을 붙이고, 읽을 수 없으면 본문만', () => {
    expect(recordedBodyText('초코 · 아조딜 1캡슐', '2026-10-06T23:05:00Z')).toBe('초코 · 아조딜 1캡슐 · 8:05');
    expect(recordedBodyText('초코 · 아조딜 1캡슐', null)).toBe('초코 · 아조딜 1캡슐');
    expect(recordedBodyText('초코 · 아조딜 1캡슐', 'not-a-date')).toBe('초코 · 아조딜 1캡슐');
    expect(recordedBodyText('', '2026-10-06T23:05:00Z')).toBe('8:05');
  });

  it('큰 버튼 접근성 라벨에 약 이름과 시각이 들어간다', () => {
    expect(bigDoseButtonLabel('아조딜 1캡슐', '오후 8:00')).toBe('아조딜 1캡슐 오후 8:00 먹였어요 체크');
  });
});
