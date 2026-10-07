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
import { Field, LoadingPanel, PageTitle, QueryState } from "../admin/forms";
import MailConnection from "./MailConnection";
import MailComposer from "./MailComposer";
import MailBody from "./MailBody";
import { addressLabel, fileSize } from "./model";
import "./mail.css";

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
function MessageView({
  message,
  clients,
  onClose,
  onReply,
  onForward,
  notify,
  userId,
  canFollowup,
}) {
  const query = useQuery(
      useCallback(
        () =>
          mailRequest({
            action: "read",
            uid: message.uid,
            folder: message.folder,
          }),
        [message.uid, message.folder],
      ),
    ),
    [clientId, setClientId] = useState(""),
    [due, setDue] = useState(localInput()),
    [busy, setBusy] = useState(false),
    [downloading, setDownloading] = useState(null);
  const download = async (a) => {
    setDownloading(a.index);
    try {
      const data = await mailRequest({
        action: "attachment",
        uid: message.uid,
        folder: message.folder,
        index: a.index,
      });
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      downloadFile(
        new Blob([bytes], { type: "application/octet-stream" }),
        data.name,
      );
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setDownloading(null);
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
              <div className="mail-message-header">
                <span className="mail-avatar">
                  {(
                    query.data.from?.[0]?.name ||
                    query.data.from?.[0]?.address ||
                    "E"
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div>
                  <strong>
                    {query.data.from?.[0]?.name ||
                      query.data.from?.[0]?.address ||
                      "Remetente"}
                  </strong>
                  <span>{query.data.from?.[0]?.address}</span>
                </div>
                <button
                  type="button"
                  className="admin-icon-button"
                  title="Marcar como não lida"
                  aria-label="Marcar como não lida"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await mailRequest({
                        action: "flag",
                        uid: message.uid,
                        folder: message.folder,
                        read: false,
                      });
                      notify("Mensagem marcada como não lida.");
                      onClose();
                    } catch (cause) {
                      notify(cause.message, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Icon name="mail" />
                </button>
              </div>
              <details className="mail-message-details">
                <summary>
                  Para {addressLabel(query.data.to)} <Icon name="down" />
                </summary>
                <p>
                  <strong>De:</strong> {addressLabel(query.data.from)}
                </p>
                <p>
                  <strong>Para:</strong> {addressLabel(query.data.to)}
                </p>
                {!!query.data.cc?.length && (
                  <p>
                    <strong>Cc:</strong> {addressLabel(query.data.cc)}
                  </p>
                )}
                <p>{fmtTime(query.data.date)}</p>
              </details>
              <MailBody html={query.data.html} text={query.data.text} />
              {query.data.remote_images_blocked && (
                <small className="mail-privacy-note">
                  <Icon name="shield" />
                  Imagens externas ficam bloqueadas para preservar sua
                  privacidade.
                </small>
              )}
              {!!query.data.attachments?.length && (
                <div className="mail-received-attachments">
                  <h3>
                    <Icon name="attachment" />
                    {query.data.attachments.length} anexo(s)
                  </h3>
                  {query.data.attachments.map((a) => (
                    <button
                      key={a.index}
                      className="mail-file-card"
                      disabled={downloading !== null}
                      onClick={() => download(a)}
                    >
                      <Icon name="file" size={22} />
                      <span>
                        <strong>{a.name}</strong>
                        <small>
                          {downloading === a.index
                            ? "Baixando…"
                            : fileSize(a.size)}
                        </small>
                      </span>
                      <Icon name="download" />
                    </button>
                  ))}
                </div>
              )}
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
                    folder: message.folder,
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
      <div className="admin-modal__foot mail-message-actions">
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
          className="admin-button admin-button--secondary"
          disabled={!query.data}
          onClick={() => onForward(query.data)}
        >
          <Icon name="forward" />
          Encaminhar
        </button>
        {!!query.data?.cc?.length || query.data?.to?.length > 1 ? (
          <button
            className="admin-button admin-button--secondary"
            disabled={!query.data}
            onClick={() => onReply(query.data, true)}
          >
            <Icon name="replyAll" />
            Responder a todos
          </button>
        ) : null}
        <button
          className="admin-button"
          disabled={!query.data}
          onClick={() => onReply(query.data)}
        >
          <Icon name="reply" />
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
    [unreadOnly, setUnreadOnly] = useState(false),
    [compose, setCompose] = useState(() =>
      params.get("compor") === "1" ? { clientId: params.get("cliente") } : null,
    ),
    [opened, setOpened] = useState(() =>
      /^[1-9][0-9]*$/.test(params.get("mensagem") || "")
        ? { uid: Number(params.get("mensagem")), subject: "Conversa Titan" }
        : null,
    ),
    [edit, setEdit] = useState(null),
    [deleting, setDeleting] = useState(null),
    [connecting, setConnecting] = useState(false);
  const folder = tab === "sent" ? "sent" : "inbox";
  const inbox = useQuery(
    useCallback(
      async () =>
        status.data?.configured
          ? {
              ...(await mailRequest({
                action: "list",
                folder,
                search: submittedSearch,
                unread_only: unreadOnly,
              })),
              folder,
              unreadOnly,
            }
          : { messages: [], folder, unreadOnly },
      [status.data?.configured, submittedSearch, folder, unreadOnly],
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
            const result = await status.reload();
            if (result.failed) return result;
            if (tab === "templates") return models.reload();
            if (status.data?.configured && result.configured)
              return inbox.reload();
          }}
        />
        {status.data?.configured && status.data.can_configure && (
          <button
            className="admin-button admin-button--secondary"
            onClick={() => setConnecting(true)}
          >
            <Icon name="settings" />
            Gerenciar conexão
          </button>
        )}
        <button
          className="admin-button"
          disabled={!status.data?.configured}
          onClick={() => setCompose({})}
        >
          <Icon name="plus" />
          Novo e-mail
        </button>
      </PageTitle>
      <div className="mail-workspace">
        <aside className="mail-folders">
          <div className="mail-folders__account">
            <span className="mail-avatar">D</span>
            <div>
              <strong>DUUK Films</strong>
              <span>contato@duukfilms.com</span>
            </div>
          </div>
          <nav aria-label="Pastas de e-mail">
            <button
              className={tab === "inbox" && !unreadOnly ? "is-active" : ""}
              aria-current={tab === "inbox" && !unreadOnly ? "page" : undefined}
              onClick={() => {
                setTab("inbox");
                setUnreadOnly(false);
              }}
            >
              <Icon name="inbox" />
              <span>Caixa de entrada</span>
            </button>
            <button
              className={tab === "inbox" && unreadOnly ? "is-active" : ""}
              aria-current={tab === "inbox" && unreadOnly ? "page" : undefined}
              onClick={() => {
                setTab("inbox");
                setUnreadOnly(true);
              }}
            >
              <Icon name="mail" />
              <span>Não lidas</span>
            </button>
            <button
              className={tab === "sent" ? "is-active" : ""}
              aria-current={tab === "sent" ? "page" : undefined}
              onClick={() => {
                setTab("sent");
                setUnreadOnly(false);
              }}
            >
              <Icon name="send" />
              <span>Enviados</span>
            </button>
            <button
              className={tab === "templates" ? "is-active" : ""}
              aria-current={tab === "templates" ? "page" : undefined}
              onClick={() => setTab("templates")}
            >
              <Icon name="document" />
              <span>Modelos de mensagem</span>
            </button>
          </nav>
          <a
            className="mail-folders__webmail"
            href="https://email.godaddy.com"
            target="_blank"
            rel="noreferrer"
          >
            Abrir webmail <Icon name="arrow" />
          </a>
          <small className="mail-folders__status">
            <span
              className={status.data?.configured ? "mail-connection-dot" : ""}
            />
            {status.data?.configured ? "Caixa conectada" : "Aguardando conexão"}
          </small>
        </aside>
        <div className="mail-workspace__content">
          {tab !== "templates" ? (
            <QueryState query={status}>
              {status.data && !status.data.configured ? (
                <section className="admin-panel mail-connection">
                  <span className="office-shortcut-icon">
                    <Icon name="mail" size={24} />
                  </span>
                  <h2>Sua caixa Titan, aqui.</h2>
                  <p>
                    Conecte contato@duukfilms.com para ler, responder e enviar
                    mensagens sem sair do administrativo.
                  </p>
                  <span className="office-badge is-pending">
                    Aguardando conexão
                  </span>
                  {status.data.can_configure ? (
                    <button
                      className="admin-button"
                      onClick={() => setConnecting(true)}
                    >
                      <Icon name="mail" />
                      Conectar Titan
                    </button>
                  ) : (
                    <p>
                      Peça a um super administrador para conectar a caixa da
                      DUUK.
                    </p>
                  )}
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
                <section
                  className="admin-panel mail-list-panel"
                  aria-label={
                    tab === "sent"
                      ? "Mensagens enviadas"
                      : "Mensagens recebidas"
                  }
                >
                  <div className="mail-list-heading">
                    <h2>
                      {tab === "sent"
                        ? "Enviados"
                        : unreadOnly
                          ? "Não lidas"
                          : "Caixa de entrada"}
                    </h2>
                    <span>
                      {inbox.loading
                        ? "Atualizando…"
                        : `${inbox.data?.total ?? inbox.data?.messages.length ?? 0} mensagem(ns)`}
                    </span>
                  </div>
                  <form
                    className="admin-list-toolbar mail-list-search"
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
                        placeholder="Pesquisar assunto, nome ou e-mail…"
                      />
                    </label>
                    <button className="admin-button admin-button--secondary">
                      Pesquisar
                    </button>
                  </form>
                  {inbox.data &&
                  (inbox.data.folder !== folder ||
                    inbox.data.unreadOnly !== unreadOnly) ? (
                    <LoadingPanel label="Abrindo a pasta…" />
                  ) : (
                    <QueryState query={inbox}>
                      <div className="mail-list">
                        {inbox.data?.messages.map((m) => (
                          <button
                            key={m.uid}
                            className={`mail-row${m.unread ? " is-unread" : ""}`}
                            onClick={() => setOpened({ ...m, folder })}
                          >
                            <span className="mail-avatar">
                              {(
                                (folder === "sent" ? m.to : m.from)?.[0]
                                  ?.name ||
                                (folder === "sent" ? m.to : m.from)?.[0]
                                  ?.address ||
                                "E"
                              )
                                .slice(0, 1)
                                .toUpperCase()}
                            </span>
                            <div className="mail-row__main">
                              <strong>
                                {(folder === "sent" ? m.to : m.from)
                                  ?.map((a) => a.name || a.address)
                                  .join(", ") || "Remetente"}
                              </strong>
                              <h3>{m.subject}</h3>
                            </div>
                            <div className="mail-row__meta">
                              <time>{fmtTime(m.date)}</time>
                              <span>
                                {m.has_attachments && (
                                  <Icon name="attachment" size={14} />
                                )}{" "}
                                {m.unread && (
                                  <span
                                    className="mail-unread-dot"
                                    aria-label="Não lida"
                                  />
                                )}
                              </span>
                            </div>
                          </button>
                        ))}
                        {inbox.data?.messages.length === 0 && (
                          <div className="admin-empty">
                            <Icon
                              name={tab === "sent" ? "send" : "inbox"}
                              size={32}
                            />
                            <h3>
                              {unreadOnly
                                ? "Tudo em dia."
                                : "Nenhuma mensagem por aqui."}
                            </h3>
                            <p>
                              {unreadOnly
                                ? "Não há mensagens não lidas nesta pesquisa."
                                : "As conversas da DUUK aparecem neste espaço."}
                            </p>
                          </div>
                        )}
                        {inbox.data?.more && (
                          <p className="platform-muted mail-more">
                            Mostrando as 50 mensagens mais recentes. Use a
                            pesquisa para encontrar mensagens anteriores.
                          </p>
                        )}
                      </div>
                    </QueryState>
                  )}
                </section>
              )}
            </QueryState>
          ) : (
            <>
              <div className="crm-toolbar">
                <p className="platform-muted">
                  Mensagens prontas para personalizar com {"{nome}"}.
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
        </div>
      </div>
      {compose && clients.data && models.data && (
        <MailComposer
          clientId={compose.clientId}
          clients={clients.data || []}
          models={models.data || []}
          reply={compose.reply}
          replyAll={compose.replyAll}
          forward={compose.forward}
          onClose={() => setCompose(null)}
          onSent={async (result) => {
            notify(
              result.rejected?.length
                ? `E-mail enviado, mas estes destinatários foram recusados: ${result.rejected.join(", ")}. Confira os endereços antes de um novo envio.`
                : result.sent_copy_saved === false
                  ? "E-mail enviado. Não foi possível salvar a cópia em Enviados; não reenvie a mensagem."
                  : result.sent_copy_saved === true
                    ? "E-mail enviado e salvo em Enviados."
                    : "E-mail enviado pelo Titan.",
              !!result.rejected?.length,
            );
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
          onReply={(reply, replyAll = false) => {
            setOpened(null);
            setCompose({ reply, replyAll });
          }}
          onForward={(forward) => {
            setOpened(null);
            setCompose({ forward });
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
      {connecting && (
        <MailConnection
          onClose={() => setConnecting(false)}
          onConnected={() => {
            setConnecting(false);
            notify("Caixa Titan conectada.");
            const wasConfigured = status.data?.configured;
            status.reload().then((result) => {
              if (wasConfigured && result.configured) inbox.reload();
            });
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
