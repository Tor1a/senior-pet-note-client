// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeleteGuideConfig } from '../lib/deleteGuide';
import { resolveDeleteGuide } from '../lib/deleteGuide';
import { findPrivacyForbidden } from '../lib/privacyText';
import DeleteAccountGuidePage from './DeleteAccountGuidePage';

// QA 보강: /delete-account 환경변수 조합, 이상한 이메일 값, 로그인 상태, 금지어, 제목 구조

let mockStatus: 'signedIn' | 'signedOut' | 'loading' = 'signedOut';
vi.mock('../auth', () => ({ useAuth: () => ({ status: mockStatus }) }));

afterEach(() => {
  cleanup();
  mockStatus = 'signedOut';
  vi.unstubAllEnvs();
});

const NAME = '홍길동';
const MAIL = 'help@example.com';
const URL_ = 'https://example.com/privacy';
const NOTE = '백업은 30일 뒤 지워져요.';

function show(cfg: Partial<DeleteGuideConfig>) {
  const config: DeleteGuideConfig = { operatorName: null, supportEmail: null, privacyUrl: null, retentionNote: null, deleteRequestNote: null, ...cfg };
  return render(
    <MemoryRouter>
      <DeleteAccountGuidePage config={config} />
    </MemoryRouter>,
  );
}

// 4개 변수의 켜짐/꺼짐 16가지를 전부 돈다 (대표 조합만이 아니라 전수)
describe('환경변수 4개 켜짐/꺼짐 16조합', () => {
  const combos = Array.from({ length: 16 }, (_, i) => ({
    name: Boolean(i & 1),
    mail: Boolean(i & 2),
    url: Boolean(i & 4),
    note: Boolean(i & 8),
  }));
  it.each(combos)('운영자=$name 이메일=$mail 처리방침=$url 보관안내=$note', (c) => {
    show({
      operatorName: c.name ? NAME : null,
      supportEmail: c.mail ? MAIL : null,
      privacyUrl: c.url ? URL_ : null,
      retentionNote: c.note ? NOTE : null,
    });
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(!!screen.queryByText(new RegExp(`개발자·운영자: ${NAME}`))).toBe(c.name);
    expect(!!document.querySelector(`a[href="mailto:${MAIL}"]`)).toBe(c.mail);
    expect(!!screen.queryByText(/로그인할 수 없으면/)).toBe(c.mail);
    expect(!!document.querySelector(`a[href="${URL_}"]`)).toBe(c.url);
    expect(!!screen.queryByText(NOTE)).toBe(c.note);
    // 빈 줄/빈 링크/미정 표시가 남지 않는다
    expect(screen.queryByText(/확인 필요|undefined|null/)).toBeNull();
    for (const a of Array.from(document.querySelectorAll('a'))) expect(a.getAttribute('href')).toBeTruthy();
    for (const p of Array.from(document.querySelectorAll('p'))) expect(p.textContent?.trim()).not.toBe('');
  });
});

describe('이메일 값에 이상한 문자가 있을 때', () => {
  const bad = ['help @example.com', 'he"lp@example.com', '<script>alert(1)</script>@example.com', 'a@b@example.com', 'help@example', '@example.com', ' ', 'help@example.com\nBcc: x@y.z'];
  it.each(bad)('형식이 틀린 값 %j 은(는) 버려서 mailto 링크가 없다', (value) => {
    expect(resolveDeleteGuide({ VITE_SUPPORT_EMAIL: value }).supportEmail).toBeNull();
  });

  it('화면에 넣는 이메일은 텍스트로만 들어가고 script 요소가 생기지 않는다 (운영자명에 태그가 있어도)', () => {
    show({ operatorName: '<script>alert(1)</script>', supportEmail: MAIL });
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeTruthy();
  });

  it(' "help@example.com?subject=x" 는 mailto 쿼리 주입이므로 버려져야 한다', () => {
    for (const v of ['help@example.com?subject=hi', 'help@example.com?cc=a', 'help@example.com&bcc=a', 'help@example.com%0d%0aBcc:x']) {
      expect(resolveDeleteGuide({ VITE_SUPPORT_EMAIL: v }).supportEmail).toBeNull();
    }
  });
});

describe('이메일 요청 안내 문구(선택)', () => {
  it('있으면 이메일 줄 끝에 붙고, 없으면 붙지 않으며, 이메일이 없으면 같이 숨겨진다', () => {
    show({ supportEmail: MAIL, deleteRequestNote: '가입한 이메일로 보내 주세요.' });
    expect(screen.getByText(/로그인할 수 없으면/).textContent).toContain('가입한 이메일로 보내 주세요.');
    cleanup();
    show({ supportEmail: MAIL });
    expect(screen.getByText(/로그인할 수 없으면/).textContent).toBe(`로그인할 수 없으면 ${MAIL}로 삭제를 요청해 주세요.`);
    cleanup();
    show({ deleteRequestNote: '가입한 이메일로 보내 주세요.' });
    expect(screen.queryByText(/가입한 이메일로/)).toBeNull();
  });
});

describe('로그인 상태 링크와 구조', () => {
  it('로그인 상태: /account/delete 링크, 로그아웃·확인 중: 링크 없음', () => {
    mockStatus = 'signedIn';
    show({});
    expect(screen.getByRole('link', { name: '계정 삭제 화면으로 가기' }).getAttribute('href')).toBe('/account/delete');
    cleanup();
    for (const s of ['signedOut', 'loading'] as const) {
      mockStatus = s;
      show({});
      expect(screen.queryByRole('link', { name: '계정 삭제 화면으로 가기' })).toBeNull();
      cleanup();
    }
  });

  it('처리방침 링크는 새 창 + noopener 이고 새 창 안내가 스크린리더 텍스트로 있다', () => {
    show({ privacyUrl: URL_ });
    const a = document.querySelector(`a[href="${URL_}"]`)!;
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.textContent).toContain('새 창에서 열려요');
  });

  it('제목 구조: h1 하나, h2 셋, h3 없음, 각 section 이 자기 h2 로 이름 붙음, main 하나', () => {
    show({ operatorName: NAME, supportEmail: MAIL, privacyUrl: URL_, retentionNote: NOTE });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-labelledby'))).toEqual(['guide-data-title', 'guide-how-title', 'guide-period-title']);
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('화면에 보이는 모든 글(환경변수 값 제외)에 금지 표현이 없다', () => {
    mockStatus = 'signedIn';
    show({ operatorName: NAME, supportEmail: MAIL, privacyUrl: URL_, retentionNote: NOTE });
    const text = (document.querySelector('main')!.textContent ?? '').replace(NAME, '').replace(MAIL, '').replace(NOTE, '');
    expect(findPrivacyForbidden(text)).toBeNull();
  });
});
