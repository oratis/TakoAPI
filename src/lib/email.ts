import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set — skipping email send");
    return null;
  }
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_EMAIL = "TakoAPI <market@takoapi.com>";
const REPLY_TO = "wangharp@gmail.com";

export async function sendWelcomeEmail(to: string, name?: string) {
  const resend = getResend();
  if (!resend) return null;
  const displayName = name || to.split("@")[0];

  return resend.emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    to,
    subject: `Welcome to TakoAPI, ${displayName}!`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:40px;margin-bottom:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#3b82f6);padding:32px;text-align:center">
    <div style="font-size:36px;margin-bottom:8px">🐙</div>
    <h1 style="color:#fff;font-size:24px;margin:0">Welcome to TakoAPI</h1>
    <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0">All in One OpenClaw Skills Marketplace</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="font-size:16px;color:#1f2937;margin:0 0 16px">Hi ${displayName},</p>
    <p style="font-size:14px;color:#4b5563;line-height:1.6;margin:0 0 24px">Thanks for joining TakoAPI! You now have access to <strong>5,000+</strong> OpenClaw skills across 30+ categories.</p>

    <h2 style="font-size:16px;color:#1f2937;margin:0 0 12px">Get Started</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="padding:12px 16px;background:#f3f4f6;border-radius:8px;margin-bottom:8px">
        <p style="font-size:13px;color:#6b7280;margin:0 0 4px">1. Browse trending skills</p>
        <a href="https://takoapi.com/trending" style="font-size:14px;color:#7c3aed;text-decoration:none;font-weight:600">takoapi.com/trending →</a>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="padding:12px 16px;background:#f3f4f6;border-radius:8px">
        <p style="font-size:13px;color:#6b7280;margin:0 0 4px">2. Install the official TakoAPI skill</p>
        <code style="font-size:14px;color:#7c3aed;font-weight:600">clawhub install takoapi</code>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="padding:12px 16px;background:#f3f4f6;border-radius:8px">
        <p style="font-size:13px;color:#6b7280;margin:0 0 4px">3. Submit your own skill</p>
        <a href="https://takoapi.com/submit" style="font-size:14px;color:#7c3aed;text-decoration:none;font-weight:600">takoapi.com/submit →</a>
      </td></tr>
    </table>

    <div style="text-align:center;margin:32px 0">
      <a href="https://takoapi.com" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">Explore Skills</a>
    </div>

    <p style="font-size:13px;color:#9ca3af;line-height:1.5;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:16px">Have questions? Just reply to this email. We'd love to hear from you.</p>
  </td></tr>
  <tr><td style="padding:16px 32px;background:#f9fafb;text-align:center">
    <p style="font-size:12px;color:#9ca3af;margin:0">TakoAPI · <a href="https://takoapi.com" style="color:#7c3aed;text-decoration:none">takoapi.com</a> · <a href="https://github.com/oratis/TakoAPI" style="color:#7c3aed;text-decoration:none">GitHub</a></p>
  </td></tr>
</table>
</body>
</html>`,
  });
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
        `<tr><td style="padding:8px 12px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6">${i + 1}. <a href="https://takoapi.com/skills/${s.slug}" style="color:#7c3aed;text-decoration:none;font-weight:500">${s.name}</a></td><td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:right;border-bottom:1px solid #f3f4f6">${s.downloads.toLocaleString()} downloads</td></tr>`
    )
    .join("");

  const resend = getResend();
  if (!resend) return null;

  return resend.emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    to,
    subject: `TakoAPI Weekly: ${data.newSkillsCount} new skills this week`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;margin-top:40px;margin-bottom:40px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
  <tr><td style="background:linear-gradient(135deg,#7c3aed,#3b82f6);padding:24px 32px;text-align:center">
    <h1 style="color:#fff;font-size:20px;margin:0">🐙 TakoAPI Weekly Digest</h1>
  </td></tr>
  <tr><td style="padding:32px">
    <div style="display:flex;gap:16px;margin-bottom:24px">
      <div style="flex:1;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px">
        <div style="font-size:24px;font-weight:700;color:#7c3aed">${data.newSkillsCount}</div>
        <div style="font-size:12px;color:#6b7280">New This Week</div>
      </div>
      <div style="flex:1;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px">
        <div style="font-size:24px;font-weight:700;color:#7c3aed">${data.totalSkills.toLocaleString()}</div>
        <div style="font-size:12px;color:#6b7280">Total Skills</div>
      </div>
    </div>
    <h2 style="font-size:16px;color:#1f2937;margin:0 0 12px">Top Skills This Week</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">${skillRows}</table>
    <div style="text-align:center">
      <a href="https://takoapi.com/trending" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none">View Full Rankings</a>
    </div>
  </td></tr>
  <tr><td style="padding:16px 32px;background:#f9fafb;text-align:center">
    <p style="font-size:12px;color:#9ca3af;margin:0">TakoAPI · <a href="https://takoapi.com" style="color:#7c3aed;text-decoration:none">takoapi.com</a> · <a href="https://takoapi.com/unsubscribe" style="color:#9ca3af;text-decoration:none">Unsubscribe</a></p>
  </td></tr>
</table>
</body>
</html>`,
  });
}

export async function sendKolOutreach(
  to: string,
  data: { name: string; skillName?: string; projectName?: string }
) {
  const resend = getResend();
  if (!resend) return null;

  return resend.emails.send({
    from: FROM_EMAIL,
    replyTo: REPLY_TO,
    to,
    subject: `Your ${data.skillName || data.projectName || "project"} on TakoAPI`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:40px auto;padding:0 20px">
  <p style="font-size:15px;line-height:1.7">Hi ${data.name},</p>
  <p style="font-size:15px;line-height:1.7">Love your ${data.skillName || data.projectName || "work"}! We featured it on <a href="https://takoapi.com" style="color:#7c3aed;font-weight:600">TakoAPI</a> — the OpenClaw skills marketplace with 5,000+ skills.</p>
  <p style="font-size:15px;line-height:1.7">Would you like a "Featured Developer" badge on your skill page? We can also provide an "Install via TakoAPI" badge for your README.</p>
  <p style="font-size:15px;line-height:1.7">No commitment needed — just thought you'd appreciate the exposure to our growing community.</p>
  <p style="font-size:15px;line-height:1.7;margin-top:24px">Best,<br><strong>TakoAPI Team</strong></p>
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb">
    <p style="font-size:12px;color:#9ca3af">🐙 <a href="https://takoapi.com" style="color:#7c3aed">takoapi.com</a> · <a href="https://github.com/oratis/TakoAPI" style="color:#7c3aed">GitHub</a></p>
  </div>
</div>
</body>
</html>`,
  });
}
