# 시니어펫 노트 모바일 앱 (React Native 뼈대)

Expo SDK 57 + TypeScript + Expo Router. 본격 개발은 웹 MVP 검증 후(2~3개월 차)에 하며,
지금은 로그인/회원가입 → "오늘"(자리표시) → 로그아웃 흐름과 공통 로직만 들어 있는 뼈대다.

## 폴더 구조
```
mobile/
├─ app.json              Expo 설정 (이름, scheme, 플러그인)
├─ .env.example          환경변수 예시 → .env 로 복사해서 사용
├─ src/
│  ├─ app/               화면(Expo Router: 파일 하나 = 화면 하나)
│  │  ├─ _layout.tsx     로그인 상태에 따라 화면 접근 제어(Stack.Protected)
│  │  ├─ index.tsx       "오늘" 자리표시 화면 + 로그아웃
│  │  ├─ login.tsx       로그인
│  │  └─ signup.tsx      회원가입
│  ├─ auth/AuthContext.tsx   로그인 상태(loading / signedOut / signedIn)
│  ├─ components/        공통 UI(ui.tsx: 접근성 기본값 강제), 로그인 폼
│  ├─ services/          모바일 전용: API 주소 설정, 토큰 저장(expo-secure-store), API 클라이언트 연결
│  ├─ lib/               웹과 같은 공통 로직 "사본" (아래 '공유 패키지 통합 계획' 참고)
│  └─ theme.ts           색·글자 크기·터치 영역 수치
```
화면이 아닌 코드는 `src/app/` 밖에 둔다(Expo Router 가 `src/app/` 안의 파일을 모두 화면으로 본다).

## 준비
- Node.js 20 이상 (확인한 버전: v24)
- `npm install`
- 환경변수: `.env.example` 을 `.env` 로 복사하고 `EXPO_PUBLIC_API_BASE_URL` 을 고친다.

| 실행 환경 | EXPO_PUBLIC_API_BASE_URL |
|-----------|--------------------------|
| 안드로이드 에뮬레이터 | `http://10.0.2.2:8080` (에뮬레이터에서 PC 의 localhost) |
| iOS 시뮬레이터(맥 필요)·웹 | `http://localhost:8080` |
| 실기기(Expo Go) | PC 의 LAN IP. 예: `http://192.168.0.10:8080` (`ipconfig` 의 IPv4 주소. 같은 Wi-Fi + Windows 방화벽 8080 허용 필요) |

- 비워 두면 안드로이드는 `10.0.2.2:8080`, 나머지는 `localhost:8080` 을 쓴다.
- `.env` 를 고친 뒤에는 `npx expo start -c` 로 캐시를 지우고 다시 시작한다.
- `EXPO_PUBLIC_` 값은 앱 안에 그대로 들어가므로 비밀값을 넣지 않는다.
- 백엔드(별도 저장소 `senior-pet-note-api`)가 켜져 있어야 로그인이 된다. 꺼져 있으면 "서버에 연결할 수 없어요" 문구가 나온다.

## 실행
| 방법 | 명령 | 비고 |
|------|------|------|
| Expo Go (실기기) | `npm start` → 휴대폰 Expo Go 앱으로 QR 스캔 | 무료. 계정 가입 없이 가능. 앱 스토어/플레이 스토어에서 Expo Go 설치 |
| 안드로이드 에뮬레이터 | 에뮬레이터를 켠 뒤 `npm run android` | Android Studio 의 AVD 필요 |
| iOS 시뮬레이터 | `npm run ios` | macOS + Xcode 필요 (대표 PC 는 Windows 라 불가) |
| 웹(화면 확인용) | `npm run web` | 웹에서는 secure-store 가 없어 토큰을 메모리에만 둔다(새로고침 시 로그아웃) |

## 검증 명령
```
npm run typecheck      # npx tsc --noEmit
npm test               # Jest (jest-expo): 공통 로직 + API 클라이언트 테스트
npx expo-doctor        # 설정·의존성 버전 점검
npx expo export --platform web   # 번들 생성 확인 (결과물 dist/ 는 git 제외)
```
- 패키지는 `npm install` 대신 `npx expo install <패키지>` 로 추가한다(SDK 에 맞는 버전을 골라 줌).

## 접근성 기본값 (design/today-wireframe.md 5-1, 5-2)
- 본문 18, 보조 문구 14, 제목 24. 기기 글자 크기 설정을 따른다(화면은 스크롤되어 200% 에서도 잘리지 않게).
- 모든 터치 요소 최소 48×48, 주요 버튼 높이 56, 버튼 간격 8.
- 색은 `theme.ts` 의 임시 색상. 빨강을 쓰지 않고, 오류도 색만이 아니라 글자로 알린다.
- 새 화면은 RN 기본 `Text`/`Pressable` 대신 `components/ui.tsx` 의 `AppText`, `AppButton`, `TextField` 를 쓴다.

## 인증 흐름
- API 계약: `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/me` (자세한 내용은 `src/lib/api.ts` 상단 주석).
- 토큰(JWT)은 `expo-secure-store` 에 저장(iOS Keychain / Android Keystore). 앱 시작 때 읽어 `/api/me` 로 확인한다.
- 401 을 받으면 토큰을 지우고 로그인 화면으로. 서버에 연결하지 못하면 토큰을 유지한다(오프라인 때마다 로그아웃되지 않게).
- 로그아웃 API 는 없다(refresh 토큰 없음). 기기에서 토큰만 지운다.

## 공유 패키지 통합 계획
현재 `src/lib/` 의 아래 파일은 `web/src/lib/` 의 **사본**이다. 파일 상단에 동기화 필요 주석이 있다.

| 파일 | 내용 | 테스트 |
|------|------|--------|
| constants.ts | 새벽 4시 기준(`RECORD_DAY_CUTOFF_HOUR`), 안내 문구, 7일 제안 기간, 면책 문구 | recordDate.test.ts 에서 확인 |
| recordDate.ts | `toRecordDate`, `addDays` | recordDate.test.ts (웹 테스트 사본) |
| suggestions.ts | 최근 7일 평균 제안값 | suggestions.test.ts (웹 테스트 사본) |
| symptoms.ts | "특이사항 없음" 초기 상태와 토글 | symptoms.test.ts (웹 테스트 사본) |
| api.ts | API 클라이언트 본체, 오류 문구 | api.test.ts (모바일에서 새로 작성) |
| loginForm.ts | 로그인/회원가입 입력 검증 | loginForm.test.ts (모바일에서 새로 작성) |

- 웹 테스트 사본은 `import ... from 'vitest'` 한 줄만 뺐다(Jest 전역 함수로 그대로 돈다).
- **지금 규칙:** 공통 로직을 고칠 때는 웹 원본을 먼저 고치고 같은 내용을 여기에 복사한다. 이 폴더만 고치지 않는다.
- **통합 시점:** 앱 본개발 착수(2~3개월 차) 때.
- **통합 방법(안):** 이 저장소에 `packages/shared/` 를 만들고 위 파일과 테스트를 옮긴 뒤,
  npm workspaces 로 `web` 과 `mobile` 이 `@senior-pet-note/shared` 로 가져다 쓴다.
  Expo 는 SDK 52 이후 모노레포(워크스페이스)를 자동 인식하므로 Metro 설정 추가는 거의 필요 없다.
  공유 패키지는 React·DOM·RN 에 의존하지 않는 순수 TS 로 유지한다(현재 파일들은 이미 그렇다).
- 플랫폼별로 다른 부분은 공유하지 않는다: API 주소 설정(Vite vs EXPO_PUBLIC), 토큰 저장(localStorage vs secure-store), 401 알림 방식.

## 앞으로 할 일
1. "오늘" 화면 본구현: 투약 카드 → 식사·물 → 증상 → 체중·메모 (와이어프레임 그대로). 백엔드 기록 API 가 나오면 연결.
2. 반려동물 등록·선택, 사진 업로드(`expo-image-picker`, MVP 결정 2).
3. **푸시 알림(투약 알림):** `expo-notifications` 사용. 로컬 알림부터 시작하고, 서버 발송 푸시는 백엔드에 기기 토큰 저장 API 가 필요하다. 안드로이드 원격 푸시는 Expo Go 에서 지원되지 않아 개발 빌드가 필요하다.
4. `packages/shared` 통합 (위 계획).
5. 화면 컴포넌트 테스트(`@testing-library/react-native`)는 화면이 실제로 생기면 추가.
6. 운영 API 는 반드시 `https://` 로. 정식(릴리스) 빌드의 안드로이드는 기본적으로 `http://` 통신을 막는다.

## 비용·승인이 필요한 일 (대표 승인 전 진행 금지)
- **스토어 출시:** Apple Developer Program 연 $99, Google Play 개발자 등록 $25(1회). 결제 전에 대표 승인 필요.
- Expo/EAS 계정 가입, EAS Build·Submit·Update 사용(무료 한도 초과 시 유료), 빌드 업로드, 스토어 등록 정보 작성은
  모두 외부 공개·비용과 연결되므로 대표 승인 후 진행한다. 지금 뼈대 단계에서는 어떤 계정도 만들지 않았다.
- 개발 빌드(`npx expo run:android`)는 로컬에서 무료로 가능하지만 Android Studio 설치가 필요하다.
