import { Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  requestOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyOtpSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
  type RequestOtpInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
  type VerifyOtpInput,
} from '@gk/validators';
import type { AppConfig } from '../../config/config.types';
import { CurrentUser, Public } from '../../common/decorators';
import { unauthorized } from '../../common/errors';
import { ZBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types';
import { AuthService, type AuthOutcome } from './auth.service';
import { CsrfGuard } from './guards';
import { TokensService, type ClientType, type SessionMeta } from './tokens.service';

const RT_COOKIE = 'gk_rt';
const CSRF_COOKIE = 'gk_csrf';
const SESSION_COOKIE = 'gk_session';
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  private meta(req: Request): SessionMeta {
    const clientType: ClientType = req.headers['x-client-type'] === 'mobile' ? 'mobile' : 'web';
    return { clientType, ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private cookieBase(): CookieOptions {
    return {
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
    };
  }

  /** Web clients get httpOnly cookies; mobile clients receive the refresh token in the body instead. */
  private respond(res: Response, outcome: AuthOutcome, clientType: ClientType) {
    if (clientType === 'web') {
      const maxAge = this.tokens.refreshTtlMs;
      const base = this.cookieBase();
      res.cookie(RT_COOKIE, outcome.issued.refreshToken, {
        ...base,
        httpOnly: true,
        path: '/api/v1/auth',
        maxAge,
      });
      res.cookie(CSRF_COOKIE, randomBytes(24).toString('base64url'), {
        ...base,
        httpOnly: false,
        path: '/',
        maxAge,
      });
      res.cookie(SESSION_COOKIE, this.tokens.signSession(outcome.sessionUser), {
        ...base,
        httpOnly: true,
        path: '/',
        maxAge,
      });
    }
    return outcome.result;
  }

  private clearCookies(res: Response) {
    const base = this.cookieBase();
    res.clearCookie(RT_COOKIE, { ...base, httpOnly: true, path: '/api/v1/auth' });
    res.clearCookie(CSRF_COOKIE, { ...base, path: '/' });
    res.clearCookie(SESSION_COOKIE, { ...base, httpOnly: true, path: '/' });
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @ApiOperation({ summary: 'Create a customer account with email + password' })
  async register(
    @ZBody(registerSchema) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = this.meta(req);
    return this.respond(res, await this.auth.register(body, meta), meta.clientType);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('login')
  @ApiOperation({
    summary: 'Email + password login → access token (+ refresh cookie on web / body on mobile)',
  })
  async login(
    @ZBody(loginSchema) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = this.meta(req);
    return this.respond(res, await this.auth.login(body, meta), meta.clientType);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('otp/request')
  @ApiOperation({ summary: 'Send a 6-digit login OTP to an Indian mobile number' })
  requestOtp(@ZBody(requestOtpSchema) body: RequestOtpInput) {
    return this.auth.requestOtp(body.phone);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify the OTP; creates the account on first login' })
  async verifyOtp(
    @ZBody(verifyOtpSchema) body: VerifyOtpInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = this.meta(req);
    return this.respond(res, await this.auth.verifyOtp(body, meta), meta.clientType);
  }

  @Public()
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  @ApiOperation({
    summary: 'Rotate the refresh token (cookie on web, body on mobile) and get a new access token',
  })
  async refresh(
    @ZBody(refreshSchema) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const raw = body.refreshToken ?? cookies[RT_COOKIE];
    if (!raw) throw unauthorized('No session', 'NO_REFRESH_TOKEN');
    const meta: SessionMeta = body.refreshToken
      ? { ...this.meta(req), clientType: 'mobile' }
      : this.meta(req);
    try {
      return this.respond(res, await this.auth.refresh(raw, meta), meta.clientType);
    } catch (err) {
      this.clearCookies(res);
      throw err;
    }
  }

  @Public()
  @UseGuards(CsrfGuard)
  @HttpCode(200)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current refresh token and clear cookies' })
  async logout(
    @ZBody(refreshSchema) body: RefreshInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    await this.auth.logout(body.refreshToken ?? cookies[RT_COOKIE]);
    this.clearCookies(res);
    return { loggedOut: true };
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('logout-all')
  @ApiOperation({ summary: 'Sign out of every device' })
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id);
    this.clearCookies(res);
    return { loggedOut: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(@ZBody(verifyEmailSchema) body: VerifyEmailInput) {
    await this.auth.verifyEmail(body.token);
    return { verified: true };
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('resend-verification')
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Email a password-reset link (always responds the same, to avoid account enumeration)',
  })
  async forgot(@ZBody(forgotPasswordSchema) body: ForgotPasswordInput) {
    await this.auth.forgotPassword(body);
    return { sent: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  async reset(@ZBody(resetPasswordSchema) body: ResetPasswordInput) {
    await this.auth.resetPassword(body);
    return { reset: true };
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('change-password')
  async change(
    @CurrentUser() user: AuthUser,
    @ZBody(changePasswordSchema) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.id, body);
    this.clearCookies(res);
    return { changed: true };
  }

  @ApiBearerAuth()
  @Get('session')
  @ApiOperation({ summary: 'Lightweight check that the access token is valid' })
  session(@CurrentUser() user: AuthUser) {
    return { id: user.id, role: user.role };
  }
}
