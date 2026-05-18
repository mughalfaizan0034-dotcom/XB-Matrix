import type { FastifyInstance } from 'fastify';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly tags?: ReadonlyArray<string>;
}

export interface EmailSendResult {
  readonly id: string;
  readonly provider: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Provider that just writes the message to the app log. Used in dev and in
 * production when no real email provider is configured — the operator
 * pulls invitation/reset URLs from logs and shares them manually.
 *
 * Never use this for real customer flows.
 */
export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  constructor(private readonly logger: { info: (obj: object, msg?: string) => void }) {}
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const id = 'log-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    this.logger.info(
      {
        emailProvider: this.name,
        to: msg.to,
        subject: msg.subject,
        textPreview: msg.text.slice(0, 1000),
        tags: msg.tags,
        deliveryId: id,
      },
      'email (log provider) — copy any verification/invite URL from textPreview',
    );
    return { id, provider: this.name };
  }
}

/**
 * Resend provider. Lazy — only validates the API key once on first send.
 * https://resend.com/docs/api-reference/emails/send-email
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
    private readonly logger: { warn: (obj: object, msg?: string) => void },
  ) {}

  async send(msg: EmailMessage): Promise<EmailSendResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        tags: msg.tags?.map((name) => ({ name, value: 'true' })),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) {
      this.logger.warn(
        { status: res.status, body, to: msg.to, subject: msg.subject },
        'resend send failed',
      );
      throw new Error(`Resend send failed: ${res.status} ${body.message ?? ''}`);
    }
    return { id: body.id, provider: this.name };
  }
}

/**
 * Factory: pick provider from config. Right now we ship the Log provider
 * by default; setting RESEND_API_KEY + EMAIL_FROM in env switches to Resend
 * for real delivery.
 */
export function makeEmailProvider(app: FastifyInstance): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey && from) {
    app.log.info({ provider: 'resend', from }, 'email provider configured');
    return new ResendEmailProvider(apiKey, from, app.log);
  }
  app.log.info({ provider: 'log' }, 'no email provider configured; using log provider');
  return new LogEmailProvider(app.log);
}
