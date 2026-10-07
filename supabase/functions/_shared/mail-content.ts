import { Buffer } from "node:buffer";
import sanitizeHtml from "npm:sanitize-html@2.18.0";
import MailComposer from "npm:nodemailer@10.0.15/lib/mail-composer";
import { HttpError, text } from "./http.ts";

export function cleanMailHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: [
      "p",
      "br",
      "div",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "mark",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["style"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    allowedStyles: {
      span: { "background-color": [/^#fff2a8$/], color: [/^#161412$/] },
    },
    transformTags: {
      a: (_tag: string, attrs: Record<string, string>) => ({
        tagName: "a",
        attribs: {
          href: attrs.href || "",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      mark: () => ({
        tagName: "span",
        attribs: { style: "background-color:#fff2a8;color:#161412" },
      }),
    },
  });
}

function recipients(value: unknown, label: string, required = false) {
  if (value == null || value === "") {
    if (required) throw new HttpError(`Informe ${label}.`);
    return [];
  }
  if (typeof value !== "string" || value.length > 3000 || /[\r\n]/.test(value))
    throw new HttpError(`Confira ${label}.`);
  const addresses = value.split(/[,;]/).map((s) => s.trim());
  if (
    addresses.some(
      (s) =>
        s.length > 254 ||
        !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(s),
    )
  )
    throw new HttpError(`Confira ${label}. Use e-mails separados por vírgula.`);
  return [...new Set(addresses)];
}

export function outgoingMail(body: any) {
  const to = recipients(body.to, "o destinatário", true),
    cc = recipients(body.cc, "os destinatários em cópia"),
    bcc = recipients(body.bcc, "os destinatários em cópia oculta");
  if (to.length + cc.length + bcc.length > 20)
    throw new HttpError("Use até 20 destinatários por mensagem.");
  const subject = text(body.subject, "o assunto", 250);
  if (/[\r\n]/.test(subject)) throw new HttpError("Confira o assunto.");
  const message = text(body.text, "a mensagem", 50000);
  if (
    body.html != null &&
    (typeof body.html !== "string" || body.html.length > 200000)
  )
    throw new HttpError("A mensagem formatada é muito longa.");
  const html = body.html ? cleanMailHtml(body.html) : undefined;
  if (body.attachments != null && !Array.isArray(body.attachments))
    throw new HttpError("Anexos inválidos.");
  const input = body.attachments || [];
  if (input.length > 5) throw new HttpError("Escolha até 5 anexos.");
  let size = 0;
  const attachments = input.map((a: any) => {
    if (
      !a ||
      typeof a.base64 !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        a.base64,
      )
    )
      throw new HttpError(
        "Um anexo não pôde ser lido. Adicione o arquivo novamente.",
      );
    const content = Buffer.from(a.base64, "base64");
    size += content.length;
    if (size > 5000000) throw new HttpError("Use anexos de até 5 MB no total.");
    const filename = text(a.name, "o nome do anexo", 160);
    if (/[\r\n\0]/.test(filename))
      throw new HttpError("Nome de anexo inválido.");
    return {
      filename: filename.replace(/[\\/]/g, "_"),
      content,
      contentType:
        typeof a.type === "string" &&
        /^[a-z\d!#$&^_.+-]+\/[a-z\d!#$&^_.+-]+$/i.test(a.type)
          ? a.type
          : undefined,
    };
  });
  const inReplyTo = body.in_reply_to
    ? text(body.in_reply_to, "a conversa", 1000)
    : undefined;
  if (inReplyTo && /[\r\n]/.test(inReplyTo))
    throw new HttpError("Conversa inválida.");
  return {
    to,
    cc,
    bcc,
    subject,
    text: message,
    html,
    attachments,
    inReplyTo,
    references: inReplyTo ? [inReplyTo] : undefined,
  };
}

// Compile once with a stable Message-ID. The SMTP bytes must never expose Bcc.
export async function rawMail(options: any) {
  const message = new MailComposer({
    ...options,
    disableFileAccess: true,
    disableUrlAccess: true,
    newline: "\r\n",
  }).compile();
  message.keepBcc = false;
  const envelope = message.getEnvelope(),
    messageId = message.messageId();
  const raw = await message.build();
  message.keepBcc = true;
  const sentCopy = options.bcc?.length ? await message.build() : raw;
  return { raw, sentCopy, envelope, messageId };
}

export async function sentFolder(
  client: any,
  create = false,
): Promise<string | null> {
  const folders = await client.list();
  const sent =
    folders.find(
      (f: any) => f.specialUse === "\\Sent" || f.flags?.has("\\Sent"),
    ) ||
    folders.find((f: any) =>
      /^(sent|sent items|sent messages|enviados|enviadas)$/i.test(f.name),
    );
  if (sent) return sent.path;
  if (!create) return null;
  const result = await client.mailboxCreate("Sent");
  return result.path || "Sent";
}

export async function archiveSentMessage(client: any, compiled: any) {
  const folder = await sentFolder(client, true);
  if (!folder) return false;
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  try {
    // Some providers save SMTP mail themselves. Reuse that copy when present.
    const found = await client.search(
      { header: { "message-id": compiled.messageId } },
      { uid: true },
    );
    if (found?.length) return true;
    return !!(await client.append(folder, compiled.sentCopy, ["\\Seen"]));
  } finally {
    lock.release();
  }
}

export function hasAttachments(part: any): boolean {
  return (
    !!part &&
    (String(part.disposition || "").toLowerCase() === "attachment" ||
      !!part.dispositionParameters?.filename ||
      (part.childNodes || []).some(hasAttachments))
  );
}
