const DEFAULT_FROM = 'Coach\'s Eye <noreply@coachseye.app>';

export function appBaseUrl(req = {}) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (host) {
    const proto = req.headers?.['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
  }
  return process.env.APP_URL || 'https://boitsfort-coachseye-gpt.vercel.app';
}

export async function sendTransactionalEmail({ to, subject, html, text } = {}) {
  const recipient = String(to || '').trim();
  if (!recipient) return { ok: true, sent: false, skipped: true, reason: 'missing_recipient' };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: true, sent: false, skipped: true, reason: 'email_not_configured' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: recipient,
      subject,
      html,
      text,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || 'Email delivery failed');
    error.status = 502;
    throw error;
  }
  return { ok: true, sent: true, provider: 'resend', id: payload.id || null };
}

export function inviteEmail({ name, teamName = 'Boitsfort RFC', url } = {}) {
  const safeName = String(name || 'Player');
  return {
    subject: `You're invited to join ${teamName} on Coach's Eye`,
    text: `Hi ${safeName},\n\nYou've been invited to join ${teamName} on Coach's Eye.\n\nClaim your account here:\n${url}\n\nThis link expires soon and can only be used once.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>You're invited to join ${teamName}</h2>
        <p>Hi ${safeName},</p>
        <p>Your coach has invited you to create your Coach's Eye account.</p>
        <p><a href="${url}" style="display:inline-block;background:#10b981;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Claim account</a></p>
        <p style="color:#64748b;font-size:13px">This link expires soon and can only be used once.</p>
      </div>`,
  };
}

export function emailVerificationEmail({ name, url } = {}) {
  const safeName = String(name || 'there');
  return {
    subject: "Verify your Coach's Eye email address",
    text: `Hi ${safeName},\n\nVerify your email to complete your Coach's Eye account setup:\n${url}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Verify your email address</h2>
        <p>Hi ${safeName},</p>
        <p>Click below to verify your email and complete your Coach's Eye account setup.</p>
        <p><a href="${url}" style="display:inline-block;background:#10b981;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p>
        <p style="color:#64748b;font-size:13px">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
      </div>`,
  };
}

export function passwordResetEmail({ name, url } = {}) {
  const safeName = String(name || 'there');
  return {
    subject: 'Reset your Coach\'s Eye password',
    text: `Hi ${safeName},\n\nReset your Coach's Eye password here:\n${url}\n\nThis link expires soon. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2>Reset your Coach's Eye password</h2>
        <p>Hi ${safeName},</p>
        <p>Use the secure link below to set a new password.</p>
        <p><a href="${url}" style="display:inline-block;background:#10b981;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">Reset password</a></p>
        <p style="color:#64748b;font-size:13px">This link expires soon. If you did not request this, ignore this email.</p>
      </div>`,
  };
}
