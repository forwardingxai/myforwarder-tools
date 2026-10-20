# myforwarder-tools — Claude Code 작업 지시서

포워딩·SCM 실무자가 로그인 없이 바로 쓰는 업무 도구 모음. 1일 1개발. 이 파일을 먼저 읽고, 작업 대상 도구의 `prd/{slug}.md`를 읽은 뒤 시작한다.

## 저장소 구조

```
/
├── index.html              랜딩 (tools.json을 읽어 카드 렌더)
├── tools/{slug}.html       도구 1개 = 파일 1개 (단일 HTML, 외부 의존 최소)
├── tools.json              앱 인덱스 (스키마: docs/tools-index-schema.md)
├── design-tokens.css       디자인 시스템이 생성한 토큰 (수정 금지, 교체만)
├── shared/
│   ├── layout.css          도구 페이지 공통 레이아웃 (실행 영역 좌/우, 섹션 간격)
│   ├── components.css      Button · Tag · ToolCard · AreaCard · PromptStructureCard
│   └── page.js             tools.json에서 하단 섹션(기능·과정·구조·관련) 렌더, 스크롤 리빌
├── data/{slug}.json        도구가 쓰는 정적 데이터 (있을 때만)
├── thumbs/{slug}.png       카드 썸네일 16:10 · thumbs/{slug}-og.png 공유 이미지 1200×630(docs/share-image-guide.md)
├── prd/{slug}.md           기획안 (PRD-template.md 양식)
├── kits/{slug}.md          공개 만들기 키트 (AI 코딩 도구용) + kits/{slug}.prompt.txt (Claude 채팅용 시작 프롬프트)
└── docs/                   PRD-template.md, tools-index-schema.md, 디자인 시스템 README 사본
```

`prompts/`(작업 프롬프트 전문)는 저장소에 넣지 않는다. 별도 비공개 폴더. `kits/`는 누구나 같은 도구를 AI로 다시 만들 수 있게 공개용으로 새로 쓴 글이며, 인증키·사내 메모·비공개 데이터를 넣지 않는다.

## 도구 1개를 만들 때 반드시

1. `prd/{slug}.md`의 입력·출력·규칙·검증 2건을 그대로 구현한다. PRD에 없는 기능을 추가하지 않는다.
2. `tools/{slug}.html` 한 파일. `<head>`에 `design-tokens.css`, `shared/layout.css`, `shared/components.css`를 링크하고, `<body data-area="sales|ops">`로 영역을 선언한다. `--accent`는 `data-area`가 결정한다.
3. 페이지 구조는 고정: 뒤로가기 + 영역 태그 + `heading-1` → 실행 영역(입력 좌 / 결과 우, 768px 이하 상하) → 하단은 `shared/page.js`가 `tools.json`에서 자동 렌더. 하단을 직접 쓰지 않는다.
4. 상태는 `localStorage`에만 저장(최근 입력, 즐겨찾기). 서버·로그인 없음. 키는 `mft:{slug}:*`.
5. 검증 2건을 브라우저에서 실제로 돌려 기대 출력과 비교한 뒤 완료 보고. 통과 전에는 `tools.json`의 `status`를 `live`로 바꾸지 않는다.
6. `tools.json`에 항목을 추가/갱신한다(스키마 준수). `history`는 덧붙이기만.
7. 완료 보고에 포함: 파일 목록, 검증 결과, 소요시간, 막힌 곳 한 줄(콘텐츠 메모용).
8. "직접 만들어 보기" 키트를 함께 만든다: `kits/{slug}.prompt.txt`(채팅에 붙여넣으면 HTML 한 파일로 만들어지는 시작 프롬프트), `kits/{slug}.md`(데이터 얻는 법·규칙·단계별 프롬프트·완성 확인), 공개 가능한 데이터 내려받기, 응용 프롬프트 2~3개. `tools.json`의 `kit`에 연결한다.
9. 공유 이미지는 D01에서 확정한 스타일(검정 바탕 · 왼쪽 도구 이름 · 오른쪽 실무 질문 → 답)로만 만든다. `tools.json`의 `share`를 쓰고 `npm run share-image -- {slug}`로 `thumbs/{slug}-og.png`(공유 이미지)와 `thumbs/{slug}.png`(랜딩 카드 썸네일, 같은 스타일)를 함께 만든 뒤, 도구 HTML에 og 태그를 넣는다. 색은 `area`가 정한다. 규칙 전문은 docs/share-image-guide.md.

## 디자인 규칙 (요약 — 전문은 docs/design-system-README.md)

- 바탕 `--bg` 흰색, 글자 `--ink`. 색은 네 곳에만: 영역 태그, 다크 블록 위 큰 숫자, 실행 버튼 1개, 연한 강조면(`--accent-*-soft`).
- 버튼·태그는 전부 pill(`--radius-pill`). 카드 16px. 입력창 8px.
- Pretendard Variable 한 가족. 굵기 400·500만. 700 금지.
- 헤드라인은 크고 촘촘하게(`display-*`, 자간 음수). 본문 16px 행간 1.6.
- 흰 카드는 `--card-rest` 그림자, 테두리는 `--line` 1px 한 종류.
- 모션은 스크롤 리빌(`--dur-reveal`)과 호버(`--dur-base`)뿐. 자동 재생 금지. `prefers-reduced-motion` 존중.
- 날짜 표기 `YYYY-MM-DD`. 숫자는 천 단위 콤마, 금액은 통화 기호 뒤에 공백 없음(US$627.78, ₩431,730).

## 문체 (전문은 docs/voice-guide.md)

- 화면·tools.json·키트·랜딩 문구는 해요체, 옆자리 실무 선배 말투, 만든 사람의 1인칭. 결과부터 짧게.
- 번역투·공문체(~을 통해, ~에 대해, 제공합니다, 해당, 가능합니다) 금지. 화면 용어는 "장치장 코드"처럼 실무 용어.
- 퍼널(만든 사람·강의·소식·연락)은 `site.json`에서만 관리하고, 빈 칸은 화면에 내보내지 않는다. 사실이 아닌 경력·숫자는 쓰지 않는다.

## 금지

- 사각 버튼, 그라데이션, 이모지 아이콘, 좌측 색 테두리 카드, 굵기 700
- 외부 CDN 폰트·스크립트 (아이콘이 필요하면 인라인 SVG). 예외: Vercel Web Analytics(같은 도메인 `/_vercel/insights`, 쿠키 없음)는 `shared/page.js`가 배포 사이트에서만 불러온다. 카카오 JavaScript SDK(t1.kakaocdn.net, 버전·SRI 고정)는 "카카오톡 공유" 버튼을 누를 때만 불러온다(site.json `kakao.jsKey`가 있을 때)
- 데이터 upsert(덮어쓰기). 버전을 쌓는다.
- PRD에 없는 입력 추가, 로그인·회원 기능
- 추정값을 실제값처럼 표시 (추정이면 "추정" 태그)

## 데이터 원칙

- 정적 데이터는 `data/{slug}.json`에 두고 파일 머리에 `{"source": "...", "updatedAt": "YYYY-MM-DD", "count": N}`를 쓴다.
- 데이터(사내 자산)와 방법론(공유 가능)을 분리한다. 공개 저장소에는 공개 가능한 데이터만.
- Supabase 키·비밀번호는 코드와 채팅에 절대 넣지 않는다.

## 보고 형식

```
## {slug} 완료
- 파일: tools/{slug}.html, data/{slug}.json, tools.json(항목 추가)
- 검증: 1 ✓ / 2 ✓ (기대값 대비 결과)
- 소요: 1.5h
- 막힌 곳: ...
- 다음 개선 후보: ...
```

## 작업 환경

- 이 저장소는 VS Code 별도 창 전용으로 작업한다. 같은 폴더를 다른 창·데스크톱 앱에서 동시에 열지 않는다.
- 로컬 미리보기는 항상 포트 5510을 쓴다(Live Server 기본 5500과 충돌 방지).

## 작업 일지 규칙

- 작업 단계 하나를 마칠 때마다 docs/progress.md 맨 위에 기록을 덧붙인다.
- 형식: 날짜(YYYY-MM-DD) · 화면(기본값 VS Code, 다른 화면이면 그 이름) · 완료한 일 · 결정한 것 · 막힌 것 · 다음 할 일
- 새 세션을 시작하면 CLAUDE.md 다음으로 docs/progress.md의 최근 3건을 읽고,
  이어서 할 일을 나에게 먼저 확인받는다.
- 단계를 마치면 Git 커밋도 함께 한다(커밋 메시지에 D번호 포함).
