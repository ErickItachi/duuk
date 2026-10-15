import { useUnsavedChanges } from "../admin/unsavedChanges";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import { EmptyState, ErrorState, FieldError, PageTitle } from "../admin/forms";
import { useMediaQuery } from "../admin/shell/hooks";
import { focusFirstError, formErrors, hasErrors } from "../crm/formErrors";
import MailConnection from "./MailConnection";
import MailComposer from "./MailComposer";
import MailBody from "./MailBody";
import MailAvatar from "./MailAvatar";
import { addressLabel, fileSize } from "./model";
import "./mail.css";

const WEBMAIL = "https://email.godaddy.com";
const templates = () => rows("duuk_mail_templates", (q) => q.order("title"));
const mailKey = (message) => `${message.folder || "inbox"}:${message.uid}`;
const zone = { timeZone: "America/Sao_Paulo" };
// Compact list dates: time today, day and month this year, full date before that.
function shortDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  const day = (item) => item.toLocaleDateString("pt-BR", zone);
  const now = new Date();
  if (day(date) === day(now))
    return date.toLocaleTimeString("pt-BR", { ...zone, hour: "2-digit", minute: "2-digit" });
  const year = (item) => item.toLocaleDateString("pt-BR", { ...zone, year: "numeric" });
  return year(date) === year(now)
    ? date.toLocaleDateString("pt-BR", { ...zone, day: "numeric", month: "short" }).replace(".", "")
    : day(date);
}

function TemplateEditor({ record, onClose, onSaved }) {
  const uid = useId();
  const [form, setForm] = useState(
      record || { title: "", subject: "", body: "" },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState({});
  useUnsavedChanges(true);
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((old) => (old[key] ? { ...old, [key]: "" } : old));
  };
  const field = (key) => ({
    id: `${uid}-${key}`,
    name: key,
    value: form[key],
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${uid}-${key}-error` : undefined,
    onChange: (e) => update(key, e.target.value),
  });
  return (
    <Modal
      title={record ? "Editar modelo" : "Novo modelo de mensagem"}
      subtitle="Use {nome} para personalizar com o nome do cliente."
      onClose={() => !busy && onClose()}
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const found = formErrors(e.currentTarget, {
            title: form.title.trim() ? "" : "Dê um nome ao modelo.",
          });
          setErrors(found);
          if (hasErrors(found)) {
            focusFirstError(e.currentTarget, found);
            return;
          }
          setBusy(true);
          setError("");
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
        <fieldset className="admin-modal__body mail-template-form" disabled={busy}>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${uid}-title`}>
              Nome do modelo
            </label>
            <input {...field("title")} required maxLength={120} autoComplete="off" />
            <FieldError id={`${uid}-title-error`}>{errors.title}</FieldError>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${uid}-subject`}>
              Assunto
            </label>
            <input {...field("subject")} required maxLength={250} autoComplete="off" />
            <FieldError id={`${uid}-subject-error`}>{errors.subject}</FieldError>
          </div>
          <div className="admin-field">
            <label className="admin-label" htmlFor={`${uid}-body`}>
              Mensagem
            </label>
            <textarea {...field("body")} rows={8} required maxLength={20000} />
            <FieldError id={`${uid}-body-error`}>{errors.body}</FieldError>
          </div>
          {error && <ErrorState>{error}</ErrorState>}
        </fieldset>
        <div className="admin-modal__foot">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="admin-button" disabled={busy} aria-busy={busy}>
            {busy ? "Salvando…" : "Salvar modelo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ListSkeleton({ label = "Carregando mensagens…" }) {
  return (
    <div className="mail-skeleton" role="status">
      <span className="ds-visually-hidden">{label}</span>
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} aria-hidden="true">
          <span className="ds-skeleton ds-skeleton--circle" />
          <span>
            <span className="ds-skeleton ds-skeleton--text" />
            <span className="ds-skeleton ds-skeleton--text" />
          </span>
        </div>
      ))}
    </div>
  );
}

// The open message, read inside the page: next to the list on wide screens, as its own view on phones.
function MessageView({
  message,
  clients,
  wide,
  onRead,
  onClose,
  onUnread,
  onReply,
  onForward,
  notify,
  userId,
  canFollowup,
}) {
  const uid = useId(),
    heading = useRef(null),
    section = useRef(null),
    wideOnOpen = useRef(wide);
  const query = useQuery(
      useCallback(
        () => onRead({ uid: message.uid, folder: message.folder }),
        [onRead, message.uid, message.folder],
      ),
    ),
    [clientId, setClientId] = useState(""),
    [due, setDue] = useState(localInput()),
    [busy, setBusy] = useState(false),
    [downloading, setDownloading] = useState(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    if (!wideOnOpen.current) section.current?.scrollIntoView({ block: "start" });
    // Runs once per message: the reader is keyed by message.
  }, []);
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
  const markUnread = async () => {
    setBusy(true);
    try {
      await mailRequest({
        action: "flag",
        uid: message.uid,
        folder: message.folder,
        read: false,
      });
      notify("Mensagem marcada como não lida.");
      onUnread();
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setBusy(false);
    }
  };
  const run = async (action, success) => {
    setBusy(true);
    try {
      await action();
      notify(success);
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setBusy(false);
    }
  };
  const data = query.data,
    sender = data?.from?.[0],
    replyAll = !!data?.cc?.length || data?.to?.length > 1;
  return (
    <section
      ref={section}
      className="mail-reader"
      aria-labelledby={`${uid}-title`}
    >
      <div className="mail-reader__bar">
        <button
          type="button"
          className="admin-button admin-button--ghost admin-button--sm mail-reader__back"
          onClick={onClose}
        >
          <Icon name="back" />
          Voltar
        </button>
        <div className="mail-reader__tools">
          <button
            type="button"
            className="admin-icon-button"
            title="Marcar como não lida"
            aria-label="Marcar como não lida"
            disabled={busy || !data}
            onClick={markUnread}
          >
            <Icon name="mail" />
          </button>
          <a
            className="admin-icon-button"
            href={WEBMAIL}
            target="_blank"
            rel="noreferrer"
            title="Abrir webmail"
            aria-label="Abrir webmail (abre em uma nova aba)"
          >
            <Icon name="external" />
          </a>
          <button
            type="button"
            className="admin-icon-button mail-reader__close"
            title="Fechar mensagem"
            aria-label="Fechar mensagem"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="mail-reader__scroll">
        <h2 id={`${uid}-title`} ref={heading} tabIndex={-1} className="mail-reader__title">
          {data?.subject || message.subject || "(Sem assunto)"}
        </h2>
        {query.loading && !data ? (
          <div className="mail-reader__skeleton" role="status">
            <span className="ds-visually-hidden">Abrindo a mensagem…</span>
            <div aria-hidden="true">
              <span className="ds-skeleton ds-skeleton--circle" />
              <span className="ds-skeleton ds-skeleton--text" />
            </div>
            <span className="ds-skeleton" aria-hidden="true" />
          </div>
        ) : query.error && !data ? (
          <ErrorState onRetry={query.reload}>
            Não foi possível abrir a mensagem. {query.error}
          </ErrorState>
        ) : (
          data && (
            <>
              {query.error && (
                <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
              )}
              <div className="mail-sender">
                <MailAvatar people={data.from} />
                <div>
                  <strong>{sender?.name || sender?.address || "Remetente"}</strong>
                  {sender?.name && <span>{sender.address}</span>}
                </div>
                <time dateTime={data.date}>{fmtTime(data.date)}</time>
              </div>
              <details className="mail-message-details">
                <summary>
                  <span>Para {addressLabel(data.to)}</span>
                  <Icon name="down" size={14} />
                </summary>
                <dl>
                  <div>
                    <dt>De</dt>
                    <dd>{addressLabel(data.from)}</dd>
                  </div>
                  <div>
                    <dt>Para</dt>
                    <dd>{addressLabel(data.to)}</dd>
                  </div>
                  {!!data.cc?.length && (
                    <div>
                      <dt>Cc</dt>
                      <dd>{addressLabel(data.cc)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Data</dt>
                    <dd>{fmtTime(data.date)}</dd>
                  </div>
                </dl>
              </details>
              <MailBody html={data.html} text={data.text} />
              {data.remote_images_blocked && (
                <p className="mail-privacy-note">
                  <Icon name="shield" />
                  Imagens externas ficam bloqueadas para preservar sua
                  privacidade.
                </p>
              )}
              {!!data.attachments?.length && (
                <section
                  className="mail-received-attachments"
                  aria-labelledby={`${uid}-files`}
                >
                  <h3 id={`${uid}-files`}>
                    <Icon name="attachment" />
                    {data.attachments.length === 1
                      ? "1 anexo"
                      : `${data.attachments.length} anexos`}
                  </h3>
                  <ul>
                    {data.attachments.map((a) => (
                      <li key={a.index}>
                        <button
                          type="button"
                          className="mail-file-card"
                          disabled={downloading !== null}
                          aria-busy={downloading === a.index}
                          onClick={() => download(a)}
                        >
                          <Icon name="file" />
                          <span>
                            <strong>
                              <span className="ds-visually-hidden">Baixar </span>
                              {a.name}
                            </strong>
                            <small>
                              {downloading === a.index
                                ? "Baixando…"
                                : fileSize(a.size)}
                            </small>
                          </span>
                          <Icon name="download" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )
        )}
        {clients.length > 0 && (
          <section className="mail-associate" aria-labelledby={`${uid}-crm`}>
            <h3 id={`${uid}-crm`}>Vincular ao Comercial</h3>
            <div className="mail-associate__row">
              <div className="admin-field">
                <label className="admin-label" htmlFor={`${uid}-client`}>
                  Relacionar ao cliente
                </label>
                <select
                  id={`${uid}-client`}
                  value={clientId}
                  aria-describedby={clientId ? undefined : `${uid}-client-hint`}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Selecionar cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="admin-button admin-button--secondary"
                disabled={!clientId || busy}
                aria-busy={busy}
                onClick={() =>
                  run(
                    () =>
                      mailRequest({
                        action: "associate",
                        uid: message.uid,
                        folder: message.folder,
                        client_id: clientId,
                      }),
                    "Mensagem vinculada ao cliente.",
                  )
                }
              >
                <Icon name="link" />
                Vincular mensagem
              </button>
            </div>
            {canFollowup && (
              <div className="mail-associate__row">
                <div className="admin-field">
                  <label className="admin-label" htmlFor={`${uid}-due`}>
                    Agendar follow-up
                  </label>
                  <input
                    id={`${uid}-due`}
                    type="datetime-local"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  disabled={!clientId || !due || busy}
                  aria-busy={busy}
                  onClick={() =>
                    run(
                      () =>
                        addFollowup({
                          client_id: clientId,
                          owner_id: userId,
                          due_at: timestamp(due),
                          notes: `Responder conversa: ${message.subject}`,
                        }),
                      "Follow-up agendado.",
                    )
                  }
                >
                  <Icon name="clock" />
                  Agendar
                </button>
              </div>
            )}
            {!clientId && (
              <small id={`${uid}-client-hint`}>
                Escolha um cliente para vincular a mensagem
                {canFollowup ? " ou agendar o próximo contato." : "."}
              </small>
            )}
          </section>
        )}
      </div>
      <div className="mail-reader__foot">
        <button
          type="button"
          className="admin-button admin-button--secondary"
          disabled={!data}
          aria-label="Encaminhar"
          title="Encaminhar"
          onClick={() => onForward(data)}
        >
          <Icon name="forward" />
          <span className="mail-reader__label">Encaminhar</span>
        </button>
        {replyAll ? (
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={!data}
            aria-label="Responder a todos"
            title="Responder a todos"
            onClick={() => onReply(data, true)}
          >
            <Icon name="replyAll" />
            <span className="mail-reader__label">Responder a todos</span>
          </button>
        ) : null}
        <button
          type="button"
          className="admin-button"
          disabled={!data}
          onClick={() => onReply(data)}
        >
          <Icon name="reply" />
          Responder
        </button>
      </div>
    </section>
  );
}

const folderTitles = {
  inbox: "Caixa de entrada",
  unread: "Não lidas",
  sent: "Enviados",
};

export default function MailPage({ notify }) {
  const [params] = useSearchParams();
  const auth = useAuth(),
    canUseCrm = auth.hasPermission("crm"),
    wide = useMediaQuery("(min-width: 1200px)"),
    phone = useMediaQuery("(max-width: 767px)"),
    compactTitle = useMediaQuery("(max-width: 1099px)"),
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
    [connecting, setConnecting] = useState(false),
    // Messages opened here are read on the server; the list shows that until its next refresh.
    [seen, setSeen] = useState(() => new Set());
  const list = useRef(null);
  const folder = tab === "sent" ? "sent" : "inbox";
  const configured = !!status.data?.configured;
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
  const readMessage = useCallback(async (message) => {
    const data = await mailRequest({
      action: "read",
      uid: message.uid,
      folder: message.folder,
    });
    const key = mailKey(message);
    setSeen((previous) =>
      previous.has(key) ? previous : new Set(previous).add(key),
    );
    return data;
  }, []);
  const closeMessage = () => {
    const key = opened && mailKey(opened);
    setOpened(null);
    inbox.reload();
    requestAnimationFrame(() =>
      list.current?.querySelector(`[data-mail-key="${key}"]`)?.focus(),
    );
  };
  const chooseFolder = (next, unread = false) => {
    setTab(next);
    setUnreadOnly(unread);
    setOpened(null);
  };
  const current = tab === "sent" ? "sent" : unreadOnly ? "unread" : "inbox";
  const switching =
    inbox.data &&
    (inbox.data.folder !== folder || inbox.data.unreadOnly !== unreadOnly);
  const total = inbox.data?.total ?? inbox.data?.messages.length ?? 0;
  const folders = [
    ["inbox", "inbox", "Caixa de entrada", () => chooseFolder("inbox")],
    ["unread", "mail", "Não lidas", () => chooseFolder("inbox", true)],
    ["sent", "send", "Enviados", () => chooseFolder("sent")],
    ["templates", "document", "Modelos de mensagem", () => chooseFolder("templates")],
  ];
  const activeFolder = tab === "templates" ? "templates" : current;
  const reading = !!opened && configured && tab !== "templates";

  const listPanel = (
    <section className="mail-list-panel" aria-labelledby="mail-list-title">
      <div className="mail-list-heading">
        <h2 id="mail-list-title">{folderTitles[current]}</h2>
        <span aria-live="polite">
          {inbox.loading
            ? "Atualizando…"
            : total === 1
              ? "1 mensagem"
              : `${total} mensagens`}
        </span>
      </div>
      <form
        className="mail-list-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedSearch(search);
        }}
      >
        <div className="mail-list-search__field">
          <label className="admin-search">
            <Icon name="search" />
            <span className="ds-visually-hidden">Pesquisar e-mails</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              enterKeyHint="search"
              placeholder={phone ? "Pesquisar…" : "Pesquisar assunto, nome ou e-mail…"}
            />
          </label>
          {submittedSearch && (
            <button
              type="button"
              className="mail-list-search__clear"
              aria-label="Limpar pesquisa"
              title="Limpar pesquisa"
              onClick={() => {
                setSearch("");
                setSubmittedSearch("");
              }}
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <button className="admin-button admin-button--secondary">Pesquisar</button>
      </form>
      <div className="mail-list-scroll">
        {status.error && (
          <div className="mail-list-error">
            <ErrorState onRetry={status.reload}>{status.error}</ErrorState>
          </div>
        )}
        {switching || (inbox.loading && !inbox.data) ? (
          <ListSkeleton label="Abrindo a pasta…" />
        ) : inbox.error && !inbox.data ? (
          <div className="mail-list-error">
            <ErrorState onRetry={inbox.reload}>
              Não foi possível carregar as mensagens. {inbox.error}
            </ErrorState>
          </div>
        ) : (
          <>
            {inbox.error && (
              <div className="mail-list-error">
                <ErrorState onRetry={inbox.reload}>{inbox.error}</ErrorState>
              </div>
            )}
            {inbox.data?.messages.length ? (
              <ul className="mail-list" ref={list}>
                {inbox.data.messages.map((m) => {
                  const key = mailKey({ ...m, folder }),
                    people = folder === "sent" ? m.to : m.from,
                    unread = m.unread && !seen.has(key),
                    selected = opened && mailKey(opened) === key;
                  return (
                    <li key={m.uid}>
                      <button
                        type="button"
                        data-mail-key={key}
                        className={`mail-row${unread ? " is-unread" : ""}${selected ? " is-selected" : ""}`}
                        aria-current={selected ? "true" : undefined}
                        onClick={() => setOpened({ ...m, folder })}
                      >
                        {unread && <span className="mail-unread-dot" aria-hidden="true" />}
                        <MailAvatar people={people} />
                        <span className="mail-row__main">
                          {unread && <span className="ds-visually-hidden">Não lida. </span>}
                          <span className="mail-row__top">
                            <span className="mail-row__from">
                              {folder === "sent" && (
                                <span className="ds-visually-hidden">Para </span>
                              )}
                              {people?.map((a) => a.name || a.address).join(", ") ||
                                "Remetente"}
                            </span>
                            {m.has_attachments && (
                              <>
                                <Icon name="attachment" size={14} />
                                <span className="ds-visually-hidden">Com anexo. </span>
                              </>
                            )}
                            <time dateTime={m.date} title={fmtTime(m.date)}>
                              {shortDate(m.date)}
                            </time>
                          </span>
                          <span className="mail-row__subject">{m.subject}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : submittedSearch ? (
              <EmptyState
                icon="search"
                title="Nenhuma mensagem encontrada"
                action={
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={() => {
                      setSearch("");
                      setSubmittedSearch("");
                    }}
                  >
                    Limpar pesquisa
                  </button>
                }
              >
                Tente outro assunto, nome ou endereço de e-mail.
              </EmptyState>
            ) : (
              <EmptyState
                icon={tab === "sent" ? "send" : "inbox"}
                title={unreadOnly ? "Tudo em dia." : "Nenhuma mensagem por aqui."}
              >
                {unreadOnly
                  ? "Não há mensagens não lidas nesta pesquisa."
                  : "As conversas da DUUK aparecem neste espaço."}
              </EmptyState>
            )}
            {inbox.data?.more && (
              <p className="mail-more">
                Mostrando as 50 mensagens mais recentes. Use a pesquisa para
                encontrar mensagens anteriores.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );

  return (
    <div className="mail-page">
      <PageTitle
        eyebrow="DUUK / COMERCIAL"
        title="E-mails"
        description="Conversas da DUUK, conectadas aos seus clientes."
      >
        <RefreshButton
          compact={phone}
          onRefresh={async () => {
            const result = await status.reload();
            if (result.failed) return result;
            if (tab === "templates") return models.reload();
            if (status.data?.configured && result.configured)
              return inbox.reload();
          }}
        />
        {configured && status.data.can_configure && (
          <button
            type="button"
            className={
              compactTitle
                ? `admin-icon-button${phone ? "" : " admin-icon-button--bordered"}`
                : "admin-button admin-button--secondary"
            }
            aria-label="Gerenciar conexão"
            title="Gerenciar conexão"
            onClick={() => setConnecting(true)}
          >
            <Icon name="settings" />
            {!compactTitle && <span>Gerenciar conexão</span>}
          </button>
        )}
        <button
          type="button"
          className="admin-button"
          disabled={!configured}
          onClick={() => setCompose({})}
        >
          <Icon name="compose" />
          Novo e-mail
        </button>
      </PageTitle>
      <div className={`mail-workspace${reading ? " is-reading" : ""}`}>
        <aside className="mail-folders" aria-label="Caixa de e-mail">
          <div className="mail-folders__account">
            <MailAvatar company />
            <div>
              <strong>DUUK Films</strong>
              <span title="contato@duukfilms.com">contato@duukfilms.com</span>
            </div>
          </div>
          <nav aria-label="Pastas de e-mail">
            <ul>
              {folders.map(([key, icon, label, choose]) => (
                <li key={key}>
                  <button
                    type="button"
                    className={activeFolder === key ? "is-active" : ""}
                    aria-current={activeFolder === key ? "page" : undefined}
                    onClick={choose}
                  >
                    <Icon name={icon} />
                    <span>{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mail-folders__foot">
            <small className={`mail-folders__status${configured ? " is-connected" : ""}`}>
              <span className="mail-status-dot" aria-hidden="true" />
              {configured ? "Caixa conectada" : "Aguardando conexão"}
            </small>
            <a
              className="mail-folders__webmail"
              href={WEBMAIL}
              target="_blank"
              rel="noreferrer"
            >
              Abrir webmail <Icon name="external" size={14} />
              <span className="ds-visually-hidden"> (abre em uma nova aba)</span>
            </a>
          </div>
        </aside>
        {tab === "templates" ? (
          <section className="mail-pane mail-templates" aria-labelledby="mail-templates-title">
            <div className="mail-templates__head">
              <div>
                <h2 id="mail-templates-title">Modelos de mensagem</h2>
                <p>Mensagens prontas para personalizar com {"{nome}"}.</p>
              </div>
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={() => setEdit("new")}
              >
                <Icon name="plus" />
                Novo modelo
              </button>
            </div>
            {models.loading && !models.data ? (
              <ListSkeleton label="Carregando modelos…" />
            ) : models.error && !models.data ? (
              <div className="mail-list-error">
                <ErrorState onRetry={models.reload}>
                  Não foi possível carregar os modelos. {models.error}
                </ErrorState>
              </div>
            ) : models.data?.length ? (
              <>
                {models.error && (
                  <div className="mail-list-error">
                    <ErrorState onRetry={models.reload}>{models.error}</ErrorState>
                  </div>
                )}
                <ul className="mail-templates__list">
                  {models.data.map((t) => (
                    <li key={t.id}>
                      <span className="mail-templates__icon" aria-hidden="true">
                        <Icon name="document" />
                      </span>
                      <div>
                        <h3>{t.title}</h3>
                        <p>{t.subject || "Sem assunto"}</p>
                      </div>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          className="admin-icon-button"
                          aria-label={`Editar modelo ${t.title}`}
                          title="Editar"
                          onClick={() => setEdit(t)}
                        >
                          <Icon name="edit" />
                        </button>
                        <button
                          type="button"
                          className="admin-icon-button admin-icon-button--danger"
                          aria-label={`Excluir modelo ${t.title}`}
                          title="Excluir"
                          onClick={() => setDeleting(t)}
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                icon="document"
                title="Nenhum modelo ainda"
                action={
                  <button type="button" className="admin-button" onClick={() => setEdit("new")}>
                    <Icon name="plus" />
                    Novo modelo
                  </button>
                }
              >
                Salve assuntos e textos que a equipe usa com frequência.
              </EmptyState>
            )}
          </section>
        ) : status.loading && !status.data ? (
          <section className="mail-pane" aria-label="Carregando a caixa de e-mail">
            <ListSkeleton label="Conectando à caixa de e-mail…" />
          </section>
        ) : status.error && !status.data ? (
          <section className="mail-pane mail-pane--padded">
            <ErrorState onRetry={status.reload}>
              Não foi possível verificar a caixa de e-mail. {status.error}
            </ErrorState>
          </section>
        ) : status.data && !status.data.configured ? (
          <section className="mail-pane mail-connection" aria-labelledby="mail-connection-title">
            {status.error && <ErrorState onRetry={status.reload}>{status.error}</ErrorState>}
            <span className="mail-connection__icon" aria-hidden="true">
              <Icon name="mail" size={22} />
            </span>
            <h2 id="mail-connection-title">Sua caixa Titan, aqui.</h2>
            <p>
              Conecte contato@duukfilms.com para ler, responder e enviar
              mensagens sem sair do administrativo.
            </p>
            <span className="ds-badge ds-badge--warning">
              <Icon name="clock" size={12} />
              Aguardando conexão
            </span>
            {!status.data.can_configure && (
              <p>Peça a um super administrador para conectar a caixa da DUUK.</p>
            )}
            <div className="mail-connection__actions">
              {status.data.can_configure && (
                <button
                  type="button"
                  className="admin-button"
                  onClick={() => setConnecting(true)}
                >
                  <Icon name="mail" />
                  Conectar Titan
                </button>
              )}
              <a
                className="admin-button admin-button--secondary"
                href={WEBMAIL}
                target="_blank"
                rel="noreferrer"
              >
                Abrir meu webmail
                <Icon name="external" />
                <span className="ds-visually-hidden"> (abre em uma nova aba)</span>
              </a>
            </div>
          </section>
        ) : (
          <>
            {listPanel}
            {reading ? (
              <MessageView
                key={mailKey(opened)}
                wide={wide}
                canFollowup={auth.hasPermission("crm.followups")}
                message={opened}
                clients={clients.data || []}
                userId={auth.user.id}
                notify={notify}
                onRead={readMessage}
                onClose={closeMessage}
                onUnread={() => {
                  const key = mailKey(opened);
                  setSeen((previous) => {
                    const next = new Set(previous);
                    next.delete(key);
                    return next;
                  });
                  closeMessage();
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
            ) : (
              <div className="mail-reader-empty">
                <EmptyState icon="mail" title="Selecione uma mensagem">
                  A conversa abre aqui, com anexos e o vínculo ao Comercial.
                </EmptyState>
              </div>
            )}
          </>
        )}
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
    </div>
  );
}
