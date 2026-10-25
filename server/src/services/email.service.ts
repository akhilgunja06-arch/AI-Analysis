import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Configurable email delivery.
 *   console  — development default; prints the message, needs no credentials
 *   smtp     — real delivery via the configured SMTP server
 *   disabled — accepted but dropped; API responses stay identical either way
 *
 * Nothing in the platform depends on email actually arriving: verification and
 * reset tokens are also returned to the client in non-production environments
 * so the flows are testable end to end.
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (env.EMAIL_PROVIDER !== 'smtp') return null;
  if (transporter) return transporter;
  if (!env.SMTP_HOST) {
    logger.warn('email.smtp_not_configured', { provider: 'smtp' });
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export function emailDeliveryEnabled(): boolean {
  return env.EMAIL_PROVIDER !== 'disabled';
}

export async function sendMail(message: MailMessage): Promise<{ delivered: boolean; reason?: string }> {
  if (env.EMAIL_PROVIDER === 'disabled') {
    logger.debug('email.skipped', { to: message.to, subject: message.subject });
    return { delivered: false, reason: 'EMAIL_PROVIDER=disabled' };
  }

  if (env.EMAIL_PROVIDER === 'console') {
    // Never log full bodies of user content; these are transactional templates.
    logger.info('email.console_delivery', {
      to: message.to,
      subject: message.subject,
      preview: message.text.slice(0, 400),
    });
    return { delivered: true, reason: 'console' };
  }

  const tx = getTransporter();
  if (!tx) return { delivered: false, reason: 'smtp-not-configured' };

  try {
    await tx.sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true };
  } catch (err) {
    // Email failure must never break the primary operation.
    logger.error('email.send_failed', { to: message.to, err });
    return { delivered: false, reason: 'send-failed' };
  }
}

function wrap(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#0b1020;font-family:Inter,Segoe UI,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-size:20px;font-weight:700;color:#a5b4fc;letter-spacing:-0.02em">SkillSpring</div>
    <div style="margin-top:20px;background:#131a33;border:1px solid #253063;border-radius:16px;padding:28px;color:#e2e8f7">
      <h1 style="margin:0 0 12px;font-size:20px;color:#ffffff">${title}</h1>
      <div style="font-size:15px;line-height:1.6;color:#b8c2e0">${body}</div>
      ${
        cta
          ? `<div style="margin-top:24px"><a href="${cta.url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${cta.label}</a></div>`
          : ''
      }
    </div>
    <p style="color:#5b6688;font-size:12px;margin-top:20px">You are receiving this because you have a SkillSpring account.</p>
  </div></body></html>`;
}

export function verificationEmail(to: string, displayName: string, token: string) {
  const url = `${env.corsOrigins[0] ?? 'http://localhost:5173'}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: 'Confirm your SkillSpring email address',
    text: `Hi ${displayName},\n\nConfirm your email address to activate your SkillSpring account:\n${url}\n\nThis link expires in 24 hours. If you did not create an account, you can ignore this message.`,
    html: wrap(
      `Welcome, ${displayName}`,
      'Confirm your email address to activate your account. This link expires in 24 hours.',
      { label: 'Confirm email address', url },
    ),
  });
}

export function passwordResetEmail(to: string, displayName: string, token: string) {
  const url = `${env.corsOrigins[0] ?? 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: 'Reset your SkillSpring password',
    text: `Hi ${displayName},\n\nUse this link to choose a new password:\n${url}\n\nThis link expires in 1 hour. If you did not request a reset, no action is needed.`,
    html: wrap(
      'Reset your password',
      'Use the button below to choose a new password. This link expires in 1 hour. If you did not request a reset, no action is needed.',
      { label: 'Choose a new password', url },
    ),
  });
}

export function notificationEmail(to: string, title: string, body: string, link?: string) {
  const url = link ? `${env.corsOrigins[0] ?? 'http://localhost:5173'}${link}` : undefined;
  return sendMail({
    to,
    subject: title,
    text: `${title}\n\n${body}${url ? `\n\n${url}` : ''}`,
    html: wrap(title, body, url ? { label: 'Open SkillSpring', url } : undefined),
  });
}
