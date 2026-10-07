import { Buffer } from "node:buffer";
import {
  checked,
  database,
  handler,
  HttpError,
  json,
  member,
  readJson,
  uuid,
} from "../_shared/http.ts";
import {
  mailbox as email,
  mailProvider,
  mailCredentials,
  smtpTransport,
  imapClient,
  verifyMailbox,
} from "../_shared/mail.ts";
import {
  cleanMailHtml,
  hasAttachments,
  outgoingMail,
  rawMail,
  sentFolder,
  archiveSentMessage,
} from "../_shared/mail-content.ts";
handler(async (req, headers) => {
  const db = database(),
    body = await readJson(req, 8000000);
  const cron = req.headers.get("x-duuk-cron"),
    secrets = cron ? checked(await db.rpc("duuk_backend_secrets")) : null,
    isCron = !!cron && cron === secrets?.["duuk.push.cron"];
  const user = isCron ? null : await member(req, db, "mail");
  if (isCron && body.action !== "poll")
    throw new HttpError("Ação não permitida.", 403);
  const canConfigure = async () =>
    !!user &&
    !!checked(
      await db
        .from("duuk_profiles")
        .select("is_super_admin")
        .eq("id", user.id)
        .single(),
    )?.is_super_admin;
  if (body.action === "connect" && user) {
    if (!(await canConfigure()))
      throw new HttpError(
        "Somente um super administrador pode conectar a caixa.",
        403,
      );
    if (
      typeof body.password !== "string" ||
      !body.password.length ||
      body.password.length > 1024
    )
      throw new HttpError("Informe a senha da caixa de e-mail.");
    if (
      !checked(
        await db.rpc("duuk_action_limit", {
          action_name: "mail-connect",
          actor: user.id,
          maximum: 5,
          window_seconds: 900,
        }),
      )
    )
      throw new HttpError(
        "Aguarde alguns minutos antes de tentar conectar novamente.",
        429,
      );
    await verifyMailbox({ user: email, password: body.password });
    checked(
      await db.rpc("duuk_connect_mail", {
        actor: user.id,
        mailbox_password: body.password,
      }),
    );
    return json(
      { connected: true, provider: mailProvider, address: email },
      headers,
    );
  }
  const credentials = await mailCredentials(db);
  if (body.action === "status")
    return json(
      {
        provider: mailProvider,
        address: email,
        configured: !!credentials.password,
        can_configure: await canConfigure(),
      },
      headers,
    );
  if (body.action === "poll" && !credentials.password)
    return json({ configured: false }, headers);
  if (!credentials.password)
    throw new HttpError(
      "Conecte a caixa Titan para acessar seus e-mails.",
      503,
    );
  if (body.action === "send" && user) {
    const outgoing = outgoingMail(body),
      { subject } = outgoing;
    const clientId = body.client_id ? uuid(body.client_id) : null;
    if (clientId) {
      if (
        !checked(
          await db.rpc("duuk_check_permission", {
            actor: user.id,
            requested: "crm",
          }),
        )
      )
        throw new HttpError("Sem acesso ao cliente.", 403);
      if (
        !checked(
          await db
            .from("duuk_clients")
            .select("id")
            .eq("id", clientId)
            .maybeSingle(),
        )
      )
        throw new HttpError("Cliente não encontrado.");
    }
    const requestId = uuid(body.request_id);
    const existing = checked(
      await db
        .from("duuk_mail_outbox")
        .select("status,message_id,created_by")
        .eq("request_id", requestId)
        .maybeSingle(),
    );
    if (existing) {
      if (existing.created_by !== user.id)
        throw new HttpError("Solicitação inválida.", 403);
      if (existing.status === "sent")
        return json({ sent: true, message_id: existing.message_id }, headers);
      throw new HttpError(
        "O envio anterior está em verificação. Confira a pasta Enviados no webmail antes de criar outra mensagem.",
        409,
      );
    }
    if (
      !checked(
        await db.rpc("duuk_action_limit", {
          actor: user.id,
          action_name: "mail-send",
          maximum: 10,
          window_seconds: 3600,
        }),
      )
    )
      throw new HttpError(
        "Limite de 10 envios por hora. Aguarde antes de enviar novamente.",
        429,
      );
    const compiled = await rawMail({
      ...outgoing,
      from: { name: "DUUK Films", address: email },
    });
    checked(
      await db.from("duuk_mail_outbox").insert({
        request_id: requestId,
        created_by: user.id,
        status: "sending",
      }),
    );
    const transport = await smtpTransport(credentials);
    let rejected: string[] = [];
    try {
      const result = await transport.sendMail({
        envelope: compiled.envelope,
        raw: compiled.raw,
      });
      rejected = (result.rejected || []).map(String);
    } catch {
      await db
        .from("duuk_mail_outbox")
        .update({ status: "uncertain" })
        .eq("request_id", requestId);
      throw new HttpError(
        "O Titan não confirmou o envio. Confira a pasta Enviados no webmail antes de enviar novamente.",
        502,
      );
    } finally {
      transport.close();
    }
    checked(
      await db
        .from("duuk_mail_outbox")
        .update({ status: "sent", message_id: compiled.messageId })
        .eq("request_id", requestId),
    );
    checked(
      await db.from("duuk_mail_links").insert({
        message_id: compiled.messageId,
        client_id: clientId,
        subject,
        direction: "out",
        sender: email,
        recipient: outgoing.to.join(", "),
        sent_at: new Date().toISOString(),
        created_by: user.id,
      }),
    );
    if (clientId) {
      checked(
        await db.from("duuk_activities").insert({
          client_id: clientId,
          user_id: user.id,
          channel: "email",
          notes: `E-mail enviado: ${subject}`,
          result: "Envio confirmado pelo servidor SMTP",
          next_step: "",
        }),
      );
    }
    checked(
      await db.from("duuk_audit").insert({
        actor_id: user.id,
        actor_name: user.email,
        action: "email-sent",
        entity: "duuk_mail_links",
        entity_id: compiled.messageId,
        summary: "E-mail enviado pelo Titan",
      }),
    );
    // Delivery is recorded before archiving. An IMAP failure must not prompt a
    // second SMTP send. Only this mailbox's private Sent copy includes Bcc.
    let sentCopySaved = false;
    const archive = await imapClient(credentials);
    try {
      await archive.connect();
      sentCopySaved = await archiveSentMessage(archive, compiled);
    } catch {
      console.error(
        JSON.stringify({
          source: "mail",
          stage: "sent-copy",
          code: "archive-failed",
        }),
      );
    } finally {
      await archive.logout().catch(() => {});
    }
    return json(
      {
        sent: true,
        message_id: compiled.messageId,
        sent_copy_saved: sentCopySaved,
        rejected,
      },
      headers,
    );
  }
  if (
    !["poll", "list", "read", "attachment", "associate", "flag"].includes(
      body.action,
    )
  )
    throw new HttpError("Ação inválida.");
  const folderKey = body.action === "poll" ? "inbox" : body.folder || "inbox";
  if (!["inbox", "sent"].includes(folderKey))
    throw new HttpError("Pasta inválida.");
  const client = await imapClient(credentials);
  try {
    await client.connect();
    const folder = folderKey === "sent" ? await sentFolder(client) : "INBOX";
    if (!folder) {
      if (body.action === "list")
        return json({ messages: [], more: false, total: 0 }, headers);
      throw new HttpError("Pasta não encontrada.", 404);
    }
    const lock = await client.getMailboxLock(folder);
    try {
      if (body.action === "poll") {
        const validity = String(
            (client.mailbox && client.mailbox.uidValidity) || "",
          ),
          cursor = checked(
            await db
              .from("duuk_mail_cursor")
              .select("*")
              .eq("mailbox", "INBOX")
              .maybeSingle(),
          );
        if (!cursor || cursor.uid_validity !== validity) {
          checked(
            await db.from("duuk_mail_cursor").upsert({
              mailbox: "INBOX",
              uid_validity: validity,
              last_uid: Math.max(
                0,
                Number((client.mailbox && client.mailbox.uidNext) || 1) - 1,
              ),
              updated_at: new Date().toISOString(),
            }),
          );
          return json({ initialized: true }, headers);
        }
        const found = (
          (await client.search(
            { uid: `${Number(cursor.last_uid) + 1}:*` },
            { uid: true },
          )) || []
        )
          .filter((uid: number) => uid > Number(cursor.last_uid))
          .sort((a: number, b: number) => a - b)
          .slice(0, 20);
        let last = Number(cursor.last_uid);
        if (found.length)
          for await (const m of client.fetch(
            found,
            { uid: true, envelope: true, internalDate: true },
            { uid: true },
          )) {
            const envelope = m.envelope;
            checked(
              await db.rpc("duuk_record_received_mail", {
                provider_id: envelope?.messageId || `imap:${validity}:${m.uid}`,
                heading: envelope?.subject || "(Sem assunto)",
                sender_address: envelope?.from?.[0]?.address || "Remetente",
                recipient_address: email,
                received_at:
                  envelope?.date || m.internalDate || new Date().toISOString(),
                message_uid: m.uid,
              }),
            );
            last = Math.max(last, m.uid);
          }
        checked(
          await db
            .from("duuk_mail_cursor")
            .update({ last_uid: last, updated_at: new Date().toISOString() })
            .eq("mailbox", "INBOX"),
        );
        return json({ received: found.length }, headers);
      }
      if (!user) throw new HttpError("Entre no painel.", 401);
      if (
        !checked(
          await db.rpc("duuk_action_limit", {
            actor: user.id,
            action_name: "mail-read",
            maximum: 30,
            window_seconds: 60,
          }),
        )
      )
        throw new HttpError("Muitas consultas. Aguarde um instante.", 429);
      if (body.action === "list") {
        const search = String(body.search || "")
          .trim()
          .slice(0, 160);
        const uids = await client.search(
          {
            ...(search
              ? {
                  or: [
                    { subject: search },
                    { from: search },
                    { to: search },
                    { text: search },
                  ],
                }
              : { all: true }),
            ...(body.unread_only === true ? { seen: false } : {}),
          },
          { uid: true },
        );
        const selected = (uids || []).slice(-50);
        const messages = [];
        if (selected.length)
          for await (const m of client.fetch(
            selected,
            {
              uid: true,
              envelope: true,
              flags: true,
              internalDate: true,
              bodyStructure: true,
            },
            { uid: true },
          )) {
            messages.push({
              uid: m.uid,
              subject: m.envelope?.subject || "(Sem assunto)",
              from: m.envelope?.from?.map((a: any) => ({
                name: a.name,
                address: a.address,
              })),
              to: m.envelope?.to?.map((a: any) => ({
                name: a.name,
                address: a.address,
              })),
              date: m.envelope?.date || m.internalDate,
              message_id: m.envelope?.messageId,
              unread: !m.flags?.has("\\Seen"),
              has_attachments: hasAttachments(m.bodyStructure),
              folder: folderKey,
            });
          }
        return json(
          {
            messages: messages.reverse(),
            more: (uids || []).length > 50,
            total: (uids || []).length,
          },
          headers,
        );
      }
      const uid = Number(body.uid);
      if (!Number.isSafeInteger(uid) || uid < 1)
        throw new HttpError("Mensagem inválida.");
      if (body.action === "flag") {
        if (typeof body.read !== "boolean")
          throw new HttpError("Estado de leitura inválido.");
        const changed = body.read
          ? await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true })
          : await client.messageFlagsRemove(uid, ["\\Seen"], { uid: true });
        if (!changed) throw new HttpError("Mensagem não encontrada.", 404);
        return json({ saved: true }, headers);
      }
      if (body.action === "read") {
        const m = await client.fetchOne(
          uid,
          { source: { maxLength: 6000000 }, envelope: true },
          { uid: true },
        );
        if (!m) throw new HttpError("Mensagem não encontrada.", 404);
        const { simpleParser } = await import("npm:mailparser@3.9.36");
        const parsed = await simpleParser(m.source || Buffer.alloc(0));
        await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
        return json(
          {
            uid,
            subject: parsed.subject || "",
            text: parsed.text || "",
            html: parsed.html
              ? cleanMailHtml(String(parsed.html).slice(0, 500000))
              : "",
            remote_images_blocked:
              !!parsed.html &&
              /<(img|video|iframe)\b/i.test(String(parsed.html)),
            from: parsed.from?.value,
            to:
              (Array.isArray(parsed.to)
                ? parsed.to.flatMap((a: any) => a.value)
                : parsed.to?.value) || [],
            cc:
              (Array.isArray(parsed.cc)
                ? parsed.cc.flatMap((a: any) => a.value)
                : parsed.cc?.value) || [],
            reply_to: parsed.replyTo?.value || parsed.from?.value,
            message_id: parsed.messageId,
            date: parsed.date,
            folder: folderKey,
            attachments: (parsed.attachments || []).map(
              (a: any, i: number) => ({
                index: i,
                name: a.filename || "anexo",
                size: a.size,
                type: a.contentType,
              }),
            ),
          },
          headers,
        );
      }
      if (body.action === "attachment") {
        if (!Number.isSafeInteger(body.index) || body.index < 0)
          throw new HttpError("Anexo inválido.");
        const m = await client.fetchOne(
          uid,
          { source: { maxLength: 6000000 } },
          { uid: true },
        );
        if (!m) throw new HttpError("Mensagem não encontrada.", 404);
        const { simpleParser } = await import("npm:mailparser@3.9.36"),
          parsed = await simpleParser(m.source || Buffer.alloc(0)),
          attachment = parsed.attachments?.[Number(body.index)];
        if (!attachment || attachment.size > 5000000)
          throw new HttpError("Anexo indisponível ou maior que 5 MB.");
        return json(
          {
            name: attachment.filename || "anexo",
            base64: attachment.content.toString("base64"),
          },
          headers,
        );
      }
      if (body.action === "associate") {
        if (
          !checked(
            await db.rpc("duuk_check_permission", {
              actor: user.id,
              requested: "crm",
            }),
          )
        )
          throw new HttpError("Sem acesso ao Comercial.", 403);
        const m = await client.fetchOne(uid, { envelope: true }, { uid: true });
        if (!m || !m.envelope?.messageId)
          throw new HttpError("Mensagem não encontrada.", 404);
        const cid = uuid(body.client_id);
        checked(
          await db.from("duuk_mail_links").upsert(
            {
              message_id: m.envelope.messageId,
              client_id: cid,
              subject: m.envelope.subject || "",
              direction: "in",
              sender: m.envelope.from?.[0]?.address || "",
              recipient: email,
              sent_at: m.envelope.date || new Date(),
              created_by: user.id,
            },
            { onConflict: "message_id" },
          ),
        );
        return json({ saved: true }, headers);
      }
      throw new HttpError("Ação inválida.");
    } finally {
      lock.release();
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      "Não foi possível conectar à caixa Titan. Confira a conexão em Gerenciar conexão ou tente novamente em instantes.",
      502,
    );
  } finally {
    await client.logout().catch(() => {});
  }
});
