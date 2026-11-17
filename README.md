# ✈️ J-Plan - AI 기반 스마트 여행 일정 플래너

> **스마트한 여행 계획의 시작**, J-Plan과 함께 동선·숙소·날씨·서류·경비·정산까지 한 번에 관리해 보세요.

---

## 📖 서비스 소개

**J-Plan**은 여행 일정을 직관적이고 시각적으로 관리할 수 있는 **PWA 기반 웹 여행 일정 플래너**입니다.

타임 테이블 뷰와 Google Maps 뷰를 나란히 보며 동선을 설계하고, **Google Maps / Kakao Mobility API**로 예상 소요 시간과 거리를 자동 계산할 수 있습니다. 공동 편집 공유, AES-256-GCM 암호화 서류 보관함, 일차별 숙소 기준 날씨 예보, 다중 통화 경비·정산 트래커 및 지출 분석 차트, 인쇄 최적화 Excel 내보내기, 오프라인 PWA 지원까지 여행 전·중·후 전 과정을 지원합니다.

---

## ✨ 주요 기능

### 📅 타임 테이블 & 스마트 동선 관리

- 일차별·전체 일정을 타임라인 그리드로 시각화 (모바일 반응형 2탭 전환 지원)
- 일정 카드 **상/하단 드래그**로 시작·종료 시간을 15분 단위로 조정
- 일정 카드 **드래그 앤 드롭**으로 시간대 교체(Swap) 및 **일정 시간 일괄 밀기/당기기**
- **AI 일정 생성 스킬 & 프롬프트 빌더**: Gemini·ChatGPT·Claude용 `SKILL.md` 규격으로 JSON 일정을 생성해 바로 가져오기

### 🗺️ 지도 뷰 & 내비게이션 연동

- 일정별 위치·이동 경로 마커 표시 및 선택 연동
- 해외·국내 어디서나 **Google Maps 길찾기** 기본 연동 (카카오맵·네이버지도·T맵 선택 지원, 모바일 앱/웹 딥링크)

### 🌤️ 일차별 숙소 기준 날씨 예보

- **Open-Meteo API** 연동(무료, API 키 불필요)으로 각 일차의 숙소 좌표를 기준으로 16일 이내 예보·기온·강수확률 제공

### 🤝 협업 공유 & 동시 편집 충돌 방지

- 읽기 전용 / 공동 편집 공유 링크 발급 및 로그인 기반 공동 작업자(`travel_collaborators`) 관리
- `revision` 기반 낙관적 잠금(Optimistic Locking)으로 동시 편집 충돌 감지 및 병합 안내

### 🔐 여행 필수 서류 보관함

- e-티켓, 숙소·렌터카 바우처, QR 이미지를 **AES-256-GCM 암호화** 후 R2 비공개 저장소에 보관 (Google Drive 링크 등록 지원)
- 카테고리별·일차별 필터링 및 공개 범위(`소유자만` / `공동 작업자` / `전체 공유`) 설정

### ✅ 준비물 체크리스트 & 💰 경비·정산 트래커

- **체크리스트**: 카테고리별 준비물 관리 및 서류 보관함 파일 직접 연결
- **경비 · 정산 트래커**: 일정 추가/수정 시 입력한 경비(`원화·현지 통화`)와 별도 경비를 통합 조회, **Frankfurter 실시간 환율** 기반 원화 환산, N분의 1 정산 가이드, **순수 SVG 지출 분석 그래프**(항목별 도넛 차트 · 일차별 누적 막대 · 누적 추이 · 고액 지출 TOP 3) 제공

### 📤 내보내기 & 📱 PWA 오프라인 지원

- **Excel 내보내기 & 미리보기**: A4 가로 인쇄에 최적화된 일정표/숙소/메모 시트(`.xlsx`) 생성
- **캘린더 내보내기**: `.ics` 파일 생성으로 Google·Apple 캘린더 등록
- **PWA**: 모바일 홈 화면 앱 설치 및 Service Worker 기반 오프라인 일정·날씨·환율 캐싱

---

## 🛠️ 기술 스택

### 프론트엔드

| 분류                 | 기술                            |
| :------------------- | :------------------------------ |
| **Framework**        | React 19                        |
| **Language**         | TypeScript 6                    |
| **Build Tool**       | Vite 8                          |
| **Routing**          | React Router v7 (Data Router)   |
| **State Management** | Zustand v5                      |
| **Styling**          | Tailwind CSS v4                 |
| **Icons / Export**   | Lucide React, ExcelJS, date-fns |

### 외부 API

| 분류                 | 기술                                                                           |
| :------------------- | :----------------------------------------------------------------------------- |
| **지도 / 해외 경로** | Google Maps Platform (Maps JavaScript API, Distance Matrix API, Geocoding API) |
| **국내 경로**        | Kakao Mobility API, Kakao Local API                                            |
| **날씨 / 환율**      | Open-Meteo Forecast & Geocoding API, Frankfurter Exchange Rate API             |
| **봇 방지**          | Cloudflare Turnstile                                                           |

### 백엔드 / 인프라

| 분류              | 기술                                                         |
| :---------------- | :----------------------------------------------------------- |
| **서버리스 함수** | Cloudflare Workers (Pages Functions)                         |
| **데이터베이스**  | Cloudflare D1 (SQLite)                                       |
| **파일 스토리지** | Cloudflare R2                                                |
| **인증 / 암호화** | Google OAuth 2.0, JWT (`jose`), Web Crypto API (AES-256-GCM) |
| **배포**          | Cloudflare Pages                                             |

---

## 🚀 로컬 개발 환경 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.local` 파일을 생성하고 아래 값을 채워주세요.

```env
# Google Maps Platform API 키
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Kakao REST API 키 (국내 경로 계산용)
VITE_KAKAO_REST_API_KEY=your_kakao_rest_api_key

# Cloudflare Turnstile 사이트 키
VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
```

### 3. 개발 서버 실행

```bash
npm run dev
```

로컬 환경(`DEV`)에서는 Cloudflare 백엔드 없이 `localStorage`를 임시 저장소로 사용합니다.

---

## ☁️ 배포 (Cloudflare Pages)

### 1. 사전 준비

Cloudflare 대시보드에서 아래 서비스를 생성하고 `wrangler.toml`에 바인딩합니다:

- **D1 데이터베이스**: `j-plan-db`
- **R2 버킷**: `j-plan-storage`

### 2. D1 데이터베이스 스키마 반영 (필수)

신규 테이블(`users`, `travel_shares`, `travel_collaborators`, `travel_files`)을 원격 D1에 반영합니다.

```bash
npx wrangler d1 execute j-plan-db --remote --file=./schema.sql
```

### 3. 환경 변수 (Cloudflare Pages 설정)

Cloudflare Pages 프로젝트의 **Settings → Environment variables**에 아래 값을 설정합니다.

```env
VITE_GOOGLE_MAPS_API_KEY=...
VITE_TURNSTILE_SITE_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-domain/api/auth/callback
KAKAO_REST_API_KEY=...      # 서버 사이드용 (Worker 프록시)
TURNSTILE_SECRET_KEY=...    # Cloudflare Turnstile 시크릿 키
JWT_SECRET=...              # JWT 서명 비밀 키
FILE_ENCRYPTION_KEY=...     # 서류 보관함 AES-256-GCM 암호화 키 (미설정 시 JWT_SECRET 폴백)
```

### 4. 빌드 및 배포

GitHub 저장소가 Cloudflare Pages와 연결되어 있다면 `main` 브랜치 푸시 시 자동 배포되며, 수동 배포 시에는 아래 명령어를 실행합니다.

```bash
npm run build
npx wrangler pages deploy dist
```

---

## 📁 프로젝트 구조

```
j-plan/
├── functions/                  # Cloudflare Pages Functions (서버리스 API)
│   └── api/
│       ├── _utils/             # 암호화(fileCrypto), 공유 DB 헬퍼
│       ├── auth/               # Google OAuth & JWT 인증
│       ├── data/travels/       # 여행 데이터, 공유, 암호화 서류 CRUD
│       ├── geo/                # Kakao 경로 프록시
│       └── share/              # 공유 링크 조회 및 공동 편집 저장
├── public/                     # PWA 매니페스트, 아이콘, Service Worker(sw.js)
└── src/
    ├── components/
    │   ├── auth/               # 인증 컴포넌트
    │   ├── layout/             # 레이아웃 및 PWA 상태 배너
    │   └── travel/             # 타임 테이블, 지도, 날씨, 모달·차트 컴포넌트
    ├── hooks/                  # useDialog, useEscapeKey, usePwa 등
    ├── pages/                  # 여행 목록, 상세, 공유 상세, 로그인 페이지
    ├── store/                  # Zustand 상태 관리 스토어
    ├── types/                  # TypeScript 타입 정의
    └── utils/                  # Excel/ICS 내보내기, 날씨, 환율, AI 스킬 프롬프트 등
```

---

## 👤 Author

**윤명준 (MJ Yun)**  
[Blog](https://mj.is-a.dev/)
