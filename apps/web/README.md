# 오래곁 — 웹 (React, Java 백엔드 호출)

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
# API 의 기본 CORS 허용 주소(5173)로 확인하려면: npx vite preview --port 5173 --strictPort
```

- **웹 푸시 알림은 `npm run dev` 에서는 동작하지 않는다.** 개발 서버는 서비스워커를 등록하지 않아 FCM 토큰을 받을 수 없고, 알림을 켜도 서버에는 "등록된 기기 없음"(`no_device`)으로 남는다. 푸시를 확인하려면 위처럼 빌드 후 미리보기로 연다(`VITE_FIREBASE_*` 는 빌드할 때 들어가므로 `.env.local` 을 먼저 채운다).

- 환경변수: `VITE_API_BASE_URL`, 개인정보 처리방침 주소 `VITE_PRIVACY_POLICY_URL`(비우면 계정·탈퇴 화면의 링크 줄이 숨겨진다. 스토어 심사 전 설정 필요), 알림용 `VITE_FIREBASE_*`, 계정 삭제 안내용 `VITE_SUPPORT_EMAIL`·`VITE_OPERATOR_NAME`·`VITE_RETENTION_NOTE`·`VITE_DELETE_REQUEST_NOTE`(아래 "개인정보 후속 조치"). 주소 형식이 틀리면 **"환경변수 설정 필요"** 안내 화면이 뜬다.
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
| `/pet` | `/login` 으로 이동 | 프로필 수정, 사진 교체·삭제, 로그아웃, `계정` 링크 |
| `/account` · `/account/password` · `/account/delete` | `/login` 으로 이동 | 계정(이메일·로그아웃), 비밀번호 바꾸기(성공 시 응답의 새 accessToken 으로 즉시 교체), 회원 탈퇴(3단계, 계약 `docs/api-account.md`). 오늘 맨 아래 `계정 · 로그아웃` 링크로도 진입 |
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
│  ├─ PetFormPage.tsx       # 반려동물 등록·프로필 수정(사진 미리보기·교체·삭제). 검증·본문 변환·저장 오류 분류는 lib/petForm.ts
│  ├─ MedicationsPage.tsx   # 약 관리
│  └─ LoginPage, ServerDownPage, SetupNeededPage
└─ lib/
   ├─ api.ts                # API 클라이언트(JSON·multipart·blob, 401, 시간 초과), 한국어 오류 문구
   ├─ petApi.ts             # 계약(docs/api-today.md) 타입과 호출 함수
   ├─ client.ts             # 앱 공용 클라이언트 인스턴스(api, petApi)
   ├─ todayForm.ts          # 오늘 화면 입력 상태(제안값/확정값 구분, 저장 본문 만들기)
   ├─ symptoms.ts           # "특이사항 없음" 기본 선택, 토글·저장 변환
   ├─ petForm.ts            # 반려동물 폼 입력 검증·본문 변환·변경 여부·저장 오류 분류(사진 제외, 모바일 사본 있음)
   ├─ format.ts             # 날짜·시각·조사 표시 형식
   ├─ photo.ts              # 사진 형식·5MB 확인
   └─ constants.ts, config.ts, tokenStorage.ts, loginForm.ts
```

## "오늘" 화면 동작 (design/today-wireframe.md, docs/api-today.md)

- **기록 날짜·제안값·새벽 4시 안내 문구는 서버가 계산**한다(`GET /api/pets/{petId}/today`). 웹에는 계산 규칙이 없다.
  예전 `recordDate.ts`·`suggestions.ts` 와 그 테스트는 삭제했다(모바일 사본도 2026-10-07 에 삭제했다).
- 투약 카드: 탭하면 바로 체크 표시(낙관적 업데이트) 후 `POST /api/med-logs`. 실패하면 되돌리고 안내한다.
  다시 탭하면 `DELETE` 로 취소. 체크한 약은 0.3초 뒤 한 줄로 접히고, 그동안 아래 영역 입력을 잠시 막는다.
  - 409 `ALREADY_CHECKED` → 체크 상태 유지 후 서버 값으로 다시 맞춤 / 404(목록에서 뺀 약) → 목록 새로 고침
- 식사·물(조금/보통/많이 또는 ml)·체중·증상·메모. **제안값은 점선 + "최근 평균"**, 고른 값·저장된 값은 채움 + ✓.
  [저장]을 눌러야 `PUT /api/pets/{petId}/daily-logs/{recordDate}` 로 확정된다. 체중은 [오늘 쟀어요]를 누르거나 값을 바꿔야 저장된다.
- 저장 후 버튼은 "기록 수정하기", 토스트 3초. 첫 사용이면 안내 문구와 약 등록 카드, "첫 기록 저장".
- 400 `INVALID_RECORD_DATE`(새벽 4시가 지나 날짜가 바뀜) → 안내 후 화면을 새로 불러온다. 404(반려동물 없음) → 등록 화면.
- 지표 이벤트 `today_opened`(source: push/direct, 주소에 `?source=push`), `med_checked`, `daily_log_saved`(taps, durationMs).
  실패해도(401 포함) 화면에 영향이 없다.

## 알림에서 바로 체크 (2026-10-12)

기획 `.company/plans/알림-바로-체크.md`, 설계 `.company/design/알림-바로-체크.md`(맨 끝 "설계와 달라진 점"), 계약 백엔드 `docs/api-reminders.md` 4장(푸시 `actions`)·`docs/api-today.md` 4장(`POST /api/med-logs`). 웹(PWA)만 알림 버튼을 처리하고, 큰 [먹였어요] 대체 흐름은 웹·모바일 공통이다.

**서비스워커 동작(`src/sw.ts` + `lib/pushAction.ts`)**
- 서버가 푸시에 `[먹였어요](action: taken)` 버튼을 싣는다. 버튼을 누르면(`event.action === 'taken'`) 앱을 열지 않고 서비스워커가 처리한다. 본문을 누르면 기존처럼 오늘 화면을 연다.
- 순서: 알림이 뜬 지 1시간 이내인지 확인(모르면 앱 열기, 넘으면 "시간이 지난 알림이에요") → **같은 `tag` 로 "기록하는 중이에요" 알림을 먼저 띄움**(소리 없음, 버튼 없음. 버튼을 누르면 브라우저가 원래 알림을 닫을 수 있어서) → 토큰 사본 읽기 → `GET /api/pets/{petId}/today` 의 `recordDate` 가 알림의 `recordDate` 와 같은지, 그 약·시각 회차가 아직 안 먹은 상태인지 확인 → `POST /api/med-logs {medicationId, scheduledTime}` → 같은 `tag` 로 결과 알림을 덮어씀.
- 결과: 201 "먹였어요로 기록했어요 · 시각"(서버 `takenAt`), 409 `ALREADY_CHECKED` 는 "이미 먹였다고 기록돼 있어요", 그 밖에는 "기록하지 못했어요 / 이유 / 눌러서 앱에서 확인해 주세요"(연결·서버·약 없음·시간 경과), 401·토큰 없음은 "다시 로그인이 필요해요". **실패를 "기록했어요"라고 말하지 않는다.** 결과 알림에는 버튼이 없다(알림 안 [되돌리기] 는 만들지 않음 — 되돌리기는 앱 오늘 화면에서만).
- 같은 알림의 버튼이 겹쳐 눌려도 요청은 하나. 요청 하나는 8초에서 끊는다. 오프라인 대기열은 없다. 결과 알림을 못 띄우면(권한 회수 등) 남은 "기록하는 중이에요"를 닫고 앱을 연다. `/api/**` 응답은 여전히 캐시하지 않는다.
- 알림 탭·인앱 배너로 오늘 화면을 열 때 주소는 `/today?source=push&med=<약>&t=<시각>&d=<기록 날짜>&n=<열 때마다 바뀌는 값>` 이다(`lib/reminderApi.medTargetQuery`).

**토큰 사본(`lib/swTokenStore.ts`, `lib/tokenStorage.ts`)** — 서비스워커는 localStorage 를 읽지 못해 IndexedDB(`spn-sw` / `auth` / `accessToken`)에 토큰 **문자열 하나만** 둔다.
- 저장·교체·삭제는 페이지의 `setToken`/`clearToken`/`syncSwTokenCopy`(앱 시작 때 현재 로그인 상태에 맞춤)만 한다. 서비스워커는 읽기만 하고, 서버가 401 을 알려 준 "그 토큰"만 지울 수 있다(`clearSwTokenIfEquals`). 로그아웃·401 강제 로그아웃·탈퇴·비밀번호 변경 후 교체·다른 계정 로그인이 모두 이 경로를 지난다.
- **삭제 실패 대응**: 삭제가 실패하면 1) 2번 더 재시도 2) 빈 문자열로 덮어쓰기(서비스워커는 빈 값을 "사본 없음"으로 읽음) 3) `deleteDatabase`. 결과(`deleted`/`blanked`/`database-deleted`/`failed`)를 돌려주고 `swTokenCopySettled()`(최대 1초 대기)가 로그아웃·탈퇴 흐름에 true/false 로 알린다. 로그아웃 자체는 막지 않고, 끝내 실패하면 콘솔 경고만 남긴다. 응답 없는 요청이 뒤 작업을 막지 않도록 작업 하나는 2.5초에서 포기한다.
- **탭 경합**: 저장은 "쓰기 트랜잭션 안에서 그 시점 localStorage 값과 같을 때만" put 한다(다른 탭이 로그아웃·교체한 뒤 낡은 탭이 사본을 되살리지 못함). 앱 시작 때 "토큰 없음" 정리도 같은 시점에 localStorage 가 여전히 비어 있을 때만 지운다. localStorage 읽기는 동기라 확인과 put 사이에 끼어들 틈이 없고, 다른 탭의 로그아웃은 localStorage 를 먼저 지운 뒤 삭제하므로 순서가 항상 맞다(세대값보다 단순해서 이 방식을 택함).
- **메모리 토큰 모드(localStorage 불가, 시크릿 모드 등)**: 토큰은 새로고침하면 사라지므로 사본을 쓰지 않고 남은 것은 즉시 지운다(사본 수명 ≤ 토큰 수명). 이 모드에서는 알림 버튼이 로그인 안내로 끝난다.
- **손상된 사본**(줄바꿈·한글·공백 등 헤더에 못 쓰는 값)은 `fetch` 가 요청 전에 TypeError 를 던져 "인터넷 연결" 오안내가 되므로, 요청 전에 눈에 보이는 ASCII 인지 검사해 로그인 안내로 처리하고 그 사본을 지운다(`isHeaderSafeToken`).
- 빌드된 `dist/sw.js` 에 `fake-indexeddb`(테스트 전용)가 들어 있지 않아야 한다: `grep -c fake-indexeddb dist/sw.js` → 0.

**iOS Safari / 액션 미지원 환경(대체 흐름)** — iOS 홈 화면 웹앱 등 알림 `actions` 를 지원하지 않는 곳은 버튼 없이 알림만 보이고 기존 흐름(본문 탭 → 오늘 화면)을 쓴다. 오늘 화면은 알림이 가리킨 회차 카드를 맨 위로 올리고 카드 아래에 폭 전체의 큰 [먹였어요]를 붙인다.
- **회차 매칭**: URL 의 `med`·`t`·`d` 로 "약·시각이 모두 맞는 회차"만 고른다(`lib/todayDoses.decidePushHold`). `d` 가 오늘 응답의 `recordDate` 와 다르면(어제 알림) 강조·큰 버튼·순서 변경이 없다. `t` 가 없는 옛 알림은 아직 안 먹인 첫 회차를 강조만 하고 큰 버튼은 붙이지 않는다(보수적 폴백).
- **고정**: 처음 정한 회차에 고정한다. 렌더마다 "그 약의 아직 안 먹인 첫 회차"를 다시 고르지 않으므로 08:00 을 체크해도 큰 버튼이 20:00 으로 옮겨 가지 않는다. 체크하면 강조가 풀리고 줄이 접히며 큰 버튼도 사라진다(되돌리면 다시 보인다). 알림을 다시 열면(`n` 변경) 다시 고른다.
- **레이아웃**: 2분 강조가 끝나도 테두리·"방금 알림 온 약"만 사라지고 큰 버튼은 남는다(카드 높이가 손가락 밑에서 바뀌지 않게). 체크 직후 줄이 접힐 때까지(0.3초) 큰 버튼은 비활성으로 남아 포커스가 body 로 떨어지지 않고, 접힌 뒤 포커스는 [되돌리기]로 간다.

**수동 확인 절차(실제 푸시 발송은 대표님 승인 필요)**
1. `npm run build` 후 `npm run preview` + `.env.local` 에 `VITE_FIREBASE_*`(Android Chrome 또는 데스크톱 Chrome, HTTPS 또는 localhost). 로그인 → 알림 허용.
2. 투약 알림 수신 시 [먹였어요] 버튼 표시 확인 → 누르면 "기록하는 중이에요"를 거쳐 "먹였어요로 기록했어요"로 바뀌고 오늘 화면의 그 회차가 체크됨.
3. 같은 약 2회차(08:00·20:00)에서 20:00 알림이면 20:00 카드에만 큰 버튼이 붙는지, 어제 알림이면 강조가 없는지 확인.
4. 로그아웃 후 이전 알림의 버튼 → "다시 로그인이 필요해요"(DevTools > Application > IndexedDB `spn-sw` 의 `accessToken` 이 비었는지).
5. 오프라인으로 버튼 → "인터넷에 연결되지 않았어요". iOS Safari 는 버튼이 없고 본문 탭 흐름만 확인.
- 확인하지 못한 것: 실제 브라우저·실기기에서의 알림 모양/잠금화면 동작, 서비스워커 종료 시점, 스크린리더의 결과 알림 낭독. 자동 테스트와 빌드된 `dist/sw.js` 를 가짜 환경에서 돌린 하네스(76개 시나리오)로만 확인했다.

## 내 할 일 일정 (2026-10-13, 커밋 전)

기획 `.company/plans/내-할-일-일정.md`(5장 API 계약·웹 W1~W6), 설계 `.company/design/내-할-일-일정.md`. 백엔드는 다른 담당이 같은 계약(`docs/api-todos.md`)으로 만든다.
- 화면: `/todos`(탭 [예정] [완료]. 예정은 서버 `dateStatus` 로 지난 일정/오늘/내일/그 이후 묶음, 완료 체크는 제자리에서 접히고 [되돌리기], 완료 탭은 [완료 취소]), `/todos/new`, `/todos/:id`(병원 메모 500자·완료·지우기 확인 카드). 단일 조회 API 가 없어 `:id` 화면은 예정 → 완료 목록 순으로 찾는다.
- 진입점: 오늘 화면 맨 아래 카드 `내 할 일 일정`(면책 바로 위, 새 API 호출 없음). 알림 탭·인앱 배너는 `/todos?source=push` 를 연다(`sw.ts`, `PushProvider` 의 `TodoPushBanner`; 투약 알림 처리는 그대로).
- 제목 위 글자 버튼(칩)·예시 글자·추천·반복·"다음 일정 만들기" 없음. 날짜는 기본값을 넣지 않는다(오늘로 잘못 저장 방지). 날짜 범위·알림 시각은 서버가 판단하고 클라이언트는 날짜 계산을 하지 않는다(알림 시각 안내 문구만 상수 `TODO_REMIND_*`, 서버 `app.todo.*` 기본값 20:00 / 09:00 과 맞춰야 함).
- 모바일이 복사할 공유 lib(웹 원본 먼저): `todoApi.ts`, `todoForm.ts`, `todoList.ts`, `todoText.ts`(+`findTodoForbidden`), 테스트용 `todoFixtures.ts`, 그리고 변경된 `api.ts`(`ErrorContext 'todo'`, `TODO_LIMIT_REACHED`), `deleteGuide.ts`(삭제 항목에 할 일 추가), `client.ts` 의 `todoApi` 한 줄. 각 `*.test.ts` 도 함께.
- 금지어: `findTodoForbidden` = `findForbidden` + 권유형 14개(`시간입니다/시간이에요/하세요/드세요/받으세요/맞으세요/해야/꼭/놓치/잊지/미루/필요/권장/추천해`). 사용자가 입력한 제목·메모는 검사 대상이 아니다.
- 확인하지 못한 것: 실제 서버 연동(가짜 fetch 로만), 실제 푸시 수신·알림 탭 이동, 브라우저 date/time 선택기 모양, 스크린리더 낭독.

## 루틴 기록 칩 — 산책·배변 횟수 (2026-10-13, 커밋 전)
기획 `.company/plans/루틴-기록-칩.md`, 설계 `.company/design/루틴-기록-칩.md`, 계약 백엔드 `docs/api-routine.md`.
- 오늘 화면 메모 다음·지난 기록 링크 앞의 접힌 행 `산책·배변 기록 (선택)`(`components/RoutineSection.tsx`). 기본 접힘, 저장된 값이 있으면 불러온 직후 한 번 자동 펼침(펼침 상태는 저장하지 않음). 값은 null(안 적음) 또는 0~20 정수, [−] 값 [+] [지우기]로만 입력, 별도 저장 없이 기존 [저장] 하나로 함께 저장한다. 기본값·제안값·평균은 없다.
- 요청: `PUT daily-logs` 의 `walkCount`·`poopCount` 는 루틴 값이 화면을 불러온(저장한) 시점과 **달라졌을 때만** 두 키를 함께 싣고(안 적음으로 지우면 null 명시), 안 바꿨으면 두 키를 생략해 8필드로 보낸다(서버는 생략 시 기존 값 유지 — 루틴을 안 건드린 기기가 다른 기기의 값을 지우지 않는다). `buildDailyLogBody(form, baselineRoutine)`. 저장 실패 뒤 루틴 값을 다시 고치면 `저장하지 못했어요` 안내가 `저장 전` 안내로 돌아온다. 지난 기록 목록 줄은 루틴만 저장한 날 `산책 2회 · 배변 3회`(다른 항목이 있으면 줄은 그대로). `restoreBody` 는 10필드, 루틴 값이 저장 전과 달라졌을 때만 되돌리기 결과 안내에 한 문장을 덧붙인다. `isFormDirty` 에 루틴 포함(접고 펴기는 제외).
- 지난 기록 하루 상세(`HistoryDayPage`)에 증상 다음·메모 앞 `산책·배변` 한 줄(값이 없으면 숨김). 삭제 안내(`deleteGuide.ts`, `AccountDeletePage`)에 `산책·배변 횟수` 추가.
- 로직·문구: `lib/routineForm.ts`, `lib/routineText.ts`(`findRoutineForbidden`). 모바일 `src/lib/` 에 사본이 있다.
- 확인하지 못한 것: 실제 서버 연동, 실제 브라우저의 큰 글씨·스크린리더 낭독. 처리방침 수집 항목 갱신은 대표님 승인·법무 검토 필요.

## 반려동물 유형·생일·입양일 — 온보딩 C단계 (2026-10-13, 커밋 전)

기획 `.company/plans/초보-견주-온보딩-C-E-F.md` 2장, 설계 `.company/design/초보-견주-온보딩-C.md`, 계약 백엔드 `docs/api-pet-profile.md`. 웹만 구현(모바일·E·F 아직).
- 화면: `PetFormPage`(등록 `/pets/new`·수정 `/pet` 모두). 종류 아래 `함께 지내는 상황 (선택)` 세로 라디오 3개(`처음 키워요` / `나이 든 아이예요` / `나중에 정할게요`=null, 기본), 태어난 해 아래 접힌 행 `날짜 자세히 적기 (선택)`(생일 월·일, 입양일 연·월·일 `<select>`). 저장된 날짜가 있으면 펼친 채 열리고, 저장 시 날짜 오류가 있으면 펼쳐 첫 오류 칸에 포커스.
- 요청 본문: `profileType`·`birthDate`·`adoptedOn` 은 저장된 값(base)과 달라졌을 때만 키를 넣고(안 건드리면 생략 = 서버가 유지), 지울 때만 `null`. `birthYear` 는 기존대로 항상 보낸다. 접힘/펼침은 dirty 가 아니다. 태어난 해를 바꾸면 월·일은 유지(그 해에 없는 날이면 일만 비움), 태어난 해를 지우면 월·일도 비운다.
- 검증(저장할 때, 기기 달력 날짜 기준 `validatePetDraft(draft, today)`): 생일 월·일 한쪽만, 월·일은 있고 태어난 해 없음, 없는 날짜, 미래, 입양일 일부만, 입양일<생일. 입양일 연도만 태어난 해보다 이른 경우는 막지 않는다(서버와 동일). 서버 400 문구는 날짜까지 포함하도록 `lib/api.ts` 확장.
- 공유 lib(모바일이 복사할 대상): `petProfile.ts`(날짜 계산·`PetProfileType`·`todayParts`), `petProfileText.ts`(문구 상수·`petDateSummary`·`findPetProfileForbidden`), `petForm.ts`·`petApi.ts`·`api.ts` 수정분. 문구 상수 전체를 금지어 검사 테스트(`petProfileText.test.ts`)에 건다.
- 계정 탈퇴 삭제 범위 문구(`deleteGuide.ts`, `AccountDeletePage`)에 생일·입양일·함께 지내는 상황 반영.
- 테스트 77파일 887개, `npm run build` 성공, `grep -c fake-indexeddb dist/sw.js` = 0. 실서버 연동·실기기·글자 확대·스크린리더·실제 폼 높이는 확인하지 못함. 처리방침 수집 항목 갱신은 대표님 승인·법무 검토 필요.

## 함께한 날 · 기록 N일째 — 온보딩 E단계 (2026-10-14, 커밋 전)

기획 `.company/plans/초보-견주-온보딩-C-E-F.md` 3장, 설계 `.company/design/초보-견주-온보딩-E.md`, 계약 백엔드 `GET /api/pets/{petId}/today` 의 `companion{togetherDays, recordingDays}`(first_time 아니면 null). 웹만 구현(모바일·F 아직).
- 오늘 화면 헤더 반려동물 줄 아래 한 줄씩 보조색 텍스트(`components/CompanionLine.tsx`, 카드·아이콘·강조·`aria-live` 없음): `{이름}와/과 함께한 지 N일째`, `기록을 시작한 지 N일째`. 그릴 문장이 없으면 `null` 을 돌려줘 빈 컨테이너도 없다.
- 그리는 조건: `today.companion` 이 있고 `pet.profileType === 'first_time'`(대표님 결정: 서버 null 외 2차 방어), 숫자는 줄마다 1 이상 정수일 때만(0·음수·소수·NaN·null 은 그 줄 생략), 이름이 비면 함께한 줄 생략. 로딩·오류 때는 그리지 않는다. 날짜 계산은 클라이언트에 없다(서버 숫자만 표시).
- 글자 확대: `.companion-line` 에 `word-break: keep-all; overflow-wrap: anywhere`.
- 타입: `TodayResponse.companion?: Companion | null`(optional, 구버전 응답 허용).
- 공유 lib(모바일이 복사할 대상): `companionText.ts`(`COMPANION_TEXT`·`companionLines`·`companionTexts`·`findCompanionForbidden`) + `petApi.ts` 의 `Companion`·`TodayResponse.companion` 수정분. 금지어 검사는 문구 상수 샘플 출력 전체에 건다(`일째`는 허용).
- 테스트: 시니어·유형 미선택 헤더 `outerHTML` 이 companion 유무와 상관없이 동일함을 `TodayPage.test.tsx` 에서 고정. 웹 79파일 920개, `npm run build` 성공, `grep -c fake-indexeddb dist/sw.js` = 0. spn.* 저장 키 변경 없음.
- 확인하지 못한 것: 실서버 연동(백엔드 `docs/api-companion.md` 가 아직 없어 기획서 계약으로 작성), 실제 브라우저의 글자 확대·스크린리더 낭독.

## 테스트

`npm test` — 52개 파일, 643개 (2026-10-12 기준, 저장 되돌리기·알림에서 바로 체크·QA·반려동물 폼 추출 포함. 아래 목록은 초기 6개 파일 내역).

- `pages/TodayPage.test.tsx` (14): 계약서 예시 JSON 으로 fetch 를 가짜로 바꿔 화면을 검사한다.
  제안값 점선 표시와 저장 시 확정, 저장 본문이 계약 8개 필드와 일치, 저장된 기록은 실선, 체중 저장 조건, 첫 사용 상태,
  "특이사항 없음" 자동 해제, 투약 낙관적 업데이트·실패 롤백·409 동기화·취소, pet 404, 저장 400 안내, 서버 꺼짐, 이벤트 실패 무시.
- `pages/PetFormPage.test.tsx` (18, 이름 30자 = UTF-16 길이 경계 포함): 반려동물 등록·수정 화면의 현재 동작 고정(검증 문구, 저장 본문, 400·연결 실패·409·404 처리, 중복 제출) — `lib/petForm.ts` 추출 전에 작성해 추출 후에도 그대로 통과한다. `lib/petForm.test.ts` (20, 한글 30/31자·이모지 15/16개). 사진 부분은 테스트하지 않는다.
- `lib/todayForm.test.ts` (7), `lib/symptoms.test.ts` (6), `lib/api.test.ts` (10), `lib/loginForm.test.ts` (5), `lib/config.test.ts` (3).

## 개인정보 후속 조치 (2026-10-12)
- **만 14세 확인(가입 화면만):** 가입할 때 "만 14세 이상입니다." 체크가 필요하다(체크 없이 제출하면 칸 오류, 요청 안 나감). **클라이언트 전용이라 서버에 기록하지 않는다.** `POST /api/auth/signup` 본문은 그대로(이메일·비밀번호). 로그인 화면에는 없다. 처리방침 주소가 있으면 체크 아래에 링크를 둔다.
- **`/delete-account`:** 로그인 없이 열리는 계정 삭제 안내 페이지(로그인 가드 밖, 서비스워커 SPA 폴백으로 직접 접속 가능). Google Play 의 "앱 밖 삭제 요청 링크"로 쓸 수 있다. 로그인해 있으면 계정 삭제 화면(`/account/delete`) 링크가 더 보인다. 환경변수(모두 비우면 해당 줄이 숨겨진다): `VITE_SUPPORT_EMAIL`(문의 이메일), `VITE_OPERATOR_NAME`(개발자·운영자명), `VITE_RETENTION_NOTE`(백업·서버 로그 보관 한 문장), `VITE_DELETE_REQUEST_NOTE`(이메일 요청 줄에 붙일 처리 기간·본인 확인 안내. 코드에 기본 문구가 없고 비면 숨김), `VITE_PRIVACY_POLICY_URL`. 이메일은 `? & , % ; #` 가 들어 있으면 형식 오류로 보고 버린다(mailto 쿼리 주입 방지).
  삭제 범위 문구는 실제 동작대로 "서비스 데이터베이스에서는 즉시 삭제해요. 사진 파일은 이어서 지워요."로 한정했다(DB 삭제 커밋 뒤 사진 폴더 삭제, 사진 삭제가 실패해도 탈퇴는 성공 처리, 백업·로그 보관은 미정이라 단정하지 않음). 삭제 목록 끝에 "그 밖에 서비스 이용 중 쌓인 데이터(이용 기록, 알림 발송 기록 등)" 포괄 항목이 있다.
  **401 처리:** 공개 경로(`auth.tsx` 의 `PUBLIC_PATHS`, 지금은 `/delete-account`)에서는 만료·무효 토큰으로 401 을 받아도 토큰만 정리하고 `/login` 으로 보내지 않는다(그 밖의 경로는 기존대로 이동).
  **스토어 제출 전 체크:** `VITE_SUPPORT_EMAIL`(비었거나 형식이 틀리면 `npm run build` 때 `[경고]` 가 출력되지만 빌드는 계속된다. 개발 모드는 조용), `VITE_OPERATOR_NAME`, `VITE_RETENTION_NOTE`, `VITE_DELETE_REQUEST_NOTE`, `VITE_PRIVACY_POLICY_URL` 을 채운다.
- **메모 안내:** 오늘 메모와 반려동물 폼의 질환 입력칸 아래에 "반려동물의 기록만 적어 주세요. 보호자 본인의 건강 정보는 적지 마세요." 가 항상 보인다(`aria-describedby`). 문구는 `lib/privacyText.ts`.

## 아직 안 한 것 / 알려진 한계

- 웹 반려동물 등록의 409 `PET_LIMIT_REACHED` 는 말없이 다시 읽어 오늘 화면으로 간다(모바일은 "이미 등록된 반려동물이 있어요…" 안내를 붙였다). 웹 쪽 보정은 하지 않았다.
- 하단 탭바는 넣지 않았다(오늘 화면의 `지난 기록` 링크와 맨 아래 `지난 기록 보기 ›` 행으로 진입). 메뉴(≡)는 프로필 화면으로 간다.
- 지난 기록 보기(`/history`, `/history/:recordDate`): 서버 30일치를 한 번 받아 7일/30일은 화면에서 자른다. 체중 선 그래프는 직접 그린 `<svg>`(`components/WeightChart.tsx`, 좌표는 `lib/chartGeometry.ts`), `표로 보기` 토글, 그래프에서 ←/→ 키로 기록 이동. 읽기 전용이며 투약은 "현재 등록된 약 기준" 횟수만 보여 준다(퍼센트·평가 표현 없음).
- 병원 방문 리포트(`/report?range=7|14|30&from=history`, 2026-10-08): 진료 때 수의사에게 건네는 요약 1~2장. 지난 기록과 **같은 `GET daily-logs` 1번 + 약 목록**으로 만들고(신규 API 없음, 백엔드 변경 없음) 7/14/30일(기본 14일) 전환은 재요청 없이 자른다. 집계 `lib/reportStats.ts`(체중 첫·마지막·최소·최대, 기록 없는 날, 메모, 기존 `historyStats` 재사용), 문구·조립 `lib/reportText.ts`(`REPORT_FORBIDDEN` = 기존 `findForbidden` + 상의·권·병원에 가·진료받·필요해·의심·심각·이상 없, 사용자 입력은 검사 제외), 화면 `pages/ReportPage.tsx` + `components/ReportSheet.tsx`. 인쇄는 `window.print()` + `styles.css` 의 `@media print`(A4 세로·흑백·11pt/9.5pt·섹션 `break-inside: avoid`·그래프 옆 체중 표·쪽마다 면책 바닥글·`.no-print` 숨김). PDF 는 브라우저 인쇄 창의 "PDF로 저장"(앱이 파일을 만들지 않음). 기간·메모 옵션은 저장하지 않는다(매번 14일, 메모 포함). 오늘 화면 맨 아래 카드와 지난 기록 화면의 `병원 방문 리포트 만들기 ›` 에서 들어간다. 메모 켜짐/꺼짐은 본문에서 즉시 반영된다. 증상·메모는 12건까지 보이고 넘으면 "나머지 n건은 앱에서 볼 수 있어요."로 알린다.
- 인쇄 모양(실제 브라우저 인쇄 미리보기, A4 1쪽 맞음, 쪽 번호)은 자동 테스트로 확인하지 못했다(CSS 규칙 존재만 `reportPrintCss.test.ts` 로 검사). 출시 전 Chrome/Safari 인쇄 미리보기에서 눈으로 확인해야 한다.
- 저장 되돌리기·실수 방지(2026-10-12, 기획 `.company/plans/저장-되돌리기.md`, 계약 백엔드 `docs/api-undo.md`): (1) 투약 접힌 줄 버튼 `취소`→`되돌리기`(줄 전체가 아니라 버튼만 반응, 접히는 0.45초 동안 같은 줄 두 번째 탭 무시), 되돌린 직후 `다시 체크`(지금 시각으로 기록됨 안내, 10초) (2) 일일 기록 저장 직후 `저장 되돌리기`(`UndoNotice`, 사라지지 않고 폼 수정·닫기·재저장·화면 이탈 시 정리, 결과 안내 8초·호버/포커스 중 정지, 낮은 화면(max-height 520px)은 안내를 `<main>` 맨 위로). 되돌리기 직전 `GET /today` 로 `dailyLog.updatedAt` 을 비교해 다르면 덮어쓰지 않고 안내, 첫 저장이면 `DELETE`, 수정이면 직전 서버 값을 `PUT`, 400 `INVALID_RECORD_DATE` 는 "시간이 지나 되돌릴 수 없어요". **저장 직전에 `GET /today` 를 한 번 받아 서버의 실제 기록을 되돌릴 값(`before`)으로 잡는다**(다른 기기가 그 사이 저장했어도 그 기록을 지우거나 낡은 값으로 덮지 않는다. 이 조회가 실패하면 화면이 알던 기록을 쓰되 `updatedAt` 비교 보호는 그대로). 저장 응답의 `updatedAt` 은 DB 저장값이라(백엔드 수정, 2026-10-12) 응답 값을 그대로 비교 기준으로 쓴다. **저장 중에는 `저장 되돌리기`를 누를 수 없다**(버튼 비활성 + "저장하는 중에는 되돌릴 수 없어요.", `undoDaily` 도 `saving` 이면 무시. 안내는 숨기지 않고 유지하다가 저장이 끝나면 새 저장 기준 `before`/`saved` 안내로 교체. 반대로 되돌리는 중에는 저장 버튼 비활성). 투약은 줄별 `pending`/접힘 가드로 같은 원칙. 되돌리는 중에 입력을 시작했으면 폼은 덮지 않고 `savedLog` 만 갱신한다. 되돌리기 이력은 메모리에만 둔다 (3) 체중 자릿수 확인 카드(`ConfirmCard`): 지난 기록의 5배 이상·1/5 이하일 때만, 숫자 두 개만 나란히, `다시 입력`(값 유지·전체 선택)/`그대로 저장`(같은 값은 다시 묻지 않음) (4) 저장하지 않은 입력을 두고 앱 안 링크로 이동하면 `저장하지 않고 나갈까요?` 대화상자, 바뀐 내용이 있을 때만 `beforeunload`. 브라우저 뒤로가기(popstate)와 푸시 배너 탭으로 인한 이동은 이탈 확인을 거치지 않는다(`BrowserRouter` 한계, 기획 Q3 — 범위는 앱 안 링크·새로고침·닫기). 공용 로직 `lib/undoLogic.ts`·문구 `lib/undoText.ts`(`findUndoForbidden` = `findForbidden` + 증감·비교 표현)·`todayForm.isFormDirty`. 약 삭제 되돌리기·물 자릿수·로그아웃 확인은 하지 않았다.
- "아직 시간이 안 된 약" 한 줄 접기, 시간대별 요약 카드는 하지 않았다(기기 시각 계산이 필요해서). 체크한 약만 한 줄로 접는다.
- localStorage 토큰은 XSS 에 취약하다. 정식 출시 전 httpOnly 쿠키 방식 전환을 검토한다.
- 비밀번호 찾기(재설정)는 없다(비밀번호 변경·회원 탈퇴는 있음). 아이콘은 임시.
- **429 `Retry-After` 는 브라우저에서 읽지 못한다**(백엔드가 `Access-Control-Expose-Headers` 를 보내지 않음). 읽지 못하면 폼을 60초만 잠그고 "잠시 뒤에" 문구를 쓴다. 앱(모바일)은 정확한 초를 쓴다.
