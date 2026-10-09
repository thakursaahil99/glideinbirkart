import { Global, Module } from '@nestjs/common';
import { KycService } from './kyc.service';

@Global()
@Module({ providers: [KycService], exports: [KycService] })
export class KycModule {}
