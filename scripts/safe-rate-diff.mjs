// D03 안전운임 — 두 버전의 운임을 칸마다 비교하고 화면용 한 줄 요약을 만든다
//   data/safe-rate/{이전}/ · data/safe-rate/{새 버전}/ (build-safe-rate.mjs 결과)
//   → data/safe-rate/{새 버전}/diff.json (화면이 읽는 요약) · docs/safe-rate/diff-{이전}-to-{새 버전}.md
//
// 사용: node scripts/safe-rate-diff.mjs 2026-402 2026-578-draft
//
// - 왕복 14기점 × 3,480곳 × 6종 + 편도 3기점 × 1,213곳 × 6종을 전부 비교한다.
// - 행선지·거리가 같아야 주소 변환표(dong-map)를 그대로 쓸 수 있다 → 다르면 실패로 알린다.
// - 칸 하나라도 ±10%를 넘게 바뀌면 실패로 알린다(유가 연동은 보통 2% 안팎). 자동 반영을 멈추고 사람이 본다.
// - 종료 코드: 0 통과 · 2 확인 필요(위 두 조건) · 1 실행 오류

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [fromId, toId] = process.argv.slice(2);
if (!fromId || !toId) { console.error('사용: node scripts/safe-rate-diff.mjs {이전 버전} {새 버전}'); process.exit(1); }
const LIMIT_PCT = 10;
const OUT = join(ROOT, 'data', 'safe-rate', toId, 'diff.json');
const REPORT = join(ROOT, 'docs', 'safe-rate', `diff-${fromId}-to-${toId}.md`);
for (const f of [OUT, REPORT]) if (existsSync(f)) { console.error(`이미 있는 파일이에요 — ${f.slice(ROOT.length + 1)}. 덮어쓰지 않아요.`); process.exit(1); }

const load = (id) => {
  const dir = join(ROOT, 'data', 'safe-rate', id);
  const j = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  return { meta: j('meta.json'), D: j('destinations.json'), T: j('km-tables.json'), OW: j('oneway.json') };
};
const A = load(fromId), B = load(toId);
const versions = JSON.parse(readFileSync(join(ROOT, 'data', 'safe-rate', 'versions.json'), 'utf8')).versions;
const vTo = versions.find((v) => v.id === toId) || {};
const F = A.meta.fareOrder;
const won = (n) => `₩${n.toLocaleString('en-US')}`;
const pct1 = (p) => `${Math.abs(p).toFixed(1)}%`;

const stat = () => ({ cells: 0, same: 0, up: 0, down: 0, min: Infinity, max: -Infinity, sum: 0, minWon: Infinity, maxWon: -Infinity });
const add = (s, a, b) => {
  const d = b - a, p = d / a * 100;
  s.cells++; if (!d) s.same++; else if (d > 0) s.up++; else s.down++;
  s.min = Math.min(s.min, p); s.max = Math.max(s.max, p); s.sum += p;
  s.minWon = Math.min(s.minWon, d); s.maxWon = Math.max(s.maxWon, d);
};
const done = (s) => ({ cells: s.cells, same: s.same, up: s.up, down: s.down, meanPct: +(s.sum / s.cells).toFixed(2), minPct: +s.min.toFixed(2), maxPct: +s.max.toFixed(2), minWon: s.minWon, maxWon: s.maxWon });

// 행선지·거리 같은지
const sameKeys = A.D.length === B.D.length && A.D.every((d, i) => JSON.stringify(d) === JSON.stringify(B.D[i]));
const sameOrigins = JSON.stringify(A.meta.origins.map((o) => [o.code, o.kmTable])) === JSON.stringify(B.meta.origins.map((o) => [o.code, o.kmTable]));
const sameOneway = Object.keys(A.OW).every((c) => B.OW[c] && A.OW[c].length === B.OW[c].length && A.OW[c].every((r, i) => r.slice(0, 6).join('|') === B.OW[c][i].slice(0, 6).join('|')));

const all = stat(), shipper = stat();
const byFare = Object.fromEntries(F.map((f) => [f, stat()]));
const byOrigin = {};
const over = [];
A.meta.origins.forEach((o, oi) => {
  byOrigin[o.code] = stat();
  A.D.forEach((d, i) => {
    const fa = A.T[o.kmTable][d[3 + oi]], fb = B.T[o.kmTable][B.D[i][3 + oi]];
    F.forEach((f, k) => {
      add(all, fa[k], fb[k]); add(byFare[f], fa[k], fb[k]); add(byOrigin[o.code], fa[k], fb[k]);
      if (f.startsWith('s')) add(shipper, fa[k], fb[k]);
      if (Math.abs((fb[k] - fa[k]) / fa[k] * 100) > LIMIT_PCT && over.length < 20) over.push(`${o.code} ${d.slice(0, 3).join(' ')} ${f} ${fa[k]}→${fb[k]}`);
    });
  });
});
const ow = stat();
for (const c of Object.keys(A.OW)) A.OW[c].forEach((r, i) => { for (let k = 0; k < 6; k++) add(ow, r[6 + k], B.OW[c][i][6 + k]); });

// 대표 예: 부산신항 → 경기도 의왕시 부곡동(의왕ICD 앞) 40FT 화주 운임
const oi = A.meta.origins.findIndex((o) => o.code === 'BNP');
const di = A.D.findIndex((d) => d[0] === '경기도' && d[1] === '의왕시' && d[2] === '부곡동');
const S40 = F.indexOf('s40');
const exA = di >= 0 ? A.T.general[A.D[di][3 + oi]][S40] : null;
const exB = di >= 0 ? B.T.general[B.D[di][3 + oi]][S40] : null;

// 한 줄 요약 — 화주 운임(안전운송운임) 기준. 해요체, 결과부터
const sh = done(shipper);
const when = vTo.effectiveFrom || vTo.plannedFrom;
const whenText = when ? `${+when.slice(5, 7)}월 ${+when.slice(8, 10)}일부터 ` : '';
const dir = sh.up && !sh.down ? 'up' : sh.down && !sh.up ? 'down' : sh.up || sh.down ? 'mixed' : 'same';
const range = (s) => `구간별 ${pct1(Math.min(Math.abs(s.minPct), Math.abs(s.maxPct)))}~${pct1(Math.max(Math.abs(s.minPct), Math.abs(s.maxPct)))}`;
const head = {
  up: `${whenText}화주 운임이 평균 ${pct1(sh.meanPct)} 올라요(${range(sh)})`,
  down: `${whenText}화주 운임이 평균 ${pct1(sh.meanPct)} 내려요(${range(sh)})`,
  mixed: `${whenText}화주 운임이 구간에 따라 ${pct1(sh.minPct)} 내리거나 ${pct1(sh.maxPct)} 올라요`,
  same: `${whenText}화주 운임은 그대로예요`,
}[dir];
const example = exA != null && exA !== exB ? ` · 부산신항→의왕 부곡동 40FT ${won(exA)} → ${won(exB)}` : '';
const summary = head + example;

const ok = sameKeys && sameOrigins && sameOneway && over.length === 0;
const kst = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const out = {
  source: `${A.meta.noticeNo} ↔ ${B.meta.noticeNo} 운임 칸별 비교`,
  updatedAt: kst.slice(0, 10),
  count: all.cells + ow.cells,
  from: fromId,
  to: toId,
  summary,
  direction: dir,
  basis: '화주 운임(안전운송운임) 20FT·40FT, 왕복 14기점 × 3,480곳',
  shipper: sh,
  example: exA != null ? { origin: 'BNP', destination: ['경기도', '의왕시', '부곡동'], fare: 's40', from: exA, to: exB, diff: exB - exA } : null,
  roundtrip: done(all),
  byFare: Object.fromEntries(F.map((f) => [f, done(byFare[f])])),
  byOrigin: Object.fromEntries(Object.entries(byOrigin).map(([c, s]) => [c, done(s)])),
  oneway: done(ow),
  sameDestinations: sameKeys && sameOrigins,
  sameOnewayDistances: sameOneway,
};

const lines = [
  `# 안전운임 버전 비교 — ${fromId} → ${toId}`,
  '',
  `- 만든 일시: ${kst} (KST) · 명령: node scripts/safe-rate-diff.mjs ${fromId} ${toId}`,
  `- 이전: ${A.meta.noticeNo} · 새 버전: ${B.meta.noticeNo}${B.meta.status === 'draft' ? ' (행정예고안, 확정 전)' : ''}`,
  `- **한 줄 요약**: ${summary}`,
  `- 결과: ${ok ? '통과 — 행선지·거리 같음, 모든 칸 ±' + LIMIT_PCT + '% 안' : '**확인 필요**'}`,
  '',
  '## 확인',
  '',
  '| 항목 | 결과 |',
  '|---|---|',
  `| 행선지 3,480곳·기점별 거리 같음 (주소 변환표 그대로 사용) | ${sameKeys && sameOrigins ? '같음' : '**다름 — dong-map 다시 만들어야 함**'} |`,
  `| 편도 행선지·구간·적컨·공컨 거리 같음 | ${sameOneway ? '같음' : '**다름**'} |`,
  `| ±${LIMIT_PCT}% 넘게 바뀐 칸 | ${over.length ? `**${over.length}건 이상**: ${over.join(', ')}` : '0건'} |`,
  '',
  '## 운임 종류별 (왕복)',
  '',
  '| 운임 | 칸 | 오름 | 내림 | 같음 | 평균 | 범위 | 금액 범위 |',
  '|---|---:|---:|---:|---:|---:|---|---|',
  ...F.map((f) => { const s = out.byFare[f]; return `| ${A.meta.fareLabels[f]} | ${s.cells.toLocaleString('en-US')} | ${s.up.toLocaleString('en-US')} | ${s.down.toLocaleString('en-US')} | ${s.same.toLocaleString('en-US')} | ${s.meanPct}% | ${s.minPct}% ~ ${s.maxPct}% | ${s.minWon.toLocaleString('en-US')} ~ ${s.maxWon.toLocaleString('en-US')}원 |`; }),
  `| 편도 6종 전체 | ${out.oneway.cells.toLocaleString('en-US')} | ${out.oneway.up} | ${out.oneway.down.toLocaleString('en-US')} | ${out.oneway.same} | ${out.oneway.meanPct}% | ${out.oneway.minPct}% ~ ${out.oneway.maxPct}% | ${out.oneway.minWon.toLocaleString('en-US')} ~ ${out.oneway.maxWon.toLocaleString('en-US')}원 |`,
  '',
  '## 기점별 (왕복 6종)',
  '',
  '| 기점 | 평균 | 범위 |',
  '|---|---:|---|',
  ...A.meta.origins.map((o) => { const s = out.byOrigin[o.code]; return `| ${o.name} | ${s.meanPct}% | ${s.minPct}% ~ ${s.maxPct}% |`; }),
];
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
console.log(lines.slice(0, 13).join('\n'));
console.log(`\n파일: data/safe-rate/${toId}/diff.json (${(statSync(OUT).size / 1024).toFixed(1)}KB) · docs/safe-rate/diff-${fromId}-to-${toId}.md`);
process.exit(ok ? 0 : 2);
