const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DOWNLOAD_DIR = path.join(__dirname, '..', '..', 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `yt-dlp ${code} bilan tugadi`));
    });
    proc.on('error', (err) => reject(err));
  });
}

/**
 * Video/post linkini yuklab oladi (Instagram, YouTube, TikTok, Facebook).
 * Qaytaradi: yuklangan fayl to'liq yo'li.
 */
async function downloadMedia(url) {
  const id = crypto.randomBytes(6).toString('hex');
  const outputTemplate = path.join(DOWNLOAD_DIR, `${id}.%(ext)s`);

  await runYtDlp([
    url,
    '-o', outputTemplate,
    '--no-playlist',
    '--max-filesize', '50M',
    '-f', 'best[ext=mp4]/best',
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=android,web',
  ]);

  const files = fs.readdirSync(DOWNLOAD_DIR).filter((f) => f.startsWith(id));
  if (files.length === 0) throw new Error("Fayl yuklanmadi (link noto'g'ri yoki himoyalangan bo'lishi mumkin)");
  return path.join(DOWNLOAD_DIR, files[0]);
}

async function downloadMusic(query) {
  const id = crypto.randomBytes(6).toString('hex');
  const outputTemplate = path.join(DOWNLOAD_DIR, `${id}.%(ext)s`);

  await runYtDlp([
    `ytsearch1:${query}`,
    '-o', outputTemplate,
    '-x', '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--max-filesize', '50M',
    '--js-runtimes', 'node',
    '--extractor-args', 'youtube:player_client=android,web',
  ]);

  const files = fs.readdirSync(DOWNLOAD_DIR).filter((f) => f.startsWith(id));
  if (files.length === 0) throw new Error("Musiqa topilmadi");
  return path.join(DOWNLOAD_DIR, files[0]);
}

function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error('cleanupFile error:', err.message);
  }
}

module.exports = { downloadMedia, downloadMusic, cleanupFile };
