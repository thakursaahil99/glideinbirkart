import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthStateService } from './auth-state.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard, JwtAuthGuard, RolesGuard, SellerGuard } from './guards';
import { TokensService } from './tokens.service';

@Global()
@Module({
  imports: [JwtModule.registerAsync({ inject: [ConfigService], useFactory: () => ({}) })],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    AuthStateService,
    JwtAuthGuard,
    RolesGuard,
    SellerGuard,
    CsrfGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, TokensService, AuthStateService, JwtModule],
})
export class AuthModule {}
