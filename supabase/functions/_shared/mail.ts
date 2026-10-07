import { checked, database, HttpError } from "./http.ts";
import { nativeImapTransport } from "./imap-transport.mjs";
import { mailFailure } from "./mail-failure.mjs";

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
  return nativeImapTransport(client);
}
export async function verifyMailbox(credentials: MailCredentials) {
  const client = await imapClient(credentials);
  let transport: Awaited<ReturnType<typeof smtpTransport>> | undefined;
  try {
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      lock.release();
    } catch (error) {
      const failure = mailFailure(error, "imap");
      console.error(
        JSON.stringify({
          source: "mail",
          stage: "imap",
          kind: failure.kind,
          code: failure.code,
        }),
      );
      throw new HttpError(failure.message, failure.status);
    }
    transport = await smtpTransport(credentials);
    try {
      await transport.verify();
    } catch (error) {
      const failure = mailFailure(error, "smtp");
      console.error(
        JSON.stringify({
          source: "mail",
          stage: "smtp",
          kind: failure.kind,
          code: failure.code,
        }),
      );
      throw new HttpError(failure.message, failure.status);
    }
  } finally {
    transport?.close();
    await client.logout().catch(() => {});
  }
}
