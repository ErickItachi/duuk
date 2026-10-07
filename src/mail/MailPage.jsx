import { useUnsavedChanges } from "../admin/unsavedChanges";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../content/AuthContext";
import { supabase } from "../content/supabase";
import { useQuery } from "../office/useQuery";
import { downloadFile } from "../office/model";
import { listClients } from "../crm/api";
import { fmtTime, timestamp, localInput } from "../crm/model";
import { addFollowup } from "../crm/api";
import { checked, mailRequest, rows } from "../admin/api";
import { ConfirmModal, Icon, Modal, RefreshButton } from "../admin/components";
import { Field, PageTitle, QueryState } from "../admin/forms";

const templates = () => rows("duuk_mail_templates", (q) => q.order("title"));
function TemplateEditor({ record, onClose, onSaved }) {
  const [form, setForm] = useState(
      record || { title: "", subject: "", body: "" },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useUnsavedChanges(true);
  return (
    <Modal
      title={record ? "Editar modelo" : "Novo modelo de mensagem"}
      onClose={() => !busy && onClose()}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const payload = {
              title: form.title,
              subject: form.subject,
              body: form.body,
            };
            checked(
              await (record
                ? supabase
                    .from("duuk_mail_templates")
                    .update(payload)
                    .eq("id", record.id)
                : supabase.from("duuk_mail_templates").insert(payload)),
            );
            await onSaved();
            onClose();
          } catch (cause) {
            setError(cause.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="admin-modal__body admin-form-grid">
          <Field
            label="Nome do modelo"
            value={form.title}
            onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            required
            maxLength={120}
          />
          <Field
            label="Assunto"
            value={form.subject}
            onChange={(v) => setForm((f) => ({ ...f, subject: v }))}
            required
            maxLength={250}
          />
          <Field label="Mensagem">
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={8}
              required
              maxLength={20000}
            />
          </Field>
          <small className="platform-muted">
            Use {"{nome}"} para personalizar com o nome do cliente.
          </small>
          {error && (
            <p className="admin-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="admin-modal__foot">
          <button className="admin-button" disabled={busy}>
            {busy ? "Salvando…" : "Salvar modelo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Composer({ clients, models, reply, clientId, onClose, onSent }) {
  const selectedClient = clients.find((c) => c.id === clientId);
  const [requestId] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
      to: reply?.from?.[0]?.address || selectedClient?.email || "",
      subject: reply ? `Re: ${reply.subject.replace(/^Re:\s*/i, "")}` : "",
      text: "",
      client_id: selectedClient?.id || "",
    }),
    [attachments, setAttachments] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useUnsavedChanges(true);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const files = async (e) => {
    const selected = Array.from(e.target.files);
    if (
      selected.length > 5 ||
      selected.reduce((sum, f) => sum + f.size, 0) > 5000000
    ) {
      setError("Escolha até 5 anexos, total máximo de 5 MB.");
      return;
    }
    try {
      const output = await Promise.all(
        selected.map(
          (file) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  name: file.name,
                  base64: reader.result.split(",")[1],
                  size: file.size,
                });
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }),
        ),
      );
      setAttachments(output);
      setError("");
    } catch {
      setError("Não foi possível ler os anexos.");
    }
  };
  return (
    <Modal
      title={reply ? "Responder conversa" : "Novo e-mail"}
      subtitle="contato@duukfilms.com · GoDaddy"
      onClose={() => !busy && onClose()}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await mailRequest({
              action: "send",
              request_id: requestId,
              ...form,
              attachments: attachments.map(({ name, base64 }) => ({
                name,
                base64,
              })),
              in_reply_to: reply?.message_id,
            });
            await onSent();
            onClose();
          } catch (cause) {
            setError(cause.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="admin-modal__body admin-form-grid">
          {clients.length > 0 && (
            <Field label="Vincular a cliente">
              <select
                value={form.client_id}
                onChange={(e) => {
                  const c = clients.find((c) => c.id === e.target.value);
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
          <Field label="Modelo de mensagem">
            <select
              defaultValue=""
              onChange={(e) => {
                const t = models.find((t) => t.id === e.target.value),
                  c = clients.find((c) => c.id === form.client_id);
                if (t)
                  setForm((f) => ({
                    ...f,
                    subject: t.subject.replaceAll("{nome}", c?.name || ""),
                    text: t.body.replaceAll("{nome}", c?.name || ""),
                  }));
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
          <Field
            label="Para"
            value={form.to}
            onChange={(v) => update("to", v)}
            type="email"
            required
            maxLength={254}
          />
          <Field
            label="Assunto"
            value={form.subject}
            onChange={(v) => update("subject", v)}
            required
            maxLength={250}
          />
          <Field label="Mensagem">
            <textarea
              value={form.text}
              onChange={(e) => update("text", e.target.value)}
              required
              rows={10}
              maxLength={50000}
            />
          </Field>
          <Field label="Anexos · até 5 MB no total">
            <input type="file" multiple onChange={files} disabled={busy} />
          </Field>
          {attachments.length > 0 && (
            <p className="platform-muted">
              {attachments.map((a) => a.name).join(" · ")}
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
          <button className="admin-button" disabled={busy}>
            <Icon
              name={busy ? "refresh" : "send"}
              className={busy ? "is-spinning" : ""}
            />
            {busy ? "Enviando…" : "Enviar e-mail"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function MessageView({
  message,
  clients,
  onClose,
  onReply,
  notify,
  userId,
  canFollowup,
}) {
  const query = useQuery(
      useCallback(
        () => mailRequest({ action: "read", uid: message.uid }),
        [message.uid],
      ),
    ),
    [clientId, setClientId] = useState(""),
    [due, setDue] = useState(localInput()),
    [busy, setBusy] = useState(false);
  const download = async (a) => {
    try {
      const data = await mailRequest({
        action: "attachment",
        uid: message.uid,
        index: a.index,
      });
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      downloadFile(
        new Blob([bytes], { type: "application/octet-stream" }),
        data.name,
      );
    } catch (cause) {
      notify(cause.message, true);
    }
  };
  return (
    <Modal
      title={message.subject}
      subtitle={fmtTime(message.date)}
      onClose={onClose}
      wide
    >
      <div className="admin-modal__body">
        <QueryState query={query}>
          {query.data && (
            <>
              <p className="platform-muted">
                De:{" "}
                {query.data.from
                  ?.map((a) => `${a.name || ""} <${a.address}>`)
                  .join(", ")}
              </p>
              <pre className="mail-message">{query.data.text}</pre>
              {query.data.attachments?.map((a) => (
                <button
                  key={a.index}
                  className="admin-button admin-button--secondary"
                  onClick={() => download(a)}
                >
                  <Icon name="download" />
                  {a.name} · {Math.round(a.size / 1024)} KB
                </button>
              ))}
            </>
          )}
        </QueryState>
        {clients.length > 0 && (
          <div className="mail-associate">
            <Field label="Relacionar ao cliente">
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Selecionar cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="admin-button admin-button--secondary"
              disabled={!clientId || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await mailRequest({
                    action: "associate",
                    uid: message.uid,
                    client_id: clientId,
                  });
                  notify("Mensagem vinculada ao cliente.");
                } catch (cause) {
                  notify(cause.message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Icon name="link" />
              Vincular mensagem
            </button>
            {canFollowup && (
              <>
                <Field
                  label="Agendar follow-up"
                  type="datetime-local"
                  value={due}
                  onChange={setDue}
                />
                <button
                  className="admin-button admin-button--secondary"
                  disabled={!clientId || !due || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await addFollowup({
                        client_id: clientId,
                        owner_id: userId,
                        due_at: timestamp(due),
                        notes: `Responder conversa: ${message.subject}`,
                      });
                      notify("Follow-up agendado.");
                    } catch (cause) {
                      notify(cause.message, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Icon name="clock" />
                  Agendar
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="admin-modal__foot">
        <a
          href="https://email.godaddy.com"
          target="_blank"
          rel="noreferrer"
          className="admin-text-button"
        >
          Abrir webmail
          <Icon name="arrow" />
        </a>
        <button
          className="admin-button"
          disabled={!query.data}
          onClick={() => onReply(query.data)}
        >
          <Icon name="mail" />
          Responder
        </button>
      </div>
    </Modal>
  );
}
export default function MailPage({ notify }) {
  const [params] = useSearchParams();
  const auth = useAuth(),
    canUseCrm = auth.hasPermission("crm"),
    status = useQuery(useCallback(() => mailRequest({ action: "status" }), [])),
    models = useQuery(useCallback(() => templates(), [])),
    clients = useQuery(
      useCallback(
        () => (canUseCrm ? listClients() : Promise.resolve([])),
        [canUseCrm],
      ),
    );
  const [search, setSearch] = useState(""),
    [submittedSearch, setSubmittedSearch] = useState(""),
    [tab, setTab] = useState("inbox"),
    [compose, setCompose] = useState(() =>
      params.get("compor") === "1" ? { clientId: params.get("cliente") } : null,
    ),
    [opened, setOpened] = useState(() =>
      /^[1-9][0-9]*$/.test(params.get("mensagem") || "")
        ? { uid: Number(params.get("mensagem")), subject: "Conversa GoDaddy" }
        : null,
    ),
    [edit, setEdit] = useState(null),
    [deleting, setDeleting] = useState(null);
  const inbox = useQuery(
    useCallback(
      () =>
        status.data?.configured
          ? mailRequest({ action: "list", search: submittedSearch })
          : Promise.resolve({ messages: [] }),
      [status.data?.configured, submittedSearch],
    ),
  );
  return (
    <>
      <PageTitle
        eyebrow="DUUK / COMERCIAL"
        title="E-mails"
        description="Conversas da DUUK, conectadas aos seus clientes."
      >
        <RefreshButton
          onRefresh={async () => {
            await status.reload();
            if (status.data?.configured) await inbox.reload();
          }}
        />
        <button
          className="admin-button"
          disabled={!status.data?.configured}
          onClick={() => setCompose({})}
        >
          <Icon name="plus" />
          Novo e-mail
        </button>
      </PageTitle>
      <div className="admin-filter-tabs">
        <button
          className={tab === "inbox" ? "is-active" : ""}
          onClick={() => setTab("inbox")}
        >
          Caixa de entrada
        </button>
        <button
          className={tab === "templates" ? "is-active" : ""}
          onClick={() => setTab("templates")}
        >
          Modelos de mensagem
        </button>
      </div>
      {tab === "inbox" ? (
        <QueryState query={status}>
          {status.data && !status.data.configured ? (
            <section className="admin-panel mail-connection">
              <span className="office-shortcut-icon">
                <Icon name="mail" size={24} />
              </span>
              <h2>Sua caixa GoDaddy, aqui.</h2>
              <p>
                A integração IMAP/SMTP está preparada. Para conectar a caixa
                real de contato@duukfilms.com, falta configurar a credencial do
                provedor com segurança no servidor.
              </p>
              <span className="office-badge is-pending">
                Aguardando conexão
              </span>
              <a
                className="admin-button admin-button--secondary"
                href="https://email.godaddy.com"
                target="_blank"
                rel="noreferrer"
              >
                Abrir meu webmail
                <Icon name="arrow" />
              </a>
            </section>
          ) : (
            <section className="admin-panel">
              <form
                className="admin-list-toolbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmittedSearch(search);
                }}
              >
                <label className="admin-search">
                  <Icon name="search" />
                  <input
                    aria-label="Pesquisar e-mails"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Pesquisar na caixa…"
                  />
                </label>
                <button className="admin-button admin-button--secondary">
                  Pesquisar
                </button>
              </form>
              <QueryState query={inbox}>
                <div className="platform-list">
                  {inbox.data?.messages.map((m) => (
                    <button
                      key={m.uid}
                      className={`platform-row mail-row${m.unread ? " is-unread" : ""}`}
                      onClick={() => setOpened(m)}
                    >
                      <Icon name="mail" />
                      <div className="platform-row__main">
                        <h2>{m.subject}</h2>
                        <p>
                          {m.from?.map((a) => a.name || a.address).join(", ")}
                        </p>
                      </div>
                      <small>{fmtTime(m.date)}</small>
                      {m.unread && <span className="mail-unread-dot" />}
                    </button>
                  ))}
                  {inbox.data?.messages.length === 0 && (
                    <div className="admin-empty">
                      <p>Nenhuma mensagem encontrada.</p>
                    </div>
                  )}
                  {inbox.data?.more && (
                    <p className="platform-muted mail-more">
                      Mostrando as 50 mensagens mais recentes. Use a pesquisa
                      para encontrar mensagens anteriores.
                    </p>
                  )}
                </div>
              </QueryState>
            </section>
          )}
        </QueryState>
      ) : (
        <>
          <div className="crm-toolbar">
            <p className="platform-muted">
              Personalize com {"{nome}"}. Envio individual, pelo composer.
            </p>
            <button
              className="admin-button admin-button--secondary"
              onClick={() => setEdit("new")}
            >
              <Icon name="plus" />
              Novo modelo
            </button>
          </div>
          <QueryState query={models}>
            <section className="admin-panel platform-list">
              {models.data?.map((t) => (
                <article className="platform-row" key={t.id}>
                  <Icon name="document" />
                  <div className="platform-row__main">
                    <h2>{t.title}</h2>
                    <p>{t.subject}</p>
                  </div>
                  <button
                    className="admin-icon-button"
                    aria-label={`Editar modelo ${t.title}`}
                    onClick={() => setEdit(t)}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    className="admin-icon-button"
                    aria-label={`Excluir modelo ${t.title}`}
                    onClick={() => setDeleting(t)}
                  >
                    <Icon name="trash" />
                  </button>
                </article>
              ))}
            </section>
          </QueryState>
        </>
      )}
      {compose && clients.data && models.data && (
        <Composer
          clientId={compose.clientId}
          clients={clients.data || []}
          models={models.data || []}
          reply={compose.reply}
          onClose={() => setCompose(null)}
          onSent={async () => {
            notify("E-mail enviado pela GoDaddy.");
            await inbox.reload();
          }}
        />
      )}
      {opened && (
        <MessageView
          canFollowup={auth.hasPermission("crm.followups")}
          message={opened}
          clients={clients.data || []}
          userId={auth.user.id}
          notify={notify}
          onClose={() => {
            setOpened(null);
            inbox.reload();
          }}
          onReply={(reply) => {
            setOpened(null);
            setCompose({ reply });
          }}
        />
      )}
      {edit && (
        <TemplateEditor
          record={edit === "new" ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={async () => {
            await models.reload();
            notify("Modelo salvo.");
          }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Excluir modelo?"
          message={`Excluir o modelo ${deleting.title}?`}
          action="Excluir modelo"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            checked(
              await supabase
                .from("duuk_mail_templates")
                .delete()
                .eq("id", deleting.id),
            );
            await models.reload();
          }}
        />
      )}
    </>
  );
}
