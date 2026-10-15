import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { supabase } from "../content/supabase";
import { useAuth } from "../content/AuthContext";
import { useQuery } from "../office/useQuery";
import { checked, notificationRequest } from "./api";
import { Icon, Modal, RefreshButton } from "./components";
import {
  EmptyState,
  ErrorState,
  FieldError,
  PageTitle,
  Pagination,
  QueryState,
  SearchField,
} from "./forms";
import { matchesQuery, usePagination } from "./ds/list";
import PushDevice from "./PushDevice";
import { fmtTime } from "../crm/model";
import { useUnsavedChanges } from "./unsavedChanges";
import { useNotificationSound } from "./useNotificationSound";

const NotificationContext = createContext(null);
const categories = [
  ["agenda", "Agenda", "calendar"],
  ["projects", "Projetos", "film"],
  ["contracts", "Contratos", "document"],
  ["finance", "Financeiro", "wallet"],
  ["commercial", "Comercial", "users"],
  ["social", "Social Media", "instagram"],
  ["system", "Sistema", "settings"],
];
const defaults = {
  agenda: true,
  projects: true,
  contracts: true,
  finance: true,
  commercial: true,
  social: true,
  system: true,
};
export function NotificationProvider({ children }) {
  const auth = useAuth(),
    userId = auth.user.id;
  const query = useQuery(
    useCallback(
      async () => {
        const [items, count] = await Promise.all([
          supabase
            .from("duuk_notifications")
            .select(
              "id,category,title,body,link,required_permission,read_at,created_at",
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("duuk_notifications").select("id", {count: "exact", head: true}).eq("user_id",userId).is("read_at",null),
        ]);
        checked(count);
        return {items:checked(items)||[],unread:count.count||0};
      },
      [userId],
    ),
  );
  const reload = query.reload;
  useEffect(() => {
    let timer;
    const channel=supabase.channel(`notifications:${userId}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"duuk_notifications",filter:`user_id=eq.${userId}`},()=>{clearTimeout(timer);timer=setTimeout(reload,250)}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"duuk_notifications",filter:`user_id=eq.${userId}`},()=>{clearTimeout(timer);timer=setTimeout(reload,250)}).subscribe();
    return ()=>{clearTimeout(timer);supabase.removeChannel(channel)};
  },[userId,reload]);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && navigator.onLine) reload();
    };
    const timer = setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
    };
  }, [reload]);
  const hasPermission = auth.hasPermission;
  const notifications = useMemo(() => (query.data?.items || []).filter((n) =>
    hasPermission(n.required_permission),
  ), [query.data?.items, hasPermission]);
  const sound = useNotificationSound(userId, notifications, !!query.data);
  const mark = async (id) => {
    checked(
      await supabase
        .from("duuk_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", auth.user.id)
        .eq("id", id),
    );
    await query.reload();
  };
  const markAll = async () => {
    checked(
      await supabase
        .from("duuk_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", auth.user.id)
        .is("read_at", null),
    );
    await query.reload();
  };
  return (
    <NotificationContext.Provider
      value={{
        ...query,
        notifications,
        unread: query.data?.unread || 0,
        mark,
        markAll,
        sound,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
export function NotificationBell() {
  const { unread } = useContext(NotificationContext);
  return (
    <Link
      className="admin-icon-button admin-notification-bell"
      to="/admin/notificacoes"
      aria-label={`Notificações${unread ? `, ${unread} não lidas` : ""}`}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
    </Link>
  );
}

// Day groups follow Brasília time, like the rest of the admin.
const zone = "America/Sao_Paulo";
const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: zone,
  hour: "2-digit",
  minute: "2-digit",
});
const longDay = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});
const longDayYear = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
function dayKey(value) {
  const moment = new Date(value);
  if (Number.isNaN(moment.getTime())) return "";
  const parts = Object.fromEntries(
    dayParts.formatToParts(moment).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function dayLabel(key) {
  const now = Date.now(),
    today = dayKey(now);
  if (!key) return "Sem data";
  if (key === today) return "Hoje";
  if (key === dayKey(now - 86400000)) return "Ontem";
  const text = (key.slice(0, 4) === today.slice(0, 4) ? longDay : longDayYear).format(
    new Date(`${key}T12:00:00Z`),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function byDay(items) {
  const groups = [];
  for (const item of items) {
    const key = dayKey(item.created_at);
    if (groups.at(-1)?.key === key) groups.at(-1).items.push(item);
    else groups.push({ key, label: dayLabel(key), items: [item] });
  }
  return groups;
}
const timeOf = (value) => {
  const moment = new Date(value);
  return Number.isNaN(moment.getTime()) ? "" : clock.format(moment);
};
const categoryOf = (key) => categories.find((c) => c[0] === key);

export function NotificationsPage({ notify }) {
  const auth=useAuth(),context = useContext(NotificationContext),
    [status, setStatus] = useState("all"),
    [category, setCategory] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false),[notice,setNotice]=useState(false);
  const all = context.notifications;
  const unreadCount = all.filter((n) => !n.read_at).length;
  const items = all.filter(
    (n) =>
      (status === "all" || !n.read_at) &&
      (!category || n.category === category) &&
      matchesQuery(search, n.title, n.body, categoryOf(n.category)?.[1]),
  );
  const pager = usePagination(items, {
    resetKey: `${status}|${category}|${search}`,
  });
  const clear = () => {
    setStatus("all");
    setCategory("");
    setSearch("");
  };
  const markRead = (n) =>
    context.mark(n.id).catch((cause) => notify(cause.message, true));
  const empty = !all.length ? (
    <EmptyState icon="bell" title="Tudo em dia.">
      Novidades e lembretes aparecem aqui.
    </EmptyState>
  ) : status === "unread" && !category && !search ? (
    <EmptyState
      icon="checkCircle"
      title="Nenhuma notificação não lida."
      action={
        <button
          type="button"
          className="admin-button admin-button--secondary"
          onClick={() => setStatus("all")}
        >
          Ver todas
        </button>
      }
    >
      Você está em dia com o que chegou.
    </EmptyState>
  ) : (
    <EmptyState
      icon="search"
      title="Nada encontrado."
      action={
        <button
          type="button"
          className="admin-button admin-button--secondary"
          onClick={clear}
        >
          Limpar filtros
        </button>
      }
    >
      Ajuste a busca, a categoria ou o filtro de leitura.
    </EmptyState>
  );
  return (
    <>
      <PageTitle
        title="Notificações"
        description="O que precisa da sua atenção, em um só lugar."
      >
        <RefreshButton onRefresh={context.reload} />
        {auth.profile.is_super_admin&&<button type="button" className="admin-button" onClick={()=>setNotice(true)}><Icon name="megaphone"/>Novo aviso</button>}
        <button
          type="button"
          className="admin-button admin-button--secondary"
          disabled={!context.unread || busy}
          aria-busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await context.markAll();
              notify("Notificações marcadas como lidas.");
            } catch (cause) {
              notify(cause.message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Icon name="check" />
          {busy ? "Marcando…" : "Marcar todas como lidas"}
        </button>
      </PageTitle>
      <QueryState query={context}>
        <section className="admin-panel settings-inbox" aria-label="Notificações recebidas">
          <div className="ds-toolbar settings-toolbar">
            <div className="ds-segmented" role="group" aria-label="Mostrar">
              <button
                type="button"
                aria-pressed={status === "all"}
                onClick={() => setStatus("all")}
              >
                Todas
              </button>
              <button
                type="button"
                aria-pressed={status === "unread"}
                onClick={() => setStatus("unread")}
              >
                Não lidas
                <span className="settings-count">{unreadCount}</span>
              </button>
            </div>
            <div className="ds-toolbar__filters settings-filters">
              <label className="settings-select">
                <span className="ds-visually-hidden">Categoria</span>
                <select
                  className="ds-input ds-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Todas as categorias</option>
                  {categories.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <SearchField
                value={search}
                onChange={setSearch}
                label="Buscar notificação"
                placeholder="Buscar notificação…"
              />
            </div>
          </div>
          {pager.total
            ? byDay(pager.items).map((day) => (
                <section className="settings-day" key={day.key || "sem-data"}>
                  <h2 className="settings-day__label">{day.label}</h2>
                  <ul className="settings-notifications">
                    {day.items.map((n) => {
                      const unread = !n.read_at,
                        kind = categoryOf(n.category);
                      return (
                        <li
                          key={n.id}
                          className={`settings-notification${unread ? " is-unread" : ""}`}
                        >
                          <span className="settings-notification__icon" aria-hidden="true">
                            <Icon name={kind?.[2] || "bell"} size={17} />
                          </span>
                          <div className="settings-notification__content">
                            <p className="settings-notification__meta">
                              <span>{kind?.[1] || "Sistema"}</span>
                              {unread && (
                                <span className="settings-unread">
                                  <i aria-hidden="true" />
                                  Não lida
                                </span>
                              )}
                            </p>
                            <h3>
                              <Link
                                className="settings-notification__link"
                                to={n.link}
                                onClick={() => {
                                  if (unread) markRead(n);
                                }}
                              >
                                {n.title}
                              </Link>
                            </h3>
                            {n.body && (
                              <p className="settings-notification__body">{n.body}</p>
                            )}
                          </div>
                          <div className="settings-notification__aside">
                            <time dateTime={n.created_at} title={fmtTime(n.created_at)}>
                              {timeOf(n.created_at)}
                            </time>
                            {unread && (
                              <button
                                type="button"
                                className="admin-icon-button"
                                aria-label={`Marcar como lida: ${n.title}`}
                                title="Marcar como lida"
                                onClick={() => markRead(n)}
                              >
                                <Icon name="check" />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            : empty}
          <Pagination pager={pager} noun="notificações" />
        </section>
      </QueryState>
      {notice&&<NoticeEditor onClose={()=>setNotice(false)} onSaved={async()=>{await context.reload();notify("Aviso enviado à equipe.")}}/>}
    </>
  );
}
function NoticeEditor({onClose,onSaved}) {
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[errors,setErrors]=useState({});
 const attempt=useRef(null);useUnsavedChanges(!!title||!!body);
 const titleId=useId(),bodyId=useId();
 const submit=async event=>{
  event.preventDefault();
  if(busy)return;
  // Same limits the server checks: both required, up to 120 and 500 characters.
  const found={};
  if(!title.trim())found.title='Informe o título do aviso.';else if(title.trim().length>120)found.title='Use até 120 caracteres.';
  if(!body.trim())found.body='Escreva a mensagem do aviso.';else if(body.trim().length>500)found.body='Use até 500 caracteres.';
  setErrors(found);
  if(Object.keys(found).length){const form=event.currentTarget;requestAnimationFrame(()=>form.querySelector('[aria-invalid="true"]')?.focus());return}
  setBusy(true);setError('');if(!attempt.current||attempt.current.title!==title||attempt.current.body!==body)attempt.current={request_id:crypto.randomUUID(),title,body};try{await notificationRequest({action:'admin-notice',...attempt.current});await onSaved();onClose()}catch(cause){setError(cause.message)}finally{setBusy(false)}};
 return <Modal title="Novo aviso administrativo" subtitle="Enviado às pessoas ativas que permitem notificações de Sistema." onClose={()=>!busy&&onClose()}>
  <form onSubmit={submit} noValidate aria-busy={busy}>
   <div className="admin-modal__body settings-modal-stack">
    <div className="admin-field">
     <label className="admin-label" htmlFor={titleId}>Título</label>
     <input id={titleId} value={title} onChange={e=>{setTitle(e.target.value);setErrors(old=>({...old,title:''}))}} required maxLength={120} aria-invalid={errors.title?'true':undefined} aria-describedby={errors.title?`${titleId}-error`:undefined}/>
     <FieldError id={`${titleId}-error`}>{errors.title}</FieldError>
    </div>
    <div className="admin-field">
     <label className="admin-label" htmlFor={bodyId}>Mensagem</label>
     <textarea id={bodyId} value={body} onChange={e=>{setBody(e.target.value);setErrors(old=>({...old,body:''}))}} required maxLength={500} rows={4} aria-invalid={errors.body?'true':undefined} aria-describedby={`${bodyId}-hint${errors.body?` ${bodyId}-error`:''}`}/>
     <small id={`${bodyId}-hint`}>{body.length}/500 caracteres</small>
     <FieldError id={`${bodyId}-error`}>{errors.body}</FieldError>
    </div>
    {error&&<ErrorState>{error}</ErrorState>}
   </div>
   <div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className="admin-button" disabled={busy} aria-busy={busy}>{busy?'Enviando…':'Enviar aviso'}</button></div>
  </form>
 </Modal>;
}
export function NotificationSettingsPage({ notify }) {
  const { sound } = useContext(NotificationContext);
  const auth = useAuth(),
    query = useQuery(
      useCallback(
        async () =>
          checked(
            await supabase
              .from("duuk_notification_preferences")
              .select("*")
              .eq("user_id", auth.user.id)
              .maybeSingle(),
          ) || { user_id: auth.user.id, ...defaults },
        [auth.user.id],
      ),
    );
  const [busy, setBusy] = useState("");
  const switchId = useId();
  const preference = async (key, value) => {
    if (busy) return;
    setBusy(key);
    try {
      checked(
        await supabase.from("duuk_notification_preferences").upsert({
          user_id: auth.user.id,
          ...defaults,
          ...query.data,
          [key]: value,
        }),
      );
      await query.reload();
      notify("Preferência salva.");
    } catch (cause) {
      notify(cause.message, true);
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <PageTitle
        title="Preferências de notificações"
        description="Escolha o que faz sentido para o seu dia."
      />
      <div className="settings-notify">
        <div className="settings-notify__grid">
          <section className="ds-card" aria-labelledby={`${switchId}-title`}>
            <div className="settings-card__head">
              <span className="settings-card__icon" aria-hidden="true">
                <Icon name="bell" />
              </span>
              <div>
                <h2 id={`${switchId}-title`}>Na plataforma</h2>
                <p>As categorias respeitam os módulos permitidos para sua conta.</p>
              </div>
            </div>
            {query.loading && !query.data ? (
              <div className="settings-skeleton-rows" role="status" aria-label="Carregando preferências">
                {categories.map(([key]) => (
                  <span key={key} className="ds-skeleton" aria-hidden="true" />
                ))}
              </div>
            ) : query.error && !query.data ? (
              <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
            ) : (
              <>
                {query.error && (
                  <ErrorState onRetry={query.reload}>{query.error}</ErrorState>
                )}
                <ul className="settings-switch-list">
                  {categories.map(([key, label, icon]) => (
                    <li className="settings-switch-row" key={key} aria-busy={busy === key || undefined}>
                      <span className="settings-switch-row__icon" aria-hidden="true">
                        <Icon name={icon} size={16} />
                      </span>
                      <label
                        className="settings-switch-row__label"
                        htmlFor={`${switchId}-${key}`}
                      >
                        {label}
                      </label>
                      {busy === key && <span className="ds-spinner" aria-hidden="true" />}
                      <button
                        id={`${switchId}-${key}`}
                        type="button"
                        className="settings-switch"
                        role="switch"
                        aria-label={`Notificações de ${label}`}
                        aria-checked={query.data?.[key] || false}
                        aria-disabled={busy ? "true" : undefined}
                        onClick={() => preference(key, !query.data[key])}
                      >
                        <span aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
          <PushDevice />
          <section className="ds-card" aria-label="Som das notificações">
            <div className="settings-card__head"><span className="settings-card__icon" aria-hidden="true"><Icon name="bell" /></span><div><h2>Som da DUUK</h2><p>Um toque discreto para novas notificações com o app aberto.</p></div></div>
            <div className="settings-switch-row"><label className="settings-switch-row__label" htmlFor={`${switchId}-sound`}>Som neste aparelho</label><button id={`${switchId}-sound`} type="button" className="settings-switch" role="switch" aria-label="Som de notificações neste aparelho" aria-checked={sound.enabled} disabled={!sound.supported} onClick={sound.toggle}><span aria-hidden="true" /></button></div>
            <p className="ds-muted" style={{ fontSize: 12, margin: '12px 0' }}>Depois do primeiro toque ou clique, o navegador libera o áudio. Com o app fechado, o som do push segue as configurações do sistema.</p>
            <button type="button" className="admin-button admin-button--secondary admin-button--sm" disabled={!sound.supported} onClick={async () => { if (!await sound.preview()) notify('O navegador não liberou o áudio. Confira o volume e tente novamente.', true) }}><Icon name="play" />Ouvir som</button>
          </section>
        </div>
      </div>
    </>
  );
}
