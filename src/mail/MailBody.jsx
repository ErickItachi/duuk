// HTML is sanitized on the server, then isolated again without scripts,
// forms, remote resources, same-origin access or navigation of the panel.
// The isolated document cannot read the Admin tokens, so it keeps a neutral light page.
export default function MailBody({ html, text }) {
  if (!html)
    return (
      <div className="mail-message">
        {text || "Esta mensagem não contém texto."}
      </div>
    );
  const document = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'"><style>*,*::before,*::after{box-sizing:border-box}html{color-scheme:light}body{margin:0;padding:24px;font:14px/1.7 Arial,sans-serif;color:#171717;background:#ffffff;overflow-wrap:anywhere;word-break:break-word}p,div{max-width:100%}p{margin:0 0 1em}a{color:#1d5fd1}table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse}td,th{padding:6px;overflow-wrap:anywhere}blockquote{margin:16px 0;padding:0 16px;border-left:3px solid #d4d4d4;color:#525252}h1,h2,h3,h4,h5,h6{line-height:1.3}ul,ol{padding-left:24px}pre{white-space:pre-wrap}@media(max-width:400px){body{padding:16px}}</style></head><body>${html}</body></html>`;
  return (
    <iframe
      className="mail-html-body"
      title="Conteúdo do e-mail"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={document}
    />
  );
}
