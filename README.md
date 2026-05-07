# ✈️ J-Plan - AI 기반 여행 일정 플래너

> **스마트한 여행 계획의 시작**, J-Plan과 함께 최적의 여행 일정을 만들어보세요.

---

## 📖 서비스 소개

**J-Plan**은 여행 일정을 직관적이고 시각적으로 관리할 수 있는 **웹 기반 여행 일정 플래너**입니다.

타임 테이블 뷰를 통해 일정을 한눈에 파악하고, 지도와 함께 동선을 확인할 수 있습니다.
이동 수단을 선택하면 **Google Maps / Kakao Maps API를 활용하여 예상 소요 시간과 거리를 자동으로 계산**해 드립니다.
일정 카드를 드래그하는 것만으로 시간을 조정하거나 순서를 바꿀 수 있어, 복잡한 여행 계획도 손쉽게 수정할 수 있습니다.

---

## ✨ 주요 기능

### 📅 타임 테이블 뷰
- 일차별, 전체 일정을 타임라인 그리드로 시각화
- 일정 카드 **상/하단 드래그**로 시작·종료 시간을 15분 단위로 조정
- 일정 카드 **드래그 앤 드롭**으로 두 일정의 시간대를 즉시 교체(Swap)
- 미저장 변경 사항을 명확히 표시하고, 저장 전 이탈 시 경고창 제공

### 🗺️ 지도 뷰 (Google Maps)
- 일정에 등록된 위치를 지도 위 마커로 표시
- 마커 클릭 시 해당 일정 정보 확인
- 타임라인 뷰와 지도 뷰를 동시에 활용하거나 전환하여 사용

### 🚗 스마트 이동 시간 계산
| 구분 | API | 지원 이동 수단 |
| :--- | :--- | :--- |
| **국내 (한국)** | Kakao Mobility API | 🚗 자동차 (실시간 교통 반영), 🚶 도보, 🚲 자전거 |
| **해외 / 대중교통** | Google Distance Matrix API | 🚗 자동차, 🚌 대중교통, 🚶 도보, 🚲 자전거 |

- 출발지·도착지·이동 수단 입력 시 예상 소요 시간과 거리를 **자동으로 계산**
- 국내/해외 주소를 **자동으로 판별**하여 최적의 API를 선택
- 계산 결과는 타임 테이블 카드에 직접 표시

### 🏨 숙소 관리
- 일차별 숙소 정보(이름, 주소, 연락처) 등록 및 관리

### 🔒 인증
- **Cloudflare Turnstile** 기반 봇 방지
- JWT 토큰을 활용한 안전한 로그인 유지

### 📤 데이터 내보내기 / 가져오기
- 여행 데이터를 **JSON 파일**로 내보내기(Export) 및 가져오기(Import)
- 인쇄용 타임라인 뷰 지원

---

## 🛠️ 기술 스택

### 프론트엔드
| 분류 | 기술 |
| :--- | :--- |
| **Framework** | React 19 |
| **Language** | TypeScript 6 |
| **Build Tool** | Vite 8 |
| **Routing** | React Router v7 (Data Router) |
| **State Management** | Zustand v5 |
| **Styling** | Tailwind CSS v4 |
| **Icons** | Lucide React |
| **날짜 처리** | date-fns |

### 외부 API
| 분류 | 기술 |
| :--- | :--- |
| **지도 / 해외 경로** | Google Maps Platform (Maps JavaScript API, Distance Matrix API, Geocoding API) |
| **국내 경로** | Kakao Mobility API (자동차 경로), Kakao Local API (주소 → 좌표 변환) |
| **봇 방지** | Cloudflare Turnstile |

### 백엔드 / 인프라
| 분류 | 기술 |
| :--- | :--- |
| **서버리스 함수** | Cloudflare Workers (Pages Functions) |
| **데이터베이스** | Cloudflare D1 (SQLite) |
| **파일 스토리지** | Cloudflare R2 |
| **인증** | JWT (jose 라이브러리) |
| **배포** | Cloudflare Pages |

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
```

> **Google Maps API 키 발급**: [Google Cloud Console](https://console.cloud.google.com/)  
> **Kakao REST API 키 발급**: [Kakao Developers](https://developers.kakao.com/)

### 3. 개발 서버 실행
```bash
npm run dev
```

로컬 환경(`DEV`)에서는 Cloudflare 백엔드 없이 `localStorage`를 임시 저장소로 사용합니다.

---

## ☁️ 배포 (Cloudflare Pages)

### 사전 준비
Cloudflare 대시보드에서 아래 서비스를 생성해야 합니다:
- **D1 데이터베이스**: `j-plan-db` 이름으로 생성 후 `wrangler.toml`의 `database_id` 입력
- **R2 버킷**: `j-plan-storage` 이름으로 생성

### 환경 변수 (Cloudflare Pages 설정)
Cloudflare Pages 프로젝트 설정에서 아래 환경 변수를 추가해 주세요.

```
VITE_GOOGLE_MAPS_API_KEY=...
KAKAO_REST_API_KEY=...      # 서버 사이드용 (Worker 프록시)
JWT_SECRET=...              # JWT 서명 비밀 키
AUTH_PASSWORD=...           # 서비스 접근 비밀번호
```

### 빌드 및 배포
```bash
npm run build
```

---

## 📁 프로젝트 구조

```
j-plan/
├── functions/            # Cloudflare Pages Functions (서버리스 API)
│   └── api/
│       ├── auth/         # 인증 관련 엔드포인트
│       ├── data/         # 여행 데이터 CRUD
│       └── geo/          # 지오코딩 / Kakao 경로 프록시
├── public/               # 정적 파일
└── src/
    ├── components/       # 재사용 가능한 UI 컴포넌트
    │   ├── auth/         # 인증 컴포넌트
    │   ├── layout/       # 레이아웃 컴포넌트
    │   └── travel/       # 여행 관련 컴포넌트 (타임 테이블, 지도, 모달 등)
    ├── pages/            # 페이지 컴포넌트
    ├── store/            # Zustand 상태 관리 스토어
    └── types/            # TypeScript 타입 정의
```

---

## 👤 Author

**윤명준 (MJ Yun)**  
[Blog](https://mj.is-a.dev/)
