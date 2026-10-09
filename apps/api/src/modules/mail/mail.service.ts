import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import type { AppConfig } from '../../config/config.types';
import { QueueNames, QueueService, type EmailJob } from '../../infra/queue.service';

/**
 * Email delivery. Provider priority: Resend → SMTP (e.g. Gmail app-password) → console logger.
 * Callers use `send()` (queued, retried); the emails worker calls `deliver()`.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name);
  private readonly from: string;
  private readonly resend?: Resend;
  private readonly smtp?: Transporter;

  constructor(
    @Inject(ConfigService) config: AppConfig,
    private readonly queue: QueueService,
  ) {
    this.from = config.get('MAIL_FROM', { infer: true });
    const resendKey = config.get('RESEND_API_KEY', { infer: true });
    const smtpHost = config.get('SMTP_HOST', { infer: true });
    if (resendKey) {
      this.resend = new Resend(resendKey);
    } else if (smtpHost) {
      const port = config.get('SMTP_PORT', { infer: true });
      this.smtp = createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: {
          user: config.get('SMTP_USER', { infer: true }),
          pass: config.get('SMTP_PASS', { infer: true }),
        },
      });
    }
  }

  get provider(): 'resend' | 'smtp' | 'console' {
    return this.resend ? 'resend' : this.smtp ? 'smtp' : 'console';
  }

  /** Queue an email (non-blocking, retried with backoff). */
  async send(job: EmailJob): Promise<void> {
    await this.queue.add(QueueNames.emails, job);
  }

  /** Actually deliver — used by the emails worker. Throws so BullMQ can retry. */
  async deliver(job: EmailJob): Promise<void> {
    if (this.resend) {
      const { error } = await this.resend.emails.send({
        from: this.from,
        to: job.to,
        subject: job.subject,
        html: job.html,
        text: job.text,
      });
      if (error) throw new Error(`Resend error: ${error.message}`);
      return;
    }
    if (this.smtp) {
      await this.smtp.sendMail({
        from: this.from,
        to: job.to,
        subject: job.subject,
        html: job.html,
        text: job.text,
      });
      return;
    }
    const plain =
      job.text ??
      job.html
        .replace(/<style[\s\S]*?<\/style>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    this.log.log(
      `[email:console] to=${job.to} subject="${job.subject}"\n    ${plain.slice(0, 400)}`,
    );
    // Surface links in dev so verification / reset flows are testable without a mail provider.
    const links = [...job.html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    if (links.length) this.log.log(`[email:console] links: ${links.join('  ')}`);
  }
}
