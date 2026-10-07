# 시니어펫 노트 — 클라이언트 (웹 + 앱)

노령·만성질환 반려동물 간병 기록 서비스 **시니어펫 노트**의 사용자 화면 저장소입니다.
백엔드 API는 별도 저장소 `senior-pet-note-api` 에 있습니다.

## 구성

```
apps/
├─ web/      React 19 + Vite + PWA  → http://localhost:5173
└─ mobile/   React Native (Expo)    → Expo Go / 웹 미리보기 http://localhost:8081
```

- 웹과 앱이 같은 API를 호출하므로, 공통 코드(API 타입·증상 목록·로그인 검증)는
  추후 `packages/shared/` 로 모은다. 현재는 각 앱에 복사본이 있다(`apps/mobile/README.md` 참고).
- API 계약(명세)의 기준은 `senior-pet-note-api` 저장소의 `docs/` 이다.

## 실행

1. `senior-pet-note-api` 를 README 대로 실행한다 (DB + API, http://localhost:8080).
2. 웹: `cd apps/web && npm install && npm run dev`
3. 앱: `cd apps/mobile && npm install && npx expo start`
   - 브라우저로 미리보기: `npx expo start --web`
     (이때 API 의 `CORS_ALLOWED_ORIGINS` 에 `http://localhost:8081` 을 추가해야 한다)

각 앱의 상세 내용은 `apps/web/README.md`, `apps/mobile/README.md` 를 본다.
