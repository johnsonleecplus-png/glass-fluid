
import { spawn } from 'node:child_process';
const a = process.argv[2], b = process.argv[3];
const proc = spawn('D:\\dev\\ffmpeg\\ffmpeg.exe', ['-y', '-i', a, '-i', b, '-lavfi', 'psnr=stats_file=-', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] });
let out = '';
proc.stdout.on('data', d => out += d);
proc.stderr.on('data', d => out += d);
proc.on('exit', () => {
  // psnr output is on stderr; "average" line tells us.
  const m = out.match(/psnr_avg:(\S+)\s+min:(\S+)\s+max:(\S+)/);
  if (m) {
    const avg = parseFloat(m[1]);
    console.log('PSNR avg:', avg, 'dB');
    if (avg > 60) console.log('LOOP: pixel-perfect (or near-perfect)');
    else if (avg > 40) console.log('LOOP: visually identical (small compression loss)');
    else console.log('LOOP: NOT identical — there is visible change');
  } else {
    console.log('Could not parse PSNR. Raw output:');
    console.log(out.split('\n').slice(-20).join('\n'));
  }
});
