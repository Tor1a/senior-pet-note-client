/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Vite 설정: React + PWA(manifest, 서비스워커) + Vitest
export default defineConfig({
  plugins: [
    react(),
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
        name: '시니어펫 노트',
        short_name: '펫노트',
        description: '노령·만성질환 반려동물의 투약과 컨디션을 매일 10초 안에 기록하는 노트',
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
