// 모바일 전용 문구 (웹 todoText 에 없는 선택기·설정 열기 글자). 웹 공유 사본이 아니다.
// 해요체, 짧게, 이모지 없음. 금지 표현 검사는 todoMobileText.test.ts 가 findTodoForbidden 으로 한다.
export const TODO_MOBILE_TEXT = {
  dateEmpty: '날짜 고르기',
  dateSheetTitle: '날짜',
  dateHint: '누르면 날짜를 고를 수 있어요',
  dateNotChosen: '아직 고르지 않았어요',
  timeEmpty: '시각 정하지 않음',
  timeSheetTitle: '시각',
  timeHint: '누르면 시각을 고를 수 있어요',
  timeNotChosen: '정하지 않았어요',
  openSettings: '설정 열기',
  entryA11y: '내 할 일 일정 보기',
} as const;
