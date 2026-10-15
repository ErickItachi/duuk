import { dirtyForms } from "./unsavedChanges";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageTitle } from "./forms";
import { Icon } from "./components";
import AdminLoader from './shell/AdminLoader';
import './updates.css';

import { PwaContext, usePwa, currentRelease, installedBuild } from "./pwaState";
export function PwaProvider({ children }) {
  const [available, setAvailable] = useState(null),
    [checking, setChecking] = useState(false),
    [message, setMessage] = useState(""),
    [updating, setUpdating] = useState(""),
    [offline, setOffline] = useState(!navigator.onLine),
    [connection, setConnection] = useState(""),
    [registration, setRegistration] = useState(null),
    [installPrompt, setInstallPrompt] = useState(null);
  const [checkStatus, setCheckStatus] = useState('idle'),
    [actionMessage, setActionMessage] = useState('');
  const checkInFlight = useRef(false);
  const requested = useRef(false),
    timeout = useRef(null),
    navigate = useNavigate();
  const check = useCallback(async (manual = false) => {
    if (!import.meta.env.PROD || checkInFlight.current) return;
    checkInFlight.current = true;
    if (manual === true) setActionMessage('');
    setChecking(true);
    setCheckStatus('checking');
    setMessage("");
    try {
      const response = await fetch("/admin-version.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const metadata = await response.json();
      if (typeof metadata.version !== 'string' || typeof metadata.build_id !== 'string') throw new Error();
      if (metadata.build_id !== installedBuild) {
        setAvailable(metadata);
        setCheckStatus('available');
        setMessage(`DUUK Admin ${metadata.version} disponível.`);
      } else {
        setAvailable(null);
        setCheckStatus('current');
        setMessage("Você está usando a versão mais recente.");
      }
      // A worker transport failure must not invalidate a successful version check.
      await registration?.update().catch(() => {});
    } catch {
      setCheckStatus('error');
      setMessage("Não foi possível verificar. Confira sua conexão.");
    } finally {
      checkInFlight.current = false;
      setChecking(false);
    }
  }, [registration]);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    navigator.serviceWorker
      .register("/admin-sw.js", { scope: "/admin", updateViaCache: "none" })
      .then((reg) => {
        if (active) setRegistration(reg);
      })
      .catch(() => {
        if (active)
          setMessage(
            "Não foi possível preparar o aplicativo. Tente verificar novamente.",
          );
      });
    const control = () => {
      navigator.serviceWorker.controller?.postMessage({
        type: "DUUK_CLIENT_VERSION",
        build: installedBuild,
      });
      if (requested.current) {
        clearTimeout(timeout.current);
        window.location.reload();
      }
    };
    const receive = (event) => {
      if (event.data?.type === "DUUK_REPORT_VERSION")
        navigator.serviceWorker.controller?.postMessage({
          type: "DUUK_CLIENT_VERSION",
          build: installedBuild,
        });
      if (event.data?.type === "DUUK_NAVIGATE") {
        try {
          const url = new URL(event.data.url, location.origin);
          if (
            url.origin === location.origin &&
            /^\/admin(?:\/|$)/.test(url.pathname)
          )
            navigate(url.pathname + url.search);
        } catch {}
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", control);
    navigator.serviceWorker.addEventListener("message", receive);
    navigator.serviceWorker.controller?.postMessage({
      type: "DUUK_CLIENT_VERSION",
      build: installedBuild,
    });
    return () => {
      active = false;
      clearTimeout(timeout.current);
      navigator.serviceWorker.removeEventListener("controllerchange", control);
      navigator.serviceWorker.removeEventListener("message", receive);
    };
  }, [navigate]);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const initial = setTimeout(check, 0);
    const focus = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 10 * 60000);
    const found = () => {
      const worker = registration?.installing;
      if (worker)
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") check();
        });
    };
    registration?.addEventListener("updatefound", found);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      registration?.removeEventListener("updatefound", found);
    };
  }, [check, registration]);
  useEffect(() => {
    const lost = () => {
        setOffline(true);
        setConnection("");
      },
      restored = () => {
        setOffline(false);
        setConnection("Conexão restaurada.");
        setTimeout(() => setConnection(""), 5000);
      };
    const install = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("offline", lost);
    window.addEventListener("online", restored);
    window.addEventListener("beforeinstallprompt", install);
    return () => {
      window.removeEventListener("offline", lost);
      window.removeEventListener("online", restored);
      window.removeEventListener("beforeinstallprompt", install);
    };
  }, []);
  const retry = async () => {
    setChecking(true);
    try {
      const response = await fetch("/admin-version.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error();
      setOffline(false);
      setConnection("Conexão restaurada.");
    } catch {
      setOffline(true);
    } finally {
      setChecking(false);
    }
  };
  const update = async () => {
    if (requested.current || updating) return;
    if (dirtyForms.size) {
      setActionMessage(
        "Salve ou descarte as alterações pendentes antes de atualizar.",
      );
      return;
    }
    if (offline) {
      setActionMessage("Reconecte antes de atualizar o aplicativo.");
      return;
    }
    setUpdating("Preparando atualização…");
    setActionMessage('');
    requested.current = true;
    try {
      await registration?.update();
      if (registration && !registration.waiting && registration.installing)
        await new Promise((resolve, reject) => {
          const limit = setTimeout(
            () =>
              reject(
                new Error(
                  "A nova versão ainda está sendo preparada. Tente novamente em instantes.",
                ),
              ),
            15000,
          );
          registration.installing.addEventListener(
            "statechange",
            function state() {
              if (this.state === "installed") {
                clearTimeout(limit);
                resolve();
              }
              if (this.state === "redundant") {
                clearTimeout(limit);
                reject(new Error("Não foi possível preparar a nova versão."));
              }
            },
          );
        });
      setUpdating(
        `Instalando versão ${available?.version || currentRelease.version}…`,
      );
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        timeout.current = setTimeout(() => {
          requested.current = false;
          setUpdating("");
          setActionMessage(
            "A atualização não concluiu. Verifique sua conexão e tente novamente.",
          );
        }, 15000);
      } else window.location.reload();
    } catch (cause) {
      requested.current = false;
      setUpdating("");
      setActionMessage(cause.message || "Não foi possível atualizar agora.");
    }
  };
  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  return (
    <PwaContext.Provider
      value={{
        available,
        checking,
        message: actionMessage || message,
        hasActionMessage: !!actionMessage,
        checkStatus,
        updating,
        offline,
        check,
        update,
        install,
        canInstall: !!installPrompt,
        registration,
      }}
    >
      {children}
      {offline && (
        <div className="admin-connection" role="status">
          <Icon name="wifi" />
          <div>
            <strong>Sem conexão</strong>
            <p>
              Algumas informações podem estar desatualizadas. Reconecte para
              salvar.
            </p>
          </div>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={checking}
            aria-busy={checking}
            onClick={retry}
          >
            <Icon name="refresh" className={checking ? "is-spinning" : ""} />
            Tentar novamente
          </button>
        </div>
      )}
      {connection && (
        <div className="admin-connection is-online" role="status">
          <Icon name="checkCircle" />
          <span>{connection}</span>
        </div>
      )}
      {updating && (
        <AdminLoader label={updating} />
      )}
    </PwaContext.Provider>
  );
}
export function UpdateNotice() {
  const pwa = usePwa();
  if (!pwa.available) return null;
  return (
    <div className="admin-update-notice">
      <Icon name="refresh" />
      <div>
        <strong>Uma atualização está disponível</strong>
        <p>{pwa.message || "Atualize o aplicativo quando estiver pronto."}</p>
      </div>
      <div className="admin-update-notice__actions"><button
        type="button"
        className="admin-button admin-button--secondary"
        onClick={pwa.update}
        disabled={!!pwa.updating || pwa.checking}
      >
        Atualizar app
      </button></div>
    </div>
  );
}
const releaseDate = (value) =>
  new Date(value + "T12:00:00-03:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
// Tone and icon of the version check; the words come from the provider unchanged.
function checkTone(pwa) {
  if (pwa.checking) return ["checking", null];
  if (pwa.hasActionMessage) return ["warning", "warning"];
  if (pwa.checkStatus === "current") return ["success", "checkCircle"];
  if (pwa.checkStatus === "error") return ["warning", "wifi"];
  if (pwa.checkStatus === "available") return ["info", "download"];
  return ["neutral", "info"];
}
export function AboutAdminPage() {
  const pwa = usePwa();
  const [tone, icon] = checkTone(pwa);
  return (
    <>
      <PageTitle
        title="Sobre o DUUK Admin"
        description="O espaço da equipe. Sempre em movimento."
      />
      <div className="settings-about">
        <section
          className="ds-card settings-about__app"
          aria-labelledby="settings-about-title"
        >
          <div className="settings-about__identity">
            <img
              src="/admin-assets/icon-180.png"
              width="56"
              height="56"
              alt=""
            />
            <div>
              <h2 id="settings-about-title">DUUK Admin</h2>
              <p>
                Versão instalada <strong>{currentRelease.version}</strong>
              </p>
              <small>
                Última atualização:{" "}
                <time dateTime={currentRelease.date}>
                  {releaseDate(currentRelease.date)}
                </time>
              </small>
            </div>
          </div>
          <div
            className={`settings-about__status is-${tone}`}
            role="status"
            aria-live="polite"
          >
            {icon ? (
              <Icon name={icon} />
            ) : (
              <span className="ds-spinner" aria-hidden="true" />
            )}
            <span>
              {pwa.checking
                ? "Verificando a versão disponível…"
                : pwa.message ||
                  "Confira se há uma nova versão disponível para o aplicativo."}
            </span>
          </div>
          <div className="settings-about__actions">
            {pwa.available && (
              <button
                type="button"
                className="admin-button"
                disabled={!!pwa.updating}
                aria-busy={!!pwa.updating}
                onClick={pwa.update}
              >
                <Icon name="download" />
                Atualizar agora
              </button>
            )}
            <button
              type="button"
              className="admin-button admin-button--secondary"
              disabled={pwa.checking}
              onClick={() => pwa.check(true)}
              aria-busy={pwa.checking}
            >
              <Icon
                name="refresh"
                className={pwa.checking ? "is-spinning" : ""}
              />
              {pwa.checking
                ? "Verificando atualizações…"
                : "Verificar atualizações"}
            </button>
            {pwa.canInstall && (
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={pwa.install}
              >
                <Icon name="download" />
                Instalar aplicativo
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
