// 장치장 구분(type)을 추정한다. API005 응답에 구분 항목이 없어서 쓰는 규칙이며,
// 결과는 항상 "추정"으로 표시한다(PRD 3-3).
// 판단 순서: 1) 이름 키워드(TYPE_RULES, 위에서부터) → 2) 하역장소 Y 보조(UNLOADING_SEGMENTS 부호만)
//           → 3) 부호 4~5번째 자리(CODE_SEGMENT_TYPES) → 4) 기타
// 규칙을 고칠 때는 이 파일의 표만 바꾼다.

// 영문 약어는 다른 영단어 속(예: AGENCY의 CY)에서 걸리지 않도록 앞뒤가 영문자가 아닐 때만 인정한다.
const latinWord = (word) => new RegExp(`(^|[^A-Z])${word}([^A-Z]|$)`, 'i');

export const TYPE_RULES = [
  { type: '지정장치장', keywords: ['지정장치장'] },
  { type: '세관검사장', keywords: ['세관검사장', '검사장'] },
  { type: 'CFS', keywords: [latinWord('CFS'), '컨테이너화물조작장'] },
  // "해운항공"(포워더 상호)은 공항 맥락이 아니므로 제외한다.
  { type: '공항화물', keywords: ['공항', /(?<!해운)항공/, '화물터미널'] },
  { type: 'CY', keywords: ['컨테이너터미널', '컨테이너 터미널', latinWord('CY'), '터미널', '터미날'] },
  { type: '자유무역지역', keywords: ['자유무역지역'] },
  { type: '보세공장', keywords: ['보세공장', '공장'] },
  {
    type: '보세창고',
    keywords: ['보세창고', '창고', '물류센터',
      '냉장', '냉동', '물류', '로지스', '로지텍', '로직스', '디스트리파크', '센타', '센터', '종합보세', '크로스독'],
  },
];

// 이름으로 판단이 안 되고, 부호 4~5번째 자리가 아래 값이며, 하역장소 여부(ldunPlcSnarYn)가 Y면 CY.
export const UNLOADING_SEGMENTS = ['12', '77', '78'];

// 부호 4~5번째 자리 → 구분. 부산세관 366건에서 관찰한 패턴이며 공식 문서 근거는 없다.
// 19(조선·제조 등)는 근거가 없어 넣지 않는다 → 기타.
export const CODE_SEGMENT_TYPES = {
  '01': '세관검사장',
  '02': '지정장치장',
  '06': '보세창고', '07': '보세창고', '10': '보세창고', '11': '보세창고', '13': '보세창고', '70': '보세창고',
  '12': 'CY',
  '86': 'CFS',
  '16': '보세공장', '18': '보세공장', '20': '보세공장',
  '77': '자유무역지역', '78': '자유무역지역',
};

export const DEFAULT_TYPE = '기타';

// 화면 필터 순서
export const TYPES = ['CY', 'CFS', '보세창고', '지정장치장', '세관검사장', '보세공장', '자유무역지역', '공항화물', DEFAULT_TYPE];

const matches = (name, keyword) =>
  typeof keyword === 'string' ? name.includes(keyword) : keyword.test(name);

export const codeSegment = (code = '') => String(code).slice(3, 5);

// 이름 키워드만으로 판단한 구분(없으면 null). 규칙 점검용.
export function typeByName(name = '') {
  for (const rule of TYPE_RULES) {
    const hit = rule.keywords.find((k) => matches(name, k));
    if (hit) return { type: rule.type, keyword: String(hit) };
  }
  return null;
}

// 반환: { type, basis, keyword }
//   basis: 'name' | 'unloading' | 'code' | 'none' — 분류 근거
export function classifyType(name = '', { code = '', unloadingPlace } = {}) {
  const byName = typeByName(name);
  if (byName) return { type: byName.type, basis: 'name', keyword: byName.keyword };
  const segment = codeSegment(code);
  if (unloadingPlace === 'Y' && UNLOADING_SEGMENTS.includes(segment)) {
    return { type: 'CY', basis: 'unloading', keyword: `하역장소 Y · 부호 ${segment}` };
  }
  if (CODE_SEGMENT_TYPES[segment]) {
    return { type: CODE_SEGMENT_TYPES[segment], basis: 'code', keyword: `부호 ${segment}` };
  }
  return { type: DEFAULT_TYPE, basis: 'none', keyword: null };
}
