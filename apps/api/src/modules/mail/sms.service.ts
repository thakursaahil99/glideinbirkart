import { Injectable, Logger } from '@nestjs/common';

/**
 * SMS gateway abstraction. India has no free SMS tier suitable for OTPs, so the default
 * implementation logs the message (and the auth service exposes `devOtp` outside production).
 * Plug MSG91 / Twilio / Fast2SMS in here by replacing `send`.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger(SmsService.name);

  async send(phone: string, message: string): Promise<void> {
    this.log.log(`[sms:console] +91${phone}: ${message}`);
  }
}
