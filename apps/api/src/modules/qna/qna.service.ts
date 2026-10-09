import { Injectable } from '@nestjs/common';
import { Prisma } from '@gk/db';
import type { QuestionDto, SellerQuestionRow } from '@gk/types';
import { notFound } from '../../common/errors';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { PrismaService } from '../../infra/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const include = {
  user: { select: { id: true, name: true } },
  answers: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: { id: true, name: true } } },
  },
} satisfies Prisma.QuestionInclude;

type Row = Prisma.QuestionGetPayload<{ include: typeof include }>;

const toDto = (q: Row): QuestionDto => ({
  id: q.id,
  productId: q.productId,
  body: q.body,
  user: q.user,
  answers: q.answers.map((a) => ({
    id: a.id,
    body: a.body,
    isSeller: a.isSeller,
    user: a.user,
    createdAt: a.createdAt.toISOString(),
  })),
  createdAt: q.createdAt.toISOString(),
});

@Injectable()
export class QnaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(productId: string, page: number, limit: number): Promise<PagedResult<QuestionDto>> {
    const where: Prisma.QuestionWhereInput = { productId, deletedAt: null, status: 'VISIBLE' };
    const [rows, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.question.count({ where }),
    ]);
    return paged(rows.map(toDto), page, limit, total);
  }

  async ask(userId: string, productId: string, body: string): Promise<QuestionDto> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, seller: { select: { userId: true } } },
    });
    if (!product) throw notFound('Product');
    const q = await this.prisma.question.create({ data: { productId, userId, body }, include });
    await this.notifications.notify(product.seller.userId, {
      type: 'QNA',
      title: 'New customer question',
      body: `${product.name}: "${body.slice(0, 100)}"`,
      data: { questionId: q.id, link: '/seller/questions' },
    });
    return toDto(q);
  }

  /** Anyone signed-in can answer; answers from the product's seller are flagged. */
  async answer(userId: string, questionId: string, body: string): Promise<QuestionDto> {
    const q = await this.prisma.question.findFirst({
      where: { id: questionId, deletedAt: null },
      include: {
        product: { select: { name: true, sellerId: true, seller: { select: { userId: true } } } },
      },
    });
    if (!q) throw notFound('Question');
    const isSeller = q.product.seller.userId === userId;
    await this.prisma.answer.create({ data: { questionId, userId, body, isSeller } });
    if (q.userId !== userId) {
      await this.notifications.notify(q.userId, {
        type: 'QNA',
        title: isSeller ? 'The seller answered your question' : 'Your question got an answer',
        body: `${q.product.name}: "${body.slice(0, 100)}"`,
        data: { productId: q.productId },
      });
    }
    return toDto(
      await this.prisma.question.findUniqueOrThrow({ where: { id: questionId }, include }),
    );
  }

  async listForSeller(
    sellerId: string,
    page: number,
    limit: number,
    unansweredOnly: boolean,
  ): Promise<PagedResult<SellerQuestionRow>> {
    const where: Prisma.QuestionWhereInput = {
      product: { sellerId },
      deletedAt: null,
      ...(unansweredOnly ? { answers: { none: { isSeller: true, deletedAt: null } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include: {
          user: { select: { name: true } },
          product: { select: { name: true } },
          answers: { where: { isSeller: true, deletedAt: null }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(page, limit),
      }),
      this.prisma.question.count({ where }),
    ]);
    return paged(
      rows.map((q) => ({
        id: q.id,
        productId: q.productId,
        productName: q.product.name,
        body: q.body,
        customerName: q.user.name,
        answered: q.answers.length > 0,
        createdAt: q.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    );
  }
}
