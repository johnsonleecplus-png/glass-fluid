// capture.js — render wave loop frames via puppeteer-core + Chrome
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FPS = 30;
const LOOP_SECONDS = 6;          // must match wave.html LOOP_SECONDS
const TOTAL_FRAMES = FPS * LOOP_SECONDS; // 180
const OUT_DIR = path.join(__dirname, 'frames');
const HTML = 'file://' + path.join(__dirname, 'wave.html').replace(/\\/g, '/');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT_DIR, f));
  }

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
    ],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    // Pre-warm: load the page and wait until animation is ready.
    await page.goto(HTML, { waitUntil: 'load' });
    await page.waitForFunction('window.__waveReady === true', { timeout: 15000 });
    // Give the SVG filters (Gaussian blur) a few frames to settle.
    await new Promise((r) => setTimeout(r, 400));

    // Render TOTAL_FRAMES frames, one per video frame.
    // We call __setLoopTime(frame / FPS) which is a deterministic function of t.
    const t0 = Date.now();
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const t = i / FPS; // seconds
      await page.evaluate((tt) => {
        window.__setLoopTime(tt);
        // Force a layout pass for SVG filter to apply.
        document.body.getBoundingClientRect();
      }, t);
      // Give the browser one frame + a tiny margin for filter rasterization.
      await new Promise((r) => setTimeout(r, 30));
      const outPath = path.join(OUT_DIR, `frame_${String(i).padStart(4, '0')}.png`);
      await page.screenshot({ path: outPath, type: 'png', omitBackground: false, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      if (i % 30 === 0 || i === TOTAL_FRAMES - 1) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`frame ${i}/${TOTAL_FRAMES} (t=${t.toFixed(2)}s) — ${elapsed}s elapsed`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`done. ${TOTAL_FRAMES} frames in ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
