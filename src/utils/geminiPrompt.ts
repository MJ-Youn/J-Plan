/**
 * Gemini 대화창에 전달할 여행 일정 생성 프롬프트 템플릿을 생성합니다.
 *
 * @returns 복사할 수 있는 완벽한 프롬프트 문자열
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
export function generateGeminiPrompt(): string {
    return `당신은 여행 일정 플래너 전문가입니다.
내가 요청하는 여행지에 대해 아래의 **J-Plan 전용 JSON 데이터 형식**에 완벽히 맞추어 일정을 작성해 주세요.

### [J-Plan JSON 스키마 규격]
\`\`\`json
{
  "version": "1.0",
  "travel": {
    "id": "임의의 고유 ID 문자열 (예: tokyo_2026)",
    "name": "여행 제목 (예: 도쿄 3박 4일 미식 & 힐링 여행)",
    "region": "지역명 (예: 도쿄, 일본)",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD"
  },
  "accommodations": [
    {
      "id": "acc_1",
      "travelId": "travel.id와 동일값",
      "name": "숙소 이름",
      "address": "숙소 전체 주소",
      "description": "체크인/체크아웃 정보 및 메모",
      "dayIndex": 1,
      "phone": "전화번호(선택)"
    }
  ],
  "itineraries": [
    {
      "id": "iti_1",
      "travelId": "travel.id와 동일값",
      "type": "이동 | 관광 | 식사 | 기타",
      "dayIndex": 1,
      "time": "HH:mm",
      "endTime": "HH:mm",
      "address": "출발지 또는 장소 주소",
      "arrivalAddress": "도착지 주소 (type이 '이동'일 때 필수, 그 외는 비워둠)",
      "content": "일정 제목 (예: 나리타 공항 도착 및 신주쿠 이동)",
      "description": "상세 설명, 추천 메뉴, 팁 등",
      "lat": 35.7719,
      "lng": 140.3929,
      "arrivalLat": 35.6895,
      "arrivalLng": 139.7005,
      "transportMode": "DRIVING | WALKING | BICYCLING | TRANSIT | TRAIN | FLIGHT",
      "duration": "1시간 20분",
      "distance": "75km"
    }
  ]
}
\`\`\`

### [필수 지침]
1. 반드시 위의 JSON 구조를 완전하게 갖춘 단일 \`\`\`json 코드 블록으로 출력해 주세요.
2. 위도(lat), 경도(lng)는 지도 마커 표시에 매우 중요하므로 가능한 실제 위치 좌표를 포함해 주세요.
3. 생성된 JSON 코드 블록을 사용자가 원클릭으로 복사하여 J-Plan 서비스의 [JSON으로 가져오기/편집] 창에 바로 붙여넣을 수 있도록, 다른 불필요한 설명은 최소화하고 완전한 JSON 코드 블록 위주로 작성해 주세요.`;
}
