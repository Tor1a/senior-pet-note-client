// 로그인 없이 보는 계정 삭제 안내(/delete-account) 문구와 환경변수 해석 (Google Play "앱 밖 삭제 요청 링크"용)
// 사실만, 해요체. 아직 정해지지 않은 값은 화면에 "확인 필요" 같은 표시를 내지 않고, 값이 비어 있으면 그 줄을 숨긴다.
// 금지 표현 검사는 deleteGuideTexts() + findPrivacyForbidden() 으로 테스트가 한다.
import { resolvePrivacyPolicyUrl } from './privacyConfig';

export const SERVICE_NAME = '오래곁';

export const DELETE_GUIDE_TEXT = {
  title: '계정 삭제 안내',
  intro: '계정을 삭제하는 방법과 삭제되는 데이터를 안내해요.',
  operatorLabel: '개발자·운영자',
  dataTitle: '삭제되는 데이터',
  dataItems: [
    '계정(이메일, 비밀번호)',
    '반려동물 정보(이름·종류·생일·입양일·함께 지내는 상황)',
    '일일 기록(체중·식사·물·증상·메모, 산책·배변 횟수)',
    '투약·알림 설정',
    '할 일 일정(제목·일정 메모·병원 메모)',
    '푸시 기기 정보',
    '사진',
    '그 밖에 서비스 이용 중 쌓인 데이터(이용 기록, 알림 발송 기록 등)',
  ],
  dataNote2: '한 번 삭제하면 되돌릴 수 없어요.',
  howTitle: '삭제 방법',
  howSteps: ['앱 또는 웹에서 로그인해요.', '계정 메뉴를 열어요.', '회원 탈퇴를 눌러요.'],
  howLoggedIn: '지금 로그인해 있어요.',
  howLoggedInLink: '계정 삭제 화면으로 가기',
  howEmailBefore: '로그인할 수 없으면 ',
  howEmailAfter: '로 삭제를 요청해 주세요.',
  periodTitle: '처리 기간과 보관 정보',
  periodBody: '서비스 데이터베이스에서는 즉시 삭제해요. 사진 파일은 이어서 지워요.',
  privacyLinkLabel: '개인정보 처리방침',
} as const;

export interface DeleteGuideConfig {
  operatorName: string | null;
  /** 형식이 맞는 이메일만. 아니면 null */
  supportEmail: string | null;
  privacyUrl: string | null;
  /** 백업·서버 로그 보관 등 추가 안내 한 줄. 비어 있으면 null */
  retentionNote: string | null;
  /** 이메일 요청 줄 아래에 붙일 처리 기간·본인 확인 안내. 비어 있으면 null (기본 문구 없음) */
  deleteRequestNote: string | null;
}

// mailto 에 쿼리·구분 문자가 붙지 않게 ? & , % ; # 도 막는다
const EMAIL_PATTERN = /^[^\s@<>"?&,%;#]+@[^\s@<>"?&,%;#]+\.[^\s@<>"?&,%;#]+$/;

function clean(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

/** 환경변수 값(VITE_*)을 화면에서 쓸 값으로 바꾼다. 비었거나 형식이 틀리면 null → 해당 줄을 숨긴다 */
export function isValidSupportEmail(value: string | undefined): boolean {
  const email = clean(value);
  return !!email && EMAIL_PATTERN.test(email);
}

export function resolveDeleteGuide(env: {
  VITE_OPERATOR_NAME?: string;
  VITE_SUPPORT_EMAIL?: string;
  VITE_PRIVACY_POLICY_URL?: string;
  VITE_RETENTION_NOTE?: string;
  VITE_DELETE_REQUEST_NOTE?: string;
}): DeleteGuideConfig {
  const email = clean(env.VITE_SUPPORT_EMAIL);
  return {
    operatorName: clean(env.VITE_OPERATOR_NAME),
    supportEmail: email && EMAIL_PATTERN.test(email) ? email : null,
    privacyUrl: resolvePrivacyPolicyUrl(env.VITE_PRIVACY_POLICY_URL),
    retentionNote: clean(env.VITE_RETENTION_NOTE),
    deleteRequestNote: clean(env.VITE_DELETE_REQUEST_NOTE),
  };
}

/** 금지어 검사용: 이 페이지의 고정 문구 전부 */
export function deleteGuideTexts(): string[] {
  const t = DELETE_GUIDE_TEXT;
  return [
    SERVICE_NAME,
    t.title,
    t.intro,
    t.operatorLabel,
    t.dataTitle,
    ...t.dataItems,
    t.dataNote2,
    t.howTitle,
    ...t.howSteps,
    t.howLoggedIn,
    t.howLoggedInLink,
    t.howEmailBefore,
    t.howEmailAfter,
    t.periodTitle,
    t.periodBody,
    t.privacyLinkLabel,
  ];
}
