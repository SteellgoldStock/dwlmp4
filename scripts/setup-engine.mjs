import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename, chmod, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

const assets = {
  'linux-x64': 'yt-dlp_linux',
  'linux-arm64': 'yt-dlp_linux_aarch64',
  'darwin-x64': 'yt-dlp_macos',
  'darwin-arm64': 'yt-dlp_macos',
  'win32-x64': 'yt-dlp.exe',
  'win32-arm64': 'yt-dlp_arm64.exe',
};

async function get(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120_000),
    headers: { 'User-Agent': 'a-garder-setup/1.0' },
  });
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status}) : ${url}`);
  return response;
}

async function setup() {
  const asset = assets[`${process.platform}-${process.arch}`];
  if (!asset)
    throw new Error(
      'Plateforme non prise en charge automatiquement. Installez yt-dlp et définissez YTDLP_PATH.',
    );
  console.log('Téléchargement de la version stable de yt-dlp depuis le dépôt officiel…');
  const release = await (
    await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')
  ).json();
  if (typeof release.tag_name !== 'string' || !/^[\w.-]+$/.test(release.tag_name))
    throw new Error('Version officielle introuvable. Réessayez plus tard.');
  const releaseUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${release.tag_name}/`;
  const sumsResponse = await get(`${releaseUrl}SHA2-256SUMS`);
  const sums = await sumsResponse.text();
  const checksum = sums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name?.replace(/^\*/, '') === asset)?.[0];
  if (!checksum || !/^[a-f0-9]{64}$/i.test(checksum))
    throw new Error('Somme de contrôle officielle introuvable. Installation interrompue.');
  // Pin the asset to the same release as the checksum, even if a new version is published meanwhile.
  const url = `${releaseUrl}${asset}`;
  const bytes = Buffer.from(await (await get(url)).arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== checksum.toLowerCase())
    throw new Error('La somme SHA-256 ne correspond pas. Installation interrompue.');
  await mkdir('.bin', { recursive: true });
  const target = path.resolve('.bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  const temporary = process.platform === 'win32' ? `${target}.new.exe` : `${target}.new`;
  try {
    await writeFile(temporary, bytes, { mode: 0o755 });
    await chmod(temporary, 0o755);
    const check = spawnSync(temporary, ['--version'], { encoding: 'utf8', timeout: 30_000 });
    if (check.status !== 0)
      throw new Error(
        `Le binaire ne démarre pas : ${check.stderr || check.error?.message || 'erreur inconnue'}`,
      );
    await rename(temporary, target);
    console.log(`yt-dlp ${check.stdout.trim()} installé (SHA-256 vérifié).`);
  } finally {
    await rm(temporary, { force: true });
  }
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpeg;
  const check = spawnSync(ffmpegPath || 'ffmpeg', ['-version'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  if (check.status !== 0)
    throw new Error(
      'FFmpeg est introuvable. Réinstallez les dépendances, ou définissez FFMPEG_PATH.',
    );
  console.log('FFmpeg disponible. Tout est prêt : npm run dev');
}

setup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
