// D03 안전운임 조회기 — 주소 검색 결과(법정동 코드) → 고시 행정동 변환표 만들기
//   raw/safe-rate/address/{코드 버전}/KIKcd_B·KIKcd_H·KIKmix.{코드 버전}(말소코드포함).xlsx  (행정안전부 주민등록 주소코드)
//   data/safe-rate/{고시번호}/destinations.json  (1단계 결과)
//   → data/safe-rate/{고시번호}/dong-map.json · docs/safe-rate/dong-map-report-{고시번호}.md
//
// 사용: node scripts/build-safe-rate-dong-map.mjs 2026-402 20261012
//
// 왜 이렇게 하나
// - 고시 행정동은 2025-08 무렵 행정구역 기준이다(빌드에서 기준일 하루 전수 일치로 확인). 주소 검색은 지금 코드를 준다.
//   그 사이 전남광주통합특별시·인천 제물포구 등·화성시 4개 구가 생기며 법정동 코드가 많이 바뀌었다.
// - 그래서 ① 기준일의 행정동 ↔ 법정동 표로 옛 코드를 고시 행정동에 잇고 ② 지금 코드는 같은 이름의 옛 코드에 잇는다(지역 개편 표).
//   ③ 그래도 안 이어지는 새 법정동은 같은 행정동에 속한 다른 법정동을 따라간다.
// - 옛 코드도 표에 남긴다(주소 검색 서비스가 아직 옛 코드를 줄 때를 대비).
// - 이어지지 않는 코드(제주·울릉·섬 등 고시에 없는 곳)는 표에 넣지 않는다 → 화면에서 시·군·구까지만 확정하고 읍·면·동을 고르게 한다.
// - 이미 있는 결과 파일은 덮어쓰지 않고 멈춘다.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as XLSX from 'xlsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [version, codeVer] = process.argv.slice(2);
if (!version || !codeVer) { console.error('사용: node scripts/build-safe-rate-dong-map.mjs {고시번호} {주소코드 버전}  예: 2026-402 20261012'); process.exit(1); }

// 고시별 행정동 기준일 — 이 날 살아 있던 행정동과 고시 행정동 3,480곳이 전부 1:1로 맞아야 한다(D1)
const BASIS = { '2026-402': '20250815' };
const basis = BASIS[version];
if (!basis) { console.error(`행정동 기준일이 없어요: ${version} — 스크립트의 BASIS에 추가하세요`); process.exit(1); }

// 기준일 뒤 지역 개편(옛 이름 → 지금 이름). 법정동 이름이 같으면 옛 코드와 지금 코드를 잇는 데 쓴다
const SIDO_CHANGES = { '광주광역시': ['전남광주통합특별시'], '전라남도': ['전남광주통합특별시'] };
const SIGUNGU_CHANGES = {
  '인천광역시|중구': ['제물포구', '영종구'],
  '인천광역시|동구': ['제물포구'],
  '인천광역시|서구': ['서해구', '검단구'],
};

const SRC = join(ROOT, 'raw', 'safe-rate', 'address', codeVer);
const DEST = join(ROOT, 'data', 'safe-rate', version, 'destinations.json');
const OUT = join(ROOT, 'data', 'safe-rate', version, 'dong-map.json');
const REPORT = join(ROOT, 'docs', 'safe-rate', `dong-map-report-${version}.md`);
const fail = (msg) => { console.error(`\n빌드 중단: ${msg}\n파일을 쓰지 않았어요.`); process.exit(1); };
const fmt = (n) => n.toLocaleString('en-US');
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

if (!existsSync(DEST)) fail(`1단계 결과가 없어요 — data/safe-rate/${version}/destinations.json`);
for (const f of [OUT, REPORT]) if (existsSync(f)) fail(`이미 있는 파일이에요 — ${f.slice(ROOT.length + 1)}. 덮어쓰지 않아요.`);
const load = (kind) => {
  const f = join(SRC, `${kind}.${codeVer}(말소코드포함).xlsx`);
  if (!existsSync(f)) fail(`원본이 없어요 — ${f.slice(ROOT.length + 1)}`);
  const wb = XLSX.read(readFileSync(f));
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
    .slice(1).map((r) => r.map((v) => String(v).trim()));
};
const B = load('KIKcd_B'); // 법정동코드 시도 시군구 읍면동 동리 생성 말소
const H = load('KIKcd_H'); // 행정동코드 시도 시군구 읍면동 생성 말소
const M = load('KIKmix');  // 행정동코드 시도 시군구 읍면동 법정동코드 동리 생성 말소
const dest = JSON.parse(readFileSync(DEST, 'utf8'));

const alive = (from, to, t) => from <= t && (!to || to > t);
const isDongLevel = (b) => b.slice(5) !== '00000'; // 시도·시군구 자리 코드는 빼고 읍면동·리만
const SG = (s) => s.replace(/\s/g, '');
// 행정동 이름 맞추기: 고시는 "창신1동·종로1234가동·면목3.8동", 행안부는 "창신제1동·종로1.2.3.4가동·면목제3.8동"
const P = (s) => s.replace(/[·.,\s]/g, '');
const N = (s) => P(s.replace(/제(?=\d)/, ''));
const destKey = (d) => `${d[0]}|${d[1]}|${d[2]}`;
const checks = [];
const check = (id, name, pass, detail) => checks.push({ id, name, pass: !!pass, detail });

// ---------- 1. 고시 행정동 ↔ 기준일 행정동 ----------
const hAtBasis = H.filter((r) => r[3] && alive(r[4], r[5], basis));
const hIndex = new Map();
for (const r of hAtBasis) {
  const k = `${r[1]}|${r[1] === '세종특별자치시' ? '' : SG(r[2])}|${N(r[3])}`;
  if (!hIndex.has(k)) hIndex.set(k, []);
  hIndex.get(k).push(r);
}
const hToDest = new Map(); // 행정동코드 → 고시 인덱스
const matchKinds = { 그대로: 0, '이름 표기만 다름': 0 };
const unmatched = [], multiple = [];
dest.forEach((d, i) => {
  const c = hIndex.get(`${d[0]}|${d[0] === '세종특별자치시' ? '' : SG(d[1])}|${P(d[2])}`) || [];
  if (c.length !== 1) { (c.length ? multiple : unmatched).push(destKey(d)); return; }
  if (hToDest.has(c[0][0])) { multiple.push(`${destKey(d)} (같은 행정동코드 ${c[0][0]})`); return; }
  hToDest.set(c[0][0], i);
  matchKinds[c[0][2] === d[1] && c[0][3] === d[2] ? '그대로' : '이름 표기만 다름']++;
});
check('D1', `고시 행정동 ↔ ${ymd(basis)} 행정동 1:1`, hToDest.size === dest.length && !unmatched.length && !multiple.length,
  `${fmt(hToDest.size)}/${fmt(dest.length)}곳 (그대로 ${fmt(matchKinds.그대로)} · 이름 표기만 다름 ${fmt(matchKinds['이름 표기만 다름'])}) · 못 찾음 ${unmatched.length} · 여러 개 ${multiple.length}` +
  (unmatched.length || multiple.length ? ` (${[...unmatched, ...multiple].slice(0, 10).join(', ')})` : ''));
if (!checks.at(-1).pass) report(false);

// 출장소는 고시에 없다 → 같은 시군구에서 이름이 앞부분으로 들어간 행정동(예: 화도읍동부출장소 → 화도읍)으로
const hBasisByCode = new Map(hAtBasis.map((r) => [r[0], r]));
const branchOf = new Map();
for (const r of hAtBasis) {
  if (hToDest.has(r[0]) || !r[3].endsWith('출장소')) continue;
  const parent = hAtBasis.filter((p) => hToDest.has(p[0]) && p[1] === r[1] && p[2] === r[2] && r[3].startsWith(p[3]))
    .sort((a, b) => b[3].length - a[3].length)[0];
  if (parent) branchOf.set(r[0], parent[0]);
}
const destOfH = (h) => (hToDest.has(h) ? hToDest.get(h) : branchOf.has(h) ? hToDest.get(branchOf.get(h)) : undefined);

// ---------- 2. 기준일 법정동 코드 → 고시 행정동 ----------
const map = new Map(); // 법정동코드 → Set(고시 인덱스)
const how = new Map(); // 법정동코드 → 이은 방법
const add = (b, i, kind) => { if (!map.has(b)) map.set(b, new Set()); map.get(b).add(i); if (!how.has(b)) how.set(b, kind); };
const mixBasis = M.filter((r) => isDongLevel(r[4]) && alive(r[6], r[7], basis));
let viaBranch = 0;
for (const r of mixBasis) {
  const i = destOfH(r[0]);
  if (i === undefined) continue;
  if (!hToDest.has(r[0])) viaBranch++;
  add(r[4], i, 'basis');
}
const basisCodes = new Set(map.keys());

// ---------- 3. 지금 법정동 코드 → 같은 이름의 옛 코드 ----------
const bRows = new Map();
for (const r of B) { if (!bRows.has(r[0])) bRows.set(r[0], []); bRows.get(r[0]).push(r); }
const bName = (b, t) => (bRows.get(b) || []).find((r) => (t ? alive(r[5], r[6], t) : !r[6]));
const mixNow = M.filter((r) => isDongLevel(r[4]) && !r[7]);
const nowCodes = [...new Set(mixNow.map((r) => r[4]))];
const retired = new Map(); // "읍면동|동리" → 기준일에 있었고 지금은 없어진 코드
for (const b of basisCodes) {
  if (bName(b)) continue;
  const r = bName(b, basis);
  if (!r) continue;
  const k = `${r[3].replace(/[읍면]$/, '')}|${r[4]}`;
  if (!retired.has(k)) retired.set(k, []);
  retired.get(k).push(r);
}
const sidoOk = (old, now) => old === now || (SIDO_CHANGES[old] || []).includes(now);
const sigunguOk = (o, n) => SG(o[2]) === SG(n[2]) || SG(n[2]).startsWith(SG(o[2])) || (SIGUNGU_CHANGES[`${o[1]}|${o[2]}`] || []).includes(n[2]);
const emdOk = (o, n) => o[3] === n[3] || o[3].replace(/면$/, '읍') === n[3];
const ambiguous = [];
for (const b of nowCodes) {
  if (map.has(b)) continue;
  const n = bName(b);
  if (!n) continue;
  let c = (retired.get(`${n[3].replace(/[읍면]$/, '')}|${n[4]}`) || []).filter((o) => sidoOk(o[1], n[1]) && sigunguOk(o, n) && emdOk(o, n));
  if (c.length > 1) { const tail = c.filter((o) => o[0].slice(5) === b.slice(5)); if (tail.length === 1) c = tail; }
  if (c.length === 1) { for (const i of map.get(c[0][0])) add(b, i, 'rename'); continue; }
  if (c.length > 1) ambiguous.push(`${b} ${n.slice(1, 5).filter(Boolean).join(' ')} ← ${c.map((o) => o[0]).join(', ')}`);
}

// ---------- 4. 그래도 남은 새 법정동 → 같은 행정동에 속한 다른 법정동을 따라감 ----------
const nowByH = new Map();
for (const r of mixNow) { if (!nowByH.has(r[0])) nowByH.set(r[0], []); nowByH.get(r[0]).push(r[4]); }
for (const b of nowCodes) {
  if (map.has(b)) continue;
  const keys = new Set();
  for (const r of mixNow.filter((x) => x[4] === b)) {
    for (const s of nowByH.get(r[0]) || []) if (s !== b && map.has(s) && how.get(s) !== 'sibling') for (const i of map.get(s)) keys.add(i);
  }
  for (const i of keys) add(b, i, 'sibling');
}

// ---------- 5. 확인 ----------
const reachable = new Set([...map.values()].flatMap((s) => [...s]));
const lost = dest.filter((_, i) => !reachable.has(i)).map(destKey);
check('D2', '고시 행정동마다 법정동 코드 1개 이상', lost.length === 0, `닿는 행정동 ${fmt(reachable.size)}/${fmt(dest.length)} · 안 닿음 ${lost.length}${lost.length ? ` (${lost.slice(0, 10).join(', ')})` : ''}`);

const nowMapped = nowCodes.filter((b) => map.has(b));
const nowUnmapped = nowCodes.filter((b) => !map.has(b));
const byHow = { basis: 0, rename: 0, sibling: 0 };
for (const b of nowMapped) byHow[how.get(b)]++;
const groups = new Map();
for (const b of nowUnmapped) {
  const n = bName(b);
  const k = n ? `${n[1]} ${n[2]}`.trim() : '(이름 없음)';
  groups.set(k, (groups.get(k) || 0) + 1);
}
// 고시에 있는 시군구인데 안 이어진 코드는 사람이 봐야 한다(섬·출장소 등). 실패로 막지는 않고 리포트에 전부 적는다
const destSigungu = new Set(dest.map((d) => `${d[0]} ${d[1]}`));
const inNoticeSigungu = nowUnmapped.map((b) => bName(b)).filter((n) => n && destSigungu.has(`${n[1]} ${n[2]}`));
check('D3', '지금 법정동 코드 → 고시 행정동', true,
  `${fmt(nowMapped.length)}/${fmt(nowCodes.length)} (${(nowMapped.length / nowCodes.length * 100).toFixed(1)}%) · 같은 코드 ${fmt(byHow.basis)} · 이름으로 옛 코드 ${fmt(byHow.rename)} · 같은 행정동 따라감 ${fmt(byHow.sibling)} · 안 이어짐 ${fmt(nowUnmapped.length)}(이 중 고시 시군구 안 ${inNoticeSigungu.length})`);
check('D4', '옛 코드 → 지금 코드 후보가 여러 개', ambiguous.length === 0, `${ambiguous.length}건${ambiguous.length ? ` (${ambiguous.slice(0, 5).join(' / ')})` : ''}`);

// 대표 확인: 지금 행정동에 속한 법정동 코드가 모두 기대한 고시 행정동으로 가는지
const destIdx = new Map(dest.map((d, i) => [destKey(d), i]));
const label = (s) => [...s].map((i) => dest[i].slice(1, 3).join(' ')).sort().join(' · ');
const sample = (id, name, codes, expect) => {
  const want = new Set(expect.map((k) => destIdx.get(k.join('|'))));
  const got = codes.map((b) => map.get(b) || new Set());
  const ok = codes.length > 0 && !want.has(undefined) && got.every((s) => s.size === want.size && [...s].every((i) => want.has(i)));
  const seen = new Set(got.flatMap((s) => [...s]));
  check(id, name, ok, `코드 ${codes.length}개 → ${seen.size ? label(seen) : '없음'} (기대 ${expect.map((k) => k.slice(1).join(' ')).join(' · ')})`);
};
const codesOfNowH = (sido, sigungu, dong) => {
  const h = H.find((r) => !r[5] && r[1] === sido && r[2] === sigungu && r[3] === dong);
  return h ? nowByH.get(h[0]) || [] : [];
};
const codesByName = (sido, sigungu, emd, ri = '', when) => B.filter((r) => r[1] === sido && r[2] === sigungu && r[3] === emd && r[4] === ri && (when === 'old' ? r[6] : !r[6])).map((r) => r[0]);
sample('S1', '의왕시 삼동·이동·월암동·초평동 → 의왕시 부곡동', ['이동', '삼동', '월암동', '초평동'].flatMap((d) => codesByName('경기도', '의왕시', d)), [['경기도', '의왕시', '부곡동']]);
sample('S2', '용인시 처인구 포곡읍 삼계리 → 포곡읍', codesByName('경기도', '용인시 처인구', '포곡읍', '삼계리'), [['경기도', '용인시 처인구', '포곡읍']]);
sample('S3', '안산시 상록구 부곡동(법정동) → 부곡동 · 월피동 (1:N)', codesByName('경기도', '안산시 상록구', '부곡동'), [['경기도', '안산시 상록구', '부곡동'], ['경기도', '안산시 상록구', '월피동']]);
sample('S4', '파주시 문산읍 마정리 → 파주시 문산읍', codesByName('경기도', '파주시', '문산읍', '마정리'), [['경기도', '파주시', '문산읍']]);
sample('S5', '진주시 문산읍 소문리 → 진주시 문산읍', codesByName('경상남도', '진주시', '문산읍', '소문리'), [['경상남도', '진주시', '문산읍']]);
sample('S6', '지금 평택시 고덕1동·고덕2동 → 고시 고덕동', [...codesOfNowH('경기도', '평택시', '고덕1동'), ...codesOfNowH('경기도', '평택시', '고덕2동')], [['경기도', '평택시', '고덕동']]);
sample('S7', '지금 전남광주통합특별시 동구 대인동 → 고시 광주광역시 동구 충장동', codesByName('전남광주통합특별시', '동구', '대인동'), [['광주광역시', '동구', '충장동']]);
sample('S8', '옛 코드 광주광역시 동구 대인동 → 충장동', codesByName('광주광역시', '동구', '대인동', '', 'old'), [['광주광역시', '동구', '충장동']]);
// 법정동 운서동은 기준일에 행정동 운서동·용유동 두 곳에 걸쳐 있었다 → 1:N
sample('S9', '지금 인천 영종구 운서1동 → 고시 인천 중구 운서동 · 용유동 (1:N)', codesOfNowH('인천광역시', '영종구', '운서1동'), [['인천광역시', '중구', '운서동'], ['인천광역시', '중구', '용유동']]);
sample('S10', '지금 용인시 처인구 양지읍 양지리 → 고시 양지면', codesByName('경기도', '용인시 처인구', '양지읍', '양지리'), [['경기도', '용인시 처인구', '양지면']]);
// 법정동 안양동은 기준일에 행정동 11곳(안양1~9동·석수1동·동안구 비산1동)에 걸쳐 있었다 → 1:N
sample('S11', '지금 안양시 만안구 명학동(행정동) → 법정동 안양동의 고시 행정동 11곳 (1:N)', codesOfNowH('경기도', '안양시 만안구', '명학동'),
  [...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ['경기도', '안양시 만안구', `안양${n}동`]), ['경기도', '안양시 만안구', '석수1동'], ['경기도', '안양시 동안구', '비산1동']]);

report(checks.every((c) => c.pass));

function report(ok) {
  const kst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const lines = [
    `# 주소 → 고시 행정동 변환표 빌드 리포트 — ${version}`,
    '',
    `- 빌드 일시: ${kst} (KST)`,
    `- 원본: 행정안전부 주민등록 주소코드 ${ymd(codeVer)} 시행분(말소코드 포함) · data/safe-rate/${version}/destinations.json`,
    `- 고시 행정동 기준일: ${ymd(basis)} (이날 살아 있던 행정동과 고시 3,480곳이 1:1로 맞음)`,
    `- 명령: node scripts/build-safe-rate-dong-map.mjs ${version} ${codeVer}`,
    `- 결과: ${ok ? '전부 통과' : '실패 — 파일을 쓰지 않음'} (${checks.filter((c) => c.pass).length}/${checks.length})`,
    '',
    '## 검증',
    '',
    '| # | 항목 | 결과 | 건수·내용 |',
    '|---|---|---|---|',
    ...checks.map((c) => `| ${c.id} | ${c.name} | ${c.pass ? '통과' : '**실패**'} | ${c.detail.replace(/\|/g, '/')} |`),
  ];
  if (!ok) { console.log(lines.join('\n')); fail('검증 실패 — 위 표의 실패 항목을 확인하세요.'); }

  const entries = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const head = {
    source: `행정안전부 주민등록 주소코드 ${ymd(codeVer)}(말소코드 포함) → 국토교통부고시 제${version}호 행정동`,
    updatedAt: kst.slice(0, 10),
    count: entries.length,
    basisDate: ymd(basis),
    codeVersion: ymd(codeVer),
    value: '법정동 코드(10자리) → destinations.json 인덱스 목록(1:N이면 후보 여럿)',
  };
  const text = '{\n' + Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n') +
    '\n  "map": {\n' + entries.map(([b, s]) => `    "${b}": ${JSON.stringify([...s].sort((x, y) => x - y))}`).join(',\n') + '\n  }\n}\n';
  writeFileSync(OUT, text, 'utf8');

  const multi = entries.filter(([, s]) => s.size > 1).length;
  lines.push(
    '', '## 숫자', '',
    `- 변환표 코드 ${fmt(entries.length)}개 (기준일 코드 ${fmt(basisCodes.size)} + 지금만 있는 코드 ${fmt(entries.length - basisCodes.size)}) · 후보가 여럿(1:N)인 코드 ${fmt(multi)}`,
    `- 출장소를 본 행정동으로 이은 줄 ${fmt(viaBranch)}`,
    `- 지역 개편 표: 시도 ${Object.entries(SIDO_CHANGES).map(([o, n]) => `${o}→${n.join('/')}`).join(', ')} · 시군구 ${Object.entries(SIGUNGU_CHANGES).map(([o, n]) => `${o.replace('|', ' ')}→${n.join('/')}`).join(', ')} · 일반구 신설(시 이름이 앞에 붙는 경우)·면→읍 승격은 규칙으로 처리`,
    '', '## 생성 파일', '', '| 파일 | 크기(KB) | gzip(KB) |', '|---|---:|---:|',
    `| data/safe-rate/${version}/dong-map.json | ${(statSync(OUT).size / 1024).toFixed(1)} | ${(gzipSync(Buffer.from(text)).length / 1024).toFixed(1)} |`,
    '', '## 안 이어진 지금 코드 (시군구별)', '',
    '고시에 행선지가 없는 곳이에요. 화면에서는 시·군·구까지만 확정하고 읍·면·동을 직접 고르게 해요.', '',
    '| 시도 시군구 | 코드 수 | 고시에 있는 시군구 |', '|---|---:|---|',
    ...[...groups.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} | ${destSigungu.has(k) ? '예' : ''} |`),
  );
  if (inNoticeSigungu.length) {
    lines.push('', '### 고시에 있는 시군구 안에서 안 이어진 코드', '', '| 코드 | 이름 |', '|---|---|',
      ...inNoticeSigungu.map((n) => `| ${n[0]} | ${n.slice(1, 5).filter(Boolean).join(' ')} |`));
  }
  if (ambiguous.length) lines.push('', '## 후보가 여러 개라 잇지 않은 코드', '', ...ambiguous.map((a) => `- ${a}`));
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
  console.log(lines.slice(0, lines.indexOf('## 안 이어진 지금 코드 (시군구별)')).join('\n'));
  console.log(`(안 이어진 코드 시군구별 목록 ${groups.size}줄은 리포트에)\n리포트: docs/safe-rate/dong-map-report-${version}.md`);
}
