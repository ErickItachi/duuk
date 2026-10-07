import { Buffer } from "node:buffer";
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
// GoDaddy Professional Email. Hosts are fixed server-side, never accepted from a request.
const email = "contato@duukfilms.com";
const config = () => ({
  user: Deno.env.get("DUUK_MAIL_USERNAME") || email,
  password: Deno.env.get("DUUK_MAIL_PASSWORD") || "",
});
handler(async (req, headers) => {
  const db = database(),
    body = await readJson(req, 8000000),
    credentials = config();
  const cron = req.headers.get("x-duuk-cron"),
    secrets = cron ? checked(await db.rpc("duuk_backend_secrets")) : null,
    isCron = !!cron && cron === secrets?.["duuk.push.cron"];
  const user = isCron ? null : await member(req, db, "mail");
  if (isCron && body.action !== "poll")
    throw new HttpError("Ação não permitida.", 403);
  if (body.action === "status")
    return json(
      {
        provider: "GoDaddy",
        address: email,
        configured: !!credentials.password,
      },
      headers,
    );
  if (body.action === "poll" && !credentials.password)
    return json({ configured: false }, headers);
  if (!credentials.password)
    throw new HttpError(
      "A conexão GoDaddy aguarda a configuração segura da caixa de e-mail no servidor.",
      503,
    );
  if (body.action === "send" && user) {
    const to = text(body.to, "o destinatário", 254),
      subject = text(body.subject, "o assunto", 250),
      message = text(body.text, "a mensagem", 50000);
    if (!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(to))
      throw new HttpError("Destinatário inválido.");
    const attachments = (
      Array.isArray(body.attachments) ? body.attachments : []
    )
      .slice(0, 5)
      .map((a: any) => ({
        filename: text(a.name, "o nome do anexo", 160),
        content: Buffer.from(String(a.base64 || ""), "base64"),
        contentType: "application/octet-stream",
      }));
    if (
      attachments.reduce((n: number, a: any) => n + a.content.length, 0) >
      5000000
    )
      throw new HttpError("Use anexos de até 5 MB no total.");
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
    checked(
      await db
        .from("duuk_mail_outbox")
        .insert({
          request_id: requestId,
          created_by: user.id,
          status: "sending",
        }),
    );
    const nodemailer = (await import("npm:nodemailer@10.0.15")).default;
    const transport = nodemailer.createTransport({
      host: "smtpout.secureserver.net",
      port: 465,
      secure: true,
      auth: { user: credentials.user, pass: credentials.password },
      connectionTimeout: 15000,
      socketTimeout: 20000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    let result;
    try {
      result = await transport.sendMail({
        from: { name: "DUUK Films", address: email },
        to,
        subject,
        text: message,
        attachments,
        inReplyTo: body.in_reply_to
          ? text(body.in_reply_to, "a conversa", 1000)
          : undefined,
        references: body.in_reply_to
          ? [text(body.in_reply_to, "a conversa", 1000)]
          : undefined,
      });
    } catch {
      await db
        .from("duuk_mail_outbox")
        .update({ status: "uncertain" })
        .eq("request_id", requestId);
      throw new HttpError(
        "A GoDaddy não confirmou o envio. Confira a pasta Enviados no webmail antes de enviar novamente.",
        502,
      );
    } finally {
      transport.close();
    }
    checked(
      await db
        .from("duuk_mail_outbox")
        .update({ status: "sent", message_id: result.messageId })
        .eq("request_id", requestId),
    );
    checked(
      await db
        .from("duuk_mail_links")
        .insert({
          message_id: result.messageId,
          client_id: clientId,
          subject,
          direction: "out",
          sender: email,
          recipient: to,
          sent_at: new Date().toISOString(),
          created_by: user.id,
        }),
    );
    if (clientId) {
      checked(
        await db
          .from("duuk_activities")
          .insert({
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
      await db
        .from("duuk_audit")
        .insert({
          actor_id: user.id,
          actor_name: user.email,
          action: "email-sent",
          entity: "duuk_mail_links",
          entity_id: result.messageId,
          summary: "E-mail enviado pela GoDaddy",
        }),
    );
    return json({ sent: true, message_id: result.messageId }, headers);
  }
  const { ImapFlow } = await import("npm:imapflow@2.2.6");
  const client = new ImapFlow({
    host: "imap.secureserver.net",
    port: 993,
    secure: true,
    auth: credentials,
    logger: false,
    connectionTimeout: 15000,
    socketTimeout: 20000,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
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
            await db
              .from("duuk_mail_cursor")
              .upsert({
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
          search
            ? { or: [{ subject: search }, { from: search }, { text: search }] }
            : { all: true },
          { uid: true },
        );
        const selected = (uids || []).slice(-50);
        const messages = [];
        if (selected.length)
          for await (const m of client.fetch(
            selected,
            { uid: true, envelope: true, flags: true, internalDate: true },
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
            });
          }
        return json(
          { messages: messages.reverse(), more: (uids || []).length > 50 },
          headers,
        );
      }
      const uid = Number(body.uid);
      if (!Number.isSafeInteger(uid) || uid < 1)
        throw new HttpError("Mensagem inválida.");
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
            text:
              parsed.text ||
              "Esta mensagem contém apenas HTML. Abra o webmail para visualizar.",
            from: parsed.from?.value,
            to: parsed.to,
            message_id: parsed.messageId,
            date: parsed.date,
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
          await db
            .from("duuk_mail_links")
            .upsert(
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
      "Não foi possível conectar à caixa GoDaddy. Confira as credenciais no servidor.",
      502,
    );
  } finally {
    await client.logout().catch(() => {});
  }
});
