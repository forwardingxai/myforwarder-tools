// D03 안전운임 조회기 — 고시 원본(PDF·hwpx·엑셀)에서 조회용 JSON 만들기
//   raw/safe-rate/{버전}/ 본문(PDF 또는 hwpx) · 왕복 엑셀 · 편도 엑셀 — 파일 이름은 data/safe-rate/versions.json의 files
//   → data/safe-rate/{버전}/meta.json · destinations.json · km-tables.json · oneway.json
//   → docs/safe-rate/build-report-{버전}.md
//
// 사용: node scripts/build-safe-rate.mjs 2026-402
//       node scripts/build-safe-rate.mjs 2026-578-draft --dry-run   (검증만, 파일 안 씀)
//
// - 버전 정보(고시번호·시행일·상태·원본 파일 이름)는 data/safe-rate/versions.json에서 읽는다. 새 버전은 거기에 한 줄 추가.
// - 왕복 운임은 "행정동별 거리(km) + 거리별 운임표 3종"으로 나눠 저장하고, 빌드할 때 원본 292,320셀을 전부 다시 만들어 대조한다.
// - 일반 거리표(1~550km)는 고시 본문 표에서 읽는다. 엑셀에는 508개 km만 있어서 엑셀은 대조용.
// - 검증이 하나라도 실패하면 파일을 쓰지 않고 멈춘다. 값을 보정하지 않는다.
// - 이미 만든 버전 폴더가 있으면 덮어쓰지 않고 멈춘다(버전을 쌓는다).
// - 대표값(V1 등 PRD 8장 기대값)은 그 값을 확인한 버전에서만 본다. 다른 버전은 scripts/safe-rate-diff.mjs로 이전 버전과 비교한다.
// - 규칙 전문: prd/safe-rate.md 1장·5장

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import * as XLSX from 'xlsx';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
const DRY = process.argv.includes('--dry-run');
if (!version) { console.error('사용: node scripts/build-safe-rate.mjs {버전, 예: 2026-402} [--dry-run]'); process.exit(1); }

const RAW = join(ROOT, 'raw', 'safe-rate', version);
const OUT = join(ROOT, 'data', 'safe-rate', version);
const REPORT = join(ROOT, 'docs', 'safe-rate', `build-report-${version}.md`);

// 2026-402는 처음 빌드한 값을 그대로 둔다(meta.json에 이미 기록됨). 그 뒤 버전은 versions.json에서 읽는다
const LEGACY = {
  '2026-402': {
    noticeNo: '제2026-402호', title: '2026년 적용 화물자동차 안전운임 고시 일부개정고시', status: 'final',
    effectiveDate: '2026-08-01', periods: [{ from: '2026-08-01', to: '2026-12-31' }],
    sourceUrl: 'https://www.molit.go.kr/USR/I0204/m_45/dtl.jsp?idx=18923',
    files: { notice: 'notice.pdf', roundtrip: 'roundtrip.xlsx', oneway: 'oneway.xlsx' },
  },
};
const entry = JSON.parse(readFileSync(join(ROOT, 'data', 'safe-rate', 'versions.json'), 'utf8')).versions.find((v) => v.id === version);
if (!entry) { console.error(`버전 정보가 없어요: ${version} — data/safe-rate/versions.json에 추가하세요`); process.exit(1); }
const from = entry.effectiveFrom || entry.plannedFrom;
const notice = LEGACY[version] || {
  noticeNo: entry.noticeNo, title: entry.title, status: entry.status,
  effectiveDate: from, periods: [{ from, to: entry.effectiveTo || null }],
  sourceUrl: entry.sourceUrl, files: entry.files,
  ...(entry.status === 'draft' ? { announcedAt: entry.announcedAt, commentUntil: entry.commentUntil } : {}),
};

// 기점 14곳 — 왕복 엑셀 시트 순서 그대로. terminalKm은 별표1 35조 터미널 내 거리
const ORIGINS = [
  { code: 'BNP', name: '부산신항', kmTable: 'general', hasOneway: true, terminalKm: 3.3 },
  { code: 'BSP', name: '부산북항', kmTable: 'general', hasOneway: true, terminalKm: 3.3 },
  { code: 'ICN', name: '인천신항', kmTable: 'incheon', hasOneway: false, terminalKm: 2 },
  { code: 'ICO', name: '인천항', kmTable: 'incheon', hasOneway: false, terminalKm: 1 },
  { code: 'ICF', name: '인천국제여객터미널', kmTable: 'incheon', hasOneway: false, terminalKm: 2 },
  { code: 'GWY', name: '광양항', kmTable: 'general', hasOneway: true, terminalKm: 4 },
  { code: 'PTK', name: '평택항', kmTable: 'pyeongtaek', hasOneway: false, terminalKm: 2 },
  { code: 'USN', name: '울산신항', kmTable: 'general', hasOneway: false, terminalKm: 2 },
  { code: 'USO', name: '울산항', kmTable: 'general', hasOneway: false, terminalKm: 1 },
  { code: 'PHK', name: '포항항', kmTable: 'general', hasOneway: false, terminalKm: 1.5 },
  { code: 'GSN', name: '군산항', kmTable: 'general', hasOneway: false, terminalKm: 2 },
  { code: 'MSN', name: '마산항', kmTable: 'general', hasOneway: false, terminalKm: 1.2 },
  { code: 'DSN', name: '대산항', kmTable: 'general', hasOneway: false, terminalKm: 1 },
  { code: 'UWI', name: '의왕ICD', kmTable: 'general', hasOneway: false, terminalKm: 2 },
];
const ONEWAY_SHEETS = [
  { code: 'BNP', sheet: '부산신항↔의왕ICD' },
  { code: 'BSP', sheet: '부산북항↔의왕ICD' },
  { code: 'GWY', sheet: '광양항↔의왕ICD' },
];
const FARE_ORDER = ['w40', 'b40', 's40', 'w20', 'b20', 's20'];
const FARE_LABELS = {
  w40: '40FT 안전위탁운임', b40: '40FT 운수사업자 간 운임', s40: '40FT 안전운송운임',
  w20: '20FT 안전위탁운임', b20: '20FT 운수사업자 간 운임', s20: '20FT 안전운송운임',
};
const ROUNDTRIP_ROWS = 3480;
const ONEWAY_ROWS = 1213;
const GENERAL_MAX_KM = 550;
const GENERAL_SHEET_KM_COUNT = 508;
const ONEWAY_REGION = (sido, sigungu) =>
  ['서울특별시', '인천광역시', '경기도'].includes(sido) ||
  (sido === '강원특별자치도' && ['춘천시', '홍천군'].includes(sigungu));

const checks = [];
const check = (id, name, pass, detail) => { checks.push({ id, name, pass: !!pass, detail }); };
const fmt = (n) => n.toLocaleString('en-US');
const keyOf = (r) => `${r[0]}|${r[1]}|${r[2]}`;
const sameFares = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const fail = (msg) => { console.error(`\n빌드 중단: ${msg}\n파일을 쓰지 않았어요.`); process.exit(1); };

for (const f of Object.values(notice.files)) {
  if (!existsSync(join(RAW, f))) fail(`원본이 없어요 — raw/safe-rate/${version}/${f}`);
}
for (const f of ['meta.json', 'destinations.json', 'km-tables.json', 'oneway.json'].map((f) => join(OUT, f)).concat(REPORT)) {
  if (!DRY && existsSync(f)) fail(`이미 있는 파일이에요 — ${f.slice(ROOT.length + 1)}. 덮어쓰지 않아요(버전을 쌓는 원칙). 필요하면 직접 확인 뒤 옮겨 주세요.`);
}

// ---------- 엑셀 읽기 ----------
// 1~2행 머리, 3행부터 데이터. 앞 textCols 칸은 글자, 나머지는 정수여야 한다(결측 0).
function readSheet(wb, name, cols, textCols) {
  const ws = wb.Sheets[name];
  if (!ws) fail(`시트가 없어요 — ${name}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }).slice(2)
    .filter((r) => r.some((v) => v !== null && v !== ''));
  let missing = 0;
  const out = rows.map((r) => {
    const row = r.slice(0, cols).map((v, i) => (i < textCols ? (typeof v === 'string' ? v.trim() : v) : v));
    row.forEach((v, i) => {
      const ok = i < textCols ? typeof v === 'string' && v !== '' : Number.isInteger(v) && v >= 0;
      if (!ok) missing++;
    });
    if (r.slice(cols).some((v) => v !== null && v !== '')) missing++;
    return row;
  });
  return { rows: out, missing };
}

const rtBook = XLSX.read(readFileSync(join(RAW, notice.files.roundtrip)));
const owBook = XLSX.read(readFileSync(join(RAW, notice.files.oneway)));

const expectedSheets = ORIGINS.map((o) => o.name);
check('S0', '왕복 시트 이름·순서', JSON.stringify(rtBook.SheetNames) === JSON.stringify(expectedSheets),
  `${rtBook.SheetNames.length}개 (${rtBook.SheetNames.join(', ')})`);
if (!checks.at(-1).pass) fail('왕복 시트 구성이 예상과 달라요');

// 왕복: 시도, 시군구, 행정동, km, 운임 6종
const rt = {};
for (const o of ORIGINS) rt[o.code] = readSheet(rtBook, o.name, 10, 3);

{
  const bad = ORIGINS.filter((o) => rt[o.code].rows.length !== ROUNDTRIP_ROWS);
  check('R1', `왕복 행 수 ${fmt(ROUNDTRIP_ROWS)} (14시트)`, bad.length === 0,
    bad.length ? bad.map((o) => `${o.name} ${rt[o.code].rows.length}`).join(', ') : `14시트 모두 ${fmt(ROUNDTRIP_ROWS)}행`);
  const miss = ORIGINS.reduce((s, o) => s + rt[o.code].missing, 0);
  check('R2', '왕복 결측', miss === 0, `${fmt(miss)}건`);
  let dup = 0;
  for (const o of ORIGINS) {
    const seen = new Set();
    for (const r of rt[o.code].rows) { const k = keyOf(r); if (seen.has(k)) dup++; seen.add(k); }
  }
  check('R3', '왕복 키(시도+시군구+행정동) 중복', dup === 0, `${fmt(dup)}건`);
  const base = rt.BNP.rows.map(keyOf);
  const diffSheets = ORIGINS.filter((o) => rt[o.code].rows.some((r, i) => keyOf(r) !== base[i]));
  check('R4', '14시트 키 순서 동일', diffSheets.length === 0,
    diffSheets.length ? `다름: ${diffSheets.map((o) => o.name).join(', ')}` : '14시트 모두 부산신항 시트와 같은 순서');
}
if (checks.some((c) => !c.pass)) report(false);

// 시트마다 km → 운임 6종이 하나로 정해지는지
const sheetKm = {};
{
  let conflicts = 0;
  const details = [];
  for (const o of ORIGINS) {
    const m = new Map();
    for (const r of rt[o.code].rows) {
      const km = r[3], fares = r.slice(4);
      if (m.has(km)) { if (!sameFares(m.get(km), fares)) conflicts++; } else m.set(km, fares);
    }
    sheetKm[o.code] = m;
    details.push(`${o.code} ${m.size}`);
  }
  check('R5', '시트 안에서 같은 km → 같은 운임 6종', conflicts === 0,
    `충돌 ${fmt(conflicts)}건 · 시트별 km 종류: ${details.join(', ')}`);
}

// ---------- 고시 본문 거리별 운임표(일반, 1~550km) ----------
// 본문에서 숫자 행을 문서 순서대로 꺼낸다.
// - PDF: 한 장에 좌우 두 쪽이 놓여 있어 같은 높이의 두 쪽 행이 섞이지 않게 장 가운데에서 먼저 나눈 뒤 줄 단위로 숫자를 모은다.
// - hwpx(예고안 등): 표 칸(hp:tc)을 순서대로 읽어 숫자 칸 8개가 이어지는 곳을 한 행으로 본다.
const isNum = (t) => /^\d{1,3}(,\d{3})*$|^\d+$/.test(t);
const toNum = (t) => Number(t.replace(/,/g, ''));
async function noticeNumberRows(file) {
  const rows = [];
  if (file.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import(pathToFileURL(join(ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const mid = page.getViewport({ scale: 1 }).width / 2;
      const items = (await page.getTextContent()).items.filter((it) => it.str && it.str.trim());
      for (const half of [0, 1]) {
        const own = items.filter((it) => (it.transform[4] < mid ? 0 : 1) === half)
          .map((it) => ({ x: it.transform[4], y: it.transform[5], s: it.str.trim() }))
          .sort((a, b) => b.y - a.y || a.x - b.x);
        const lines = [];
        for (const it of own) {
          const line = lines.at(-1);
          if (line && Math.abs(line.y - it.y) <= 2) line.items.push(it); else lines.push({ y: it.y, items: [it] });
        }
        for (const line of lines) {
          const tokens = line.items.sort((a, b) => a.x - b.x).flatMap((it) => it.s.split(/\s+/));
          rows.push(tokens.filter(isNum).map(toNum));
        }
      }
    }
  } else if (file.toLowerCase().endsWith('.hwpx')) {
    const zip = XLSX.CFB.read(readFileSync(file), { type: 'buffer' });
    const sections = zip.FullPaths.filter((p) => /Contents\/section\d+\.xml$/i.test(p)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    for (const s of sections) {
      const xml = Buffer.from(XLSX.CFB.find(zip, s).content).toString('utf8');
      // 표 한 줄(hp:tr)이 한 행. 칸 수가 다른 시멘트 표가 섞여 읽히지 않게 줄 단위로 끊는다
      for (const tr of xml.matchAll(/<hp:tr\b[\s\S]*?<\/hp:tr>/g)) {
        const cells = [...tr[0].matchAll(/<hp:tc\b[\s\S]*?<\/hp:tc>/g)].map((m) => m[0].replace(/<[^>]*>/g, '').trim());
        rows.push(cells.filter(isNum).map(toNum));
      }
    }
  } else fail(`본문 형식을 모르겠어요 — ${file}`);
  return rows;
}

// 채택 조건: (a) 숫자 8개 (b) 운송거리 = 구간거리 × 2 (c) 구간거리 1~550 (d) 같은 구간거리는 처음 나온 행만
const general = {};
{
  let candidates = 0, duplicates = 0;
  for (const nums of await noticeNumberRows(join(RAW, notice.files.notice))) {
    if (nums.length !== 8) continue;
    const [km, tripKm, ...fares] = nums;
    if (tripKm !== km * 2 || km < 1 || km > GENERAL_MAX_KM) continue;
    candidates++;
    if (general[km]) { duplicates++; continue; }
    general[km] = fares;
  }
  const kms = Object.keys(general).map(Number).sort((a, b) => a - b);
  const missingKm = [];
  for (let k = 1; k <= GENERAL_MAX_KM; k++) if (!general[k]) missingKm.push(k);
  check('P1', `고시 본문 거리표 1~${GENERAL_MAX_KM}km 연속`, kms.length === GENERAL_MAX_KM && missingKm.length === 0,
    `채택 ${fmt(kms.length)}행 (조건 맞는 행 ${fmt(candidates)}, 뒤에 다시 나와 버린 행 ${fmt(duplicates)})` +
    (missingKm.length ? ` · 빠진 km: ${missingKm.slice(0, 20).join(', ')}${missingKm.length > 20 ? ' …' : ''}` : ''));
  const drops = [];
  for (let k = 2; k <= GENERAL_MAX_KM; k++) {
    if (!general[k] || !general[k - 1]) continue;
    general[k].forEach((v, i) => { if (v < general[k - 1][i]) drops.push(`${k}km ${FARE_ORDER[i]}`); });
  }
  check('P2', '거리 증가에 따라 운임 6종 감소 없음', drops.length === 0,
    drops.length ? `감소 ${drops.length}건: ${drops.slice(0, 10).join(', ')}` : '감소 0건');
}

// V16: 일반 10개 시트의 km 값 ↔ 고시 본문 표
{
  const generalOrigins = ORIGINS.filter((o) => o.kmTable === 'general');
  const union = new Set();
  const mismatches = [];
  let compared = 0;
  for (const o of generalOrigins) {
    for (const [km, fares] of sheetKm[o.code]) {
      union.add(km);
      compared++;
      if (!general[km] || !sameFares(general[km], fares)) mismatches.push(`${o.code} ${km}km`);
    }
  }
  check('V16', '일반 거리표(고시 본문) ↔ 일반 10개 시트 km 값',
    mismatches.length === 0 && union.size === GENERAL_SHEET_KM_COUNT,
    `대조 km ${fmt(union.size)}개(예상 ${GENERAL_SHEET_KM_COUNT}) · 시트별 대조 ${fmt(compared)}건 · 불일치 ${mismatches.length}건` +
    (mismatches.length ? ` (${mismatches.slice(0, 10).join(', ')})` : ''));
}

// 인천 3개 시트 → incheon, 평택항 → pyeongtaek (원본 값 그대로, 배수 계산 안 함)
const incheon = {}, pyeongtaek = {};
{
  const icn = ORIGINS.filter((o) => o.kmTable === 'incheon');
  let conflicts = 0;
  for (const o of icn) {
    for (const [km, fares] of sheetKm[o.code]) {
      if (incheon[km]) { if (!sameFares(incheon[km], fares)) conflicts++; } else incheon[km] = fares;
    }
  }
  check('K1', '인천 3개 시트 같은 km → 같은 운임', conflicts === 0,
    `충돌 ${conflicts}건 · ${icn.map((o) => `${o.code} ${sheetKm[o.code].size}km`).join(', ')} → 합친 ${Object.keys(incheon).length}km`);
  for (const [km, fares] of sheetKm.PTK) pyeongtaek[km] = fares;
}
const sortKm = (t) => Object.fromEntries(Object.keys(t).map(Number).sort((a, b) => a - b).map((k) => [k, t[k]]));
const kmTables = { general: sortKm(general), incheon: sortKm(incheon), pyeongtaek: sortKm(pyeongtaek) };

// ---------- destinations ----------
const destinations = rt.BNP.rows.map((r, i) => [r[0], r[1], r[2], ...ORIGINS.map((o) => rt[o.code].rows[i][3])]);

// ---------- 편도 ----------
const oneway = {};
{
  const names = owBook.SheetNames;
  check('O0', '편도 시트 이름·순서', JSON.stringify(names) === JSON.stringify(ONEWAY_SHEETS.map((s) => s.sheet)), names.join(', '));
  const rtKeys = new Set(destinations.map(keyOf));
  const expectKeys = new Set(destinations.filter((d) => ONEWAY_REGION(d[0], d[1])).map(keyOf));
  const rows = [], keysMissing = [], regionDiff = [];
  let miss = 0, dup = 0;
  for (const { code, sheet } of ONEWAY_SHEETS) {
    const { rows: r, missing } = readSheet(owBook, sheet, 12, 3);
    oneway[code] = r;
    rows.push(`${code} ${r.length}`);
    miss += missing;
    const seen = new Set();
    for (const row of r) {
      const k = keyOf(row);
      if (seen.has(k)) dup++;
      seen.add(k);
      if (!rtKeys.has(k)) keysMissing.push(`${code} ${k}`);
    }
    const extra = [...seen].filter((k) => !expectKeys.has(k));
    const lack = [...expectKeys].filter((k) => !seen.has(k));
    if (extra.length || lack.length) regionDiff.push(`${code} 지역 밖 ${extra.length} · 빠짐 ${lack.length}`);
  }
  check('O1', `편도 행 수 ${fmt(ONEWAY_ROWS)} (3시트)`, ONEWAY_SHEETS.every((s) => oneway[s.code].length === ONEWAY_ROWS), rows.join(', '));
  check('O2', '편도 결측·키 중복', miss === 0 && dup === 0, `결측 ${miss}건 · 중복 ${dup}건`);
  check('O3', '편도 키가 모두 왕복 키에 있음', keysMissing.length === 0,
    keysMissing.length ? `없음 ${keysMissing.length}건: ${keysMissing.slice(0, 5).join(', ')}` : `없는 키 0건`);
  const sidoCount = {};
  for (const r of oneway.BNP) sidoCount[r[0] === '강원특별자치도' ? `${r[0]} ${r[1]}` : r[0]] = (sidoCount[r[0] === '강원특별자치도' ? `${r[0]} ${r[1]}` : r[0]] || 0) + 1;
  check('O4', '편도 지역 = 서울·인천·경기 전체 + 강원 춘천·홍천', regionDiff.length === 0 && expectKeys.size === ONEWAY_ROWS,
    (regionDiff.length ? regionDiff.join(' / ') + ' · ' : '') +
    `왕복 키 중 해당 지역 ${fmt(expectKeys.size)}곳 · ` + Object.entries(sidoCount).map(([k, v]) => `${k} ${v}`).join(', '));
}

// ---------- 직렬화 (한 줄에 한 행 — 다음 고시와 비교하기 쉽게) ----------
const rowsJson = (rows) => '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n';
const tableJson = (t) => '{\n' + Object.entries(t).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n  }';
const files = {
  'destinations.json': rowsJson(destinations),
  'km-tables.json': '{\n' + Object.entries(kmTables).map(([name, t]) => `  ${JSON.stringify(name)}: ${tableJson(t)}`).join(',\n') + '\n}\n',
  'oneway.json': '{\n' + ONEWAY_SHEETS.map(({ code }) =>
    `  ${JSON.stringify(code)}: [\n` + oneway[code].map((r) => '    ' + JSON.stringify(r)).join(',\n') + '\n  ]').join(',\n') + '\n}\n',
};

// ---------- V15: 저장할 JSON만으로 왕복 운임을 다시 만들어 원본과 전수 대조 ----------
const D = JSON.parse(files['destinations.json']);
const T = JSON.parse(files['km-tables.json']);
const OW = JSON.parse(files['oneway.json']);
{
  let cells = 0, mismatches = 0;
  const examples = [];
  ORIGINS.forEach((o, oi) => {
    rt[o.code].rows.forEach((r, i) => {
      const km = D[i][3 + oi];
      const fares = T[o.kmTable][km];
      for (let f = 0; f < 6; f++) {
        cells++;
        if (!fares || fares[f] !== r[4 + f] || D[i][0] !== r[0] || D[i][1] !== r[1] || D[i][2] !== r[2]) {
          mismatches++;
          if (examples.length < 5) examples.push(`${o.code} ${keyOf(r)} ${FARE_ORDER[f]}`);
        }
      }
    });
  });
  check('V15', '왕복 운임 재구성 전수 대조 (14 × 3,480 × 6)', mismatches === 0 && cells === 292320,
    `${fmt(cells)}셀 · 불일치 ${mismatches}건${examples.length ? ` (${examples.join(', ')})` : ''}`);
}

// ---------- 대표값 (안전운송운임, 저장할 JSON에서 조회) — PRD 8장 기대값은 2026-402 기준 ----------
if (version === '2026-402') {
  const oi = Object.fromEntries(ORIGINS.map((o, i) => [o.code, i]));
  const find = (sido, sigungu, dong) => D.find((d) => d[0] === sido && d[1] === sigungu && d[2] === dong);
  const fareOf = (code, d) => T[ORIGINS[oi[code]].kmTable][d[3 + oi[code]]];
  const owOf = (code, sido, sigungu, dong) => OW[code].find((r) => r[0] === sido && r[1] === sigungu && r[2] === dong);
  const S40 = 2, S20 = 5;
  const rep = (id, name, got, want) => check(id, name, JSON.stringify(got) === JSON.stringify(want),
    `기대 ${want.map((v) => fmt(v)).join(' / ')} · 결과 ${got.map((v) => (v == null ? '없음' : fmt(v))).join(' / ')}`);
  const roundtrip = (code, ...key) => {
    const d = find(...key);
    if (!d) return [null, null, null];
    const f = fareOf(code, d);
    return [d[3 + oi[code]], f?.[S40], f?.[S20]];
  };

  rep('V1', '부산신항 → 경기도 의왕시 부곡동 (km · 40FT · 20FT)', roundtrip('BNP', '경기도', '의왕시', '부곡동'), [380, 1182400, 1042100]);
  rep('V3', '부산신항 → 경기도 용인시 처인구 포곡읍 (km · 40FT · 20FT)', roundtrip('BNP', '경기도', '용인시 처인구', '포곡읍'), [357, 1132400, 1002200]);
  const v4 = owOf('BNP', '경기도', '용인시 처인구', '포곡읍');
  rep('V4', '편도 부산신항 → 포곡읍 (40FT · 20FT)', [v4?.[6 + S40], v4?.[6 + S20]], [796100, 712800]);

  const munsan = D.filter((d) => d[2] === '문산읍').map((d) => `${d[0]} ${d[1]}`);
  check('V9', '행정동명 "문산읍" 검색 → 경기도 파주시 · 경상남도 진주시', JSON.stringify(munsan.sort()) === JSON.stringify(['경기도 파주시', '경상남도 진주시']),
    `${munsan.length}건: ${munsan.join(', ')}`);
  rep('V10', '부산신항 → 경상남도 진주시 문산읍 (km · 40FT · 20FT)', roundtrip('BNP', '경상남도', '진주시', '문산읍'), [84, 436200, 386600]);

  const paju = find('경기도', '파주시', '문산읍');
  const by20 = paju ? ORIGINS.map((o) => [o.code, fareOf(o.code, paju)?.[S20]]).sort((a, b) => a[1] - b[1]) : [];
  check('V11', '경기도 파주시 문산읍 14개 기점 20FT 최저·최고',
    by20.length === 14 && by20[0][0] === 'UWI' && by20[0][1] === 396000 && by20[13][0] === 'BSP' && by20[13][1] === 1144800,
    by20.length ? `최저 ${by20[0][0]} ${fmt(by20[0][1])} · 최고 ${by20[13][0]} ${fmt(by20[13][1])} (기대 UWI 396,000 · BSP 1,144,800)` : '행선지 없음');
  const pj = owOf('BNP', '경기도', '파주시', '문산읍');
  rep('V11b', '편도 부산신항 → 파주시 문산읍 (20FT · 40FT)', [pj?.[6 + S20], pj?.[6 + S40]], [864200, 976900]);
}

// ---------- 결과 ----------
report(checks.every((c) => c.pass));

function report(ok) {
  const kst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date()).replace('T', ' ');
  const lines = [
    `# 안전운임 고시 데이터 빌드 리포트 — ${notice.noticeNo}`,
    '',
    `- 빌드 일시: ${kst} (KST)`,
    `- 원본: raw/safe-rate/${version}/ (${Object.values(notice.files).join(' · ')} — 저장소에 넣지 않음)`,
    ...(notice.status === 'draft' ? [`- 상태: 행정예고안(확정 전) · 예고 ${notice.announcedAt} · 의견 기한 ${notice.commentUntil} · 시행 예정 ${notice.effectiveDate}`] : []),
    `- 명령: node scripts/build-safe-rate.mjs ${version}`,
    `- 결과: ${ok ? '전부 통과' : '실패 — 파일을 쓰지 않음'} (${checks.filter((c) => c.pass).length}/${checks.length})`,
    '',
    '## 검증',
    '',
    '| # | 항목 | 결과 | 건수·내용 |',
    '|---|---|---|---|',
    ...checks.map((c) => `| ${c.id} | ${c.name} | ${c.pass ? '통과' : '**실패**'} | ${c.detail.replace(/\|/g, '/')} |`),
  ];
  if (!ok) {
    console.log(lines.join('\n'));
    fail('검증 실패 — 위 표의 실패 항목을 확인하세요. 값을 보정하지 않았어요.');
  }
  if (DRY) { console.log(lines.join('\n')); console.log('\n--dry-run: 검증만 했어요. 파일은 쓰지 않았어요.'); return; }

  const meta = {
    source: `${notice.noticeNo.startsWith('국토교통부') ? '' : '국토교통부고시 '}${notice.noticeNo} 본문(거리별 운임표)·별첨(기점별 운임 왕복·편도)`,
    updatedAt: kst.slice(0, 10),
    count: destinations.length,
    noticeNo: notice.noticeNo,
    title: notice.title,
    ...(LEGACY[version] ? {} : { status: notice.status }),
    ...(notice.announcedAt ? { announcedAt: notice.announcedAt, commentUntil: notice.commentUntil } : {}),
    effectiveDate: notice.effectiveDate,
    periods: notice.periods,
    sourceUrl: notice.sourceUrl,
    vat: '별도',
    destinationCount: destinations.length,
    onewayDestinationCount: ONEWAY_ROWS,
    builtAt: kst,
    fareOrder: FARE_ORDER,
    fareLabels: FARE_LABELS,
    fareKinds: { w: '안전위탁운임', b: '운수사업자 간 운임', s: '안전운송운임' },
    kmTables: {
      general: { source: '고시 본문 1) 거리(km)별 운임(왕복)', count: Object.keys(kmTables.general).length },
      incheon: { source: '별첨 왕복 인천신항·인천항·인천국제여객터미널 시트', count: Object.keys(kmTables.incheon).length },
      pyeongtaek: { source: '별첨 왕복 평택항 시트', count: Object.keys(kmTables.pyeongtaek).length },
    },
    files: {
      destinations: '[시도, 시군구, 행정동, km × 14 (origins 순서)]',
      kmTables: '{ 표 이름: { km: [fareOrder 6종] } }',
      oneway: '{ 기점 코드: [[시도, 시군구, 행정동, 구간거리, 적컨거리, 공컨거리, fareOrder 6종]] }',
    },
    origins: ORIGINS,
  };
  const all = { 'meta.json': JSON.stringify(meta, null, 2) + '\n', ...files };
  mkdirSync(OUT, { recursive: true });
  for (const [name, text] of Object.entries(all)) writeFileSync(join(OUT, name), text, 'utf8');

  lines.push('', '## 생성 파일', '', '| 파일 | 크기(KB) | gzip(KB) |', '|---|---:|---:|');
  for (const [name, text] of Object.entries(all)) {
    const kb = statSync(join(OUT, name)).size / 1024;
    lines.push(`| data/safe-rate/${version}/${name} | ${kb.toFixed(1)} | ${(gzipSync(Buffer.from(text)).length / 1024).toFixed(1)} |`);
  }
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
  console.log(`\n리포트: docs/safe-rate/build-report-${version}.md`);
}
