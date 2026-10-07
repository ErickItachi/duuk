import { dirtyForms } from "./unsavedChanges";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageTitle } from "./forms";
import { Icon } from "./components";
import BrandLoader from "../components/BrandLoader";

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
  const requested = useRef(false),
    timeout = useRef(null),
    navigate = useNavigate();
  const check = useCallback(async () => {
    if (!import.meta.env.PROD) return;
    setChecking(true);
    setMessage("");
    try {
      const response = await fetch("/admin-version.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const metadata = await response.json();
      if (metadata.build_id !== installedBuild) {
        setAvailable(metadata);
        setMessage(`DUUK Admin ${metadata.version} disponível.`);
      } else {
        setAvailable(null);
        setMessage("Você está usando a versão mais recente.");
      }
      await registration?.update();
    } catch {
      setMessage("Não foi possível verificar. Confira sua conexão.");
    } finally {
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
      setMessage(
        "Salve ou descarte as alterações pendentes antes de atualizar.",
      );
      return;
    }
    if (offline) {
      setMessage("Reconecte antes de atualizar o aplicativo.");
      return;
    }
    setUpdating("Preparando atualização…");
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
          setMessage(
            "A atualização não concluiu. Verifique sua conexão e tente novamente.",
          );
        }, 15000);
      } else window.location.reload();
    } catch (cause) {
      requested.current = false;
      setUpdating("");
      setMessage(cause.message || "Não foi possível atualizar agora.");
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
        message,
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
            className="admin-button admin-button--secondary"
            disabled={checking}
            onClick={retry}
          >
            <Icon name="refresh" className={checking ? "is-spinning" : ""} />
            Tentar novamente
          </button>
        </div>
      )}
      {connection && (
        <div className="admin-connection is-online" role="status">
          <Icon name="check" />
          {connection}
        </div>
      )}
      {updating && (
        <BrandLoader label={updating} detail="Atualizando DUUK Admin" />
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
      <button
        className="admin-button admin-button--secondary"
        onClick={pwa.update}
        disabled={!!pwa.updating || pwa.checking}
      >
        Atualizar app
      </button>
    </div>
  );
}
export function AboutAdminPage() {
  const pwa = usePwa();
  return (
    <>
      <PageTitle
        title="Sobre o DUUK Admin"
        description="O espaço da equipe. Sempre em movimento."
      />
      <section className="admin-panel platform-about">
        <img
          src="/admin-assets/icon-180.png"
          width="76"
          height="76"
          alt="DUUK Admin"
        />
        <div>
          <h2>DUUK Admin</h2>
          <p>
            Versão instalada <strong>{currentRelease.version}</strong>
          </p>
          <small>
            Última atualização:{" "}
            {new Date(
              currentRelease.date + "T12:00:00-03:00",
            ).toLocaleDateString("pt-BR")}
          </small>
          <p className="platform-muted">
            {pwa.available
              ? `Nova versão: ${pwa.available.version}`
              : "Aplicativo atualizado"}
          </p>
        </div>
        <div className="platform-about__actions">
          <button
            className="admin-button admin-button--secondary"
            disabled={pwa.checking}
            onClick={pwa.check}
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
          {pwa.available && (
            <button
              className="admin-button"
              disabled={!!pwa.updating}
              onClick={pwa.update}
            >
              Atualizar agora
            </button>
          )}
          {pwa.canInstall && (
            <button
              className="admin-button admin-button--secondary"
              onClick={pwa.install}
            >
              <Icon name="download" />
              Instalar aplicativo
            </button>
          )}
        </div>
        {pwa.message && (
          <p className="platform-muted" role="status">
            {pwa.message}
          </p>
        )}
      </section>
    </>
  );
}
