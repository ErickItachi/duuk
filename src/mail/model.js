export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5_000_000;

export function fileSize(bytes) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} MB`
    : `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

export function textToHtml(text = "") {
  return text
    .split(/\r?\n/)
    .map(
      (line) =>
        `<p>${
          line.replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c],
          ) || "<br>"
        }</p>`,
    )
    .join("");
}

export function safeLink(value) {
  const input = value.trim();
  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`,
    );
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export function addressLabel(addresses = []) {
  return addresses
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
    .join(", ");
}
