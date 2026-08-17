// record.js — record 10s of auto-fluid.html via Chrome DevTools screencast,
// then composite into a 10s mp4 with ffmpeg.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Usage: node record.js [palette] [out.mp4] [duration_seconds] [continuous]
//   node record.js                                      → default palette, 10s, periodic
//   node record.js ice ice.mp4                          → ice, 10s
//   node record.js ice out60.mp4 60 1                   → ice, 60s, continuous (no loop)
const argPal   = process.argv[2] || '';
const argOut   = process.argv[3] || '';
const argDur   = parseFloat(process.argv[4] || '10');
const argCont  = process.argv[5] === '1' || process.argv[5] === 'true';
const html = 'file:///' + path.join(__dirname, 'auto-fluid.html').replace(/\\/g, '/')
  + '?record=1'
  + (argPal ? '&p=' + argPal : '')
  + (argCont ? '&continuous=1' : '');
const ffmpeg = 'D:\\dev\\ffmpeg\\ffmpeg.exe';
const ffmpegEsc = ffmpeg.replace(/\\/g, '\\\\');
const FRAMES_DIR = path.join(__dirname, 'frames');
const OUT_MP4 = argOut ? path.join(__dirname, argOut) : path.join(__dirname, 'auto-fluid-10s.mp4');
const DURATION_S = argDur;

// 1. 启动 chrome
const puppeteer = (await import('puppeteer-core')).default;
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-blink-features=AutomationControlled',
  ],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
console.log('loading', html);
await page.goto(html, { waitUntil: 'load' });
// 让 rAF 启动 + 编译完
await new Promise((r) => setTimeout(r, 1500));

// 2. 启动 screencast
fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });
const client = await page.target().createCDPSession();

await client.send('Page.startScreencast', {
  format: 'png',
  quality: 90,
  everyNthFrame: 1,
});

let frameIdx = 0;
const framePromises = [];
let active = true;

client.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  if (!active) return;
  const idx = frameIdx++;
  const outPath = path.join(FRAMES_DIR, `f_${String(idx).padStart(5, '0')}.png`);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  // 立即 ack 让 chrome 继续录
  await client.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});

console.log('recording', DURATION_S, 's...');
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < DURATION_S + 0.5) {
  await new Promise((r) => setTimeout(r, 200));
}
active = false;
await client.send('Page.stopScreencast').catch(() => {});

console.log('captured', frameIdx, 'frames');
await browser.close();

// 3. ffmpeg 合成 mp4 — use image2 demuxer (no concat timestamp issues)
const files = fs.readdirSync(FRAMES_DIR).filter(f => f.endsWith('.png')).sort();
console.log('compositing', files.length, 'frames → mp4...');
const args = [
  '-y',
  '-framerate', '30',
  '-i', path.join(FRAMES_DIR, 'f_%05d.png'),
  '-c:v', 'libopenh264',
  '-pix_fmt', 'yuv420p',
  '-b:v', '8M',
  '-r', '30',
  OUT_MP4,
];
await new Promise((resolve, reject) => {
  const p = spawn(ffmpegEsc, args, { stdio: 'inherit' });
  p.on('exit', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code)));
});
console.log('done:', OUT_MP4);
