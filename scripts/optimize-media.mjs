import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const mediaDir = path.join(root, 'public/media')
const originalsDir = path.join(root, 'media/originals')
const imageDir = path.join(mediaDir, 'images')
const videoDir = path.join(mediaDir, 'video')
const localFfmpeg = path.join(homedir(), '.local/bin/ffmpeg')
const ffmpeg = process.env.FFMPEG || (existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg')
const manifest = { images: {}, videos: {} }

await Promise.all([mkdir(imageDir, { recursive: true }), mkdir(videoDir, { recursive: true })])

async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex').slice(0, 12)
}

function encode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''
    child.stderr.on('data', (data) => { error += data })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error || `FFmpeg terminou com código ${code}`)))
  })
}

for (const name of (await readdir(mediaDir)).filter((name) => /\.(jpg|webp)$/i.test(name)).sort()) {
  const original = path.join(mediaDir, name)
  const base = path.parse(name).name
  const { width, height } = await sharp(original).metadata()
  const widths = [...new Set([640, 1280, 1920].map((size) => Math.min(size, width)))]
  const variants = []
  for (const size of widths) {
    const buffer = await sharp(original).rotate().resize({ width: size, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toBuffer()
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 12)
    const filename = `${base}-${size}.${hash}.webp`
    await writeFile(path.join(imageDir, filename), buffer)
    variants.push({ src: `/media/images/${filename}`, width: size })
  }
  const fallback = variants.find((variant) => variant.width >= Math.min(width, 1280)) || variants.at(-1)
  manifest.images[`/media/${name}`] = { src: fallback.src, srcSet: variants.map((variant) => `${variant.src} ${variant.width}w`).join(', '), width, height }
  console.log(`Imagem: ${name}`)
}

const tasks = []
for (const name of (await readdir(originalsDir)).filter((name) => name.endsWith('.mp4')).sort()) {
  const original = path.join(originalsDir, name)
  const file = await open(original, 'r')
  const sample = Buffer.alloc(48)
  await file.read(sample, 0, sample.length, 0)
  await file.close()
  const header = sample.toString()
  if (header.startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error(`Baixe o original com git lfs pull antes de converter ${name}`)
  const base = path.parse(name).name
  const source = `/media/${name}`
  manifest.videos[source] = {}
  const hero = base.startsWith('hero-')
  const profiles = hero
    ? [{ name: 'ambient', edge: 1280, crf: 27, rate: base.endsWith('mobile') ? 1000 : 1600, silent: true }]
    : [
        { name: 'preview', edge: 960, crf: 28, rate: 800, silent: true, seconds: 8 },
        { name: 'mobile', edge: 1280, crf: 25, rate: 1400 },
        { name: 'desktop', edge: 1920, crf: 23, rate: 3200 },
      ]
  for (const profile of profiles) {
    tasks.push(async () => {
      const temp = path.join(videoDir, `${base}-${profile.name}.tmp.mp4`)
      const filter = `scale=${profile.edge}:${profile.edge}:force_original_aspect_ratio=decrease:force_divisible_by=2${profile.silent ? ',fps=24' : ''}`
      const args = [
        '-y',
        ...(profile.seconds ? ['-ss', '1'] : []),
        '-i', original,
        ...(profile.seconds ? ['-t', String(profile.seconds)] : []),
        '-map', '0:v:0',
        ...(profile.silent ? ['-an'] : ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', '128k']),
        '-vf', filter,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(profile.crf), '-threads', '2',
        '-profile:v', 'main', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
        '-maxrate', `${profile.rate}k`, '-bufsize', `${profile.rate * 2}k`, '-g', '48',
        '-map_metadata', '-1', '-movflags', '+faststart', temp,
      ]
      await encode(args)
      const bytes = (await stat(temp)).size
      if (bytes >= 100 * 1024 * 1024) throw new Error(`A versão web excede o limite do GitHub: ${base}-${profile.name}`)
      const filename = `${base}-${profile.name}.${await hashFile(temp)}.mp4`
      await rename(temp, path.join(videoDir, filename))
      manifest.videos[source][profile.name] = `/media/video/${filename}`
      console.log(`Vídeo: ${base} / ${profile.name} — ${(bytes / 1024 / 1024).toFixed(2)} MiB`)
    })
  }
}

async function worker() {
  while (tasks.length) await tasks.shift()()
}
await Promise.all([worker(), worker()])

await writeFile(path.join(root, 'src/data/media.generated.json'), `${JSON.stringify(manifest, null, 2)}\n`)
const used = new Set([
  ...Object.values(manifest.images).flatMap((image) => image.srcSet.split(', ').map((variant) => path.basename(variant.split(' ')[0]))),
  ...Object.values(manifest.videos).flatMap((video) => Object.values(video).map((src) => path.basename(src))),
])
for (const dir of [imageDir, videoDir]) {
  for (const name of await readdir(dir)) {
    if (!used.has(name)) await rm(path.join(dir, name))
  }
}
console.log('Mídias web e manifesto atualizados. Os originais foram preservados em media/originals.')
