import katex from "katex";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMath(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, {
      displayMode: display,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return escapeHtml(src);
  }
}

/**
 * Lightweight Markdown subset plus `$...$` / `$$...$$` KaTeX.
 * Math is extracted first so underscores inside TeX are not italicised.
 */
export function renderWriteup(markdown: string): string {
  const tokens: string[] = [];
  const hold = (html: string): string => {
    const id = tokens.length;
    tokens.push(html);
    return `@@MATH${id}@@`;
  };

  let src = markdown.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) =>
    hold(`<div class="eq">${renderMath(tex.trim(), true)}</div>`),
  );
  src = src.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => hold(renderMath(tex.trim(), false)));

  const blocks = src.trim().split(/\n{2,}/);
  const html: string[] = [];
  for (const block of blocks) {
    const line = block.trim();
    if (!line) continue;
    if (line.startsWith("### ")) {
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("- ")) {
      const items = line.split(/\n/).map((l) => l.replace(/^- /, "").trim());
      html.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = line.split(/\n/).map((l) => l.replace(/^\d+\. /, "").trim());
      html.push(`<ol>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }
    html.push(`<p>${inline(line.replace(/\n/g, " "))}</p>`);
  }

  return html
    .join("\n")
    .replace(/@@MATH(\d+)@@/g, (_m, id: string) => tokens[Number(id)] ?? "");
}

function inline(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  t = t.replace(
    /\[([^\]]+)\]\((https?:[^)]+)\)/g,
    `<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>`,
  );
  return t;
}
