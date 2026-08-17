// verify-fluid.js — load fluid-demo.html in puppeteer, check for shader errors
// and confirm the canvas is actually rendering (not all-black)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = 'file:///' + path.join(__dirname, 'fluid-demo.html').replace(/\\/g, '/');
const ffmpeg = 'D:\\dev\\ffmpeg\\ffmpeg.exe';

async function main() {
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.goto(html, { waitUntil: 'load' });
    // Let rAF tick a few frames so the canvas has content.
    await new Promise((r) => setTimeout(r, 1200));

    // Sweep mouse across the canvas to leave a flow trail
    for (let i = 0; i < 5; i++) {
      const x = 200 + i * 220;
      const y = 300 + Math.sin(i * 0.7) * 100;
      await page.mouse.move(x, y, { steps: 30 });
      await new Promise((r) => setTimeout(r, 80));
    }
    await new Promise((r) => setTimeout(r, 300));

    // Inspect canvas pixels: ensure not all-black.
    const stats = await page.evaluate(() => {
      const c = document.getElementById('gl');
      const w = c.width, h = c.height;
      // Read via a 2D canvas mirror.
      const off = document.createElement('canvas');
      off.width = 200; off.height = 120;
      const ctx = off.getContext('2d');
      ctx.drawImage(c, 0, 0, w, h, 0, 0, 200, 120);
      const data = ctx.getImageData(0, 0, 200, 120).data;
      let nonBlack = 0, rSum = 0, gSum = 0, bSum = 0, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = data[i] + data[i+1] + data[i+2];
        if (lum > 30) nonBlack++;
        rSum += data[i]; gSum += data[i+1]; bSum += data[i+2];
        max = Math.max(max, lum);
      }
      const total = data.length / 4;
      return {
        w, h, total, nonBlack,
        nonBlackPct: (nonBlack / total * 100).toFixed(1),
        avgR: (rSum / total).toFixed(1),
        avgG: (gSum / total).toFixed(1),
        avgB: (bSum / total).toFixed(1),
        maxLum: max,
      };
    });
    console.log('canvas stats:', stats);
    console.log('errors collected:');
    for (const e of errors) console.log('  ', e);

    // Save a preview frame
    await page.screenshot({ path: path.join(__dirname, 'fluid-preview.png'), type: 'png' });
    console.log('preview saved to fluid-preview.png');
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
