import { useState } from 'react';
import { useAdminTheme } from '../admin/themeContext.mjs';
import { mailDocument } from './mailDocument.mjs';

// Sender markup never shares the Admin DOM, scripts, origin or remote resources.
export default function MailBody({ html, text }) {
  const { theme } = useAdminTheme();
  const [original, setOriginal] = useState(false);
  if (!html)
    return (
      <div className="mail-message">
        {text || "Esta mensagem não contém texto."}
      </div>
    );
  return (
    <div className="mail-content">
      <div className="mail-content__appearance">
        <button type="button" aria-pressed={original} onClick={() => setOriginal(value => !value)}>
          {original ? 'Usar tema do painel' : 'Visual original'}
        </button>
      </div>
    <iframe
      className="mail-html-body"
      title="Conteúdo do e-mail"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={mailDocument(html, !original && theme === 'dark')}
    />
    </div>
  );
}
