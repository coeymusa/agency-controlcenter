import { getSetting } from "./settings";

type SendArgs = {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
  inReplyTo?: string;
};

type SendResult = {
  id: string;
};

export async function resendSend(args: SendArgs): Promise<SendResult> {
  const key = await getSetting("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY not set — open /settings");

  const from = args.from ?? (await getSetting("RESEND_FROM"));
  if (!from) throw new Error("RESEND_FROM not set (default from address) — open /settings");

  const replyTo = args.replyTo ?? (await getSetting("RESEND_REPLY_TO")) ?? undefined;

  const body: Record<string, unknown> = {
    from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
  };
  if (args.text) body.text = args.text;
  if (replyTo) body.reply_to = replyTo;
  const headers: Record<string, string> = { ...(args.headers ?? {}) };
  if (args.inReplyTo) {
    headers["In-Reply-To"] = args.inReplyTo;
    headers["References"] = args.inReplyTo;
  }
  if (Object.keys(headers).length > 0) body.headers = headers;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Resend send failed (" + res.status + "): " + errText);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}

// Rewrite every http(s) URL in the body to a tracking short link. Returns
// both the rewritten body and the list of (code, target) pairs so we can
// persist them as `links` rows.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

export function rewriteLinks(
  body: string,
  shortCodeFor: (target: string) => string,
  base: string,
): { body: string; links: { code: string; target: string }[] } {
  const links: { code: string; target: string }[] = [];
  const seen = new Map<string, string>();
  const rewritten = body.replace(URL_RE, (raw) => {
    // Skip the tracking pixel host if it's already ours
    if (base && raw.startsWith(base + "/t/")) return raw;
    let code = seen.get(raw);
    if (!code) {
      code = shortCodeFor(raw);
      seen.set(raw, code);
      links.push({ code, target: raw });
    }
    return base + "/t/c/" + code;
  });
  return { body: rewritten, links };
}

export function htmlWithPixel(html: string, emailId: number, base: string): string {
  const pixel = `<img src="${base}/t/o/${emailId}.png" width="1" height="1" alt="" style="display:none">`;
  // Insert before </body>, or append.
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, pixel + "</body>");
  return html + pixel;
}

export function textToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 12px">${para.replace(/\n/g, "<br>").replace(URL_RE, (u) => `<a href="${u}">${u}</a>`)}</p>`)
    .join("\n");
}
