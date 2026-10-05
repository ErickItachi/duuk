import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Two-second, aligned segments let the player change quality without restarting.
export async function generateHero({ original, base, videoDir, encode, hashFile, previous }) {
  const portrait = base.endsWith('mobile')
  const profiles = [
    { edge: 854, crf: 23, rate: 850 },
    { edge: 1280, crf: 21, rate: portrait ? 1800 : 2600 },
    { edge: 1920, crf: 18, rate: portrait ? 4500 : 7000 },
    { edge: 3840, crf: 18, rate: portrait ? 10000 : 14000, level: '5.1', codec: 'avc1.640033' },
  ]
  const tempDir = path.join(videoDir, `${base}-hls.tmp`)
  await rm(tempDir, { recursive: true, force: true })
  await mkdir(tempDir, { recursive: true })
  const variants = []
  let ambient = previous?.ambient
  let lightweight = previous?.lightweight
  const previousDir = previous?.adaptive && path.join(videoDir, path.basename(path.dirname(previous.adaptive)))
  const previousMaster = previousDir ? await readFile(path.join(previousDir, 'index.m3u8'), 'utf8') : ''
  const existingVariants = [...previousMaster.matchAll(/(#EXT-X-STREAM-INF:[^\n]+)\n([^\n]+)/g)]

  for (const [index, profile] of profiles.entries()) {
    if (previousDir && index < 3 && existingVariants[index]) {
      const [, info, playlist] = existingVariants[index]
      await cp(path.join(previousDir, String(index)), path.join(tempDir, String(index)), { recursive: true })
      variants.push(`${info}\n${playlist}`)
      console.log(`Abertura: ${base} / ${profile.edge} — versão existente preservada`)
      continue
    }
    const temp = path.join(videoDir, `${base}-${profile.edge}.tmp.mp4`)
    await encode([
      '-y', '-i', original, '-map', '0:v:0', '-an',
      '-vf', `scale=${profile.edge}:${profile.edge}:force_original_aspect_ratio=decrease:force_divisible_by=2${profile.edge === 3840 ? ':flags=lanczos' : ''},fps=24`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(profile.crf), '-threads', '2',
      '-profile:v', 'high', '-level:v', profile.level || '4.0', '-pix_fmt', 'yuv420p',
      '-maxrate', `${profile.rate}k`, '-bufsize', `${profile.rate * 2}k`,
      '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
      '-map_metadata', '-1', '-movflags', '+faststart', temp,
    ])
    const bytes = (await stat(temp)).size
    if ((index === 1 || index === 2) && bytes >= 100 * 1024 * 1024) throw new Error(`A versão web excede o limite do GitHub: ${base}`)
    const rendition = String(index)
    const renditionDir = path.join(tempDir, rendition)
    await mkdir(renditionDir)
    await encode([
      '-y', '-i', temp, '-map', '0:v:0', '-c:v', 'copy', '-an',
      '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4', '-hls_flags', 'independent_segments',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', path.join(renditionDir, 'segment-%03d.m4s'),
      path.join(renditionDir, 'index.m3u8'),
    ])
    const playlist = await readFile(path.join(renditionDir, 'index.m3u8'), 'utf8')
    const segments = [...playlist.matchAll(/#EXTINF:([\d.]+),\s*\n([^\n]+)/g)]
    const bitrates = await Promise.all(segments.map(async ([, duration, filename]) => (
      (await stat(path.join(renditionDir, filename))).size * 8 / Number(duration)
    )))
    const duration = segments.reduce((sum, [, seconds]) => sum + Number(seconds), 0)
    const width = portrait ? Math.floor(profile.edge * 9 / 16 / 2) * 2 : profile.edge
    const height = portrait ? profile.edge : Math.floor(profile.edge * 9 / 16 / 2) * 2
    variants.push(`#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(Math.max(...bitrates))},AVERAGE-BANDWIDTH=${Math.ceil(bytes * 8 / duration)},RESOLUTION=${width}x${height},FRAME-RATE=24.000,CODECS="${profile.codec || 'avc1.640028'}"\n${rendition}/index.m3u8`)

    if (index === 1 || index === 2) {
      const name = `${base}-${index === 2 ? 'ambient' : 'lightweight'}.${await hashFile(temp)}.mp4`
      await rename(temp, path.join(videoDir, name))
      if (index === 2) ambient = `/media/video/${name}`
      else lightweight = `/media/video/${name}`
    } else {
      await rm(temp)
    }
    console.log(`Abertura: ${base} / ${width}x${height} — ${(bytes / 1024 / 1024).toFixed(2)} MiB`)
  }
  await writeFile(path.join(tempDir, 'index.m3u8'), `#EXTM3U\n#EXT-X-VERSION:7\n${variants.join('\n')}\n`)
  const hash = createHash('sha256')
  for (const dir of ['.', ...profiles.map((_, index) => String(index))]) {
    for (const name of (await readdir(path.join(tempDir, dir), { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort()) {
      hash.update(`${dir}/${name}`).update(await readFile(path.join(tempDir, dir, name)))
    }
  }
  const folder = `${base}-hls.${hash.digest('hex').slice(0, 12)}`
  await rm(path.join(videoDir, folder), { recursive: true, force: true })
  await rename(tempDir, path.join(videoDir, folder))
  return { ambient, lightweight, adaptive: `/media/video/${folder}/index.m3u8` }
}
