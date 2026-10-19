// Exporta os slides em PNG a partir de carrossel.html.
// Uso: node brand/instagram/carrossel-01/export.mjs [escala ...]
// Sem argumentos gera 1080×1350 (1x) e 2160×2700 (2x).
// Requer Playwright (`npm i -g playwright` ou disponível no projeto).
import { createReadStream, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const scales = process.argv.slice(2).map(Number).filter(Boolean)
const targets = scales.length ? scales : [1, 2]

function loadPlaywright() {
  const require = createRequire(import.meta.url)
  try {
    return require('playwright')
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim()
    return require(join(globalRoot, 'playwright'))
  }
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
}

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
  const file = join(root, path)
  if (!file.startsWith(root)) {
    res.writeHead(403).end()
    return
  }
  const stream = createReadStream(file)
  stream.on('error', () => res.writeHead(404).end())
  stream.on('open', () => {
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    stream.pipe(res)
  })
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const base = `http://127.0.0.1:${server.address().port}/brand/instagram/carrossel-01/carrossel.html`

const { chromium } = loadPlaywright()
const browser = await chromium.launch()

for (const scale of targets) {
  const folder = join(here, scale === 1 ? 'png' : `png@${scale}x`)
  mkdirSync(folder, { recursive: true })
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: scale,
  })
  for (let n = 1; n <= 5; n += 1) {
    await page.goto(`${base}?slide=${n}`)
    await page.waitForSelector('html[data-ready="true"]')
    const file = join(folder, `duuk-carrossel-01-slide-0${n}.png`)
    await page.locator(`[data-slide="${n}"]`).screenshot({ path: file, animations: 'disabled' })
    console.log(file.replace(`${root}/`, ''))
  }
  await page.close()
}

// Visão contínua dos cinco slides lado a lado, para revisar as emendas.
const strip = await browser.newPage({ viewport: { width: 5400, height: 1350 } })
await strip.goto(base)
await strip.waitForSelector('html[data-ready="true"]')
await strip.screenshot({ path: join(here, 'png', 'duuk-carrossel-01-sequencia.png') })

await browser.close()
server.close()
