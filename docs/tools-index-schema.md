# tools.json — 앱 인덱스 스키마

랜딩 카드 그리드와 도구 페이지 하단(기능 목록·만든 과정·프롬프트 구조·관련 도구)은 전부 이 파일에서 읽는다. **도구 1개 = `tools/{slug}.html` 1개 + 이 파일의 항목 1개.** 다른 곳에 중복 기록하지 않는다.

## 항목 구조

```json
{
  "slug": "bonded-area-code",
  "name": "장치장 코드 조회기",
  "area": "ops",
  "day": 1,
  "date": "2026-10-16",
  "stage": "②",
  "summary": "장치장명·항만·세관으로 보세구역 부호를 바로 찾아 복사합니다.",
  "features": ["이름·부호 양방향 검색", "항만/세관 필터", "클릭 한 번 복사", "최근 조회 기억"],
  "history": [
    {"date": "2026-10-16", "step": "기획", "note": "입력 3개(검색어·항만·구분)로 범위 확정"},
    {"date": "2026-10-16", "step": "데이터", "note": "관세청 공개 목록 N건 정제"},
    {"date": "2026-10-16", "step": "구현", "note": "Claude Code, 단일 HTML"},
    {"date": "2026-10-16", "step": "배포", "note": "myforwarder-tools.vercel.app/tools/bonded-area-code"}
  ],
  "promptStructure": [
    {"title": "역할 지정", "open": true},
    {"title": "입력 데이터 형식", "open": true},
    {"title": "검색 규칙", "open": false},
    {"title": "예외 처리", "open": false},
    {"title": "출력 형식", "open": false}
  ],
  "toolsUsed": ["Claude Code", "Claude 채팅(기획)"],
  "hours": 1.5,
  "status": "live",
  "thumb": "thumbs/bonded-area-code.png",
  "related": ["an-parser", "edi-deadline"]
}
```

## 필드 규칙

| 필드 | 타입 | 규칙 |
|---|---|---|
| `slug` | string | 영문 소문자·숫자·하이픈. 파일명·URL·채팅 제목과 동일 |
| `name` | string | 카드 제목. 10자 내외 |
| `area` | `"sales"` \| `"ops"` | 액센트 색을 결정. 카드 태그·실행 버튼·구조 카드 번호칸에 적용 |
| `day` | number | D번호. 랜딩 "D+N" 숫자 밴드는 `max(day)` |
| `date` | string | `YYYY-MM-DD`. 배포일 |
| `stage` | string | 해상수입 프로세스 ①~⑬, 없으면 `"공통"`. 중립 태그로 표시 |
| `summary` | string | 한 줄, 40자 내외. 카드 설명 |
| `features` | string[] | 3~5개. 도구 페이지 "기능 목록" |
| `history` | object[] | 시간순. `step`은 `기획 / 데이터 / 구현 / 수정 / 배포` 중 하나 |
| `promptStructure` | object[] | 5~7개. `open: false`는 자물쇠 표시. 전문은 저장소 밖(`prompts/`, 비공개)에 둔다 |
| `toolsUsed` | string[] | 뱃지로 표시 |
| `hours` | number | 기획+구현 합계. 숫자 밴드 "누적 절약 시간"의 근거는 따로 계산하지 않고 `hours`만 노출 |
| `status` | `"draft"` \| `"live"` \| `"hold"` | `live`만 랜딩에 노출. `draft`는 인덱스에는 있되 숨김 |
| `thumb` | string | 16:10 스크린샷 경로. 없으면 카드가 `card` 바탕 빈 썸네일로 표시 |
| `related` | string[] | slug 최대 3개. 비어 있으면 같은 `area` 최신 3개 자동 |

## 랜딩의 정렬·필터 (프론트에서 처리)

- 정렬: 최신(`date` 내림차순, 기본) / 이름 / D번호
- 필터: 영역(`area`) · 단계(`stage`) · 상태는 `live` 고정
- 영역 카드(AreaCard)의 "도구 N개"는 `area`별 `live` 수

## 갱신 규칙

- 배포 전 `status: "draft"`로 먼저 넣고, 검증 2건 통과 후 `live`로 바꾼다.
- `history`는 덧붙이기만 한다(과거 줄 수정 금지). 이 파일이 곧 "만든 과정"의 원본이다.
- `hours`는 소수 첫째 자리까지.
