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
  uuid,
} from "../_shared/http.ts";
import {
  subscriptionOf,
  sendPush,
  pushFailure,
  testDevicePush,
} from "../_shared/push.ts";
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
    const devices =
      checked(
        await db
          .from("duuk_push_subscriptions")
          .select("id,endpoint")
          .eq("user_id", user.id),
      ) || [];
    const endpoint = text(body.endpoint, "o dispositivo", 4096, false);
    return json(
      {
        public_key: secrets["duuk.vapid.public"],
        devices: devices.length,
        registered:
          !!endpoint && devices.some((s: any) => s.endpoint === endpoint),
      },
      headers,
    );
  }
  if (body.action === "subscribe" && user) {
    const count =
      checked(
        await db
          .from("duuk_push_subscriptions")
          .select("id,endpoint")
          .eq("user_id", user.id),
      ) || [];
    const subscription = subscriptionOf(body.subscription);
    if (
      count.length >= 10 &&
      !count.some((s: any) => s.endpoint === subscription.endpoint)
    )
      throw new HttpError(
        "Limite de 10 dispositivos por conta. Desative um dispositivo antes de adicionar outro.",
      );
    checked(
      await db.from("duuk_push_subscriptions").upsert(
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
  if (body.action === "test" && user) {
    return json(
      await testDevicePush(db, user.id, body.endpoint, secrets),
      headers,
    );
  }
  if(body.action==='admin-notice'&&user){
    if(!checked(await db.rpc('duuk_action_limit',{actor:user.id,action_name:'admin-notice',maximum:5,window_seconds:3600})))throw new HttpError('Limite de cinco avisos por hora. Aguarde antes de enviar outro.',429);
    checked(await db.rpc('duuk_admin_notice',{actor:user.id,heading:text(body.title,'o título',120),message:text(body.body,'a mensagem',500),request_id:uuid(body.request_id)}));
    return json({sent:true},headers);
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
  await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/duuk-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-duuk-cron": cron! },
    body: JSON.stringify({ action: "poll" }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => {});
  checked(await db.rpc("duuk_generate_notifications"));
  checked(await db.rpc("duuk_generate_action_reminders"));
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
        await sendPush(
          s,
          {
            title: n.title,
            body: n.body,
            url: n.link,
            tag: n.id,
          },
          secrets,
        );
        delivered++;
      } catch (error: any) {
        const failure = pushFailure(error);
        console.error(
          JSON.stringify({
            source: "push",
            stage: "dispatch",
            status: failure.status,
          }),
        );
        if (failure.expired) {
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
