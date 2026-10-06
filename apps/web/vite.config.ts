/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Vite 설정: React + PWA(manifest, 서비스워커) + Vitest
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 새 버전이 배포되면 서비스워커를 자동으로 갱신한다
      registerType: 'autoUpdate',
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
      workbox: {
        // 앱 껍데기(HTML/JS/CSS/아이콘)를 캐시해서 오프라인에서도 기본 화면을 그린다.
        // API 요청(/api/**)은 캐시하지 않는다(민감한 건강 기록, 항상 서버 최신값).
        // - runtimeCaching 을 두지 않으므로 API 응답은 서비스워커가 저장하지 않는다.
        // - 나중에 같은 주소에서 /api 를 서비스하더라도 index.html 로 대체되지 않게 제외한다.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // 화면 테스트(*.test.tsx)는 파일 맨 위 주석으로 jsdom 환경을 고른다
  },
});
