// D03 안전운임 — 국토교통부 행정규칙 게시판 감시
//   새 글이 올라오면 첨부를 받고, 종류에 따라 처리한다.
//   - 확정 고시: 빌드 → 전수 검증 → 이전 고시와 비교 → 모두 통과하면 versions.json 갱신·커밋·push (자동)
//   - 행정예고(예고안): 빌드 → 검증 → 비교까지 하고 로컬 브랜치 bot/{버전}에 커밋만. 반영 여부는 사람이 정한다
//   - 그 밖의 글(위원회 운영규칙 등): 알림만
//   알림: Windows 알림 + raw/safe-rate/watch/inbox/{날짜}-{글번호}.md 메모
//
// 사용: node scripts/safe-rate-watch.mjs              게시판 확인·처리
//       node scripts/safe-rate-watch.mjs --baseline   지금 있는 글을 모두 "본 글"로 기록(처음 한 번)
//       node scripts/safe-rate-watch.mjs --dry-run    받고 읽기만, 저장소·상태 안 바꿈
//       node scripts/safe-rate-watch.mjs --approve 2026-578-draft   예고안 브랜치를 main에 합치고 push
//
// - git 커밋·push는 환경변수 SAFE_RATE_BOT=1일 때만 한다(자동화 전용 클론에서만 켠다 — scripts/safe-rate-watch-setup.ps1).
//   작업하는 저장소에서 그냥 돌리면 준비까지만 하고 알린다.
// - 국토교통부 첨부는 스크립트 다운로드를 막아서 이 PC의 Microsoft Edge로 받는다(브라우저를 새로 내려받지 않음).

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import * as XLSX from 'xlsx';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const BOT = process.env.SAFE_RATE_BOT === '1';
const BOARD = 'https://www.molit.go.kr/USR/I0204/m_45/';
const LIST_URL = `${BOARD}lst.jsp?search=${encodeURIComponent('안전운임')}&srch_usr_titl=Y&psize=30`;
const WATCH = join(ROOT, 'raw', 'safe-rate', 'watch');
const STATE = join(WATCH, 'state.json');
const VERSIONS = join(ROOT, 'data', 'safe-rate', 'versions.json');
const kstNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const today = () => kstNow().slice(0, 10);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const node = (...a) => spawnSync(process.execPath, a, { cwd: ROOT, encoding: 'utf8' });
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const writeJson = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 2) + '\n', 'utf8'); };

function notify(title, body) {
  console.log(`[알림] ${title} — ${body}`);
  if (DRY || process.platform !== 'win32') return;
  const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null;
$x = New-Object Windows.Data.Xml.Dom.XmlDocument;
$x.LoadXml('<toast><visual><binding template="ToastGeneric"><text>${esc(title)}</text><text>${esc(body)}</text></binding></visual></toast>');
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' });
}

// ---------- 예고안 승인: bot/{버전} 브랜치를 main에 합치고 push ----------
if (args[0] === '--approve') {
  const id = args[1];
  if (!id) { console.error('사용: --approve {버전}'); process.exit(1); }
  if (!BOT) { console.error('승인은 자동화 전용 클론(SAFE_RATE_BOT=1)에서 해요.'); process.exit(1); }
  git('checkout', 'main'); git('pull', '--ff-only');
  git('merge', '--ff-only', `bot/${id}`);
  git('push', 'origin', 'main');
  notify('안전운임 예고안 반영', `${id}를 사이트에 올렸어요`);
  process.exit(0);
}

// ---------- 게시판 읽기 ----------
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
let exitCode = 0;
try {
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const posts = await page.$$eval('tbody tr', (trs) => trs.map((tr) => {
    const a = tr.querySelector('td.bd_title a');
    const idx = a && (a.getAttribute('href').match(/[?&]idx=(\d+)/) || [])[1];
    return idx ? { idx: +idx, title: a.textContent.trim(), date: (tr.querySelector('td.bd_date_publish')?.textContent || '').trim() } : null;
  }).filter(Boolean));
  if (!posts.length) throw new Error('게시판 목록을 못 읽었어요(화면 구조가 바뀌었을 수 있음)');

  const state = readJson(STATE, null);
  if (!state || args.includes('--baseline')) {
    const seen = Object.fromEntries(posts.map((p) => [p.idx, { ...p, firstSeen: today(), action: 'baseline' }]));
    if (!DRY) writeJson(STATE, { updatedAt: kstNow(), seen });
    console.log(`처음 기록: 글 ${posts.length}개를 본 글로 남겼어요. 다음부터 새 글만 처리해요.`);
  } else {
    const fresh = posts.filter((p) => !state.seen[p.idx]).sort((a, b) => a.idx - b.idx);
    console.log(`${kstNow()} 게시판 글 ${posts.length}개 · 새 글 ${fresh.length}개`);
    for (const p of fresh) {
      const result = await handle(p);
      state.seen[p.idx] = { ...p, firstSeen: today(), action: result.action };
      if (result.action === 'failed') exitCode = 2;
    }
    if (!DRY) writeJson(STATE, { updatedAt: kstNow(), seen: state.seen });
  }
} catch (e) {
  console.error(e);
  notify('안전운임 감시 오류', String(e.message || e).slice(0, 120));
  exitCode = 1;
} finally {
  // 다운로드로 시작된 탐색은 끝나지 않은 채 남아, 브라우저를 닫을 때 라이브러리가 TargetClosedError를 던진다 → 닫는 동안만 무시
  process.on('uncaughtException', (e) => { if (e?.name !== 'TargetClosedError') { console.error(e); process.exit(1); } });
  await browser.close().catch(() => {});
}
process.exit(exitCode);

// ---------- 글 하나 처리 ----------
async function handle(p) {
  const kind = /행정예고|고시안|개정안|\[공고\]/.test(p.title) ? 'draft' : /고시/.test(p.title) ? 'final' : 'other';
  const memo = [`# ${p.title}`, '', `- 게시일: ${p.date} · 글 번호 ${p.idx} · ${BOARD}dtl.jsp?idx=${p.idx}`, `- 종류: ${{ draft: '행정예고(예고안)', final: '확정 고시', other: '그 밖의 글' }[kind]}`, `- 확인: ${kstNow()}`];
  const finish = (action, title, body, extra = []) => {
    memo.push('', ...extra);
    if (DRY) console.log(memo.join('\n'));
    if (!DRY) { mkdirSync(join(WATCH, 'inbox'), { recursive: true }); writeFileSync(join(WATCH, 'inbox', `${today()}-${p.idx}.md`), memo.join('\n') + '\n', 'utf8'); }
    notify(title, body);
    return { action };
  };
  if (kind === 'other') return finish('notified', '안전운임 게시판 새 글', p.title);

  // 첨부 받기
  await page.goto(`${BOARD}dtl.jsp?idx=${p.idx}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const bodyText = await page.evaluate(() => document.body.innerText);
  const links = await page.$$eval('a[href*="DWN.jsp"]', (as) => [...new Set(as.map((a) => a.getAttribute('title')).filter(Boolean))]);
  const inbox = join(WATCH, 'inbox', String(p.idx));
  mkdirSync(inbox, { recursive: true });
  for (const t of links) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(`a[title="${t.replace(/"/g, '\\"')}"]`)]);
    await dl.saveAs(join(inbox, dl.suggestedFilename()));
  }
  await page.goto('about:blank'); // 다운로드로 걸린 탐색을 끝내 둔다(닫을 때 오류 방지)
  const files = readdirSync(inbox);
  memo.push(`- 첨부 ${files.length}개: ${files.join(', ')}`);

  // 파일 고르기·번호·날짜 읽기
  const pick = (re, not) => files.find((f) => re.test(f) && !(not && not.test(f)));
  const roundtrip = pick(/왕복.*\.xlsx$/i), oneway = pick(/편도.*\.xlsx$/i);
  const notice = kind === 'final'
    ? pick(/전문.*\.pdf$/i) || pick(/고시.*\.pdf$/i, /예고|전배|시멘트/) || pick(/고시.*\.hwpx$/i, /예고|전배|시멘트/)
    : pick(/개정안.*고시.*\.hwpx$/i, /전배/) || pick(/개정안.*\.pdf$/i, /전배|예고문/);
  const texts = [bodyText];
  for (const f of files.filter((f) => /\.(pdf|hwpx)$/i.test(f))) texts.push(await fileText(join(inbox, f)));
  const all = texts.join('\n');
  const ymd = (m) => (m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null);
  const startDate = ymd(all.match(/이 고시는\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일부터\s*시행/));
  let id, entry;
  if (kind === 'final') {
    const m = all.match(/국토교통부고시\s*제\s*(\d{4})\s*[-–—]\s*(\d+)\s*호/);
    id = m && `${m[1]}-${m[2]}`;
    entry = { id, status: 'final', noticeNo: m && `제${m[1]}-${m[2]}호`, title: p.title, effectiveFrom: startDate, effectiveTo: null };
  } else {
    const m = all.match(/국토교통부공고\s*제\s*(\d{4})\s*[-–—]\s*(\d+)\s*호/);
    id = m && `${m[1]}-${m[2]}-draft`;
    entry = { id, status: 'draft', noticeNo: m && `국토교통부공고 제${m[1]}-${m[2]}호(행정예고)`, title: p.title, announcedAt: p.date,
      commentUntil: ymd(all.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일까지\s*[^\n]{0,40}제출/)), plannedFrom: startDate };
  }
  Object.assign(entry, { sourceUrl: `${BOARD}dtl.jsp?idx=${p.idx}`, boardIdx: p.idx, files: { notice, roundtrip, oneway } });
  memo.push(`- 읽은 값: 버전 ${id || '?'} · ${kind === 'final' ? `시행 ${entry.effectiveFrom || '?'}` : `시행 예정 ${entry.plannedFrom || '?'} · 의견 기한 ${entry.commentUntil || '?'}`}`,
    `- 원본 짝: 본문 ${notice || '없음'} · 왕복 ${roundtrip || '없음'} · 편도 ${oneway || '없음'}`);
  const missing = [!id && '버전 번호', !startDate && '시행일', !notice && '본문', !roundtrip && '왕복 엑셀', !oneway && '편도 엑셀'].filter(Boolean);
  if (missing.length) return finish('failed', '안전운임 새 글 — 확인 필요', `${p.title}: ${missing.join('·')}를 못 찾았어요`, ['컨테이너 운임표가 없는 글(시멘트만 바뀐 경우 등)일 수 있어요. 메모의 첨부를 직접 봐 주세요.']);
  if (DRY) return finish('dry-run', '안전운임 새 글(시험)', `${id} 읽기까지 했어요`);
  if (!BOT) return finish('noticed', `안전운임 ${kind === 'final' ? '확정 고시' : '예고안'} 새 글`, `${id} — 자동화 클론이 아니라서 받기까지만 했어요`);

  // 저장소 준비
  const versions = readJson(VERSIONS);
  if (versions.versions.some((v) => v.id === id) || existsSync(join(ROOT, 'data', 'safe-rate', id))) return finish('known', '안전운임 새 글', `${id}는 이미 있는 버전이에요`);
  const base = [...versions.versions].reverse().find((v) => v.status === 'final');
  git('checkout', 'main'); git('pull', '--ff-only');
  if (kind === 'draft') git('checkout', '-B', `bot/${id}`);
  const rawDir = join(ROOT, 'raw', 'safe-rate', id);
  mkdirSync(rawDir, { recursive: true });
  for (const f of files) copyFileSync(join(inbox, f), join(rawDir, f));
  entry.compareTo = base.id;
  entry.dongMap = base.dongMap;
  versions.versions.push(entry);

  // 빌드·비교 (실패하면 되돌림)
  const writeVersions = () => { versions.updatedAt = today(); versions.count = versions.versions.length; writeJson(VERSIONS, versions); };
  writeVersions();
  const build = node('scripts/build-safe-rate.mjs', id);
  const diff = build.status === 0 ? node('scripts/safe-rate-diff.mjs', base.id, id) : null;
  const ok = build.status === 0 && diff?.status === 0;
  const summary = ok ? readJson(join(ROOT, 'data', 'safe-rate', id, 'diff.json')).summary : null;
  memo.push('', '## 빌드', '```', (build.stdout + build.stderr).split('\n').filter((l) => /결과|실패|중단|생성 파일/.test(l)).join('\n'), '```');
  if (diff) memo.push('', '## 비교', '```', (diff.stdout + diff.stderr).split('\n').slice(0, 14).join('\n'), '```');
  if (!ok) {
    if (BOT) { git('checkout', '--', '.'); git('clean', '-fd', 'data', 'docs'); git('checkout', 'main'); }
    return finish('failed', '안전운임 새 글 — 자동 처리 멈춤', `${id} 검증 또는 비교에서 걸렸어요. 메모를 봐 주세요`);
  }
  // 확정 고시: 이전 확정 고시 끝나는 날, 같은 시행일 예고안은 대체됨으로
  if (kind === 'final') {
    const dayBefore = new Date(Date.parse(entry.effectiveFrom) - 864e5).toISOString().slice(0, 10);
    for (const v of versions.versions) {
      if (v.id === base.id && !v.effectiveTo) v.effectiveTo = dayBefore;
      if (v.status === 'draft' && v.plannedFrom === entry.effectiveFrom) { v.status = 'superseded'; v.supersededBy = id; }
    }
    writeVersions();
  }
  memo.push('', `**한 줄 요약**: ${summary}`);
  git('add', 'data/safe-rate', 'docs/safe-rate');
  git('commit', '-m', `D03 safe-rate: ${entry.noticeNo} ${kind === 'final' ? '자동 반영' : '예고안 준비'}(검증 통과)\n\n${summary}`);
  if (kind === 'final') {
    git('push', 'origin', 'main');
    return finish('published', '안전운임 확정 고시 반영 완료', `${entry.noticeNo} · ${summary}`);
  }
  git('checkout', 'main');
  return finish('awaiting', '안전운임 예고안 — 반영할지 정해 주세요', summary,
    ['## 정해 주세요', '', `- 반영: 자동화 클론에서 \`node scripts/safe-rate-watch.mjs --approve ${id}\` (또는 Claude에게 "${id} 반영")`, `- 보류: 그대로 두면 확정 고시가 나올 때 확정본만 반영돼요`]);
}

async function fileText(file) {
  try {
    if (/\.hwpx$/i.test(file)) {
      const zip = XLSX.CFB.read(readFileSync(file), { type: 'buffer' });
      return zip.FullPaths.filter((p) => /Contents\/section\d+\.xml$/i.test(p))
        .map((s) => Buffer.from(XLSX.CFB.find(zip, s).content).toString('utf8').replace(/<\/hp:p>/g, '\n').replace(/<[^>]*>/g, '')).join('\n');
    }
    const pdfjs = await import(pathToFileURL(join(ROOT, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) out.push((await (await doc.getPage(i)).getTextContent()).items.map((t) => t.str).join(' '));
    return out.join('\n');
  } catch { return ''; }
}
