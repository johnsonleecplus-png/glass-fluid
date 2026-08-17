// render.js — scale to 1920x1080, add head/tail fade to white for seamless loop
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = 'D:\\dev\\ffmpeg\\ffmpeg.exe';
const input = path.join(__dirname, 'wave-loop.mp4');
const output = path.join(__dirname, 'wave-final.mp4');

// 5.88s video @ 24fps = 141 frames (n=0..140). To make the final frame pure white,
// fade-out must finish at 5.83s (= 140/24), so st=5.33s, d=0.5s.
const vf = 'scale=1920:1080:flags=lanczos'
  + ',fade=in:st=0:d=0.5:c=white'
  + ',fade=out:st=5.33:d=0.5:c=white';

const args = [
  '-y',
  '-i', input,
  '-vf', vf,
  '-c:v', 'libopenh264',
  '-b:v', '5M',
  '-pix_fmt', 'yuv420p',
  '-an',
  output,
];

console.log('vf:', vf);

const proc = spawn(ffmpeg, args, { stdio: 'inherit' });
proc.on('exit', (code) => {
  console.log(`ffmpeg exited with code ${code}`);
  process.exit(code ?? 1);
});
proc.on('error', (err) => {
  console.error('spawn error:', err);
  process.exit(1);
});
