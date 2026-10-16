# 작업 일지

새 기록은 맨 위에 덧붙인다. 형식은 CLAUDE.md "작업 일지 규칙"을 따른다.

---

## 2026-10-16 · VS Code · D01 준비: API005 명세 확인

- 완료한 일: .env 키 확인(값 비공개, git 미추적). 연계가이드 PDF를 docs/reference/unipass-openapi-guide-v4.1.pdf로 옮기고 docs/reference/를 .gitignore에 추가. API005 명세를 읽고 docs/api005-notes.md에 요약
- 결정한 것: API005는 목록형, XML 응답, 조건(관할세관·부호)은 모두 선택. 전화번호는 수집하지 않음. 응답 태그 이름은 대소문자 구분 없이 읽음
- 막힌 것: 응답에 세관명·지역·구분(CY/CFS 등)·만료 상태가 없음. 가이드에 일일 호출 한도와 "조건 없이 전체 조회" 가능 여부가 없음. 검증 1의 장치장명·코드 미기입
- 다음 할 일: 구분(type) 처리 방식과 세관명 출처 결정(사용자) → 시험 호출 1~2회 승인 → scripts/fetch-bonded-areas.mjs 작성

## 2026-10-16 · VS Code · D00 작업 환경 변경

- 완료한 일: CLAUDE.md에 "작업 환경"·"작업 일지 규칙" 섹션 추가, 이 일지 생성, git 초기화와 첫 커밋(D00 저장소 준비)
- 결정한 것: 이 저장소는 VS Code 별도 창 전용(데스크톱 앱·다른 창에서 동시에 열지 않음). 로컬 미리보기 포트 5510(Live Server 기본 5500과 충돌 방지). 일지 화면 표기 기본값 VS Code
- 막힌 것: 없음
- 다음 할 일: 저장소 준비 2단계(파일 점검)·5단계(GitHub 연결), D01 데이터 단계 재개

## 2026-10-16 · VS Code · D00 환경 점검 / D01 데이터 출처 확정

- 완료한 일: git 2.54.0 · node v24.16.0 · npm 11.13.0 설치 확인. PRD 3-1 출처를 UNI-PASS OPEN API "API005 장치장정보조회"(2026-10-16 승인)로 갱신
- 결정한 것: 원본 응답은 raw/(커밋 제외), 정제본 data/bonded-area-code.json만 커밋. 인증키는 .env의 UNIPASS_API005_KEY에만
- 막힌 것: docs/에 API005 명세서 없음, 프로젝트 폴더에 .env 없음 → 호출 방식·한도·필드 대응표 보고 보류. PRD 5번 검증 1의 장치장명·코드 미기입
- 다음 할 일: 명세서를 docs/에 넣고 .env 작성(사용자) → 명세서 분석 보고 → scripts/fetch-bonded-areas.mjs 작성
