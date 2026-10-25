/** Extract a conservative text document. Never emits markup delimiters. */
export function websiteText(html: string): string {
  function text(value: string) {
    let output = "",
      hidden = "";
    for (let index = 0; index < value.length; index++) {
      const char = value[index];
      if (char === "<") {
        const end = value.indexOf(">", index + 1);
        if (end < 0) break;
        const tag = value
          .slice(index + 1, end)
          .trim()
          .toLowerCase();
        const name = tag.match(/^\/?([a-z0-9]+)/)?.[1] || "";
        if (hidden) {
          if (tag.startsWith("/") && name === hidden) hidden = "";
        } else if (
          ["script", "style", "nav", "header", "footer"].includes(name) &&
          !tag.startsWith("/")
        )
          hidden = name;
        else output += " ";
        index = end;
      } else if (!hidden && char !== ">") output += char;
    }
    // Preserve text through subsequent Markdown entity decoding too.
    return output
      .replaceAll("&", "&amp;")
      .replace(/[ \t]+/g, " ")
      .trim();
  }
  const title = text(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "Imported website");
  return `# ${title}\n\n${text(html)}`;
}
