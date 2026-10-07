import { lazy, Suspense, useRef, useState } from "react";
import { useUnsavedChanges } from "../admin/unsavedChanges";
import { ConfirmModal, Icon, Modal } from "../admin/components";
import { Field } from "../admin/forms";
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
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const close = () => {
    if (!busy && !reading) {
      if (dirty) setDiscard(true);
      else onClose();
    }
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
  const totalBytes = attachments.reduce((sum, a) => sum + a.size, 0);
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
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || reading) return;
            if (!form.text.trim()) {
              setError("Escreva uma mensagem antes de enviar.");
              e.currentTarget.querySelector('[role="textbox"]')?.focus();
              return;
            }
            if (form.text.length > 50000 || form.html.length > 200000) {
              setError(
                "A mensagem é muito longa. Reduza o texto antes de enviar.",
              );
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
            <div className="mail-compose__sender">
              <span className="mail-avatar">D</span>
              <div>
                <strong>DUUK Films</strong>
                <span>{mailbox}</span>
              </div>
              <span className="mail-connection-dot" title="Caixa conectada" />
            </div>
            <fieldset
              disabled={busy || reading}
              className="mail-compose__fields"
            >
              <div className="mail-compose__to">
                <Field
                  label="Para"
                  value={form.to}
                  onChange={(v) => update("to", v)}
                  type="email"
                  multiple
                  required
                  maxLength={3000}
                  placeholder="cliente@empresa.com"
                />
                <div className="mail-compose__copies">
                  <button
                    type="button"
                    aria-pressed={ccOpen}
                    className="admin-text-button"
                    onClick={() => setCcOpen(!ccOpen || !!form.cc)}
                  >
                    Cc
                  </button>
                  <button
                    type="button"
                    aria-pressed={bccOpen}
                    className="admin-text-button"
                    onClick={() => setBccOpen(!bccOpen || !!form.bcc)}
                  >
                    Cco
                  </button>
                </div>
              </div>
              {ccOpen && (
                <Field
                  label="Cc · cópia"
                  value={form.cc}
                  onChange={(v) => update("cc", v)}
                  type="email"
                  multiple
                  maxLength={3000}
                  placeholder="E-mails separados por vírgula"
                />
              )}
              {bccOpen && (
                <Field
                  label="Cco · cópia oculta"
                  value={form.bcc}
                  onChange={(v) => update("bcc", v)}
                  type="email"
                  multiple
                  maxLength={3000}
                  placeholder="Estes destinatários ficam ocultos"
                />
              )}
              <Field
                label="Assunto"
                value={form.subject}
                onChange={(v) => update("subject", v)}
                required
                maxLength={250}
                placeholder="Sobre o que vamos conversar?"
              />
              {(clients.length > 0 || models.length > 0) && (
                <details className="mail-compose__options">
                  <summary>
                    <Icon name="document" /> Cliente e modelo de mensagem{" "}
                    <Icon name="down" />
                  </summary>
                  <div>
                    {clients.length > 0 && (
                      <Field label="Vincular a cliente">
                        <select
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
                          }}
                        >
                          <option value="">Sem vínculo</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {models.length > 0 && (
                      <Field label="Modelo de mensagem">
                        <select
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
                      </Field>
                    )}
                  </div>
                </details>
              )}
            </fieldset>
            <div className="mail-compose__message">
              <span className="admin-label">Mensagem</span>
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
                  disabled={busy || reading}
                  onChange={(html, text) =>
                    setForm((f) => ({ ...f, html, text }))
                  }
                />
              </Suspense>
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
                disabled={busy || reading}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <div className="mail-attachments__head">
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  disabled={busy || reading}
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
                        disabled={busy || reading}
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
                  disabled={busy || reading}
                  onClick={copyOriginals}
                >
                  Incluir {forward.attachments.length} anexo(s) da mensagem
                  original <Icon name="attachment" />
                </button>
              )}
            </div>
            {error && (
              <p className="admin-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="admin-modal__foot mail-compose__foot">
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={close}
              disabled={busy || reading}
            >
              <Icon name="trash" />
              Descartar
            </button>
            <button className="admin-button" disabled={busy || reading}>
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
