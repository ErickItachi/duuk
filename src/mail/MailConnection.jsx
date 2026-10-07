import { useState } from "react";
import { mailRequest } from "../admin/api";
import { Icon, Modal } from "../admin/components";
import { useUnsavedChanges } from "../admin/unsavedChanges";

export default function MailConnection({ onClose, onConnected }) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useUnsavedChanges(!!password || busy);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await mailRequest({ action: "connect", password });
      setPassword("");
      onConnected();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Conectar e-mail Titan"
      subtitle="contato@duukfilms.com · GoDaddy"
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit}>
        <div className="admin-modal__body mail-connect-form">
          <p className="platform-muted">
            Use a senha da caixa de e-mail, que pode ser diferente da senha
            deste painel.
          </p>
          <label className="admin-field" htmlFor="titan-mailbox-password">
            <span>Senha da caixa Titan</span>
            <span className="admin-password">
              <input
                id="titan-mailbox-password"
                name="titan-mailbox-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                maxLength={1024}
                disabled={busy}
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby="titan-password-help"
              />
              <button
                className="admin-icon-button"
                type="button"
                aria-label={
                  show ? "Ocultar senha da caixa" : "Mostrar senha da caixa"
                }
                onClick={() => setShow(!show)}
                disabled={busy}
              >
                <Icon name={show ? "eyeOff" : "eye"} />
              </button>
            </span>
          </label>
          <small id="titan-password-help" className="platform-muted">
            A senha fica criptografada no servidor. Vamos validar o recebimento
            e o envio antes de concluir.
          </small>
          <p className="platform-muted">
            Se o Titan pedir, habilite o acesso por outros aplicativos no
            webmail. Com autenticação em duas etapas, use uma senha de
            aplicativo.
          </p>
          <a
            className="admin-text-button"
            href="https://support.titan.email/hc/en-us/articles/900000573066-How-to-configure-IMAP-for-Android"
            target="_blank"
            rel="noreferrer"
          >
            Ajuda do Titan <Icon name="arrow" />
          </a>
          {busy && (
            <p className="mail-connect-progress" role="status">
              <Icon name="refresh" className="is-spinning" />
              Validando entrada e envio…
            </p>
          )}
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="admin-modal__foot">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="admin-button" disabled={busy || !password}>
            <Icon name="mail" />
            {busy ? "Conectando…" : "Conectar caixa"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
