import webpush from "npm:web-push@3.6.7";
import {
  checked,
  database,
  handler,
  HttpError,
  json,
  member,
  readJson,
  text,
} from "../_shared/http.ts";
function subscriptionOf(input: any) {
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
  const length = (s: unknown) => {
    try {
      const value = String(s || "");
      if (!/^[A-Za-z0-9_-]+$/.test(value)) return 0;
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
handler(async (req, headers) => {
  const db = database(),
    body = await readJson(req, 16000);
  let secrets = checked(await db.rpc("duuk_backend_secrets")) || {};
  const cron = req.headers.get("x-duuk-cron");
  const isCron = !!cron && cron === secrets["duuk.push.cron"];
  const user = isCron ? null : await member(req, db);
  if (!secrets["duuk.vapid.private"]) {
    const keys = webpush.generateVAPIDKeys();
    checked(
      await db.rpc("duuk_init_vapid", {
        public_key: keys.publicKey,
        private_key: keys.privateKey,
      }),
    );
    secrets = checked(await db.rpc("duuk_backend_secrets"));
  }
  if (body.action === "status" && user) {
    return json(
      {
        public_key: secrets["duuk.vapid.public"],
        devices: (
          checked(
            await db
              .from("duuk_push_subscriptions")
              .select("id,device_name,created_at")
              .eq("user_id", user.id),
          ) || []
        ).length,
      },
      headers,
    );
  }
  if (body.action === "subscribe" && user) {
    const count =
      checked(
        await db
          .from("duuk_push_subscriptions")
          .select("id")
          .eq("user_id", user.id),
      ) || [];
    if (count.length >= 10)
      throw new HttpError(
        "Limite de 10 dispositivos por conta. Desative um dispositivo antes de adicionar outro.",
      );
    const subscription = subscriptionOf(body.subscription);
    checked(
      await db
        .from("duuk_push_subscriptions")
        .upsert(
          {
            ...subscription,
            user_id: user.id,
            device_name: text(body.device_name, "o dispositivo", 120, false),
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        ),
    );
    return json({ registered: true }, headers);
  }
  if (body.action === "unsubscribe" && user) {
    checked(
      await db
        .from("duuk_push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", text(body.endpoint, "o dispositivo", 4096)),
    );
    return json({ removed: true }, headers);
  }
  if (body.action === "publish-release" && user) {
    const p = checked(
      await db
        .from("duuk_profiles")
        .select("is_super_admin")
        .eq("id", user.id)
        .single(),
    );
    if (!p?.is_super_admin) throw new HttpError("Acesso restrito.", 403);
    checked(
      await db.rpc("duuk_release_publish", {
        release_version: text(body.version, "a versão", 30),
      }),
    );
    return json({ published: true }, headers);
  }
  if (body.action !== "dispatch" || !isCron)
    throw new HttpError("Ação não permitida.", 403);
  if (Deno.env.get("DUUK_MAIL_PASSWORD"))
    await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/duuk-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-duuk-cron": cron! },
      body: JSON.stringify({ action: "poll" }),
      signal: AbortSignal.timeout(20000),
    }).catch(() => {});
  checked(await db.rpc("duuk_generate_notifications"));
  const notifications = checked(await db.rpc("duuk_claim_push")) || [];
  let delivered = 0,
    failed = 0;
  for (const n of notifications) {
    const allowed = checked(
      await db.rpc("duuk_check_permission", {
        actor: n.user_id,
        requested: n.required_permission,
      }),
    );
    const preference = checked(
      await db
        .from("duuk_notification_preferences")
        .select("*")
        .eq("user_id", n.user_id)
        .maybeSingle(),
    );
    const subscriptions =
      allowed && preference?.[n.category] !== false
        ? checked(
            await db
              .from("duuk_push_subscriptions")
              .select("*")
              .eq("user_id", n.user_id),
          ) || []
        : [];
    let retry = false;
    for (const s of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          JSON.stringify({
            title: n.title,
            body: n.body,
            url: n.link,
            tag: n.id,
          }),
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
        delivered++;
      } catch (error: any) {
        if ([404, 410].includes(error.statusCode)) {
          checked(
            await db.from("duuk_push_subscriptions").delete().eq("id", s.id),
          );
        } else {
          retry = true;
          failed++;
        }
      }
    }
    checked(
      await db
        .from("duuk_notifications")
        .update(
          retry
            ? {
                next_attempt_at: new Date(
                  Date.now() + Math.pow(2, n.push_attempts) * 60000,
                ).toISOString(),
              }
            : { push_sent_at: new Date().toISOString() },
        )
        .eq("id", n.id),
    );
  }
  return json({ processed: notifications.length, delivered, failed }, headers);
});
