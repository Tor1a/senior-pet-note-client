import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 인쇄 레이아웃은 브라우저 인쇄 미리보기로 봐야 하지만, 규칙이 빠지지 않았는지는 여기서 지킨다(설계서 7장).
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const print = css.slice(css.indexOf('@media print'));

describe('병원 방문 리포트 인쇄 CSS', () => {
  it('A4 세로 용지와 여백', () => {
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4 portrait/);
  });

  it('내비·버튼(.no-print)을 숨긴다', () => {
    expect(print).toMatch(/\.no-print[^{]*\{\s*display:\s*none\s*!important/);
  });

  it('본문 11pt, 보조 9.5pt', () => {
    expect(print).toMatch(/font-size:\s*11pt/);
    expect(print).toMatch(/\.small\s*\{\s*font-size:\s*9\.5pt/);
  });

  it('섹션이 쪽 가운데서 끊기지 않는다', () => {
    expect(print).toMatch(/\.report-section\s*\{[^}]*break-inside:\s*avoid/);
    // 메모·체중 구역은 통째로 밀지 않고 행·항목 단위로만 나눈다
    expect(print).toMatch(/\.report-section\.report-memo-section[^{]*\{\s*break-inside:\s*auto/);
    expect(print).toMatch(/\.report-table tr\s*\{\s*break-inside:\s*avoid/);
  });

  it('흑백: 글자 #000, 그래프 선·점은 검정, 점선 구분 유지', () => {
    expect(print).toMatch(/color:\s*#000/);
    expect(print).toMatch(/\.chart-line\s*\{\s*stroke:\s*#000/);
    expect(print).toMatch(/\.chart-line\.dashed\s*\{\s*stroke-dasharray/);
    expect(print).toMatch(/\.chart-dot\s*\{\s*fill:\s*#000/);
  });

  it('그래프 옆에 체중 표(58% / 나머지), 표 칸은 줄바꿈 허용', () => {
    expect(print).toMatch(/\.report-weight-grid\s*\{[^}]*grid-template-columns:\s*58% 1fr/);
    expect(print).toMatch(/\.report-table th, \.report-table td\s*\{[^}]*white-space:\s*normal/);
  });

  it('면책 문구 바닥글이 쪽마다 반복되도록 fixed 이고, 화면에서는 숨긴다', () => {
    expect(print).toMatch(/\.report-print-footer\s*\{[^}]*position:\s*fixed/);
    expect(css).toMatch(/\.report-print-footer\s*\{\s*display:\s*none/);
  });
});
