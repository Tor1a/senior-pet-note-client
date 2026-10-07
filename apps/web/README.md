# 시니어펫 노트 — 웹 (React, Java 백엔드 호출)

- 작성: developer / 2026-10-06 (기술 스택 변경 반영: `docs/decisions/2026-10-06-기술-스택-변경.md`)
- 스택: Vite 8 + React 19 + TypeScript, vite-plugin-pwa(manifest·서비스워커), Vitest
- 백엔드: Java(Spring Boot) API (별도 저장소 `senior-pet-note-api`). **Supabase 는 쓰지 않는다.**
- 범위: **로컬 실행만.** 배포는 대표 승인 후 진행한다.

## 실행 순서

필요: Node.js 20 이상 (개발 PC 에서는 Node 24 로 확인), Docker Desktop (백엔드·DB 용)

### 1) 백엔드를 먼저 띄운다

백엔드와 DB(`docker-compose.yml`)는 별도 저장소 `senior-pet-note-api` 에 있다. 실행 명령은 그 저장소 README 를 따른다.

```bash
cd ../senior-pet-note-api     # 로컬에 나란히 클론해 둔 경우
docker compose up -d          # PostgreSQL → 이어서 README 의 "서버 실행" 명령으로 API(http://localhost:8080) 실행
```

- 백엔드가 꺼져 있어도 웹은 멈추지 않는다. 로그인 시도 때 **"서버에 연결할 수 없어요"** 안내가 뜬다.
- 웹(5173)과 API(8080)는 주소가 다르므로 **백엔드가 `http://localhost:5173` 의 CORS 요청을 허용**해야 한다
  (Authorization, Content-Type 헤더 포함). 안 되어 있으면 브라우저가 막아서 "서버에 연결할 수 없어요"로 보인다.

### 2) 웹 실행

```bash
cd apps/web

npm install

# (선택) API 주소를 바꿀 때만. 비워 두면 http://localhost:8080 을 쓴다
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local

npm run dev                       # → http://localhost:5173
npm test                          # 단위 테스트 (Vitest)

# (선택) 배포용 빌드 확인 + 미리보기(서비스워커 동작 확인용)
npm run build
npm run preview                   # → http://localhost:4173  (CORS 허용 주소에 4173 도 필요)
```

- 환경변수는 `VITE_API_BASE_URL` 하나뿐이다. 주소 형식이 틀리면 **"환경변수 설정 필요"** 안내 화면이 뜬다.
- `VITE_` 로 시작하는 값은 브라우저에 그대로 공개되므로 비밀 값은 넣지 않는다. `.env*` 는 `.gitignore` 로 제외(`.env.example` 만 커밋).

## 백엔드 인증 계약 (웹이 기대하는 형식)

| 요청 | 성공 응답 |
|------|-----------|
| `POST /api/auth/signup` `{email, password}` (비밀번호 8자 이상) | `201 {accessToken, user:{id,email}}` |
| `POST /api/auth/login` `{email, password}` | `200 {accessToken, user:{id,email}}` |
| `GET /api/me` + `Authorization: Bearer <token>` | `200 {id,email}` |

- 오류 본문 `{code, message}`: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `409 EMAIL_TAKEN`
- JWT 만료 7일, refresh 없음. 만료되면 다시 로그인한다.

## 로그인 동작

- 토큰은 MVP 에서 `localStorage`(`spn.accessToken`)에 저장한다. 로그아웃은 토큰만 지운다(서버 호출 없음).
- 앱 시작 시 토큰이 있으면 `GET /api/me` 로 세션을 확인한다.
  - 성공 → 로그인 상태 / 401 → 토큰 삭제 후 `/login` / 서버 연결 실패 → "서버에 연결할 수 없어요" 화면(다시 시도, 로그인 화면으로)
- 로그인한 상태의 **어떤 요청이든 401** 을 받으면 토큰을 지우고 `/login` 으로 보낸다.
  로그인 시도 자체의 401 은 "이메일 또는 비밀번호가 맞지 않아요" 안내만 한다.
- 요청이 10초 안에 응답이 없으면 연결 실패로 본다.

| 주소 | 로그인 전 | 로그인 후 |
|------|-----------|-----------|
| `/login` | 로그인 ↔ 회원가입 전환 폼 (이메일 + 비밀번호, 가입 때는 비밀번호 확인) | `/today` 로 이동 |
| `/pets/new` | `/login` 으로 이동 | 반려동물 등록(온보딩 1/2). 이미 있으면 `/today` |
| `/medications` | `/login` 으로 이동 | 약 관리(추가·수정·목록에서 빼기). `?onboarding=1` 이면 온보딩 2/2 |
| `/pet` | `/login` 으로 이동 | 프로필 수정, 사진 교체·삭제, 로그아웃 |
| `/today` | `/login` 으로 이동 | "오늘" 기록 화면. 반려동물이 없으면 `/pets/new` |
| 그 외 | `/today` 로 이동 | `/today` 로 이동 |

## PWA

- manifest·서비스워커는 그대로 유지한다(앱 껍데기만 캐시).
- **API 요청은 캐시하지 않는다.** 런타임 캐시 규칙을 두지 않았고, `/api/**` 는 `navigateFallbackDenylist` 로 index.html 대체에서도 뺐다.

## 폴더 구조

```
src/
├─ main.tsx, App.tsx        # 진입점, 라우팅(로그인·반려동물 유무에 따라 이동)
├─ auth.tsx                 # 로그인 상태(AuthProvider), 401 → /login
├─ pet.tsx                  # 내 반려동물 상태(PetProvider), 사진 blob URL 훅
├─ components/PetAvatar.tsx # 원형 사진, 없으면 🐾
├─ pages/
│  ├─ TodayPage.tsx         # "오늘" 기록 화면 (+ TodayPage.test.tsx 화면 테스트)
│  ├─ PetFormPage.tsx       # 반려동물 등록·프로필 수정(사진 미리보기·교체·삭제)
│  ├─ MedicationsPage.tsx   # 약 관리
│  └─ LoginPage, ServerDownPage, SetupNeededPage
└─ lib/
   ├─ api.ts                # API 클라이언트(JSON·multipart·blob, 401, 시간 초과), 한국어 오류 문구
   ├─ petApi.ts             # 계약(docs/api-today.md) 타입과 호출 함수
   ├─ client.ts             # 앱 공용 클라이언트 인스턴스(api, petApi)
   ├─ todayForm.ts          # 오늘 화면 입력 상태(제안값/확정값 구분, 저장 본문 만들기)
   ├─ symptoms.ts           # "특이사항 없음" 기본 선택, 토글·저장 변환
   ├─ format.ts             # 날짜·시각·조사 표시 형식
   ├─ photo.ts              # 사진 형식·5MB 확인
   └─ constants.ts, config.ts, tokenStorage.ts, loginForm.ts
```

## "오늘" 화면 동작 (design/today-wireframe.md, docs/api-today.md)

- **기록 날짜·제안값·새벽 4시 안내 문구는 서버가 계산**한다(`GET /api/pets/{petId}/today`). 웹에는 계산 규칙이 없다.
  예전 `recordDate.ts`·`suggestions.ts` 와 그 테스트는 삭제했다(모바일에는 사본이 남아 있다).
- 투약 카드: 탭하면 바로 체크 표시(낙관적 업데이트) 후 `POST /api/med-logs`. 실패하면 되돌리고 안내한다.
  다시 탭하면 `DELETE` 로 취소. 체크한 약은 0.3초 뒤 한 줄로 접히고, 그동안 아래 영역 입력을 잠시 막는다.
  - 409 `ALREADY_CHECKED` → 체크 상태 유지 후 서버 값으로 다시 맞춤 / 404(목록에서 뺀 약) → 목록 새로 고침
- 식사·물(조금/보통/많이 또는 ml)·체중·증상·메모. **제안값은 점선 + "최근 평균"**, 고른 값·저장된 값은 채움 + ✓.
  [저장]을 눌러야 `PUT /api/pets/{petId}/daily-logs/{recordDate}` 로 확정된다. 체중은 [오늘 쟀어요]를 누르거나 값을 바꿔야 저장된다.
- 저장 후 버튼은 "기록 수정하기", 토스트 3초. 첫 사용이면 안내 문구와 약 등록 카드, "첫 기록 저장".
- 400 `INVALID_RECORD_DATE`(새벽 4시가 지나 날짜가 바뀜) → 안내 후 화면을 새로 불러온다. 404(반려동물 없음) → 등록 화면.
- 지표 이벤트 `today_opened`(source: push/direct, 주소에 `?source=push`), `med_checked`, `daily_log_saved`(taps, durationMs).
  실패해도(401 포함) 화면에 영향이 없다.

## 테스트

`npm test` — 6개 파일, 45개.

- `pages/TodayPage.test.tsx` (14): 계약서 예시 JSON 으로 fetch 를 가짜로 바꿔 화면을 검사한다.
  제안값 점선 표시와 저장 시 확정, 저장 본문이 계약 8개 필드와 일치, 저장된 기록은 실선, 체중 저장 조건, 첫 사용 상태,
  "특이사항 없음" 자동 해제, 투약 낙관적 업데이트·실패 롤백·409 동기화·취소, pet 404, 저장 400 안내, 서버 꺼짐, 이벤트 실패 무시.
- `lib/todayForm.test.ts` (7), `lib/symptoms.test.ts` (6), `lib/api.test.ts` (10), `lib/loginForm.test.ts` (5), `lib/config.test.ts` (3).

## 아직 안 한 것 / 알려진 한계

- 하단 탭바(오늘/그래프/리포트)는 그래프·리포트 화면이 아직 없어 넣지 않았다. 메뉴(≡)는 프로필 화면으로 간다.
- 저장 토스트의 [되돌리기]는 넣지 않았다. 계약에 일일 기록 삭제 API 가 없어 첫 저장을 되돌릴 수 없다.
- "아직 시간이 안 된 약" 한 줄 접기, 시간대별 요약 카드는 하지 않았다(기기 시각 계산이 필요해서). 체크한 약만 한 줄로 접는다.
- localStorage 토큰은 XSS 에 취약하다. 정식 출시 전 httpOnly 쿠키 방식 전환을 검토한다.
- 비밀번호 찾기·변경 기능은 없다. 아이콘은 임시.
