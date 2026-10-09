import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  answerInputSchema,
  paginationQuerySchema,
  questionInputSchema,
  type AnswerInput,
  type QuestionInput,
} from '@gk/validators';
import { CurrentSeller, CurrentUser, Public, Roles } from '../../common/decorators';
import { ZBody, ZQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser, SellerContext } from '../../common/types';
import { SellerGuard } from '../auth/guards';
import { QnaService } from './qna.service';

const sellerQuery = paginationQuerySchema.extend({
  unanswered: z.enum(['true', 'false']).optional(),
});

@ApiTags('Q&A')
@Controller()
export class QnaController {
  constructor(private readonly qna: QnaService) {}

  @Public()
  @Get('products/:id/questions')
  list(@Param('id') id: string, @ZQuery(paginationQuerySchema) q: { page: number; limit: number }) {
    return this.qna.list(id, q.page, q.limit);
  }

  @ApiBearerAuth()
  @Post('questions')
  @HttpCode(201)
  ask(@CurrentUser() user: AuthUser, @ZBody(questionInputSchema) body: QuestionInput) {
    return this.qna.ask(user.id, body.productId, body.body);
  }

  @ApiBearerAuth()
  @Post('questions/:id/answers')
  @HttpCode(201)
  answer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZBody(answerInputSchema) body: AnswerInput,
  ) {
    return this.qna.answer(user.id, id, body.body);
  }
}

@ApiTags('Seller · Q&A')
@ApiBearerAuth()
@Roles('SELLER')
@UseGuards(SellerGuard)
@Controller('seller/questions')
export class SellerQnaController {
  constructor(private readonly qna: QnaService) {}

  @Get()
  list(
    @CurrentSeller() seller: SellerContext,
    @ZQuery(sellerQuery) q: { page: number; limit: number; unanswered?: string },
  ) {
    return this.qna.listForSeller(seller.id, q.page, q.limit, q.unanswered === 'true');
  }
}
