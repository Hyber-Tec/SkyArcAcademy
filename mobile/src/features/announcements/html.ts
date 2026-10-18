/**
 * A post's content as the website's editor writes it (web/src/features/announcements/RichTextEditor.tsx, sanitized when
 * saved): paragraphs, headings, lists, quotes, code, rules, line breaks, pictures and links, with bold, italic,
 * underline, strikethrough and code. Read here into blocks that the app draws with its own text and colours
 * (RichText.tsx), so a post reads like the rest of the app in light and dark. Nothing in it runs: scripts, styles,
 * frames and form controls are dropped, a tag it doesn't know keeps its text, and links and pictures that aren't web
 * addresses (or, for links, email and phone) lose their link or are left out.
 */

export interface Marks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  /** A web address, mailto: or tel:. */
  href?: string;
}

export type Inline = { kind: "text"; text: string; marks: Marks } | { kind: "break" };

export type Block =
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "heading"; level: 1 | 2 | 3; content: Inline[] }
  | { kind: "list"; ordered: boolean; start: number; items: Block[][] }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "code"; text: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "rule" };

// ---------------------------------------------------------------- reading the HTML

interface El {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
}
type Node = El | string;

/** Elements that never have children. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "keygen", "link", "meta", "param", "source", "track", "wbr"]);
/** Elements whose content is never text to read (skipped to their closing tag). */
const RAW = new Set(["script", "style", "textarea", "title", "template", "noscript", "iframe", "object", "svg", "math", "xmp", "noembed", "noframes"]);
/** Elements dropped with everything in them. */
const DROP = new Set([...RAW, "head", "button", "select", "option", "datalist", "video", "audio", "canvas", "map", "embed", "input", "form"]);
/** Opening one of these ends an open paragraph, as a browser does. */
const ENDS_P = new Set([
  "address", "article", "aside", "blockquote", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul",
]);
/** A paragraph inside one of these isn't ended by what opens outside it. */
const SCOPE = new Set(["#root", "td", "th", "table", "caption", "button", "li", "blockquote", "dd", "dt"]);
const HEADING = /^h[1-6]$/;

const NAMED = new Map<string, string>(Object.entries({
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ensp: "\u2002", emsp: "\u2003", thinsp: "\u2009",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  laquo: "«", raquo: "»", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", deg: "°", times: "×", divide: "÷",
  plusmn: "±", frac12: "½", frac14: "¼", frac34: "¾", euro: "€", pound: "£", yen: "¥", cent: "¢", sect: "§",
  para: "¶", dagger: "†", larr: "←", rarr: "→", uarr: "↑", darr: "↓", shy: "\u00ad", zwj: "\u200d", zwnj: "\u200c",
}));

/** Text with its character references (`&amp;`, `&#8217;`, `&#x2014;`) as the characters. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (all, e: string) => {
    if (e[0] !== "#") return NAMED.get(e) ?? all;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : "\ufffd";
  });
}

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/y;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attrsOf(source: string): Record<string, string> {
  // No prototype: an attribute named like one of an object's own ("constructor") is just an attribute.
  const attrs: Record<string, string> = Object.create(null);
  for (const m of source.matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** HTML into a tree, forgiving as a browser is: unclosed paragraphs and list items close themselves. */
function parse(html: string): El {
  const root: El = { tag: "#root", attrs: {}, children: [] };
  const stack: El[] = [root];
  const lower = html.toLowerCase();
  const top = () => stack[stack.length - 1];
  const text = (raw: string) => {
    if (!raw) return;
    const t = decodeEntities(raw);
    const kids = top().children;
    const last = kids[kids.length - 1];
    if (typeof last === "string") kids[kids.length - 1] = last + t;
    else kids.push(t);
  };
  // Closes the nearest open element named `tag`, unless something in `stop` comes first.
  const closeNearest = (tags: Set<string> | string, stop: Set<string>) => {
    for (let k = stack.length - 1; k > 0; k--) {
      const t = stack[k].tag;
      if (typeof tags === "string" ? t === tags : tags.has(t)) {
        stack.length = k;
        return;
      }
      if (stop.has(t)) return;
    }
  };
  const open = (tag: string, attrs: Record<string, string>, empty: boolean) => {
    if (ENDS_P.has(tag)) closeNearest("p", SCOPE);
    if (tag === "li") closeNearest("li", new Set(["ul", "ol", "#root", "td", "th", "table"]));
    if (tag === "dd" || tag === "dt") closeNearest(new Set(["dd", "dt"]), new Set(["dl", "#root", "td", "th", "table"]));
    if (HEADING.test(tag) && HEADING.test(top().tag)) stack.length -= 1;
    const el: El = { tag, attrs, children: [] };
    top().children.push(el);
    if (!empty) stack.push(el);
  };
  const close = (tag: string) => {
    if (tag === "br") return open("br", {}, true);
    if (HEADING.test(tag)) {
      for (let k = stack.length - 1; k > 0; k--) {
        if (HEADING.test(stack[k].tag)) {
          stack.length = k;
          return;
        }
      }
      return;
    }
    closeNearest(tag, new Set());
  };

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      text(html.slice(i));
      break;
    }
    text(html.slice(i, lt));
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      const end = html.indexOf(">", lt);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    TAG.lastIndex = lt;
    const m = TAG.exec(html);
    if (!m) {
      text("<");
      i = lt + 1;
      continue;
    }
    i = TAG.lastIndex;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      close(tag);
      continue;
    }
    if (RAW.has(tag)) {
      const end = lower.indexOf(`</${tag}`, i);
      const gt = end < 0 ? -1 : html.indexOf(">", end);
      i = gt < 0 ? html.length : gt + 1;
      continue;
    }
    open(tag, attrsOf(m[3]), VOID.has(tag) || /\/\s*$/.test(m[3]));
  }
  return root;
}

// ---------------------------------------------------------------- the tree into blocks

const BOLD = new Set(["strong", "b"]);
const ITALIC = new Set(["em", "i", "cite", "dfn", "var"]);
const UNDERLINE = new Set(["u", "ins"]);
const STRIKE = new Set(["s", "strike", "del"]);
const CODE = new Set(["code", "kbd", "samp", "tt"]);
/** Elements that stand on their own lines (their text is a paragraph of its own). */
const BLOCKS = new Set([
  "p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "address", "figure", "figcaption", "center",
  "details", "summary", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "li", "fieldset",
  "legend", "body", "html",
]);

/** A link the app opens: a web address, an email or a phone number. */
export function safeHref(href: string | undefined): string | null {
  const h = (href ?? "").trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(h) ? h : null;
}

/** A picture the app shows: a web address only (the editor uploads pictures and links them; it never inlines them). */
export function safeSrc(src: string | undefined): string | null {
  const s = (src ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

const sameMarks = (a: Marks, b: Marks) =>
  !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && !!a.strike === !!b.strike && !!a.code === !!b.code && a.href === b.href;

/**
 * A paragraph's pieces laid out as a browser lays them out: each run of spaces, tabs and line ends one space, none at
 * the start or end of a line; pieces marked alike joined.
 */
function tidy(run: Inline[]): Inline[] {
  const out: Inline[] = [];
  const trimEnd = () => {
    while (out.length) {
      const last = out[out.length - 1];
      if (last.kind !== "text") return;
      const t = last.text.replace(/ +$/, "");
      if (t) {
        out[out.length - 1] = { ...last, text: t };
        return;
      }
      out.pop();
    }
  };
  let lineStart = true;
  for (const piece of run) {
    if (piece.kind === "break") {
      trimEnd();
      out.push(piece);
      lineStart = true;
      continue;
    }
    let t = piece.text.replace(/[ \t\n\r\f]+/g, " ");
    const last = out[out.length - 1];
    if (lineStart || (last?.kind === "text" && last.text.endsWith(" "))) t = t.replace(/^ /, "");
    if (!t) continue;
    if (last?.kind === "text" && sameMarks(last.marks, piece.marks)) out[out.length - 1] = { ...last, text: last.text + t };
    else out.push({ kind: "text", text: t, marks: piece.marks });
    lineStart = false;
  }
  trimEnd();
  // Line breaks at the very start or end show nothing.
  while (out[0]?.kind === "break") out.shift();
  while (out[out.length - 1]?.kind === "break") out.pop();
  return out;
}

/** Whether the pieces show anything (a paragraph of spaces or line breaks only is left out). */
const visible = (content: Inline[]) => content.some((p) => p.kind === "text" && p.text.replace(/[\s\u00a0\u200b]/g, "") !== "");

/** All of an element's text, as it is (a code block keeps its spaces and line ends). */
function textOf(node: Node): string {
  if (typeof node === "string") return node;
  if (node.tag === "br") return "\n";
  return node.children.map(textOf).join("");
}

class Builder {
  blocks: Block[] = [];
  private run: Inline[] = [];

  add(piece: Inline) {
    this.run.push(piece);
  }

  /** Ends the paragraph being gathered (if it shows anything). */
  flush() {
    const content = tidy(this.run);
    this.run = [];
    if (visible(content)) this.blocks.push({ kind: "paragraph", content });
  }

  push(block: Block) {
    this.flush();
    this.blocks.push(block);
  }
}

function blocksIn(nodes: Node[], marks: Marks): Block[] {
  const b = new Builder();
  walk(nodes, marks, b);
  b.flush();
  return b.blocks;
}

function walk(nodes: Node[], marks: Marks, b: Builder): void {
  for (const node of nodes) {
    if (typeof node === "string") {
      b.add({ kind: "text", text: node, marks });
      continue;
    }
    const { tag, attrs, children } = node;
    if (DROP.has(tag)) continue;
    if (tag === "br") {
      b.add({ kind: "break" });
    } else if (tag === "img") {
      const src = safeSrc(attrs.src);
      if (src) b.push({ kind: "image", src, alt: (attrs.alt ?? attrs.title ?? "").trim() });
    } else if (tag === "hr") {
      b.push({ kind: "rule" });
    } else if (HEADING.test(tag)) {
      const level = Math.min(Number(tag[1]), 3) as 1 | 2 | 3;
      // A heading holds a line of text; a picture in it stands after it.
      for (const block of blocksIn(children, marks)) b.push(block.kind === "paragraph" ? { kind: "heading", level, content: block.content } : block);
    } else if (tag === "ul" || tag === "ol") {
      const items: Block[][] = [];
      for (const child of children) {
        if (typeof child === "string") {
          if (child.trim()) items.push(blocksIn([child], marks));
        } else if (child.tag === "li") {
          items.push(blocksIn(child.children, marks));
        } else if ((child.tag === "ul" || child.tag === "ol") && items.length) {
          // A list put straight in a list belongs to the item before it.
          items[items.length - 1].push(...blocksIn([child], marks));
        } else {
          items.push(blocksIn([child], marks));
        }
      }
      const shown = items.filter((item) => item.length);
      const start = parseInt(attrs.start ?? "", 10);
      if (shown.length) b.push({ kind: "list", ordered: tag === "ol", start: Number.isFinite(start) ? start : 1, items: shown });
    } else if (tag === "blockquote") {
      const blocks = blocksIn(children, marks);
      if (blocks.length) b.push({ kind: "quote", blocks });
    } else if (tag === "pre") {
      const t = textOf(node).replace(/^\r?\n/, "").replace(/\s+$/, "");
      if (t) b.push({ kind: "code", text: t });
    } else if (BLOCKS.has(tag)) {
      b.flush();
      walk(children, marks, b);
      b.flush();
    } else {
      // Inline: its text, with what the tag adds to it.
      const next: Marks = { ...marks };
      if (BOLD.has(tag)) next.bold = true;
      else if (ITALIC.has(tag)) next.italic = true;
      else if (UNDERLINE.has(tag)) next.underline = true;
      else if (STRIKE.has(tag)) next.strike = true;
      else if (CODE.has(tag)) next.code = true;
      else if (tag === "a") {
        const href = safeHref(attrs.href);
        if (href) next.href = href;
      }
      walk(children, next, b);
    }
  }
}

/** A post's content (`contentHtml`) as blocks to draw. */
export function htmlBlocks(html: string | null | undefined): Block[] {
  if (!html) return [];
  return blocksIn(parse(html).children, {});
}

/**
 * A post's text on one line, for a preview: its headings, paragraphs, list items, quotes and code in order, a heading
 * set off by a colon ("Match day: Bring your…"). Unlike the website's search text, nothing is spaced apart that the
 * post doesn't space ("Saturday.", not "Saturday .").
 */
export function htmlText(html: string | null | undefined): string {
  const parts: string[] = [];
  const visit = (blocks: Block[]) => {
    for (const block of blocks) {
      if (block.kind === "paragraph" || block.kind === "heading") {
        const t = block.content
          .map((p) => (p.kind === "break" ? " " : p.text))
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        if (t) parts.push(block.kind === "heading" && !/[.:;!?]$/.test(t) ? `${t}:` : t);
      } else if (block.kind === "list") block.items.forEach(visit);
      else if (block.kind === "quote") visit(block.blocks);
      else if (block.kind === "code") parts.push(block.text.replace(/\s+/g, " ").trim());
    }
  };
  visit(htmlBlocks(html));
  return parts.join(" ");
}

/** The pictures in a post's content, in order. */
export function htmlImages(html: string | null | undefined): { src: string; alt: string }[] {
  const out: { src: string; alt: string }[] = [];
  const visit = (blocks: Block[]) => {
    for (const block of blocks) {
      if (block.kind === "image") out.push({ src: block.src, alt: block.alt });
      else if (block.kind === "list") block.items.forEach(visit);
      else if (block.kind === "quote") visit(block.blocks);
    }
  };
  visit(htmlBlocks(html));
  return out;
}
