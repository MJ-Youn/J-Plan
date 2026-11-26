import { addDays, format, parseISO } from 'date-fns';
import type { ExpenseItem, Itinerary, Travel } from '../types/travel';
import { getItineraryCosts, resolveItineraryCostCategory } from './expenseService';

export interface AiPromptOptions {
    destination?: string;
    startDate?: string;
    endDate?: string;
    companions?: string;
    transport?: string;
    extraNotes?: string;
}

/**
 * Gemini / ChatGPT / Claude 대화창에 전달할 J-Plan 전용 JSON 생성 프롬프트 템플릿을 생성합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 10. 12.
 */
export function generateGeminiPrompt(options?: AiPromptOptions): string {
    const hasCustom =
        Boolean(options?.destination?.trim()) ||
        Boolean(options?.startDate?.trim()) ||
        Boolean(options?.companions?.trim()) ||
        Boolean(options?.transport?.trim()) ||
        Boolean(options?.extraNotes?.trim());

    const requestSection = hasCustom
        ? `\n### [내 여행 요청 조건]\n- 여행지: ${options?.destination?.trim() || '미정'}\n- 기간: ${options?.startDate || 'YYYY-MM-DD'} ~ ${options?.endDate || 'YYYY-MM-DD'}\n- 동행/성격: ${options?.companions?.trim() || '자유 여행'}\n- 주요 이동수단: ${options?.transport?.trim() || '대중교통 / 렌터카'}\n${options?.extraNotes?.trim() ? `- 추가 요청사항: ${options.extraNotes.trim()}\n` : ''}`
        : '';

    return `당신은 여행 일정 플래너 전문가입니다.
내가 요청하는 여행지에 대해 아래의 **J-Plan 전용 JSON 데이터 형식**에 완벽히 맞추어 일정을 작성해 주세요.
${requestSection}
### [J-Plan JSON 스키마 규격]
\`\`\`json
{
  "version": "1.0",
  "travel": {
    "id": "임의의 고유 ID 문자열 (예: tokyo_2026)",
    "name": "여행 제목 (예: 도쿄 3박 4일 미식 & 힐링 여행)",
    "region": "지역명 (예: 도쿄, 일본)",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "exportMeta": {
      "airportInfo": "출도착 공항/항공편 (예: 인천 ⇄ 나리타)",
      "vehicleInfo": "이동 수단/차량 요약 (예: 대중교통 또는 렌터카 차종)",
      "currencyLabel": "원 또는 엔"
    }
  },
  "participants": ["동행자1", "동행자2"],
  "accommodations": [
    {
      "id": "acc_1",
      "travelId": "travel.id와 동일값",
      "name": "숙소 이름",
      "address": "Google 지도에서 검색 가능한 전체 주소 (날씨·지도 연동 기준)",
      "description": "체크인/체크아웃 정보, 주차 및 팁 메모",
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
      "address": "Google 지도에서 검색 가능한 출발지 또는 장소 주소",
      "arrivalAddress": "도착지 주소 (type이 '이동'일 때 필수, 그 외는 비워둠)",
      "content": "일정 제목 (예: 나리타 공항 도착 및 신주쿠 이동)",
      "description": "상세 설명, 추천 메뉴, 주차 팁 등 (여러 줄 가능)",
      "lat": 35.7719,
      "lng": 140.3929,
      "arrivalLat": 35.6895,
      "arrivalLng": 139.7005,
      "transportMode": "DRIVING | WALKING | BICYCLING | TRANSIT | TRAIN | FLIGHT",
      "duration": "1시간 20분",
      "distance": "75km",
      "costs": [
        {
          "id": "cost_1",
          "category": "항공권 | 렌트/교통 | 숙소 | 식비 | 관광 | 쇼핑(편의점) | 기타",
          "title": "사용처/설명 (예: 입장료, 점심, 주차비)",
          "amount": 3500,
          "currency": "KRW | JPY | USD | EUR | TWD | THB | VND",
          "paidBy": "결제자 이름(선택)"
        }
      ]
    }
  ],
  "checklists": [
    {
      "id": "chk_1",
      "category": "서류·예약 | 전자기기 | 의류·세면 | 상비약 | 현지준비 | 기타",
      "title": "준비물 항목 (예: 여권 및 e-티켓)",
      "isChecked": false,
      "memo": "간단한 메모(선택)"
    }
  ],
  "expenses": [
    {
      "id": "exp_1",
      "dayIndex": 1,
      "category": "항공권 | 렌트/교통 | 숙소 | 식비 | 관광 | 쇼핑(편의점) | 기타",
      "title": "별도 공통 경비 (예: 3박 숙소 선결제, 왕복 항공권)",
      "amount": 450000,
      "currency": "KRW | JPY | USD | EUR | TWD | THB | VND",
      "paidBy": "결제자 이름(선택)"
    }
  ]
}
\`\`\`

### [필수 지침]
1. 반드시 위의 JSON 구조를 완전하게 갖춘 단일 \`\`\`json 코드 블록으로 출력해 주세요.
2. 모든 주소(\`address\`, \`arrivalAddress\`, 숙소 \`address\`)는 Google 지도 내비게이션과 날씨 API가 정확한 좌표를 찾을 수 있도록 정식 장소명·영문/현지 주소를 포함해 주세요.
3. 위도(\`lat\`), 경도(\`lng\`)는 지도 마커 표시에 중요하므로 가능한 실제 좌표를 포함해 주세요.
4. \`accommodations\`는 마지막 귀국일(\`N일차\`)을 제외한 \`1 ~ N-1일차\`에만 작성해 주세요.
5. 각 일정에 여러 건의 비용이 발생할 경우 \`costs\` 배열(1:N, \`category\`(선택), 사용처 \`title\`, \`amount\`, \`currency\`, \`paidBy\`)로 나누어 넣어 주세요. 특히 일정 종류가 \`기타\`(숙소 체크인, 렌터카 인수 등)일 때는 \`category\`를 \`"숙소"\`나 \`"렌트/교통"\` 등으로 명시하면 J-Plan 경비 · 정산 트래커와 Excel에 정확히 분류됩니다. (별도 숙소·항공권·렌터카 등 공통 비용은 \`expenses\`에 추가)
6. 생성된 JSON 코드 블록을 사용자가 복사하여 J-Plan의 [일정 가져오기 / JSON 편집] 창에 바로 붙여넣을 수 있도록 불필요한 설명은 최소화해 주세요.`;
}

/**
 * AI 에이전트/채팅(Gemini, ChatGPT, Claude 등)에 등록해 두고 재사용할 수 있는
 * J-Plan JSON 생성 스킬(SKILL.md) 전문을 반환합니다.
 */
export function generateAiSkillMarkdown(): string {
    return `# J-Plan Travel Itinerary JSON Generator Skill

## Role
당신은 여행 동선·시간·교통·숙소·예산·준비물을 설계하고 **J-Plan** 웹 앱에서 즉시 가져올 수 있는 완벽한 JSON 데이터를 생성하는 여행 플래너 전문가입니다.

## Output Format (Strict)
사용자가 여행지·기간·동행·선호도를 말하면, 아래 최신 스키마를 100% 준수하는 **단일 \`\`\`json 코드 블록**을 출력하세요.

\`\`\`json
{
  "version": "1.0",
  "travel": {
    "id": "slug_yyyymmdd",
    "name": "여행 제목",
    "region": "방문 지역",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "exportMeta": {
      "airportInfo": "출도착 공항/편명",
      "vehicleInfo": "차량 또는 주요 교통수단",
      "currencyLabel": "원 또는 엔"
    }
  },
  "participants": ["동행자1", "동행자2"],
  "accommodations": [
    {
      "id": "acc_1",
      "travelId": "travel.id와 동일",
      "name": "숙소명",
      "address": "Google Maps 검색 가능한 전체 주소",
      "description": "체크인/체크아웃/주차/온천 팁",
      "dayIndex": 1,
      "phone": "전화번호"
    }
  ],
  "itineraries": [
    {
      "id": "iti_1",
      "travelId": "travel.id와 동일",
      "type": "이동 | 관광 | 식사 | 기타",
      "dayIndex": 1,
      "time": "09:00",
      "endTime": "10:30",
      "address": "Google Maps 검색 가능한 장소 또는 출발지 주소",
      "arrivalAddress": "type이 '이동'일 때만 도착지 주소 입력",
      "content": "짧고 명확한 일정 제목",
      "description": "상세 팁, 주차 안내, 추천 메뉴 (줄바꿈 활용 가능)",
      "lat": 33.5902,
      "lng": 130.4207,
      "arrivalLat": 33.5218,
      "arrivalLng": 130.5312,
      "transportMode": "DRIVING | WALKING | BICYCLING | TRANSIT | TRAIN | FLIGHT",
      "duration": "1시간 30분",
      "distance": "18.4km",
      "costs": [
        {
          "id": "cost_1",
          "category": "관광",
          "title": "입장료",
          "amount": 1500,
          "currency": "JPY",
          "paidBy": "동행자1"
        },
        {
          "id": "cost_2",
          "category": "렌트/교통",
          "title": "주차비",
          "amount": 500,
          "currency": "JPY",
          "paidBy": "동행자1"
        }
      ]
    }
  ],
  "checklists": [
    {
      "id": "chk_1",
      "category": "서류·예약 | 전자기기 | 의류·세면 | 상비약 | 현지준비 | 기타",
      "title": "여권 및 e-티켓",
      "isChecked": false,
      "memo": "유효기간 6개월 이상 확인"
    }
  ],
  "expenses": [
    {
      "id": "exp_1",
      "dayIndex": 1,
      "category": "항공권 | 렌트/교통 | 숙소 | 식비 | 관광 | 쇼핑(편의점) | 기타",
      "title": "항공권·숙소·렌트 등 일정 외 공통 경비",
      "amount": 450000,
      "currency": "KRW",
      "paidBy": "동행자1"
    }
  ]
}
\`\`\`

## Rules
1. \`type\`은 반드시 \`"이동"\`, \`"관광"\`, \`"식사"\`, \`"기타"\` 중 하나만 사용하세요.
2. \`time\`, \`endTime\`은 반드시 \`HH:mm\` 24시간 형식을 사용하고, 동일 일차 내 시간이 겹치지 않게 배치하세요.
3. \`type\`이 \`"이동"\`일 때는 \`address\`(출발지), \`arrivalAddress\`(도착지), \`transportMode\`, \`duration\`, \`distance\`를 반드시 채우세요.
4. 주소는 Google 지도 내비게이션, 숙소 기준 날씨 조회, Excel 내보내기에서 바로 검색 가능하도록 정식 명칭 + 주소를 함께 적으세요.
5. 마지막 날(귀국일 \`N일차\`)을 제외한 각 숙박 일차(\`dayIndex: 1 .. N-1\`)에만 \`accommodations\` 항목을 작성하세요.
6. 일정별 예상 지출은 1:N \`costs\` 배열(\`category\`(선택), \`title\`, \`amount\`, \`currency\`, \`paidBy\`)로 여러 항목을 나누어 입력하면 경비 트래커와 Excel에 자동 연동됩니다. \`category\`는 \`"항공권"\`, \`"렌트/교통"\`, \`"숙소"\`, \`"식비"\`, \`"관광"\`, \`"쇼핑(편의점)"\`, \`"기타"\` 중 하나를 지정할 수 있으며(생략 시 일정 \`type\` 기반 자동 추론), 숙소 체크인·렌터카 인수 등 \`"기타"\` 일정의 비용은 \`category\`를 명시하는 것을 권장합니다. 지원 통화는 \`KRW\`, \`JPY\`, \`USD\`, \`EUR\`, \`TWD\`, \`THB\`, \`VND\`입니다.
7. \`checklists\`와 \`expenses\`는 선택 사항이지만, 여행 성격에 맞는 필수 준비물과 큰 공통 경비(항공권·숙소·렌트/교통)를 함께 생성해 주면 바로 활용하기 좋습니다.
`;
}

/**
 * 영수증 캡처 기반 최종 정산을 위해 전체 JSON 대신 초경량 일정 매핑표와 함께
 * 경비 Patch JSON(`itineraryCosts` + `expenses`)만을 요청하는 Gemini 프롬프트를 생성합니다.
 *
 * @author 윤명준 (MJ Yun)
 * @since 2026. 11. 26.
 */
export function generateSettlementPrompt(params: {
    travel: Travel;
    itineraries: Itinerary[];
    expenses?: ExpenseItem[];
    participants: string[];
}): string {
    const { travel, itineraries, expenses = [], participants } = params;
    const baseDate = parseISO(travel.startDate);

    const sortedItineraries = [...itineraries]
        .filter((i) => i.travelId === travel.id)
        .sort((a, b) => (a.dayIndex !== b.dayIndex ? a.dayIndex - b.dayIndex : a.time.localeCompare(b.time)));

    const itineraryLines =
        sortedItineraries.length > 0
            ? sortedItineraries
                  .map((i) => {
                      let dateLabel = '';
                      try {
                          dateLabel = `(${format(addDays(baseDate, i.dayIndex - 1), 'MM/dd')})`;
                      } catch {
                          dateLabel = '';
                      }
                      const costs = getItineraryCosts(i);
                      const costSummary =
                          costs.length > 0
                              ? ` | 기존경비: ${costs
                                    .map((c) => {
                                        const cat = resolveItineraryCostCategory(c, i.type, i.content);
                                        const tag = c.isConfirmed ? '🔒확정' : '📝예상';
                                        return `[${tag} ${cat}: ${c.title} ${c.amount.toLocaleString()} ${c.currency}]`;
                                    })
                                    .join(', ')}`
                              : '';
                      return `- ${i.id} | ${i.dayIndex}일차${dateLabel} | ${i.type} | ${i.content}${costSummary}`;
                  })
                  .join('\n')
            : '(등록된 일정 없음)';

    const expenseSummaryLines =
        expenses.length > 0
            ? expenses
                  .map((e) => {
                      const tag = e.isConfirmed ? '🔒확정' : '📝예상';
                      return `- [${tag}] ${e.dayIndex}일차 | ${e.category} | ${e.title} (${e.amount.toLocaleString()} ${e.currency})`;
                  })
                  .join('\n')
            : '(없음)';

    const participantText = participants.length > 0 ? participants.join(', ') : '미지정 (결제자 생략 가능)';

    return `당신은 여행 영수증 정산 전문가입니다.
첨부된 영수증·결제 내역 이미지(또는 텍스트)를 분석하여 아래의 **J-Plan 정산 Patch JSON 규격**으로만 출력해 주세요.
불필요한 토큰 소모를 막기 위해 기존 일정 정보는 다시 출력하지 말고, **새로 반영하거나 변경할 경비 정보만** 작성합니다.

### [여행 기본 정보]
- 여행명: ${travel.name}
- 기간: ${travel.startDate} ~ ${travel.endDate}
- 동행자: ${participantText}

### [일정 ID 매핑표 (일정 연동용)]
${itineraryLines}

### [기존 직접 지출(expenses) 요약]
${expenseSummaryLines}

### [출력 JSON 스키마 규격]
\`\`\`json
{
  "itineraryCosts": [
    {
      "itineraryId": "위 일정 목록의 ID (예: iti_1)",
      "costs": [
        {
          "category": "항공권 | 렌트/교통 | 숙소 | 식비 | 관광 | 쇼핑(편의점) | 기타",
          "title": "사용처/메뉴/세부항목 (예: 1일차 숙소 트윈, 석식 실결제)",
          "amount": 23485,
          "currency": "KRW | JPY | USD | EUR | TWD | THB | VND",
          "paidBy": "결제자 이름(선택)"
        }
      ]
    }
  ],
  "expenses": [
    {
      "dayIndex": 1,
      "category": "항공권 | 렌트/교통 | 숙소 | 식비 | 관광 | 쇼핑(편의점) | 기타",
      "title": "일정표에 없는 지출 (예: 로손 편의점 야식, 자판기, 왕복 항공권)",
      "amount": 1280,
      "currency": "KRW | JPY | USD | EUR | TWD | THB | VND",
      "paidBy": "결제자 이름(선택)"
    }
  ]
}
\`\`\`

### [작성 지침]
1. **[🔒확정] 경비 보호**: \`🔒확정\`으로 표시된 항공권·숙소·예약 비용 등은 이미 결제 완료된 고정 금액이므로 **절대 수정·중복 출력하지 말고 제외**하세요.
2. **[📝예상] 및 미입력 경비 갱신**: \`📝예상\`으로 표시되었거나 경비가 없는 일정 중, 첨부된 영수증에 실제 결제 내역이 있으면 **영수증의 실제 금액으로 \`itineraryCosts\`에 출력**하세요. (영수증에 없는 기존 항목은 제외해 기존 값을 유지합니다.)
3. 일정표에 없는 돌발 지출(편의점, 간식, 쇼핑 등)이나 공통 경비는 기존 직접 지출과 중복되지 않는 항목만 \`expenses\` 배열에 \`dayIndex\`(1부터 시작)와 함께 넣어 주세요.
4. \`category\`는 반드시 \`항공권\`, \`렌트/교통\`, \`숙소\`, \`식비\`, \`관광\`, \`쇼핑(편의점)\`, \`기타\` 중 하나를 명시해 주세요. (특히 숙소 체크인·렌터카 인수 같은 \`기타\` 일정도 \`숙소\`, \`렌트/교통\`으로 정확히 지정)
5. 지원 통화는 \`KRW\`, \`JPY\`, \`USD\`, \`EUR\`, \`TWD\`, \`THB\`, \`VND\`이며, 금액(\`amount\`)은 숫자만 입력하세요.
6. 결과물은 복사하여 바로 붙여넣을 수 있도록 설명 없이 단일 \`\`\`json 코드 블록으로만 출력해 주세요.`;
}
