import { Module } from '@nestjs/common';
import { QnaController, SellerQnaController } from './qna.controller';
import { QnaService } from './qna.service';

@Module({
  controllers: [QnaController, SellerQnaController],
  providers: [QnaService],
  exports: [QnaService],
})
export class QnaModule {}
