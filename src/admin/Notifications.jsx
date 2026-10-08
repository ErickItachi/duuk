import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { supabase } from "../content/supabase";
import { useAuth } from "../content/AuthContext";
import { useQuery } from "../office/useQuery";
import { checked, notificationRequest } from "./api";
import { Icon, Modal, RefreshButton } from "./components";
import { Field, PageTitle, QueryState } from "./forms";
import PushDevice from "./PushDevice";
import { fmtTime } from "../crm/model";
import { useUnsavedChanges } from "./unsavedChanges";

const NotificationContext = createContext(null);
const categories = [
  ["agenda", "Agenda", "calendar"],
  ["projects", "Projetos", "film"],
  ["contracts", "Contratos", "document"],
  ["finance", "Financeiro", "wallet"],
  ["commercial", "Comercial", "users"],
  ["system", "Sistema", "settings"],
];
const defaults = {
  agenda: true,
  projects: true,
  contracts: true,
  finance: true,
  commercial: true,
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
  const notifications = (query.data?.items || []).filter((n) =>
    auth.hasPermission(n.required_permission),
  );
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
export function NotificationsPage({ notify }) {
  const auth=useAuth(),context = useContext(NotificationContext),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false),[notice,setNotice]=useState(false);
  const items = context.notifications.filter(
    (n) =>
      filter === "all" ||
      (filter === "unread" && !n.read_at) ||
      n.category === filter,
  );
  return (
    <>
      <PageTitle
        title="Notificações"
        description="O que precisa da sua atenção, em um só lugar."
      >
        <RefreshButton onRefresh={context.reload} />
        {auth.profile.is_super_admin&&<button className="admin-button" onClick={()=>setNotice(true)}><Icon name="plus"/>Novo aviso</button>}
        <button
          className="admin-button admin-button--secondary"
          disabled={!context.unread || busy}
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
          Marcar todas como lidas
        </button>
      </PageTitle>
      <div className="admin-filter-tabs crm-followup-tabs">
        {[
          ["all", "Todas"],
          ["unread", "Não lidas"],
          ...categories.map(([k, l]) => [k, l]),
        ].map(([k, l]) => (
          <button
            key={k}
            className={filter === k ? "is-active" : ""}
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <QueryState query={context}>
        <section className="admin-panel platform-list">
          {items.map((n) => (
            <article
              key={n.id}
              className={`platform-row notification-row${!n.read_at ? " is-unread" : ""}`}
            >
              <Icon
                name={
                  categories.find((c) => c[0] === n.category)?.[2] || "bell"
                }
              />
              <Link
                className="platform-row__main"
                to={n.link}
                onClick={() => {
                  if (!n.read_at)
                    context
                      .mark(n.id)
                      .catch((cause) => notify(cause.message, true));
                }}
              >
                <span className="notification-category">{categories.find(c=>c[0]===n.category)?.[1]||"Sistema"}{!n.read_at&&<><i/>Não lida</>}</span>
                <h2>{n.title}</h2>
                <p>{n.body}</p>
                <time dateTime={n.created_at}>{fmtTime(n.created_at)}</time>
              </Link>
              {!n.read_at && (
                <button
                  className="admin-icon-button"
                  aria-label={`Marcar como lida: ${n.title}`}
                  onClick={() =>
                    context
                      .mark(n.id)
                      .catch((cause) => notify(cause.message, true))
                  }
                >
                  <Icon name="check" />
                </button>
              )}
            </article>
          ))}
          {!items.length && (
            <div className="admin-empty">
              <Icon name="bell" size={32} />
              <h2>Tudo em dia.</h2>
              <p>Novidades e lembretes aparecem aqui.</p>
            </div>
          )}
        </section>
      </QueryState>
      {notice&&<NoticeEditor onClose={()=>setNotice(false)} onSaved={async()=>{await context.reload();notify("Aviso enviado à equipe.")}}/>}
    </>
  );
}
function NoticeEditor({onClose,onSaved}) {
 const [title,setTitle]=useState(''),[body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const attempt=useRef(null);useUnsavedChanges(!!title||!!body);
 const submit=async event=>{event.preventDefault();setBusy(true);setError('');if(!attempt.current||attempt.current.title!==title||attempt.current.body!==body)attempt.current={request_id:crypto.randomUUID(),title,body};try{await notificationRequest({action:'admin-notice',...attempt.current});await onSaved();onClose()}catch(cause){setError(cause.message)}finally{setBusy(false)}};
 return <Modal title="Novo aviso administrativo" subtitle="Enviado às pessoas ativas que permitem notificações de Sistema." onClose={()=>!busy&&onClose()}><form onSubmit={submit}><div className="admin-modal__body admin-form-grid"><Field label="Título" value={title} onChange={setTitle} required maxLength={120}/><Field label="Mensagem"><textarea value={body} onChange={e=>setBody(e.target.value)} required maxLength={500} rows={4}/></Field>{error&&<p className="admin-error" role="alert">{error}</p>}</div><div className="admin-modal__foot"><button type="button" className="admin-button admin-button--secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="admin-button" disabled={busy}>{busy?'Enviando…':'Enviar aviso'}</button></div></form></Modal>;
}
export function NotificationSettingsPage({ notify }) {
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
  const preference = async (key, value) => {
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
      <div className="platform-two-columns">
        <section className="admin-panel platform-permissions">
          <h2>Na plataforma</h2>
          <p className="platform-muted">
            As categorias respeitam os módulos permitidos para sua conta.
          </p>
          <QueryState query={query}>
            {categories.map(([key, label, icon]) => (
              <div className="platform-permission" key={key}>
                <span>
                  <Icon name={icon} />
                  {label}
                </span>
                <button
                  className={`platform-switch${query.data?.[key] ? " is-on" : ""}`}
                  role="switch"
                  aria-label={`Notificações de ${label}`}
                  aria-checked={query.data?.[key] || false}
                  disabled={!!busy}
                  onClick={() => preference(key, !query.data[key])}
                >
                  <span />
                </button>
              </div>
            ))}
          </QueryState>
        </section>
        <PushDevice />
      </div>
    </>
  );
}
