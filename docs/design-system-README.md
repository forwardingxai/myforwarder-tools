# 마이포워더 도구

포워딩·SCM 실무자가 로그인 없이 바로 쓰는 업무 도구 모음(`myforwarder-tools`)의 디자인 시스템입니다. 1일 1개발로 쌓이는 도구들이 각자 개성을 가지면서도 한 브랜드로 읽히도록, 색·글자·모양·움직임의 규칙을 여기에 고정합니다. 적용일 2026-10-15.

## 1. 원칙

1. **블랙 & 화이트가 기본, 색은 희소하게.** 바탕은 `bg`(흰색)와 `ink`(검정) 두 가지로 끝낸다. 액센트는 아래 "색을 쓸 수 있는 네 곳" 외에는 등장하지 않는다. 색을 아끼기 때문에 한 번 쓰일 때 강하다.
2. **영역이 색을 정한다.** 도구는 **영업**(`accent-sales`, 라임) 또는 **운영**(`accent-ops`, 코발트 블루) 둘 중 하나에 속하고, 그 도구의 액센트는 영역 색 하나뿐이다. 도구마다 색을 고르지 않는다.
3. **굵게 말고 크게.** 헤드라인은 `display-xl`(80px, 굵기 500, 자간 −3%)처럼 크고 촘촘하게 둔다. 굵기 700은 쓰지 않는다.
4. **구분은 그림자와 여백으로.** 흰 카드 위 흰 카드는 `card-rest` 그림자로 떠오르고, 섹션은 `space-24`의 여백으로 나뉜다. 테두리는 `line` 1px 한 종류.
5. **움직임은 스크롤에만 반응한다.** 자동 재생·반복 애니메이션 없음. 뷰포트에 들어올 때 한 번 드러나고(`dur-reveal`), 호버에 살짝 반응한다(`dur-base`).

## 2. 색

### 바탕과 글자
- 페이지 `bg` → 본문 `ink`, 설명 `ink-2`, 메타 `ink-3`.
- 한 화면에 `bg-dark` 블록을 1~2개 둔다(숫자 밴드, 영역 카드 2개, 하단 CTA). 블록 위 글자는 `on-dark` / `on-dark-2`.
- 흰 목록 카드는 `card-raised` + `card-rest`, 메타 영역은 `card`.

### 색을 쓸 수 있는 네 곳
| 위치 | 토큰 | 비고 |
|---|---|---|
| 영역 태그 | `accent-sales` / `accent-ops` 바탕 + `accent-sales-ink` / `accent-ops-ink` 글자 | 카드와 도구 페이지 상단 |
| 다크 블록 위 큰 숫자·라벨 | `accent-sales` / `accent-ops` 글자색 | `bg-dark` 위에서만 |
| 도구 페이지의 실행 버튼 1개 | 영역 액센트 바탕 | 한 페이지에 하나 |
| 연한 강조면 | `accent-sales-soft` / `accent-ops-soft` | 기능 목록 번호, 활성 필터 |

라임은 흰 바탕 위 글자색으로 쓰면 읽히지 않는다(1.7:1). 글자로 쓸 때는 반드시 `bg-dark` 위에서, 24px 이상으로. `danger`는 입력 오류에만.

### 다크 모드
`light`가 기본, `dark`는 `data-theme="dark"`로 전환한다. 액센트 두 색은 양쪽 테마에서 같은 값이고, `bg-dark`는 다크에서 `#141418`로 한 단계 밝아져 블록이 사라지지 않는다.

## 3. 글자

**Pretendard Variable** 한 가족으로 한글·영문·숫자를 모두 쓴다(`fonts/PretendardVariable.woff2`). 코드·프롬프트 구조 번호만 `mono`.

| 스타일 | 쓰는 곳 |
|---|---|
| `display-xl` | 랜딩 히어로 한 줄 |
| `display-l` | 다크 블록 위 숫자(도구 N개 · D+N) |
| `heading-1` | 도구 페이지 제목 |
| `heading-2` | 섹션 제목(기능 목록, 만든 과정) |
| `body-l` / `body` | 소개문 / 본문·설명 |
| `label` | 버튼, 입력 라벨 |
| `caption` | 메타(D07 · 2026-10-16 · 1.5h) |
| `tag` | 영역 태그, 상태 태그 |

날짜는 항상 `YYYY-MM-DD`.

## 4. 모양과 간격

- 버튼·태그는 전부 `radius-pill`, 카드는 `radius-md`(16px), 입력창은 `radius-sm`(8px).
- 카드 안쪽 `space-4`~`space-6`, 그리드 간격 `space-6`, 섹션 사이 `space-24`(모바일 `space-16`).
- 카드 그리드는 데스크톱 3열, 태블릿 2열, 모바일 1열.

## 5. 페이지 구조

**랜딩(한 페이지 스크롤)**: 앵커 네비 → 히어로(`display-xl` + 한 줄 소개 + 버튼 2개) → 숫자 밴드(`bg-dark`) → 영업/운영 영역 카드 2개(`AreaCard`) → 도구 카드 그리드(`ToolCard`, 정렬·필터) → 소개 → 연락.

**도구 페이지(한 페이지 스크롤)**: 뒤로가기 + 영역 태그 + `heading-1` → 도구 실행 영역(입력 좌 / 결과 우, 모바일은 상하) → 기능 목록 → 만든 과정 타임라인 → `PromptStructureCard`(단계 제목만 공개) → 만든 사람 → 관련 도구 3개.

도구 하나 = `tools/{slug}.html` 1개 + `tools.json` 항목 1개. 카드와 도구 페이지 하단은 `tools.json`에서 자동으로 채운다.

## 6. 움직임

| 상황 | 값 |
|---|---|
| 스크롤 리빌 | opacity 0→1, translateY 24px→0, `dur-reveal`, `ease-out`, 한 번만 |
| 헤드라인 리빌 | 단어 단위로 40ms 간격 스태거 |
| 카드 호버 | translateY(−4px) + `card-hover`, `dur-base` |
| 버튼 호버 | 바탕·글자색 전환 `dur-fast` |
| 스크롤 시 네비 | `bg`에 `card-rest` 그림자 추가 |

`prefers-reduced-motion`에서는 리빌을 즉시 표시로 바꾼다.

## 7. 컴포넌트

`Button`, `Tag`, `ToolCard`, `AreaCard`, `PromptStructureCard`. 각 폴더의 README가 상태와 금지 사항을 적는다. 번들 없이 토큰 CSS와 순수 HTML로 만들어지므로 단일 HTML 도구에 그대로 복사해 쓸 수 있다.

## 8. 쓰는 법

1. `tokens.css`(이 시스템이 생성)를 `design-tokens.css`로 저장소에 복사한다.
2. 각 도구 HTML은 `<link rel="stylesheet" href="../design-tokens.css">`와 `data-area="sales|ops"`를 `<body>`에 둔다. `--accent`는 `data-area`에 따라 `accent-sales` 또는 `accent-ops`로 묶인다.
3. Claude Code에 도구를 시킬 때 이 README와 `tokens.json`을 함께 읽힌다.

## 9. 출처

흰 바탕·검정 블록·pill 버튼·라임 포인트·스크롤 리빌은 Realtour(Framer) 실측값, 카드 그림자·카탈로그 상세 구조는 Mention(Framer) 실측값에서 가져왔다. 운영 색(코발트 블루)과 Pretendard는 이 시스템의 선택이다.
