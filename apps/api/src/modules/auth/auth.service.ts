import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomInt, timingSafeEqual } from 'node:crypto';
import type { AuthResult, OtpRequestResult } from '@gk/types';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyOtpInput,
} from '@gk/validators';
import type { AppConfig } from '../../config/config.types';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { AppException, badRequest, conflict, forbidden, unauthorized } from '../../common/errors';
import { MailService } from '../mail/mail.service';
import { mailTemplates } from '../mail/mail.templates';
import { SmsService } from '../mail/sms.service';
import { toUserDto, userSelect } from '../users/user.mapper';
import { AuthStateService } from './auth-state.service';
import {
  randomToken,
  sha256,
  TokensService,
  type IssuedTokens,
  type SessionMeta,
} from './tokens.service';

const OTP_TTL_SECONDS = 300;
const OTP_RESEND_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 6;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_SECONDS = 15 * 60;
const EMAIL_VERIFY_TTL_MS = 24 * 3600 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** Burned when the account doesn't exist so response time doesn't reveal valid emails. */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash('not-a-real-password'));

export interface AuthOutcome {
  result: AuthResult;
  issued: IssuedTokens;
  sessionUser: { id: string; role: string };
}

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokensService,
    private readonly state: AuthStateService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  private get isProd() {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }

  private webUrl(path: string) {
    return `${this.config.get('WEB_URL', { infer: true }).replace(/\/$/, '')}${path}`;
  }

  private async buildOutcome(
    userId: string,
    meta: SessionMeta,
    existing?: IssuedTokens,
  ): Promise<AuthOutcome> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ...userSelect, tokenVersion: true },
    });
    const issued = existing ?? (await this.tokens.issue(user, meta));
    const result: AuthResult = {
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      user: toUserDto(user),
      ...(meta.clientType === 'mobile' ? { refreshToken: issued.refreshToken } : {}),
    };
    return { result, issued, sessionUser: { id: user.id, role: user.role } };
  }

  // ───────────────────────── password auth ─────────────────────────

  async register(input: RegisterInput, meta: SessionMeta): Promise<AuthOutcome> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])] },
      select: { email: true },
    });
    if (existing) {
      throw conflict(
        existing.email === input.email ? 'EMAIL_EXISTS' : 'PHONE_EXISTS',
        existing.email === input.email
          ? 'An account with this email already exists'
          : 'An account with this phone already exists',
      );
    }
    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: { name: input.name, email: input.email, phone: input.phone, passwordHash },
    });
    await this.sendVerificationEmail(user.id, user.email as string, user.name);
    return this.buildOutcome(user.id, meta);
  }

  async login(input: LoginInput, meta: SessionMeta): Promise<AuthOutcome> {
    const lockKey = `gk:login:fail:${input.email}`;
    const failures = Number((await this.redis.client.get(lockKey)) ?? 0);
    if (failures >= LOGIN_MAX_FAILURES) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'ACCOUNT_LOCKED',
        'Too many failed attempts. Try again in 15 minutes or reset your password.',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
    });
    const hash = user?.passwordHash ?? (await getDummyHash());
    const valid = await argon2.verify(hash, input.password).catch(() => false);
    if (!user || !user.passwordHash || !valid) {
      await this.redis.client.multi().incr(lockKey).expire(lockKey, LOGIN_LOCK_SECONDS).exec();
      throw unauthorized('Incorrect email or password', 'INVALID_CREDENTIALS');
    }
    if (user.status === 'BLOCKED')
      throw forbidden('Your account has been blocked. Contact support.', 'ACCOUNT_BLOCKED');

    await this.redis.client.del(lockKey);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.buildOutcome(user.id, meta);
  }

  async refresh(rawToken: string, meta: SessionMeta): Promise<AuthOutcome> {
    const { user, issued } = await this.tokens.rotate(rawToken, meta);
    return this.buildOutcome(user.id, meta, issued);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.tokens.revokeToken(rawToken);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokens.revokeAllForUser(userId);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash)
      throw badRequest(
        'NO_PASSWORD',
        'This account signs in with OTP. Use "Forgot password" to set one.',
      );
    if (!(await argon2.verify(user.passwordHash, input.currentPassword).catch(() => false))) {
      throw badRequest('INVALID_PASSWORD', 'Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await argon2.hash(input.newPassword) },
    });
    await this.tokens.revokeAllForUser(userId);
  }

  // ───────────────────────── email verification & reset ─────────────────────────

  private async createEmailToken(
    userId: string | null,
    email: string,
    purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET',
    ttlMs: number,
  ) {
    const token = randomToken(32);
    // one live token per identifier+purpose
    await this.prisma.otpCode.updateMany({
      where: { identifier: email, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.otpCode.create({
      data: {
        userId,
        identifier: email,
        purpose,
        codeHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  async sendVerificationEmail(userId: string, email: string, name: string): Promise<void> {
    const token = await this.createEmailToken(userId, email, 'EMAIL_VERIFY', EMAIL_VERIFY_TTL_MS);
    const mail = mailTemplates.verifyEmail(name, this.webUrl(`/verify-email?token=${token}`));
    await this.mail.send({ to: email, ...mail });
  }

  async resendVerification(userId: string): Promise<{ sent: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.email) throw badRequest('NO_EMAIL', 'Add an email address to your account first');
    if (user.emailVerifiedAt) return { sent: false };
    const cooldown = `gk:verify:cooldown:${userId}`;
    if (!(await this.redis.client.set(cooldown, '1', 'EX', 60, 'NX'))) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'COOLDOWN',
        'Please wait a minute before requesting another email',
      );
    }
    await this.sendVerificationEmail(user.id, user.email, user.name);
    return { sent: true };
  }

  async verifyEmail(token: string): Promise<void> {
    const rec = await this.prisma.otpCode.findFirst({
      where: {
        codeHash: sha256(token),
        purpose: 'EMAIL_VERIFY',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!rec || !rec.userId)
      throw badRequest('INVALID_TOKEN', 'This verification link is invalid or has expired');
    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
  }

  /** Always resolves the same way so the endpoint can't be used to enumerate accounts. */
  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user || !user.email) return;
    const token = await this.createEmailToken(
      user.id,
      user.email,
      'PASSWORD_RESET',
      PASSWORD_RESET_TTL_MS,
    );
    const mail = mailTemplates.resetPassword(
      user.name,
      this.webUrl(`/reset-password?token=${token}`),
    );
    await this.mail.send({ to: user.email, ...mail });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const rec = await this.prisma.otpCode.findFirst({
      where: {
        codeHash: sha256(input.token),
        purpose: 'PASSWORD_RESET',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!rec || !rec.userId)
      throw badRequest('INVALID_TOKEN', 'This reset link is invalid or has expired');
    await this.prisma.$transaction([
      this.prisma.otpCode.update({ where: { id: rec.id }, data: { consumedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: rec.userId },
        data: { passwordHash: await argon2.hash(input.password), emailVerifiedAt: new Date() },
      }),
    ]);
    await this.tokens.revokeAllForUser(rec.userId);
  }

  // ───────────────────────── phone OTP ─────────────────────────

  private otpHash(phone: string, code: string) {
    return sha256(`${phone}:${code}:${this.config.get('JWT_ACCESS_SECRET', { infer: true })}`);
  }

  async requestOtp(phone: string): Promise<OtpRequestResult> {
    const cooldownKey = `gk:otp:cooldown:${phone}`;
    const countKey = `gk:otp:count:${phone}`;
    if (!(await this.redis.client.set(cooldownKey, '1', 'EX', OTP_RESEND_SECONDS, 'NX'))) {
      const ttl = await this.redis.client.ttl(cooldownKey);
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_COOLDOWN',
        `Please wait ${Math.max(ttl, 1)}s before requesting another code`,
      );
    }
    const sent = await this.redis.client.incr(countKey);
    if (sent === 1) await this.redis.client.expire(countKey, 3600);
    if (sent > OTP_MAX_PER_HOUR) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_LIMIT',
        'Too many OTP requests. Try again in an hour.',
      );
    }

    const env = this.config.get('NODE_ENV', { infer: true });
    const code = env === 'test' ? '123456' : String(randomInt(100000, 1000000));
    await this.redis.client.set(
      `gk:otp:${phone}`,
      JSON.stringify({ hash: this.otpHash(phone, code), attempts: 0 }),
      'EX',
      OTP_TTL_SECONDS,
    );
    await this.sms.send(
      phone,
      `${code} is your Glideinbir Kart verification code. Valid for 5 minutes. Do not share it.`,
    );
    return { sent: true, resendIn: OTP_RESEND_SECONDS, ...(this.isProd ? {} : { devOtp: code }) };
  }

  async verifyOtp(input: VerifyOtpInput, meta: SessionMeta): Promise<AuthOutcome> {
    const key = `gk:otp:${input.phone}`;
    const raw = await this.redis.client.get(key);
    if (!raw) throw badRequest('OTP_EXPIRED', 'This code has expired. Request a new one.');
    const rec = JSON.parse(raw) as { hash: string; attempts: number };
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      await this.redis.client.del(key);
      throw badRequest('OTP_ATTEMPTS', 'Too many wrong attempts. Request a new code.');
    }
    const expected = Buffer.from(rec.hash);
    const given = Buffer.from(this.otpHash(input.phone, input.code));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      const ttl = await this.redis.client.ttl(key);
      await this.redis.client.set(
        key,
        JSON.stringify({ ...rec, attempts: rec.attempts + 1 }),
        'EX',
        Math.max(ttl, 1),
      );
      throw badRequest('OTP_INVALID', 'Incorrect code');
    }
    await this.redis.client.del(key);

    let user = await this.prisma.user.findFirst({ where: { phone: input.phone, deletedAt: null } });
    if (user?.status === 'BLOCKED')
      throw forbidden('Your account has been blocked. Contact support.', 'ACCOUNT_BLOCKED');
    if (!user) {
      user = await this.prisma.user.create({
        data: { phone: input.phone, name: input.name ?? 'Customer', phoneVerifiedAt: new Date() },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerifiedAt: user.phoneVerifiedAt ?? new Date(), lastLoginAt: new Date() },
      });
      await this.state.invalidate(user.id);
    }
    return this.buildOutcome(user.id, meta);
  }
}
