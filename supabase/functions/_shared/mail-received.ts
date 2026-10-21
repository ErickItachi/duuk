import sanitizeHtml from "npm:sanitize-html@2.18.0";

// Received mail needs its layout, unlike the deliberately small composer format.
// Only declarative typography and table layout survive; no resource-bearing CSS.
const length = /^(?:0|\d{1,4}(?:\.\d{1,2})?(?:px|pt|em|rem|%)|auto)$/i;
const spacing = /^(?:0|\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem|%))(?:\s+(?:0|\d{1,3}(?:\.\d{1,2})?(?:px|pt|em|rem|%))){0,3}$/i;
const color = /^(?:#[\da-f]{3,8}|(?:rgb|rgba)\([\d.,%\s]+\)|black|white|transparent|inherit|red|blue|gray|grey)$/i;
const border = /^(?:0|none|(?:\d{1,2}(?:px|pt)|thin|medium|thick)\s+(?:solid|dashed|dotted)\s+(?:#[\da-f]{3,8}|black|white|gray|grey))$/i;
const styles = {
  color: [color], "background-color": [color],
  width: [length], "max-width": [length], height: [length],
  padding: [spacing], "padding-top": [spacing], "padding-right": [spacing], "padding-bottom": [spacing], "padding-left": [spacing],
  margin: [spacing, /^0\s+auto$/i], "margin-top": [length], "margin-right": [length], "margin-bottom": [length], "margin-left": [length],
  "font-family": [/^[a-z\d\s,'"_-]{1,150}$/i], "font-size": [length],
  "font-weight": [/^(?:normal|bold|[1-9]00)$/i], "font-style": [/^(?:normal|italic)$/i],
  "line-height": [length, /^\d(?:\.\d{1,2})?$/, /^normal$/i],
  "text-align": [/^(?:left|right|center|justify|start|end)$/i], "vertical-align": [/^(?:top|middle|bottom|baseline)$/i],
  "text-decoration": [/^(?:none|underline|line-through)$/i], "letter-spacing": [length],
  border: [border], "border-top": [border], "border-right": [border], "border-bottom": [border], "border-left": [border],
  "border-style": [/^(?:none|solid|dashed|dotted)$/i], "border-width": [length, /^(?:thin|medium|thick)$/i],
  "border-color": [color], "border-radius": [spacing], "border-collapse": [/^(?:collapse|separate)$/i], "border-spacing": [spacing],
};

export function cleanReceivedMailHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "strike", "mark", "ul", "ol", "li", "a", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "hr", "center", "pre", "code", "font"],
    allowedAttributes: {
      "*": ["style", "dir", "lang"],
      a: ["href", "target", "rel"],
      table: ["width", "align", "cellpadding", "cellspacing", "border", "bgcolor", "role"],
      tr: ["align", "valign", "bgcolor"],
      td: ["width", "colspan", "rowspan", "align", "valign", "bgcolor"],
      th: ["width", "colspan", "rowspan", "align", "valign", "bgcolor"],
      font: ["color", "face", "size"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    allowedStyles: { "*": styles },
    transformTags: {
      table: (_tag: string, attrs: Record<string, string>) => {
        const inline = /(?:^|;)\s*width\s*:\s*(\d{1,4})px\s*(?:;|$)/i.exec(attrs.style || "");
        const width = inline?.[1] || (/^\d{1,4}$/.test(attrs.width || "") ? attrs.width : null);
        if (!width) return { tagName: "table", attribs: attrs };
        // A fixed table width acts as a minimum in browsers even with max-width.
        // Retain it as a preferred maximum so nested tables fit narrow readers.
        const existingMax=/(?:^|;)\s*max-width\s*:\s*(\d{1,4})px/i.exec(attrs.style || "");
        const maximum = Math.min(Number(width), existingMax ? Number(existingMax[1]) : 9999);
        const style = (attrs.style || "").replace(/(?:^|;)\s*(?:width|max-width)\s*:[^;]*/gi, "");
        const attribs: Record<string, string> = { ...attrs, style: `${style};width:100%;max-width:${maximum}px` };
        delete attribs.width;
        return { tagName: "table", attribs };
      },
      a: (_tag: string, attrs: Record<string, string>) => ({ tagName: "a", attribs: { href: attrs.href || "", style: attrs.style || "", target: "_blank", rel: "noopener noreferrer" } }),
    },
  });
}
