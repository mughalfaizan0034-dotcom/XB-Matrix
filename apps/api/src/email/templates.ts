/**
 * Email templates. Plain functions that take vars and return `{ subject, html, text }`.
 * No template engine — strings only. If templates grow, swap in a renderer.
 *
 * All templates favour the text version: it is what shows in the LogEmailProvider
 * (so operators see the URL clearly) and what email clients render when html is
 * blocked. HTML is a minimal, accessible enhancement.
 */

interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const BRAND = {
  name: 'xB Matrix',
  navy: '#0F2D4B',
  orange: '#F0691E',
  bg: '#F8FAFC',
};

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:32px 16px;background:${BRAND.bg};font-family:Inter,Arial,sans-serif;color:#0F172A;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:8px;">
    <tr><td style="padding:24px 28px 0">
      <div style="display:inline-flex;align-items:center;gap:8px;">
        <div style="width:28px;height:28px;border-radius:6px;background:${BRAND.navy};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">xB</div>
        <span style="font-weight:600;font-size:14px;color:${BRAND.navy};">${BRAND.name}</span>
      </div>
    </td></tr>
    <tr><td style="padding:16px 28px 28px;line-height:1.55;font-size:14px;">
      ${body}
    </td></tr>
    <tr><td style="padding:16px 28px 24px;border-top:1px solid #E2E8F0;color:#475569;font-size:12px;">
      You're receiving this because someone with access to your email address used this address with ${BRAND.name}. If this wasn't you, you can safely ignore the message.
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.navy};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;font-size:14px;">${label}</a>`;
}

export interface InvitationVars {
  readonly displayName: string;
  readonly inviterDisplayName: string;
  readonly organizationName: string | null;
  readonly acceptUrl: string;
  readonly expiresAt: string;
}

export function invitationEmail(vars: InvitationVars): RenderedEmail {
  const context = vars.organizationName ? `to **${vars.organizationName}**` : 'to the platform';
  const subject = `${vars.inviterDisplayName} invited you to xB Matrix`;
  const text = [
    `Hi ${vars.displayName},`,
    ``,
    `${vars.inviterDisplayName} invited you ${context.replace(/\*\*/g, '')} on xB Matrix.`,
    ``,
    `Accept your invitation (expires ${vars.expiresAt}):`,
    vars.acceptUrl,
    ``,
    `If you weren't expecting this invitation, you can safely ignore it.`,
  ].join('\n');
  const html = shell(
    subject,
    `
      <p style="margin:0 0 16px;font-weight:600;font-size:16px;color:${BRAND.navy};">You've been invited</p>
      <p style="margin:0 0 16px;">${vars.inviterDisplayName} invited you ${context.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')} on ${BRAND.name}.</p>
      <p style="margin:0 0 24px;">${button(vars.acceptUrl, 'Accept invitation')}</p>
      <p style="margin:0 0 8px;color:#475569;font-size:12px;">This link expires on <span style="font-variant-numeric:tabular-nums;">${vars.expiresAt}</span>.</p>
    `,
  );
  return { subject, html, text };
}

export interface PasswordResetVars {
  readonly displayName: string | null;
  readonly resetUrl: string;
  readonly expiresAt: string;
  readonly requestIp: string | null;
}

export function passwordResetEmail(vars: PasswordResetVars): RenderedEmail {
  const subject = `Reset your xB Matrix password`;
  const text = [
    vars.displayName ? `Hi ${vars.displayName},` : 'Hi,',
    ``,
    `Someone (you, we hope) requested a password reset for your xB Matrix account.`,
    ``,
    `Reset your password (expires ${vars.expiresAt}):`,
    vars.resetUrl,
    ``,
    vars.requestIp ? `Request came from IP: ${vars.requestIp}.` : '',
    `If you didn't request this, you can ignore the email — your current password still works.`,
  ]
    .filter(Boolean)
    .join('\n');
  const html = shell(
    subject,
    `
      <p style="margin:0 0 16px;font-weight:600;font-size:16px;color:${BRAND.navy};">Reset your password</p>
      <p style="margin:0 0 16px;">Someone requested a password reset for your ${BRAND.name} account.</p>
      <p style="margin:0 0 24px;">${button(vars.resetUrl, 'Reset password')}</p>
      <p style="margin:0 0 8px;color:#475569;font-size:12px;">This link expires on <span style="font-variant-numeric:tabular-nums;">${vars.expiresAt}</span>.</p>
      ${vars.requestIp ? `<p style="margin:0;color:#475569;font-size:12px;">Request from IP <span style="font-variant-numeric:tabular-nums;">${vars.requestIp}</span>.</p>` : ''}
    `,
  );
  return { subject, html, text };
}

export interface EmailVerificationVars {
  readonly displayName: string | null;
  readonly verifyUrl: string;
  readonly expiresAt: string;
}

export function emailVerificationEmail(vars: EmailVerificationVars): RenderedEmail {
  const subject = `Verify your xB Matrix email`;
  const text = [
    vars.displayName ? `Hi ${vars.displayName},` : 'Hi,',
    ``,
    `Verify this email address to finish setting up your xB Matrix account.`,
    ``,
    `Verify (expires ${vars.expiresAt}):`,
    vars.verifyUrl,
  ].join('\n');
  const html = shell(
    subject,
    `
      <p style="margin:0 0 16px;font-weight:600;font-size:16px;color:${BRAND.navy};">Verify your email</p>
      <p style="margin:0 0 24px;">${button(vars.verifyUrl, 'Verify email')}</p>
      <p style="margin:0;color:#475569;font-size:12px;">Link expires <span style="font-variant-numeric:tabular-nums;">${vars.expiresAt}</span>.</p>
    `,
  );
  return { subject, html, text };
}

export interface EmailChangeVars {
  readonly displayName: string | null;
  readonly newEmail: string;
  readonly confirmUrl: string;
  readonly expiresAt: string;
}

export function emailChangeEmail(vars: EmailChangeVars): RenderedEmail {
  const subject = `Confirm your new xB Matrix email`;
  const text = [
    vars.displayName ? `Hi ${vars.displayName},` : 'Hi,',
    ``,
    `Confirm that ${vars.newEmail} is your new sign-in address.`,
    ``,
    `Confirm (expires ${vars.expiresAt}):`,
    vars.confirmUrl,
  ].join('\n');
  const html = shell(
    subject,
    `
      <p style="margin:0 0 16px;font-weight:600;font-size:16px;color:${BRAND.navy};">Confirm your new email</p>
      <p style="margin:0 0 16px;">Confirm that <strong>${vars.newEmail}</strong> is your new sign-in address.</p>
      <p style="margin:0 0 24px;">${button(vars.confirmUrl, 'Confirm new email')}</p>
      <p style="margin:0;color:#475569;font-size:12px;">Link expires <span style="font-variant-numeric:tabular-nums;">${vars.expiresAt}</span>.</p>
    `,
  );
  return { subject, html, text };
}
