import webpush from "npm:web-push@3.6.7";
import { checked, HttpError, text } from "./http.ts";

export function subscriptionOf(input: any) {
  let url: URL;
  try {
    url = new URL(input?.endpoint);
  } catch {
    throw new HttpError("Dispositivo inválido.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    ![
      "fcm.googleapis.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
      "notify.windows.com",
      "wns.windows.com",
    ].some((host) => url.hostname === host || url.hostname.endsWith("." + host))
  )
    throw new HttpError("Serviço de notificações inválido.");
  const keys = input.keys || {};
  const length = (value: unknown) => {
    try {
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
        return 0;
      return atob(value.replace(/-/g, "+").replace(/_/g, "/")).length;
    } catch {
      return 0;
    }
  };
  if (
    url.href.length > 4096 ||
    length(keys.auth) !== 16 ||
    length(keys.p256dh) !== 65
  )
    throw new HttpError("Chaves do dispositivo inválidas.");
  return { endpoint: url.href, keys: { auth: keys.auth, p256dh: keys.p256dh } };
}

export function sendPush(
  subscription: any,
  payload: any,
  secrets: Record<string, string>,
) {
  return webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject: "mailto:contato@duukfilms.com",
        publicKey: secrets["duuk.vapid.public"],
        privateKey: secrets["duuk.vapid.private"],
      },
      TTL: 3600,
      timeout: 10000,
    },
  );
}

export function pushFailure(error: any) {
  const status = Number(error?.statusCode) || 0;
  return {
    expired: [404, 410].includes(status),
    status: status >= 400 && status <= 599 ? status : 0,
  };
}

export async function testDevicePush(
  db: any,
  actor: string,
  endpointInput: unknown,
  secrets: Record<string, string>,
  send = sendPush,
) {
  const endpoint = text(endpointInput, "o dispositivo", 4096);
  const subscription: any = checked(
    await db
      .from("duuk_push_subscriptions")
      .select("id,endpoint,keys")
      .eq("user_id", actor)
      .eq("endpoint", endpoint)
      .maybeSingle(),
  );
  if (!subscription)
    throw new HttpError(
      "Este dispositivo ainda não está conectado. Ative as notificações novamente.",
      404,
    );
  if (
    !checked(
      await db.rpc("duuk_action_limit", {
        actor: actor,
        action_name: "push-test",
        maximum: 3,
        window_seconds: 300,
      }),
    )
  )
    throw new HttpError(
      "Aguarde alguns minutos antes de testar novamente.",
      429,
    );
  try {
    await send(
      subscription,
      {
        title: "DUUK — teste de notificação",
        body: "Se você está vendo esta mensagem, as notificações chegaram neste dispositivo.",
        url: "/admin/configuracoes/notificacoes",
        tag: "duuk-device-test",
      },
      secrets,
    );
  } catch (error) {
    const failure = pushFailure(error);
    console.error(
      JSON.stringify({
        source: "push",
        stage: "test",
        status: failure.status,
      }),
    );
    if (failure.expired) {
      checked(
        await db
          .from("duuk_push_subscriptions")
          .delete()
          .eq("id", subscription.id)
          .eq("user_id", actor),
      );
      throw new HttpError(
        "O cadastro deste dispositivo expirou. Reconecte as notificações e teste novamente.",
        410,
      );
    }
    throw new HttpError(
      "Não foi possível enviar o teste. Verifique a conexão ou reconecte as notificações.",
      502,
    );
  }

  return { accepted: true };
}
