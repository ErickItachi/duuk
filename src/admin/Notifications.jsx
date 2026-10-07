import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { supabase } from "../content/supabase";
import { useAuth } from "../content/AuthContext";
import { useQuery } from "../office/useQuery";
import { checked, notificationRequest } from "./api";
import { Icon, RefreshButton } from "./components";
import { PageTitle, QueryState } from "./forms";
import { usePwa } from "./pwaState";
import { fmtTime } from "../crm/model";

const NotificationContext = createContext(null);
const categories = [
  ["agenda", "Agenda", "calendar"],
  ["contracts", "Contratos", "document"],
  ["finance", "Financeiro", "wallet"],
  ["commercial", "Comercial", "users"],
  ["system", "Sistema", "settings"],
];
const defaults = {
  agenda: true,
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
      async () =>
        checked(
          await supabase
            .from("duuk_notifications")
            .select(
              "id,category,title,body,link,required_permission,read_at,created_at",
            )
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100),
        ) || [],
      [userId],
    ),
  );
  const reload = query.reload;
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
  const notifications = (query.data || []).filter((n) =>
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
        unread: notifications.filter((n) => !n.read_at).length,
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
  const context = useContext(NotificationContext),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState(false);
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
                <h2>{n.title}</h2>
                <p>{n.body}</p>
                <small>{fmtTime(n.created_at)}</small>
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
    </>
  );
}
function applicationKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4),
    raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function NotificationSettingsPage({ notify }) {
  const auth = useAuth(),
    pwa = usePwa(),
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
  const [busy, setBusy] = useState(""),
    [enabled, setEnabled] = useState(false),
    [devices, setDevices] = useState(0),
    [status, setStatus] = useState("");
  const supported =
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator;
  const inspect = useCallback(async () => {
    if (!supported) return;
    const reg = await navigator.serviceWorker.getRegistration("/admin/");
    const sub = await reg?.pushManager.getSubscription();
    setEnabled(!!sub);
    const result = await notificationRequest({ action: "status" });
    setDevices(result.devices);
  }, [supported]);
  useEffect(() => {
    const timer = setTimeout(() => inspect().catch(() => {}), 0);
    return () => clearTimeout(timer);
  }, [inspect]);
  const preference = async (key, value) => {
    setBusy(key);
    try {
      checked(
        await supabase
          .from("duuk_notification_preferences")
          .upsert({
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
  const enable = async () => {
    setBusy("push");
    setStatus("");
    try {
      if (!supported)
        throw new Error(
          "Instale o DUUK Admin na Tela de Início e abra pelo ícone para ativar notificações neste aparelho.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Notificações não autorizadas. Você pode liberar nas configurações do navegador.",
        );
      const result = await notificationRequest({ action: "status" }),
        reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationKey(result.public_key),
      });
      await notificationRequest({
        action: "subscribe",
        subscription: sub.toJSON(),
        device_name:
          navigator.userAgentData?.platform ||
          navigator.platform ||
          "Dispositivo",
      });
      setEnabled(true);
      await inspect();
      setStatus("Notificações ativadas neste dispositivo.");
    } catch (cause) {
      setStatus(cause.message);
    } finally {
      setBusy("");
    }
  };
  const disable = async () => {
    setBusy("push");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/admin/"),
        sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await notificationRequest({
          action: "unsubscribe",
          endpoint: sub.endpoint,
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      await inspect();
      setStatus("Notificações desativadas neste dispositivo.");
    } catch (cause) {
      setStatus(cause.message);
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
        <section className="admin-panel platform-form">
          <span className="office-shortcut-icon">
            <Icon name="bell" size={24} />
          </span>
          <h2>No seu dispositivo</h2>
          <p className="platform-muted">
            Receba lembretes da agenda, contratos, follow-ups e novidades mesmo
            com o aplicativo fechado.
          </p>
          <p className="platform-muted">
            {devices}{" "}
            {devices === 1
              ? "dispositivo registrado"
              : "dispositivos registrados"}{" "}
            na sua conta.
          </p>
          {!supported && (
            <p className="platform-muted">
              No iPhone, use Safari → Compartilhar → Adicionar à Tela de Início.
              Abra pelo ícone para ativar (iOS 16.4 ou mais recente).
            </p>
          )}
          {pwa.canInstall && (
            <button
              className="admin-button admin-button--secondary"
              onClick={pwa.install}
            >
              <Icon name="download" />
              Instalar DUUK Admin
            </button>
          )}
          <button
            className="admin-button"
            disabled={!!busy || !pwa.registration}
            onClick={enabled ? disable : enable}
          >
            <Icon
              name={busy === "push" ? "refresh" : "bell"}
              className={busy === "push" ? "is-spinning" : ""}
            />
            {busy === "push"
              ? "Aguarde…"
              : enabled
                ? "Desativar neste dispositivo"
                : "Ativar notificações"}
          </button>
          {status && (
            <p role="status" className="platform-muted">
              {status}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
