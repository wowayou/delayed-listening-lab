import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('generated', { recursive: true });
const jobs = [
  ['generated/timing-20s.mp4', ['-f', 'lavfi', '-i', 'color=c=0x18212b:s=640x360:r=30:d=20', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-t', '20', '-shortest']],
  ['generated/timing-20s.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=20', '-c:a', 'pcm_s16le', '-t', '20']],
];
for (const [file, args] of jobs) {
  if (existsSync(file)) { console.log(`保留已有文件：${file}`); continue; }
  const result = spawnSync('ffmpeg', ['-n', ...args, file], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw result.error ?? new Error(`ffmpeg exit ${result.status}`);
}
