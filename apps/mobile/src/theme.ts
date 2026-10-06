// 접근성 기본값과 색 (디자이너 와이어프레임 design/today-wireframe.md 5-1, 5-2 기준)
// - 본문 18 (최소 17pt), 터치 영역 최소 48, 주요 버튼 높이 56 이상, 버튼 간격 8 이상
// - 색은 브랜드 가이드 확정 전 임시안. 빨강은 쓰지 않는다(판단처럼 읽히므로).
// - React Native 의 숫자 단위는 dp/pt 이며, 기기 글자 크기 설정을 따른다(allowFontScaling 기본 true).

export const colors = {
  background: '#FFFBF5', // 따뜻한 아이보리
  text: '#2B2420', // 본문 (대비 약 15:1)
  textSecondary: '#5C5047', // 보조 글자 (약 7.5:1), 제안값 점선 테두리
  primary: '#A0471D', // 주요 버튼(테라코타) + 흰 글자 (약 6:1)
  done: '#2E6B4F', // 완료 체크(숲 초록) + 흰 글자
  onPrimary: '#FFFFFF',
  border: '#5C5047',
  surface: '#FFFFFF',
} as const;

export const fontSize = {
  /** 면책 문구 등 보조 문구 (와이어프레임: 14) */
  caption: 14,
  /** 본문 기본값 (와이어프레임: 18px 권장) */
  body: 18,
  /** 화면 제목 */
  title: 24,
} as const;

export const touch = {
  /** 모든 터치 요소의 최소 높이·너비 */
  minSize: 48,
  /** 주요 버튼(저장·로그인 등) 최소 높이 */
  primaryHeight: 56,
  /** 버튼 사이 최소 간격 */
  gap: 8,
} as const;

export const spacing = {
  /** 화면 좌우 여백 (Tailwind px-4 = 16) */
  screen: 16,
  sm: 8,
  md: 16,
  lg: 24,
} as const;
