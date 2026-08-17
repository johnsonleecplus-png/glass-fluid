// verify-loop.js — drive the JS animation, snap at t=0 and t=LOOP, compare
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = 'file:///' + path.join(__dirname, 'wave.html').replace(/\\/g, '/');
const ffmpeg = 'D:\\dev\\ffmpeg\\ffmpeg.exe';
const ffmpegPath = ffmpeg.replace(/\\/g, '\\\\');
const out = path.join(__dirname, 'verify');

fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) fs.unlinkSync(path.join(out, f));

async function main() {
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--force-device-scale-factor=1', '--hide-scrollbars'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(html, { waitUntil: 'load' });
    // Stop the rAF loop so we have full control.
    await page.evaluate(() => {
      // Replace requestAnimationFrame to be a no-op.
      window.requestAnimationFrame = () => 0;
    });
    // Wait for filter rasterization to settle.
    await new Promise(r => setTimeout(r, 400));

    // Set t=0 and force a layout pass.
    await page.evaluate(() => {
      window.__setTime(0);
      // Force layout
      document.body.getBoundingClientRect();
    });
    await new Promise(r => setTimeout(r, 100));

    const f0 = path.join(out, 't0.png');
    await page.screenshot({ path: f0, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log('captured t=0');

    // Set t=LOOP (== 0 mod LOOP, must be identical).
    await page.evaluate(() => {
      window.__setTime(window.__loop);
      document.body.getBoundingClientRect();
    });
    await new Promise(r => setTimeout(r, 100));

    const fLoop = path.join(out, 'tloop.png');
    await page.screenshot({ path: fLoop, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log('captured t=LOOP');

    // Also set t=LOOP/2 to check intermediate state.
    await page.evaluate(() => {
      window.__setTime(window.__loop / 2);
      document.body.getBoundingClientRect();
    });
    await new Promise(r => setTimeout(r, 100));
    const fMid = path.join(out, 'tmid.png');
    await page.screenshot({ path: fMid, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    console.log('captured t=LOOP/2');

    // PSNR t=0 vs t=LOOP
    const psnrProc = spawn(ffmpegPath, [
      '-y', '-i', f0, '-i', fLoop, '-lavfi', 'psnr=stats_file=-', '-f', 'null', '-'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    psnrProc.stdout.on('data', d => buf += d.toString());
    psnrProc.stderr.on('data', d => buf += d.toString());
    await new Promise(r => psnrProc.on('exit', r));
    const m = buf.match(/psnr_avg:(\S+)/);
    if (m) {
      const avg = parseFloat(m[1]);
      console.log('PSNR t=0 vs t=LOOP:', avg, 'dB');
      if (avg > 60) console.log('LOOP: pixel-perfect (or near-perfect)');
      else if (avg > 40) console.log('LOOP: visually identical (small sub-pixel drift)');
      else console.log('LOOP: NOT identical — visible difference');
    }

    // Diff image
    const diffProc = spawn(ffmpegPath, [
      '-y', '-i', f0, '-i', fLoop, '-lavfi', 'blend=all_mode=difference,format=yuv420p',
      '-frames:v', '1', '-update', '1', path.join(out, 'diff.png')
    ], { stdio: 'inherit' });
    await new Promise(r => diffProc.on('exit', r));
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
