// Only the already sanitized HTML supplied by duuk-mail is embedded here.
// Sandbox and CSP remain independent of the sender's formatting.
function neutralColors(html) {
  return html.replace(/style="([^"]*)"/gi, (_, style) => `style="${style.replace(/(^|;)(\s*(?:color|background-color|border(?:-(?:top|right|bottom|left|color))?)\s*:\s*)([^;]+)/gi, (all, prefix, property, value) => {
    const adapted = value.replace(/rgba?\([\d.,\s]+\)|#[a-f\d]{3,8}\b|\b(?:white|black)\b/gi, c => {
      let key=c.toLowerCase(), channels, alpha=1
      if(key==='white')key='#ffffff';if(key==='black')key='#000000'
      if(/^#[a-f\d]{3}$/i.test(key))key='#'+[...key.slice(1)].map(v=>v+v).join('')
      if(/^#[a-f\d]{6}$/i.test(key))channels=[1,3,5].map(i=>parseInt(key.slice(i,i+2),16))
      else if(key.startsWith('rgb')){const nums=key.match(/[\d.]+/g)?.map(Number);if(nums?.length>=3){channels=nums.slice(0,3);alpha=nums[3]??1}}
      if(!channels||Math.max(...channels)-Math.min(...channels)>20)return c
      const light=channels.reduce((a,b)=>a+b,0)/3, prop=property.trim().split(':')[0]
      let variable
      if(prop==='background-color'&&light>235)variable='paper'
      else if(prop==='color'&&light<70)variable=alpha<.7?'muted':'ink'
      else if(prop==='color'&&light<150)variable='muted'
      else if(prop.startsWith('border')&&light>180)variable='rule'
      return variable?`var(--mail-${variable},${c})`:c
    })
    return prefix + property + adapted
  })}"`)
}

export function mailDocument(html, dark = false) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><style>
html{color-scheme:${dark ? 'dark' : 'light'};${dark ? '--mail-paper:#1b1b1b;--mail-ink:#dedede;--mail-muted:#a8a8a8;--mail-rule:#3c3c3c;' : ''}}
body{margin:0;padding:24px 16px;font:14px/1.6 Arial,sans-serif;color:${dark ? '#dedede' : '#202124'};background:${dark ? '#1b1b1b' : '#fff'};overflow-wrap:break-word}
table{max-width:100%;height:auto}td,th{word-break:normal}a{color:${dark ? '#8ab4f8' : '#1a73e8'}}
img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{margin-inline:12px;padding-left:12px;border-left:2px solid ${dark ? '#555' : '#ddd'}}
${dark ? '[bgcolor="#ffffff" i],[bgcolor="#fff" i],[bgcolor="white" i]{background-color:var(--mail-paper)}font[color="#000000" i],font[color="#202124" i],font[color="black" i]{color:var(--mail-ink)}' : ''}
@media(max-width:420px){body{padding:16px 8px}table[width]{width:auto;max-width:100%}td[width]{max-width:100%}}
</style></head><body>${neutralColors(html)}</body></html>`
}
