import { checked, database, HttpError } from "./http.ts";

export const mailbox = "contato@duukfilms.com";
export const mailProvider = "Titan · GoDaddy";
// GoDaddy's Titan reseller uses these hosts, rather than imap/smtp.titan.email.
// Hosts are fixed here and are never accepted from the browser.
export type MailCredentials = { user: string; password: string };
export async function mailCredentials(
  db: ReturnType<typeof database>,
): Promise<MailCredentials> {
  const stored = checked(await db.rpc("duuk_mail_credentials"));
  return stored?.password
    ? { user: mailbox, password: stored.password }
    : {
        user: Deno.env.get("DUUK_MAIL_USERNAME") || mailbox,
        password: Deno.env.get("DUUK_MAIL_PASSWORD") || "",
      };
}
export async function smtpTransport(credentials: MailCredentials) {
  const nodemailer = (await import("npm:nodemailer@10.0.15")).default;
  return nodemailer.createTransport({
    host: "smtpout.secureserver.net",
    port: 465,
    secure: true,
    auth: { user: credentials.user, pass: credentials.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
export async function imapClient(credentials: MailCredentials) {
  const { ImapFlow } = await import("npm:imapflow@2.2.6");
  const client = new ImapFlow({
    host: "imap.secureserver.net",
    port: 993,
    secure: true,
    auth: { user: credentials.user, pass: credentials.password },
    logger: false,
    connectionTimeout: 15000,
    socketTimeout: 20000,
  });
  client.on("error", () => {});
  return client;
}
export async function verifyMailbox(credentials: MailCredentials) {
  const client = await imapClient(credentials);
  let transport: Awaited<ReturnType<typeof smtpTransport>> | undefined;
  try {
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      lock.release();
    } catch {
      throw new HttpError(
        "Não foi possível acessar o Titan. Confira a senha da caixa e a permissão de acesso por aplicativos no webmail.",
        422,
      );
    }
    transport = await smtpTransport(credentials);
    try {
      await transport.verify();
    } catch {
      throw new HttpError(
        "A entrada foi validada, mas o Titan não autorizou o envio. Confira a senha de aplicativo e o acesso por outros aplicativos.",
        422,
      );
    }
  } finally {
    transport?.close();
    await client.logout().catch(() => {});
  }
}
