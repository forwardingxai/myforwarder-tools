// 전국 장치장(보세구역) 목록 수집 → data/bonded-area-code.json
//
// 사용:
//   node scripts/fetch-bonded-areas.mjs                  오늘 날짜로 수집(이미 받은 세관은 건너뜀) 후 정제
//   node scripts/fetch-bonded-areas.mjs --run 2026-10-17 그 날짜 수집을 이어받기
//   node scripts/fetch-bonded-areas.mjs --build-only     호출 없이 raw/로 정제만
//
// - 인증키: .env의 UNIPASS_API005_KEY. 키와 키가 들어간 요청 주소는 출력·저장하지 않는다.
// - 호출 대상: data/customs-codes.json(API019 A09) 중 010 이상(000~009 관세청 본청·부서·소속기관 제외)
// - 원본: raw/api005/{수집일}/{세관코드}.xml (커밋 제외). 성공한 응답만 저장하므로 이어받기가 안전하다.
// - 호출 사이 1초. 오류 응답(tCnt -1)·한도 문구·HTTP 오류가 오면 즉시 멈추고 정제하지 않는다.
// - 구분 규칙: scripts/classify-type.mjs, 지역 매핑: scripts/region-map.mjs
// - 명세 요약: docs/api005-notes.md, 필드 정의: prd/bonded-area-code.md 3-2

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyType, TYPES } from './classify-type.mjs';
import { REGIONS, regionOf } from './region-map.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_URL = 'https://unipass.customs.go.kr:38010/ext/rest/shedInfoQry/retrieveShedInfo';
const CALL_INTERVAL_MS = 1000;
const LIMIT_PATTERN = /한도|초과|제한|limit/i;

const args = process.argv.slice(2);
const buildOnly = args.includes('--build-only');
const runArg = args.includes('--run') ? args[args.indexOf('--run') + 1] : null;
const runDate = runArg || new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD(로컬)
if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) fail(`--run 날짜 형식이 아닙니다: ${runDate}`);
const rawDir = join(ROOT, 'raw', 'api005', runDate);

function fail(message, code = 1) {
  console.error(`중단: ${message}`);
  process.exit(code);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</\\s*${name}>`, 'i'));
  return m ? decode(m[1].trim()) : '';
};
const parseRows = (xml) =>
  [...xml.matchAll(/<shedInfoQryRsltVo>([\s\S]*?)<\/shedInfoQryRsltVo>/gi)].map(([, b]) => ({
    code: tag(b, 'snarSgn'),
    name: tag(b, 'snarNm'),
    address: tag(b, 'snarAddr'),
    unloading: tag(b, 'ldunPlcSnarYn'),
  }));

function readKey() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) fail('.env 파일이 없습니다');
  const line = readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => /^\s*UNIPASS_API005_KEY\s*=/.test(l));
  const key = line ? line.split('=').slice(1).join('=').trim() : '';
  if (!key) fail('.env에 UNIPASS_API005_KEY가 없거나 비어 있습니다');
  return key;
}

function loadTargets() {
  const path = join(ROOT, 'data', 'customs-codes.json');
  if (!existsSync(path)) fail('data/customs-codes.json이 없습니다(API019 A09 세관부호 목록 필요)');
  const { items } = readJson(path);
  return items.filter((c) => Number(c.code) >= 10);
}

async function collect(targets) {
  const key = readKey();
  const redact = (s) => String(s).split(key).join('***');
  mkdirSync(rawDir, { recursive: true });

  let called = 0;
  for (const [i, { code, name }] of targets.entries()) {
    const label = `[${String(i + 1).padStart(2)}/${targets.length}] ${code} ${name}`;
    const file = join(rawDir, `${code}.xml`);
    if (existsSync(file)) {
      console.log(`${label} — 이미 받음, 건너뜀`);
      continue;
    }
    if (called > 0) await sleep(CALL_INTERVAL_MS);
    called++;

    let res, body;
    try {
      const params = new URLSearchParams({ crkyCn: key, jrsdCstmCd: code });
      res = await fetch(`${API_URL}?${params}`, { signal: AbortSignal.timeout(60_000) });
      body = redact(await res.text());
    } catch (e) {
      fail(`${label} 요청 실패 — ${redact(e.message)} ${e.cause ? redact(e.cause.code || e.cause.message) : ''}`, 2);
    }

    const tCnt = Number(tag(body, 'tCnt'));
    const notice = tag(body, 'ntceInfo');
    if (!res.ok || !Number.isFinite(tCnt) || tCnt < 0 || LIMIT_PATTERN.test(notice)) {
      const errFile = join(rawDir, `_error-${code}.xml`);
      writeFileSync(errFile, body, 'utf8');
      fail(
        `${label} 오류 응답 — HTTP ${res.status}, tCnt ${tag(body, 'tCnt') || '(없음)'}, ntceInfo "${notice}"\n` +
          `  응답 원본: raw/api005/${runDate}/_error-${code}.xml\n` +
          `  원인을 확인한 뒤 같은 명령에 --run ${runDate}를 붙여 다시 실행하면 이어받습니다.`,
        3,
      );
    }

    const rows = parseRows(body).length;
    writeFileSync(`${file}.part`, body, 'utf8');
    renameSync(`${file}.part`, file);
    console.log(`${label} — ${rows}건${rows !== tCnt ? ` (주의: tCnt ${tCnt}와 다름)` : ''}`);
  }
  console.log(`호출 ${called}회 · 건너뜀 ${targets.length - called}곳`);
}

function build(targets) {
  const missing = targets.filter((c) => !existsSync(join(rawDir, `${c.code}.xml`)));
  if (missing.length) fail(`원본이 없는 세관 ${missing.length}곳: ${missing.map((c) => c.code).join(', ')}`);

  const customsName = Object.fromEntries(targets.map((c) => [c.code, c.name]));
  const aliasPath = join(ROOT, 'data', 'bonded-area-aliases.json');
  const aliases = existsSync(aliasPath) ? readJson(aliasPath).items : {};

  const byCode = new Map();
  let total = 0;
  let duplicates = 0;
  const nameConflicts = [];
  for (const { code: customs } of targets) {
    const xml = readFileSync(join(rawDir, `${customs}.xml`), 'utf8');
    for (const row of parseRows(xml)) {
      total++;
      const prev = byCode.get(row.code);
      if (prev) {
        duplicates++;
        if (prev.row.name !== row.name) nameConflicts.push(`${row.code}: "${prev.row.name}" / "${row.name}"`);
        // 부호 앞 3자리와 관할세관이 같은 응답을 우선한다.
        if (prev.customs !== row.code.slice(0, 3) && customs === row.code.slice(0, 3)) byCode.set(row.code, { row, customs });
        continue;
      }
      byCode.set(row.code, { row, customs });
    }
  }

  const items = [...byCode.values()]
    .map(({ row, customs }) => {
      const t = classifyType(row.name, { code: row.code, unloadingPlace: row.unloading, customs });
      return {
        code: row.code,
        name: row.name,
        customs,
        customsName: customsName[customs] || '',
        region: regionOf(customs),
        type: t.type,
        typeBasis: t.basis,
        address: row.address,
        aliases: aliases[row.code] || [],
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const header = {
    source: '관세청 UNI-PASS OPEN API API005 장치장정보조회 (세관명: API019 통계부호 A09)',
    updatedAt: runDate,
    count: items.length,
    scope: `전국 관할세관 ${targets.length}곳(세관부호 010~154)`,
    typeEstimated: true,
  };
  // 머리는 보기 좋게, 항목은 한 줄에 하나(파일 크기와 diff 가독성)
  const head = JSON.stringify(header, null, 2).replace(/\n}$/, '');
  const body = items.map((it) => '    ' + JSON.stringify(it)).join(',\n');
  const outPath = join(ROOT, 'data', 'bonded-area-code.json');
  writeFileSync(outPath, `${head},\n  "items": [\n${body}\n  ]\n}\n`, 'utf8');

  // 엑셀용 CSV(직접 만들어 보기 키트의 "데이터 그대로 쓰기"). BOM을 붙여 엑셀에서 한글이 깨지지 않게 한다.
  // 부호는 ="01001001" 형태로 써서 더블클릭으로 열어도 앞자리 0이 사라지지 않게 한다(프로그램용은 JSON).
  const csvCell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const asText = (v) => `="${v}"`;
  const csvRows = [
    ['장치장부호', '장치장명', '관할세관부호', '관할세관명', '지역', '구분(추정)', '주소', '약칭'],
    ...items.map((it) => [asText(it.code), it.name, asText(it.customs), it.customsName, it.region, it.type, it.address, it.aliases.join(' ')]),
  ];
  const csvPath = join(ROOT, 'data', 'bonded-area-code.csv');
  writeFileSync(csvPath, '﻿' + csvRows.map((r) => r.map((v) => csvCell(String(v ?? ''))).join(',')).join('\r\n') + '\r\n', 'utf8');

  const countBy = (k) => items.reduce((a, it) => ((a[it[k]] = (a[it[k]] || 0) + 1), a), {});
  const pct = (n) => `${((n / items.length) * 100).toFixed(1)}%`;
  const types = countBy('type');
  console.log('\n=== 정제 결과 ===');
  console.log(`원본 행 ${total.toLocaleString()} · 중복 ${duplicates.toLocaleString()} · 정제본 ${items.length.toLocaleString()}건`);
  console.log(`이름이 다른 중복 ${nameConflicts.length}건${nameConflicts.length ? ': ' + nameConflicts.slice(0, 5).join(' | ') : ''}`);
  console.log(`파일: data/bonded-area-code.json · ${(statSync(outPath).size / 1024).toFixed(1)} KB, data/bonded-area-code.csv · ${(statSync(csvPath).size / 1024).toFixed(1)} KB`);
  console.log('지역:', REGIONS.map((r) => `${r} ${countBy('region')[r] || 0}`).join(' · '));
  console.log('구분:', TYPES.map((t) => `${t} ${types[t] || 0}(${pct(types[t] || 0)})`).join(' · '));
  console.log('구분 근거:', JSON.stringify(countBy('typeBasis')));
  for (const code of ['03077011', '03077013']) {
    const it = items.find((x) => x.code === code);
    console.log(`검증 ${code}: ${it ? `${it.name} · ${it.customs} ${it.customsName} · ${it.type} · 약칭 ${it.aliases.join(',') || '-'}` : '없음'}`);
  }
}

const targets = loadTargets();
console.log(`수집일 ${runDate} · 대상 세관 ${targets.length}곳 · 원본 raw/api005/${runDate}/`);
if (!buildOnly) await collect(targets);
build(targets);
