// 장치장명 키워드로 구분(type)을 추정한다. API005 응답에 구분 항목이 없어서 쓰는 규칙이며,
// 결과는 항상 "추정"으로 표시한다(PRD 3-3).
// 규칙을 고칠 때는 TYPE_RULES만 바꾼다. 위에 있는 규칙이 먼저 적용된다.

// 영문 약어는 다른 영단어 속(예: AGENCY의 CY)에서 걸리지 않도록 앞뒤가 영문자가 아닐 때만 인정한다.
const latinWord = (word) => new RegExp(`(^|[^A-Z])${word}([^A-Z]|$)`, 'i');

export const TYPE_RULES = [
  { type: 'CFS', keywords: [latinWord('CFS')] },
  { type: '공항화물', keywords: ['공항', '항공', '화물터미널'] },
  { type: 'CY', keywords: ['컨테이너터미널', '컨테이너 터미널', latinWord('CY')] },
  { type: '보세창고', keywords: ['보세창고', '창고'] },
];

export const DEFAULT_TYPE = '기타';

const matches = (name, keyword) =>
  typeof keyword === 'string' ? name.includes(keyword) : keyword.test(name);

// 반환: { type, keyword } — keyword는 걸린 키워드(기타면 null). 분류 근거 확인용.
export function classifyType(name = '') {
  for (const rule of TYPE_RULES) {
    const hit = rule.keywords.find((k) => matches(name, k));
    if (hit) return { type: rule.type, keyword: String(hit) };
  }
  return { type: DEFAULT_TYPE, keyword: null };
}
