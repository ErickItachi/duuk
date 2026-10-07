import { useCallback, useEffect, useRef, useState } from "react";
import { notificationRequest } from "./api";
import { Icon, RefreshButton } from "./components";
import { usePwa } from "./pwaState";

function applicationKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushDevice() {
  const pwa = usePwa();
  const supported =
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  const needsInstall = ios && !installed;
  const [device, setDevice] = useState({ state: "checking", devices: 0 });
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState(null);
  const revision = useRef(0);

  const registration = useCallback(async () => {
    const reg =
      pwa.registration ||
      (await navigator.serviceWorker.getRegistration("/admin/"));
    if (!reg?.active || !reg.pushManager)
      throw new Error(
        "O aplicativo ainda está preparando as notificações. Aguarde alguns segundos e verifique novamente.",
      );
    return reg;
  }, [pwa.registration]);

  const inspect = useCallback(async () => {
    const current = ++revision.current;
    if (!supported || needsInstall) {
      setDevice({
        state: needsInstall ? "install" : "unsupported",
        devices: 0,
      });
      return;
    }
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      const result = await notificationRequest({
        action: "status",
        endpoint: sub?.endpoint,
      });
      if (current !== revision.current) return;
      const permission = Notification.permission;
      const connected =
        permission === "granted" && !!sub && result.registered === true;
      setDevice({
        devices: result.devices,
        state:
          permission === "denied"
            ? "blocked"
            : connected
              ? "connected"
              : sub
                ? "disconnected"
                : "disabled",
      });
      return connected;
    } catch (cause) {
      if (current === revision.current)
        setDevice((previous) => ({
          ...previous,
          state: "error",
          error: cause.message,
        }));
      throw cause;
    }
  }, [supported, needsInstall, registration]);

  useEffect(() => {
    const invalidate = () => {
      revision.current++;
    };
    const check = () => {
      if (document.visibilityState === "visible" && navigator.onLine)
        inspect().catch(() => {});
    };
    const timer = setTimeout(check, 0);
    const worker = pwa.registration?.installing;
    worker?.addEventListener("statechange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      invalidate();
      clearTimeout(timer);
      worker?.removeEventListener("statechange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [inspect, pwa.registration]);

  const enable = async () => {
    setBusy("enable");
    setFeedback(null);
    try {
      // iOS requires this call directly inside the user's tap, before network I/O.
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "Permita as notificações em Ajustes > Notificações > DUUK Admin e tente novamente.",
        );
      const result = await notificationRequest({ action: "status" });
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      const key = applicationKey(result.public_key);
      const previousKey = sub?.options?.applicationServerKey;
      if (previousKey && String(new Uint8Array(previousKey)) !== String(key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ||= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      await notificationRequest({
        action: "subscribe",
        subscription: sub.toJSON(),
        device_name: ios
          ? navigator.userAgent.includes("iPad") ||
            (navigator.maxTouchPoints > 1 && navigator.platform === "MacIntel")
            ? "iPad"
            : "iPhone"
          : navigator.userAgentData?.platform ||
            navigator.platform ||
            "Dispositivo",
      });
      if (!(await inspect()))
        throw new Error(
          "O cadastro deste dispositivo ainda não foi confirmado. Toque em Reconectar ou verifique a conexão.",
        );
      setFeedback({
        text: "Dispositivo conectado. Toque em Testar notificação para conferir a entrega.",
      });
    } catch (cause) {
      setFeedback({ text: cause.message, error: true });
      await inspect().catch(() => {});
    } finally {
      setBusy("");
    }
  };

  const disable = async () => {
    setBusy("disable");
    setFeedback(null);
    try {
      const reg = await registration(),
        sub = await reg.pushManager.getSubscription();
      if (sub) {
        await notificationRequest({
          action: "unsubscribe",
          endpoint: sub.endpoint,
        });
        await sub.unsubscribe();
      }
      await inspect();
      setFeedback({
        text: "Notificações desativadas somente neste dispositivo.",
      });
    } catch (cause) {
      setFeedback({ text: cause.message, error: true });
    } finally {
      setBusy("");
    }
  };

  const test = async () => {
    setBusy("test");
    setFeedback(null);
    try {
      const reg = await registration(),
        sub = await reg.pushManager.getSubscription();
      if (!sub)
        throw new Error(
          "Ative as notificações neste dispositivo antes de testar.",
        );
      const result = await notificationRequest({
        action: "test",
        endpoint: sub.endpoint,
      });
      if (!result.accepted)
        throw new Error("O serviço não confirmou o envio. Tente novamente.");
      setFeedback({
        text: "Teste enviado. Confira a Central de Notificações. Se não aparecer, revise as permissões e o modo Foco do aparelho.",
      });
    } catch (cause) {
      setFeedback({ text: cause.message, error: true });
      await inspect().catch(() => {});
    } finally {
      setBusy("");
    }
  };

  const connected = device.state === "connected";
  const labels = {
    checking: "Verificando este dispositivo…",
    connected: "Este dispositivo está conectado",
    disconnected: "O cadastro deste dispositivo precisa ser reconectado",
    disabled: "Notificações ainda não ativadas neste dispositivo",
    blocked: "As notificações estão bloqueadas no aparelho",
    install: "Abra o DUUK Admin pelo ícone da Tela de Início",
    unsupported: "Este navegador não oferece notificações",
    error: "Não foi possível verificar a conexão",
  };
  return (
    <section className="admin-panel platform-form platform-push-device">
      <span className="office-shortcut-icon">
        <Icon name="bell" size={24} />
      </span>
      <h2>No seu dispositivo</h2>
      <p className="platform-muted">
        Receba lembretes da agenda, contratos, follow-ups e e-mails mesmo com o
        aplicativo fechado. Instalar o aplicativo e ativar as notificações são
        passos separados.
      </p>
      <div
        className={`platform-push-state${connected ? " is-connected" : ""}`}
        role="status"
      >
        <Icon name={connected ? "check" : "bell"} />
        <span>{labels[device.state]}</span>
      </div>
      {device.state === "error" && (
        <p className="admin-error" role="alert">
          {device.error}
        </p>
      )}
      {needsInstall || !supported ? (
        <p className="platform-muted">
          No iPhone, use Safari → Compartilhar → Adicionar à Tela de Início.
          Abra pelo ícone para ativar (iOS 16.4 ou mais recente).
        </p>
      ) : (
        <>
          <p className="platform-muted">
            {device.devices}{" "}
            {device.devices === 1
              ? "dispositivo registrado"
              : "dispositivos registrados"}{" "}
            na sua conta. A conexão acima se refere somente a este aparelho.
          </p>
          {device.state === "blocked" && (
            <p className="platform-muted">
              No iPhone, abra Ajustes → Notificações → DUUK Admin → Permitir
              Notificações. Confira também o modo Foco e o Resumo Agendado.
            </p>
          )}
          <div className="platform-push-actions">
            <button
              className="admin-button"
              disabled={
                !!busy || !pwa.registration || device.state === "checking"
              }
              onClick={connected ? disable : enable}
            >
              <Icon
                name={busy && busy !== "test" ? "refresh" : "bell"}
                className={busy && busy !== "test" ? "is-spinning" : ""}
              />
              {busy === "enable" || busy === "disable"
                ? "Aguarde…"
                : connected
                  ? "Desativar neste dispositivo"
                  : device.state === "disconnected"
                    ? "Reconectar este dispositivo"
                    : "Ativar notificações"}
            </button>
            {connected && (
              <button
                className="admin-button admin-button--secondary"
                disabled={!!busy}
                onClick={test}
              >
                <Icon
                  name={busy === "test" ? "refresh" : "send"}
                  className={busy === "test" ? "is-spinning" : ""}
                />
                {busy === "test" ? "Enviando teste…" : "Testar notificação"}
              </button>
            )}
            <RefreshButton
              label="Verificar conexão"
              onRefresh={inspect}
              disabled={!!busy}
            />
          </div>
        </>
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
      {feedback && (
        <p
          role={feedback.error ? "alert" : "status"}
          className={feedback.error ? "admin-error" : "platform-muted"}
        >
          {feedback.text}
        </p>
      )}
      <p className="platform-muted">
        A agenda avisa um dia antes, às 9h, e uma hora antes do compromisso. Os
        envios automáticos são verificados a cada cinco minutos.
      </p>
    </section>
  );
}
