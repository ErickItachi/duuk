import { Buffer } from "node:buffer";
import { simpleParser } from "npm:mailparser@3.9.36";
import {
  cleanMailHtml,
  hasAttachments,
  outgoingMail,
  rawMail,
  sentFolder,
  archiveSentMessage,
} from "../functions/_shared/mail-content.ts";

const assert = (value: unknown, description: string) => {
  if (!value) throw new Error(description);
};
const body = () => ({
  to: "client@example.com",
  subject: "Proposta DUUK",
  text: "Olá, cliente.",
  html: "<p>Olá, <strong>cliente</strong>.</p>",
});
const rejects = (run: () => unknown) => {
  let failed = false;
  try {
    run();
  } catch {
    failed = true;
  }
  assert(failed, "Expected invalid payload to be rejected");
};

Deno.test(
  "recipient validation accepts copies and rejects header injection and excessive recipients",
  () => {
    const message = outgoingMail({
      ...body(),
      to: "client@example.com;other@example.com",
      cc: "copy@example.com",
      bcc: "private@example.com",
    });
    assert(
      message.to.length === 2 &&
        message.cc.length === 1 &&
        message.bcc.length === 1,
      "Recipients lost",
    );
    for (const payload of [
      { to: "client@example.com\r\nBcc: bad@example.com" },
      { cc: "invalid" },
      { subject: "test\r\nBcc: bad@example.com" },
      {
        to: Array.from({ length: 21 }, (_, i) => `user${i}@example.com`).join(
          ",",
        ),
      },
    ])
      rejects(() => outgoingMail({ ...body(), ...payload }));
  },
);

Deno.test(
  "mail HTML preserves formatting and safe links while removing executable and remote content",
  () => {
    const html = cleanMailHtml(
      '<p onclick="evil()"><strong>Bold</strong><em>Italic</em><u>Underline</u><mark>Highlight</mark></p><ul><li>Item</li></ul><a href="https://duukfilms.com">DUUK</a><a href="javascript:alert(1)">Bad</a><img src="https://example.com/track"><script>evil()</script><iframe src="https://example.com"></iframe><form><input></form><span style="position:fixed;background-image:url(https://example.com)">Text</span>',
    );
    assert(
      html.includes("<strong>Bold</strong>") &&
        html.includes("<u>Underline</u>") &&
        html.includes("background-color:#fff2a8") &&
        html.includes("<li>Item</li>"),
      "Formatting removed",
    );
    assert(
      html.includes('href="https://duukfilms.com"') &&
        html.includes('rel="noopener noreferrer"'),
      "Safe link changed",
    );
    assert(
      !/onclick|javascript:|<img|<script|<iframe|<input|<form|position:|background-image|evil\(/i.test(
        html,
      ),
      "Unsafe content survived",
    );
  },
);

Deno.test(
  "attachments enforce count, size and valid bytes without accepting file or URL access",
  () => {
    const a = {
      name: "document.txt",
      base64: Buffer.from("Fixture attachment").toString("base64"),
      type: "text/plain",
      path: "/etc/passwd",
      href: "https://example.com",
    };
    const message = outgoingMail({ ...body(), attachments: [a] });
    assert(
      message.attachments[0].content.toString() === "Fixture attachment" &&
        !("path" in message.attachments[0]) &&
        !("href" in message.attachments[0]),
      "Unsafe attachment options accepted",
    );
    rejects(() => outgoingMail({ ...body(), attachments: Array(6).fill(a) }));
    rejects(() =>
      outgoingMail({ ...body(), attachments: [{ ...a, base64: "invalid!" }] }),
    );
    rejects(() =>
      outgoingMail({
        ...body(),
        attachments: [
          { ...a, base64: Buffer.alloc(5_000_001).toString("base64") },
        ],
      }),
    );
  },
);

Deno.test(
  "MIME delivery preserves rich text and attachments, with Bcc restricted to the private sent copy",
  async () => {
    const outgoing = outgoingMail({
      ...body(),
      cc: "copy@example.com",
      bcc: "private@example.com",
      in_reply_to: "<thread@example.com>",
      attachments: [
        {
          name: "proposta.txt",
          type: "text/plain",
          base64: Buffer.from("Olá, DUUK!").toString("base64"),
        },
      ],
    });
    const compiled = await rawMail({
      ...outgoing,
      from: { name: "DUUK Films", address: "contato@duukfilms.com" },
    });
    const delivered = await simpleParser(compiled.raw),
      archived = await simpleParser(compiled.sentCopy);
    assert(
      compiled.envelope.to.includes("private@example.com") &&
        compiled.envelope.to.includes("copy@example.com"),
      "Copies absent from SMTP envelope",
    );
    assert(
      !delivered.bcc && !/^Bcc:/im.test(compiled.raw.toString()),
      "Bcc exposed to recipients",
    );
    assert(
      !!archived.bcc &&
        archived.messageId === delivered.messageId &&
        delivered.messageId === compiled.messageId,
      "Sent copy differs from delivered message",
    );
    assert(
      delivered.html &&
        delivered.html.includes("<strong>cliente</strong>") &&
        delivered.text?.includes("Olá, cliente."),
      "Rich/plain alternatives lost",
    );
    assert(
      delivered.attachments[0].content.toString() === "Olá, DUUK!" &&
        delivered.inReplyTo === "<thread@example.com>",
      "Attachment or conversation reference changed",
    );
  },
);

Deno.test(
  "Sent folder uses provider special-use flags and only creates a fixed fallback when requested",
  async () => {
    let created = false;
    const client = {
      list: async () => [
        { path: "INBOX.Enviados", name: "Enviados", specialUse: "\\Sent" },
      ],
      mailboxCreate: async (path: string) => {
        assert(path === "Sent", "Unexpected mailbox path");
        created = true;
        return { path };
      },
    };
    assert(
      (await sentFolder(client)) === "INBOX.Enviados" && !created,
      "Provider folder not used",
    );
    client.list = async () => [];
    assert(
      (await sentFolder(client)) === null && !created,
      "Read operation created a mailbox",
    );
    assert(
      (await sentFolder(client, true)) === "Sent" && created,
      "Sent fallback missing",
    );
  },
);

Deno.test("attachment indicator traverses nested MIME structures", () => {
  assert(
    hasAttachments({ childNodes: [{ disposition: "attachment" }] }),
    "Nested attachment missed",
  );
  assert(
    !hasAttachments({ childNodes: [{ type: "text/plain" }] }),
    "Plain text reported as attachment",
  );
});

Deno.test(
  "Sent archiving reuses an existing Message-ID and releases its lock on failure",
  async () => {
    let released = 0,
      appended = 0,
      exists = true,
      fail = false;
    const compiled = {
      messageId: "<fixture@example.com>",
      sentCopy: Buffer.from("fixture"),
    };
    const client = {
      list: async () => [{ path: "Sent", specialUse: "\\Sent" }],
      getMailboxLock: async () => ({ release: () => released++ }),
      search: async (query: any) => {
        assert(
          query.header["message-id"] === compiled.messageId,
          "Wrong duplicate check",
        );
        return exists ? [1] : [];
      },
      append: async (_path: string, raw: Buffer) => {
        appended++;
        assert(raw === compiled.sentCopy, "Wrong archived bytes");
        if (fail) throw new Error("Fixture archive failure");
        return { uid: 2 };
      },
    };
    assert(
      (await archiveSentMessage(client, compiled)) &&
        appended === 0 &&
        released === 1,
      "Provider-saved message duplicated",
    );
    exists = false;
    assert(
      (await archiveSentMessage(client, compiled)) &&
        appended === 1 &&
        released === 2,
      "Missing sent copy",
    );
    fail = true;
    try {
      await archiveSentMessage(client, compiled);
    } catch {
      /* expected */
    }
    assert(released === 3, "Archive lock leaked on failure");
  },
);
