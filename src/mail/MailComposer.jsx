import { lazy, Suspense, useId, useRef, useState } from "react";
import { useUnsavedChanges } from "../admin/unsavedChanges";
import { ConfirmModal, Icon, Modal } from "../admin/components";
import { ErrorState, FieldError } from "../admin/forms";
import { mailRequest } from "../admin/api";
import {
  addressLabel,
  fileSize,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  textToHtml,
} from "./model";

const mailbox = "contato@duukfilms.com";
const RichTextEditor = lazy(() => import("./RichTextEditor"));

// The same address rules the mail function applies before sending.
const addressPattern = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const addressList = (value) => value.split(/[,;]/).map((item) => item.trim());
function recipientError(value, required) {
  if (!value) return required ? "Informe o destinatário." : "";
  if (value.length > 3000 || /[\r\n]/.test(value))
    return "Use até 3.000 caracteres nos endereços.";
  if (addressList(value).some((item) => item.length > 254 || !addressPattern.test(item)))
    return "Confira os e-mails. Use endereços completos, separados por vírgula.";
  return "";
}
const recipientCount = (value) => (value ? new Set(addressList(value)).size : 0);

export default function MailComposer({
  clients,
  models,
  reply,
  forward,
  replyAll,
  clientId,
  onClose,
  onSent,
}) {
  const uid = useId();
  const selectedClient = clients.find((c) => c.id === clientId),
    original = forward || reply;
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState(() => {
    const to = reply
      ? (reply.folder === "sent"
          ? reply.to
          : reply.reply_to?.length
            ? reply.reply_to
            : reply.from) || []
      : [];
    const cc = replyAll
      ? [...(reply.to || []), ...(reply.cc || [])].filter(
          (a) =>
            a.address !== mailbox && !to.some((t) => t.address === a.address),
        )
      : [];
    const text = forward
      ? `\n\n---------- Mensagem encaminhada ----------\nDe: ${addressLabel(forward.from)}\nPara: ${addressLabel(forward.to)}\nAssunto: ${forward.subject}\n\n${forward.text || ""}`
      : "";
    return {
      to: reply
        ? to.map((a) => a.address).join(", ")
        : selectedClient?.email || "",
      cc: [...new Set(cc.map((a) => a.address))].join(", "),
      bcc: "",
      subject: original
        ? `${forward ? "Enc: " : "Re: "}${original.subject.replace(/^(Re|Enc|Fwd):\s*/i, "")}`
        : "",
      text,
      html: textToHtml(text),
      client_id: selectedClient?.id || "",
    };
  });
  const [attachments, setAttachments] = useState([]),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({}),
    [ccOpen, setCcOpen] = useState(!!form.cc),
    [bccOpen, setBccOpen] = useState(false),
    [dragging, setDragging] = useState(false),
    [discard, setDiscard] = useState(false),
    [copiedOriginals, setCopiedOriginals] = useState(false);
  const fileInput = useRef(null),
    processing = useRef(false);
  const dirty = !!(
    form.to ||
    form.cc ||
    form.bcc ||
    form.subject ||
    form.text.trim() ||
    attachments.length
  );
  useUnsavedChanges(dirty || busy || reading);
  const clearError = (key) =>
    setErrors((old) => (old[key] ? { ...old, [key]: "" } : old));
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  };
  const close = () => {
    if (!busy && !reading) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  };
  // Enter moves to the next field instead of sending the message by accident.
  const nextField = (event) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const fields = [
      ...event.currentTarget.form.querySelectorAll(
        '[data-compose-field], [role="textbox"]',
      ),
    ];
    fields[fields.indexOf(event.currentTarget) + 1]?.focus();
  };
  const addFiles = async (selected) => {
    if (processing.current || busy || !selected.length) return;
    if (
      attachments.length + selected.length > MAX_ATTACHMENTS ||
      [...attachments, ...selected].reduce((sum, f) => sum + f.size, 0) >
        MAX_ATTACHMENT_BYTES
    ) {
      setError("Escolha até 5 anexos, com no máximo 5 MB no total.");
      return;
    }
    if (selected.some((f) => f.name.length > 160)) {
      setError(
        "Um nome de arquivo é muito longo. Renomeie para até 160 caracteres.",
      );
      return;
    }
    processing.current = true;
    setReading(true);
    setError("");
    try {
      const output = await Promise.all(
        selected.map(
          (file) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  type: file.type,
                  base64: reader.result.split(",")[1],
                  size: file.size,
                });
              reader.onerror = () =>
                reject(new Error("Não foi possível ler os anexos."));
              reader.readAsDataURL(file);
            }),
        ),
      );
      setAttachments((current) => [...current, ...output]);
    } catch (cause) {
      setError(cause.message);
    } finally {
      processing.current = false;
      setReading(false);
    }
  };
  const copyOriginals = async () => {
    const originals = forward.attachments;
    if (processing.current || busy) return;
    if (
      attachments.length + originals.length > MAX_ATTACHMENTS ||
      [...attachments, ...originals].reduce((sum, a) => sum + a.size, 0) >
        MAX_ATTACHMENT_BYTES
    ) {
      setError(
        "Os anexos originais ultrapassam o limite de 5 arquivos ou 5 MB. Baixe e escolha os arquivos que deseja encaminhar.",
      );
      return;
    }
    processing.current = true;
    setReading(true);
    setError("");
    try {
      const copied = await Promise.all(
        originals.map(async (a) => {
          const data = await mailRequest({
            action: "attachment",
            uid: forward.uid,
            folder: forward.folder,
            index: a.index,
          });
          return {
            id: crypto.randomUUID(),
            name: data.name,
            base64: data.base64,
            type: a.type,
            size: a.size,
          };
        }),
      );
      setAttachments((current) => [...current, ...copied]);
      setCopiedOriginals(true);
    } catch (cause) {
      setError(cause.message);
    } finally {
      processing.current = false;
      setReading(false);
    }
  };
  const validate = () => {
    const found = {
      to: recipientError(form.to, true),
      cc: recipientError(form.cc, false),
      bcc: recipientError(form.bcc, false),
      subject: form.subject.trim() ? "" : "Informe o assunto.",
      text: !form.text.trim()
        ? "Escreva uma mensagem antes de enviar."
        : form.text.length > 50000 || form.html.length > 200000
          ? "A mensagem é muito longa. Reduza o texto antes de enviar."
          : "",
    };
    if (
      !found.to &&
      !found.cc &&
      !found.bcc &&
      recipientCount(form.to) + recipientCount(form.cc) + recipientCount(form.bcc) > 20
    )
      found.to = "Use até 20 destinatários por mensagem, somando Para, Cc e Cco.";
    return found;
  };
  const totalBytes = attachments.reduce((sum, a) => sum + a.size, 0);
  const locked = busy || reading;
  const row = (key, label, props) => (
    <>
      <div className={`mail-compose__row${errors[key] ? " is-invalid" : ""}`}>
        <label htmlFor={`${uid}-${key}`}>{label}</label>
        <input
          id={`${uid}-${key}`}
          name={key}
          data-compose-field
          value={form[key]}
          onChange={(e) => update(key, e.target.value)}
          onKeyDown={nextField}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errors[key] ? `${uid}-${key}-error` : undefined}
          enterKeyHint="next"
          {...props}
        />
        {key === "to" && (
          <div className="mail-compose__copies">
            <button
              type="button"
              aria-pressed={ccOpen}
              aria-label="Cópia (Cc)"
              onClick={() => setCcOpen(!ccOpen || !!form.cc)}
            >
              Cc
            </button>
            <button
              type="button"
              aria-pressed={bccOpen}
              aria-label="Cópia oculta (Cco)"
              onClick={() => setBccOpen(!bccOpen || !!form.bcc)}
            >
              Cco
            </button>
          </div>
        )}
      </div>
      <FieldError id={`${uid}-${key}-error`}>{errors[key]}</FieldError>
    </>
  );
  return (
    <>
      <Modal
        title={
          forward
            ? "Encaminhar e-mail"
            : reply
              ? "Responder e-mail"
              : "Novo e-mail"
        }
        subtitle="Uma nova conversa, com a assinatura da DUUK."
        onClose={close}
        wide
      >
        <form
          className="mail-compose"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || reading) return;
            const found = validate();
            setErrors(found);
            const first = ["to", "cc", "bcc", "subject", "text"].find(
              (key) => found[key],
            );
            if (first) {
              if (first === "cc") setCcOpen(true);
              if (first === "bcc") setBccOpen(true);
              const target =
                first === "text"
                  ? e.currentTarget.querySelector('[role="textbox"]')
                  : e.currentTarget.querySelector(`[name="${first}"]`);
              target?.focus();
              return;
            }
            setBusy(true);
            setError("");
            try {
              const result = await mailRequest({
                action: "send",
                request_id: requestId,
                ...form,
                attachments: attachments.map(({ name, base64, type }) => ({
                  name,
                  base64,
                  type,
                })),
                in_reply_to: reply?.message_id,
              });
              onClose();
              onSent(result);
            } catch (cause) {
              setError(cause.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="admin-modal__body mail-compose__body">
            <fieldset disabled={locked} className="mail-compose__envelope">
              <legend className="ds-visually-hidden">Destinatários e assunto</legend>
              <div className="mail-compose__row mail-compose__from">
                <span className="mail-compose__label">De</span>
                <span className="mail-compose__sender">
                  <strong>DUUK Films</strong>
                  <span>{mailbox}</span>
                </span>
                <span className="mail-status-dot is-on" title="Caixa conectada" aria-hidden="true" />
              </div>
              {row("to", "Para", {
                type: "email",
                multiple: true,
                required: true,
                maxLength: 3000,
                autoComplete: "off",
                placeholder: "cliente@empresa.com",
              })}
              {ccOpen &&
                row("cc", "Cc", {
                  type: "email",
                  multiple: true,
                  maxLength: 3000,
                  autoComplete: "off",
                  placeholder: "E-mails separados por vírgula",
                })}
              {bccOpen &&
                row("bcc", "Cco", {
                  type: "email",
                  multiple: true,
                  maxLength: 3000,
                  autoComplete: "off",
                  placeholder: "Estes destinatários ficam ocultos",
                })}
              {row("subject", "Assunto", {
                required: true,
                maxLength: 250,
                autoComplete: "off",
                placeholder: "Sobre o que vamos conversar?",
              })}
            </fieldset>
            {(clients.length > 0 || models.length > 0) && (
              <details className="mail-compose__options">
                <summary>
                  <Icon name="document" />
                  <span>Cliente e modelo de mensagem</span>
                  <Icon name="down" size={16} />
                </summary>
                <fieldset disabled={locked}>
                  <legend className="ds-visually-hidden">Cliente e modelo de mensagem</legend>
                  {clients.length > 0 && (
                    <div className="admin-field">
                      <label className="admin-label" htmlFor={`${uid}-client`}>
                        Vincular a cliente
                      </label>
                      <select
                        id={`${uid}-client`}
                        value={form.client_id}
                        onChange={(e) => {
                          const c = clients.find(
                            (item) => item.id === e.target.value,
                          );
                          setForm((f) => ({
                            ...f,
                            client_id: c?.id || "",
                            to: c?.email || f.to,
                          }));
                          clearError("to");
                        }}
                      >
                        <option value="">Sem vínculo</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {models.length > 0 && (
                    <div className="admin-field">
                      <label className="admin-label" htmlFor={`${uid}-model`}>
                        Modelo de mensagem
                      </label>
                      <select
                        id={`${uid}-model`}
                        defaultValue=""
                        onChange={(e) => {
                          const t = models.find(
                              (item) => item.id === e.target.value,
                            ),
                            c = clients.find(
                              (item) => item.id === form.client_id,
                            );
                          if (t) {
                            const text = t.body.replaceAll(
                              "{nome}",
                              c?.name || "",
                            );
                            setForm((f) => ({
                              ...f,
                              subject: t.subject.replaceAll(
                                "{nome}",
                                c?.name || "",
                              ),
                              text,
                              html: textToHtml(text),
                            }));
                            setErrors((old) => ({ ...old, subject: "", text: "" }));
                          }
                        }}
                      >
                        <option value="">Escrever mensagem</option>
                        {models.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </fieldset>
              </details>
            )}
            <div className="mail-compose__message">
              <span className="admin-label" id={`${uid}-message`}>
                Mensagem
              </span>
              <Suspense
                fallback={
                  <div
                    className="mail-editor mail-editor--loading"
                    role="status"
                  >
                    Preparando o editor…
                  </div>
                }
              >
                <RichTextEditor
                  value={form.html}
                  disabled={locked}
                  invalid={!!errors.text}
                  describedBy={errors.text ? `${uid}-text-error` : undefined}
                  onChange={(html, text) => {
                    setForm((f) => ({ ...f, html, text }));
                    clearError("text");
                  }}
                />
              </Suspense>
              <FieldError id={`${uid}-text-error`}>{errors.text}</FieldError>
            </div>
            <div
              className={`mail-attachments${dragging ? " is-dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy && !reading) setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget))
                  setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                aria-label="Selecionar anexos"
                disabled={locked}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <div className="mail-attachments__head">
                <button
                  type="button"
                  className="admin-button admin-button--secondary admin-button--sm"
                  disabled={locked}
                  aria-busy={reading}
                  onClick={() => fileInput.current.click()}
                >
                  <Icon name="attachment" />
                  {reading ? "Preparando anexos…" : "Anexar arquivos"}
                </button>
                <small>
                  {attachments.length
                    ? `${attachments.length}/5 arquivos · ${fileSize(totalBytes)} de 5 MB`
                    : "Arraste arquivos aqui · até 5 anexos / 5 MB"}
                </small>
              </div>
              {attachments.length > 0 && (
                <ul className="mail-attachment-list">
                  {attachments.map((a) => (
                    <li key={a.id}>
                      <Icon name="file" />
                      <div>
                        <strong>{a.name}</strong>
                        <small>{fileSize(a.size)}</small>
                      </div>
                      <button
                        type="button"
                        className="admin-icon-button"
                        aria-label={`Remover ${a.name}`}
                        title="Remover anexo"
                        disabled={locked}
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter((item) => item.id !== a.id),
                          )
                        }
                      >
                        <Icon name="close" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!!forward?.attachments?.length && !copiedOriginals && (
                <button
                  type="button"
                  className="admin-text-button"
                  disabled={locked}
                  onClick={copyOriginals}
                >
                  <Icon name="attachment" />
                  Incluir {forward.attachments.length} anexo(s) da mensagem
                  original
                </button>
              )}
            </div>
            {error && <ErrorState>{error}</ErrorState>}
          </div>
          <div className="admin-modal__foot mail-compose__foot">
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={close}
              disabled={locked}
            >
              <Icon name="trash" />
              Descartar
            </button>
            <button className="admin-button" disabled={locked} aria-busy={busy}>
              <Icon
                name={busy ? "refresh" : "send"}
                className={busy ? "is-spinning" : ""}
              />
              {busy ? "Enviando…" : "Enviar e-mail"}
            </button>
          </div>
        </form>
      </Modal>
      {discard && (
        <ConfirmModal
          title="Descartar mensagem?"
          message="O texto e os anexos desta mensagem serão descartados."
          action="Descartar"
          onClose={() => setDiscard(false)}
          onConfirm={onClose}
        />
      )}
    </>
  );
}
