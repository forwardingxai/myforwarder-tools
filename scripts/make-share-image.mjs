// 도구 공유 이미지(1200×630) 만들기 → thumbs/{slug}-og.png
//
// 사용: npm run share-image -- bonded-area-code
//   (처음 한 번 npm install 필요. 이 PC의 Microsoft Edge로 찍는다 — 브라우저를 새로 내려받지 않음)
//
// - 문구: tools.json의 share 칸 / 색: area(ops 코발트·sales 라임) / 틀: scripts/share-image.html
// - 스타일 규칙: docs/share-image-guide.md
// - 이 스크립트가 잠깐 자체 웹 서버를 띄워 찍으므로 미리보기 서버(5510)가 없어도 된다.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const slug = process.argv[2];
if (!slug) { console.error('사용: npm run share-image -- {slug}'); process.exit(1); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`${base}/scripts/share-image.html?slug=${encodeURIComponent(slug)}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 15000 });
  const { ready, error, warn } = await page.evaluate(() => ({ ...document.body.dataset }));
  if (error) throw new Error(error);
  if (ready === 'overflow') console.warn('주의: 글자가 이미지 밖으로 넘쳤어요. tools.json share 문구를 줄여 주세요.');
  if (warn) console.warn(`주의: ${warn}`);
  const out = join(ROOT, 'thumbs', `${slug}-og.png`);
  await page.locator('#art').screenshot({ path: out });
  console.log(`저장: thumbs/${slug}-og.png · ${(statSync(out).size / 1024).toFixed(0)}KB`);
} finally {
  await browser.close();
  server.close();
}
