import type { Message } from "./AgentChat";

interface Props {
  message: Message;
  agentEmoji: string;
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  html = html.replace(/((?:\|[^\n]+\|\n?)+)/g, (tableText) => {
    const rows = tableText.trim().split("\n").filter((r) => r.trim());
    if (rows.length < 2) return tableText;
    const isHeader = rows[1]?.match(/^\|[-| :]+\|$/);
    if (!isHeader) return tableText;
    const parseRow = (row: string) =>
      row.split("|").slice(1, -1).map((cell) => cell.trim());
    const headerCells = parseRow(rows[0]).map((c) => `<th>${c}</th>`).join("");
    const bodyRowsHtml = rows.slice(2)
      .map((row) => `<tr>${parseRow(row).map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("");
    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRowsHtml}</tbody></table>`;
  });

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  html = html.replace(/((?:^[-•*] .+\n?)+)/gm, (list) => {
    const items = list.trim().split("\n")
      .map((line) => `<li>${line.replace(/^[-•*] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (list) => {
    const items = list.trim().split("\n")
      .map((line) => `<li>${line.replace(/^\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });

  html = html.split(/\n\n+/).map((block) => {
    if (block.startsWith("<h") || block.startsWith("<pre") ||
        block.startsWith("<ul") || block.startsWith("<ol") ||
        block.startsWith("<table")) return block;
    return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
  }).join("\n");

  return html;
}

export default function MessageBubble({ message, agentEmoji }: Props) {
  const isAgent = message.role === "agent";
  return (
    <div className={`message message--${message.role}`}>
      <div className={`message__avatar message__avatar--${message.role}`}>
        {isAgent ? agentEmoji : "ME"}
      </div>
      <div className="message__body">
        <div className="message__role">{isAgent ? "Agent" : "You"}</div>
        <div
          className="message__content"
          dangerouslySetInnerHTML={{
            __html:
              renderMarkdown(message.content) +
              (message.streaming ? '<span class="cursor-blink"/>' : ""),
          }}
        />
      </div>
    </div>
  );
}
