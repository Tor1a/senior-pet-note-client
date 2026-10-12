// [공유 로직 사본] 원본: web/src/lib/pushActionText.ts (2026-10-12 복사)
// web/src/lib 과 동기화 필요. 추후 packages/shared 로 통합 예정 (mobile/README.md 참고).
// 이 파일만 고치지 말고 웹 원본과 함께 수정하세요.
// 알림에서 바로 체크 문구 모음 (설계 .company/design/알림-바로-체크.md 2-6, 8장 / 기획 .company/plans/알림-바로-체크.md)
// 해요체, 짧게, 사실만. "기록했어요"는 서버에 실제로 저장됐을 때만 쓴다. 이모지·의료 판단·증감 표현 없음.
// 금지 표현 검사는 findUndoForbidden()(= findForbidden + 증감·평가 표현)으로 테스트가 한다. 문구를 더하면 테스트에도 더한다.
// 웹 서비스워커(알림 결과)와 오늘 화면(웹·모바일 큰 버튼)이 함께 쓴다.
import { formatTakenAt } from './format';

export const PUSH_ACTION_TEXT = {
  /** 알림 버튼 라벨(서버가 보낸다)과 오늘 화면 큰 버튼 글자: 화면의 체크 버튼과 같은 글자 */
  actionLabel: '먹였어요',
  /** 오늘 화면 강조 카드 머리글(기존 문구) */
  highlightFlag: '방금 알림 온 약',

  /** 요청을 보내는 동안 같은 알림 자리에 보이는 제목(설계 2-6 "기록하는 중") */
  recordingTitle: '기록하는 중이에요',
  recordedTitle: '먹였어요로 기록했어요',
  alreadyTitle: '이미 먹였다고 기록돼 있어요',

  failedTitle: '기록하지 못했어요',
  failNetwork: '인터넷에 연결되지 않았어요. 눌러서 앱에서 확인해 주세요.',
  failServer: '서버에 잠시 문제가 있어요. 눌러서 앱에서 확인해 주세요.',
  failGone: '이 약은 이제 목록에 없어요. 눌러서 앱에서 확인해 주세요.',
  failStale: '시간이 지난 알림이에요. 눌러서 앱에서 확인해 주세요.',

  loginTitle: '다시 로그인이 필요해요',
  loginBody: '눌러서 앱을 열어 주세요. 아직 기록되지 않았어요.',
} as const;

/** 알림 본문 + 서버가 정한 기록 시각: "초코 · 아조딜 1캡슐 · 8:05". 시각을 못 읽으면 본문만 */
export function recordedBodyText(base: string, takenAtIso: string | null): string {
  const time = takenAtIso ? formatTakenAt(takenAtIso) : '';
  if (!time) return base;
  return base ? `${base} · ${time}` : time;
}

/** 오늘 화면 큰 [먹였어요] 버튼의 접근성 라벨(약 이름·시각 포함, 설계 7-3) */
export const bigDoseButtonLabel = (what: string, time: string) => `${what} ${time} 먹였어요 체크`;
