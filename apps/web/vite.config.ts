/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 이메일 형식은 src/lib/deleteGuide.ts 의 EMAIL_PATTERN 과 같게 유지한다(설정 파일이 src 를 불러오면 Vite 경고가 나서 복사해 둠)
const EMAIL_PATTERN = /^[^\s@<>"?&,%;#]+@[^\s@<>"?&,%;#]+\.[^\s@<>"?&,%;#]+$/;

// 빌드(vite build)할 때만: /delete-account 의 문의 이메일이 비었거나 형식이 틀리면 경고한다(빌드는 실패시키지 않음, 개발 모드는 조용히)
function supportEmailWarning(): Plugin {
  return {
    name: 'spn-support-email-warning',
    configResolved(config) {
      if (config.command !== 'build') return;
      if (!EMAIL_PATTERN.test((config.env.VITE_SUPPORT_EMAIL ?? '').trim())) {
        console.warn(
          '\n[경고] VITE_SUPPORT_EMAIL 이 비었거나 이메일 형식이 아니에요. /delete-account 의 이메일 요청 안내 줄이 숨겨져요. 스토어 제출 전에 채워 주세요.\n',
        );
      }
    },
  };
}

// Vite 설정: React + PWA(manifest, 서비스워커) + Vitest
export default defineConfig({
  plugins: [
    react(),
    supportEmailWarning(),
    VitePWA({
      // 새 버전이 배포되면 서비스워커를 자동으로 갱신한다(sw.ts 에서 skipWaiting + clientsClaim)
      registerType: 'autoUpdate',
      // 서비스워커를 직접 쓴다(src/sw.ts): PWA precache + FCM 백그라운드 수신·알림 클릭을 한 서비스워커에 둔다.
      // API 캐시 금지 규칙(/api/** 제외)과 navigateFallback 은 sw.ts 로 옮겼다.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '오래곁',
        short_name: '오래곁',
        description: '반려동물의 투약과 컨디션을 매일 10초 안에 기록하는 노트',
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FFFBF5',
        theme_color: '#A0471D',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // 앱 껍데기(HTML/JS/CSS/아이콘)만 precache 한다. API 응답은 캐시하지 않는다(sw.ts 참고)
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // 모듈 서비스워커를 지원하지 않는 브라우저도 있어 고전 스크립트(iife)로 묶는다
        rollupFormat: 'iife',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // 화면 테스트(*.test.tsx)는 파일 맨 위 주석으로 jsdom 환경을 고른다
  },
});
