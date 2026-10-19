// Exporta a capa do WhatsApp Business a partir de capa.html.
// Uso: node brand/whatsapp/export.mjs [escala ...]
// Sem argumentos gera 1920×1080 (1x).
// Requer Playwright (`npm i -g playwright` ou disponível no projeto).
import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const scales = process.argv.slice(2).map(Number).filter(Boolean)
const targets = scales.length ? scales : [1]

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
const url = `http://127.0.0.1:${server.address().port}/brand/whatsapp/capa.html`

const { chromium } = loadPlaywright()
const browser = await chromium.launch()

for (const scale of targets) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: scale,
  })
  await page.goto(url)
  await page.waitForSelector('html[data-ready="true"]')
  const suffix = scale === 1 ? '' : `@${scale}x`
  const file = join(here, `duuk-whatsapp-capa${suffix}.png`)
  await page.locator('[data-export]').screenshot({ path: file, animations: 'disabled' })
  console.log(file.replace(`${root}/`, ''))
  await page.close()
}

await browser.close()
server.close()
