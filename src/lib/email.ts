import { Resend } from "resend";
import { SITE_URL } from "@/lib/seo";

// Transactional email. Every template speaks the current product ("one API to
// access all agents"); the OpenClaw-marketplace copy the welcome and outreach
// mails carried after the pivot is gone. All senders are no-ops when
// RESEND_API_KEY is unset (local dev, CI) and never throw at the caller.

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set — skipping email send");
    return null;
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "TakoAPI <market@takoapi.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO || "wangharp@gmail.com";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Shared shell: purple header band, white card, muted footer. `body` is trusted HTML. */
function shell(opts: { heading: string; subheading?: string; body: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:40px;margin-bottom:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#3b82f6);padding:28px 32px;text-align:center">
    <div style="font-size:32px;margin-bottom:6px">🐙</div>
    <h1 style="color:#fff;font-size:22px;margin:0">${esc(opts.heading)}</h1>
    ${opts.subheading ? `<p style="color:rgba(255,255,255,0.85);font-size:14px;margin:8px 0 0">${esc(opts.subheading)}</p>` : ""}
  </td></tr>
  <tr><td style="padding:32px">${opts.body}</td></tr>
  <tr><td style="padding:16px 32px;background:#f9fafb;text-align:center">
    <p style="font-size:12px;color:#6b7280;margin:0">TakoAPI · <a href="${SITE_URL}" style="color:#7c3aed;text-decoration:none">takoapi.com</a> · <a href="https://github.com/oratis/TakoAPI" style="color:#7c3aed;text-decoration:none">GitHub</a></p>
  </td></tr>
</table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<div style="text-align:center;margin:28px 0"><a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">${esc(label)}</a></div>`;
}

function p(text: string): string {
  return `<p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px">${text}</p>`;
}

function code(text: string): string {
  return `<pre style="background:#111827;color:#e5e7eb;padding:12px 14px;border-radius:8px;font-size:12px;line-height:1.5;overflow:auto;margin:0 0 16px">${esc(text)}</pre>`;
}

async function send(to: string, subject: string, html: string) {
  const resend = getResend();
  if (!resend) return null;
  try {
    return await resend.emails.send({ from: FROM_EMAIL, replyTo: REPLY_TO, to, subject, html });
  } catch (err) {
    console.error("[email] send failed", { subject, err: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function sendWelcomeEmail(to: string, name?: string) {
  const displayName = name || to.split("@")[0];
  return send(
    to,
    `Welcome to TakoAPI, ${displayName}`,
    shell({
      heading: "Welcome to TakoAPI",
      subheading: "One API to access all agents",
      body:
        p(`Hi ${esc(displayName)},`) +
        p("You can now discover AI agents and call any of them through one endpoint with one key.") +
        p("<strong>1. Create an API key</strong> in your dashboard.") +
        button(`${SITE_URL}/dashboard`, "Open the dashboard") +
        p("<strong>2. Call an agent</strong> — any OpenAI SDK works, set <code>model</code> to the agent slug:") +
        code(`curl ${SITE_URL}/v1/chat/completions \\
  -H "Authorization: Bearer $TAKO_KEY" \\
  -d '{"model":"<agent-slug>","messages":[{"role":"user","content":"Hello"}]}'`) +
        p(`<strong>3. Use it from your coding agent</strong> — <a href="${SITE_URL}/install" style="color:#7c3aed">one command</a> installs TakoAPI into Claude Code, Codex or OpenCode.`) +
        p(`<span style="color:#6b7280;font-size:13px">Questions? Just reply to this email.</span>`),
    })
  );
}

export async function sendVerificationEmail(to: string, verifyUrl: string) {
  return send(
    to,
    "Confirm your TakoAPI email",
    shell({
      heading: "Confirm your email",
      body:
        p("Click the button below to confirm this address for your TakoAPI account. The link is valid for 24 hours.") +
        button(verifyUrl, "Confirm email") +
        p(`<span style="color:#6b7280;font-size:13px">If you did not create a TakoAPI account, you can ignore this message.</span>`),
    })
  );
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return send(
    to,
    "Reset your TakoAPI password",
    shell({
      heading: "Reset your password",
      body:
        p("We received a request to reset the password for this TakoAPI account. The link below is valid for 1 hour.") +
        button(resetUrl, "Choose a new password") +
        p(`<span style="color:#6b7280;font-size:13px">If you did not ask for this, nothing changes — your password stays the same.</span>`),
    })
  );
}

/** Moderation outcome for a submitted agent or skill. */
export async function sendReviewResultEmail(
  to: string,
  data: { kind: "agent" | "skill"; name: string; approved: boolean; note?: string | null; url: string }
) {
  const noun = data.kind === "agent" ? "agent" : "skill";
  const heading = data.approved ? `Your ${noun} is live` : `Your ${noun} was not approved`;
  return send(
    to,
    `${heading}: ${data.name}`,
    shell({
      heading,
      body:
        p(`<strong>${esc(data.name)}</strong> ${data.approved ? `is now listed on TakoAPI.` : `did not pass review.`}`) +
        (data.note ? p(`<strong>Reviewer note:</strong> ${esc(data.note)}`) : "") +
        (data.approved
          ? button(data.url, `View your ${noun}`) + p(data.kind === "agent" ? `Add the <a href="${SITE_URL}/badge" style="color:#7c3aed">“Listed on TakoAPI” badge</a> to your README so people can find it.` : "")
          : button(data.url, "Review and resubmit")),
    })
  );
}

export async function sendWeeklyDigest(
  to: string,
  data: {
    newSkillsCount: number;
    topSkills: { name: string; slug: string; downloads: number }[];
    totalSkills: number;
  }
) {
  const skillRows = data.topSkills
    .map(
      (s, i) =>
        `<tr><td style="padding:8px 12px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6">${i + 1}. <a href="${SITE_URL}/skills/${esc(s.slug)}" style="color:#7c3aed;text-decoration:none;font-weight:500">${esc(s.name)}</a></td><td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:right;border-bottom:1px solid #f3f4f6">${s.downloads.toLocaleString()} downloads</td></tr>`
    )
    .join("");
  return send(
    to,
    `TakoAPI Weekly: ${data.newSkillsCount} new skills this week`,
    shell({
      heading: "TakoAPI weekly digest",
      body:
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px"><tr>
          <td style="text-align:center;padding:16px;background:#f3f4f6;border-radius:8px"><div style="font-size:24px;font-weight:700;color:#7c3aed">${data.newSkillsCount}</div><div style="font-size:12px;color:#6b7280">New this week</div></td>
          <td style="width:16px"></td>
          <td style="text-align:center;padding:16px;background:#f3f4f6;border-radius:8px"><div style="font-size:24px;font-weight:700;color:#7c3aed">${data.totalSkills.toLocaleString()}</div><div style="font-size:12px;color:#6b7280">Skills listed</div></td>
        </tr></table>` +
        `<h2 style="font-size:16px;color:#1f2937;margin:0 0 12px">Most downloaded skills</h2>` +
        `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">${skillRows}</table>` +
        button(`${SITE_URL}/trending`, "See the full leaderboard") +
        p(`<span style="color:#6b7280;font-size:12px">Download counts come from clawskills.sh. <a href="${SITE_URL}/unsubscribe" style="color:#6b7280">Unsubscribe</a></span>`),
    })
  );
}

export async function sendKolOutreach(
  to: string,
  data: { name: string; skillName?: string; projectName?: string }
) {
  const thing = data.skillName || data.projectName || "project";
  return send(
    to,
    `Your ${thing} is listed on TakoAPI`,
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:40px auto;padding:0 20px">
  <p style="font-size:15px;line-height:1.7">Hi ${esc(data.name)},</p>
  <p style="font-size:15px;line-height:1.7">We listed ${esc(thing)} on <a href="${SITE_URL}" style="color:#7c3aed;font-weight:600">TakoAPI</a> — an open directory of AI agents and agent projects, with a unified API for calling the hosted ones.</p>
  <p style="font-size:15px;line-height:1.7">If you'd like, add the <a href="${SITE_URL}/badge" style="color:#7c3aed">“Listed on TakoAPI” badge</a> to your README (it shows your live star count and links back to your page), or tell us and we'll take the listing down.</p>
  <p style="font-size:15px;line-height:1.7;margin-top:24px">Best,<br><strong>TakoAPI</strong></p>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">
    <p style="font-size:12px;color:#6b7280">🐙 <a href="${SITE_URL}" style="color:#7c3aed">takoapi.com</a> · <a href="https://github.com/oratis/TakoAPI" style="color:#7c3aed">GitHub</a></p>
  </div>
</div>
</body>
</html>`
  );
}
