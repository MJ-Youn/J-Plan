# 🚀 J-Plan Release Notes

## v2.0.0 — 2026-11-17

여행 전 계획부터 현지 이동·정산·오프라인 활용까지 전 과정을 통합 지원하는 대규모 업데이트입니다.

### ✨ 주요 신규 기능

1. **협업 공유 & 동시 편집 충돌 방지**
    - 읽기 전용 / 공동 편집 공유 링크 발급 및 Google 로그인 기반 공동 작업자 관리 (`travel_shares`, `travel_collaborators`)
    - `revision` 낙관적 잠금 및 충돌 해결 모달(`ConflictModal`) 추가

2. **암호화 여행 필수 서류 보관함**
    - e-티켓, 숙소·렌터카 바우처, QR 이미지를 **AES-256-GCM 암호화** 후 Cloudflare R2 비공개 저장소에 저장 (`travel_files`)
    - Google Drive 외부 링크 등록, 카테고리별·일차별 필터링, 공개 범위 설정 지원

3. **인쇄 최적화 Excel 내보내기 & 미리보기**
    - `ExcelJS` 기반 A4 가로 인쇄 최적화 시트(`.xlsx`) 생성 및 내보내기 전 웹 미리보기 제공

4. **현지 실전 유틸리티 (날씨 · 내비게이션 · 시간 조정 · 캘린더)**
    - **일차별 숙소 기준 날씨 예보**: Open-Meteo API를 이용해 각 일차 숙소 좌표 기준 날씨·기온·강수확률 표시 (마지막 날 숙소 설정 제외)
    - **내비게이션 바로가기**: 해외 사용을 고려해 Google Maps를 기본으로 지원하며 카카오맵·네이버지도·T맵 선택 가능 (모바일 최적화)
    - **일정 시간 일괄 밀기/당기기** 및 **`.ics` 캘린더 파일 내보내기** 추가

5. **준비물 체크리스트 & 경비·정산 트래커 + 지출 분석 그래프**
    - **체크리스트**: 서류 보관함 파일 직접 연동 지원
    - **경비·정산 트래커**: 일정 추가/수정 시 경비(원화·현지 통화) 직접 입력 및 트래커 통합 조회, Frankfurter 실시간 환율 환산, N분의 1 정산 가이드
    - **지출 분석 탭 (순수 SVG)**: 항목별 지출 비율 도넛 차트, 일차별 카테고리 누적 막대 그래프, 누적 지출 추이 곡선, 고액 지출 TOP 3 제공

6. **AI 일정 생성 스킬 & PWA 오프라인 지원**
    - **AI 일정 생성 스킬 (`SKILL.md`)**: Gemini·ChatGPT·Claude에서 최신 J-Plan JSON(일정·숙소·체크리스트·경비 포함)을 바로 생성할 수 있는 맞춤 프롬프트 빌더 및 스킬 전문 제공
    - **PWA**: 모바일 홈 화면 앱 설치, 오프라인 상태 배지, Service Worker(`sw.js`) 기반 앱 셸 및 여행·날씨·환율 API 오프라인 캐싱

---

### ⚠️ 배포 시 필수 체크사항

1. **D1 스키마 마이그레이션 실행**:
    ```bash
    npx wrangler d1 execute j-plan-db --remote --file=./schema.sql
    ```
2. **Cloudflare Pages 환경 변수 확인**:
    - `FILE_ENCRYPTION_KEY` (신규 권장, 미설정 시 `JWT_SECRET` 폴백)
    - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `JWT_SECRET`, `KAKAO_REST_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_TURNSTILE_SITE_KEY`
