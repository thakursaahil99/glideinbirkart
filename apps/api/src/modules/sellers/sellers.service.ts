import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SellerProfileDto } from '@gk/types';
import type {
  SellerBankInput,
  SellerBusinessInput,
  SellerDecisionInput,
  SellerPickupInput,
} from '@gk/validators';
import type { AppConfig } from '../../config/config.types';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { uniqueSlug } from '../../common/utils/slug';
import { PagedResult, pageArgs, paged } from '../../common/types';
import { Prisma } from '@gk/db';
import { PrismaService } from '../../infra/prisma.service';
import { AuthStateService } from '../auth/auth-state.service';
import { MailService } from '../mail/mail.service';
import { mailTemplates } from '../mail/mail.templates';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductAggregatesService } from '../products/product-aggregates.service';
import { toSellerDto } from './sellers.mapper';
import type { AdminSellerRow } from '@gk/types';

const REQUIRED_KYC = ['PAN', 'GSTIN_CERTIFICATE', 'BANK_PROOF'] as const;
const withKyc = { kycDocuments: { orderBy: { createdAt: 'desc' as const } } };

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: AuthStateService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly aggregates: ProductAggregatesService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  private webUrl(path: string) {
    return `${this.config.get('WEB_URL', { infer: true }).replace(/\/$/, '')}${path}`;
  }

  async getProfile(sellerId: string): Promise<SellerProfileDto> {
    const s = await this.prisma.sellerProfile.findFirst({
      where: { id: sellerId, deletedAt: null },
      include: withKyc,
    });
    if (!s) throw notFound('Seller profile');
    return toSellerDto(s);
  }

  async profileForUser(userId: string): Promise<SellerProfileDto | null> {
    const s = await this.prisma.sellerProfile.findFirst({
      where: { userId, deletedAt: null },
      include: withKyc,
    });
    return s ? toSellerDto(s) : null;
  }

  /** A customer starts seller onboarding: creates the DRAFT profile and upgrades the role. */
  async apply(userId: string, input: SellerBusinessInput): Promise<SellerProfileDto> {
    const existing = await this.prisma.sellerProfile.findFirst({ where: { userId } });
    if (existing) throw conflict('ALREADY_SELLER', 'You already have a seller account');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== 'CUSTOMER') throw forbidden('Only customer accounts can apply to sell');

    const gstinTaken = await this.prisma.sellerProfile.findFirst({
      where: { gstin: input.gstin, deletedAt: null },
      select: { id: true },
    });
    if (gstinTaken)
      throw conflict('GSTIN_EXISTS', 'A seller with this GSTIN is already registered');

    const slug = await uniqueSlug(
      input.storeName,
      async (s) =>
        !!(await this.prisma.sellerProfile.findUnique({
          where: { slug: s },
          select: { id: true },
        })),
      'store',
    );
    const profile = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { role: 'SELLER' } });
      return tx.sellerProfile.create({
        data: {
          userId,
          slug,
          storeName: input.storeName,
          description: input.description || null,
          logoUrl: input.logoUrl || null,
          businessName: input.businessName,
          businessType: input.businessType,
          gstin: input.gstin,
          pan: input.pan,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          onboardingStep: 1,
        },
        include: withKyc,
      });
    });
    await this.state.invalidate(userId); // role changed
    return toSellerDto(profile);
  }

  private assertEditable(status: string) {
    if (status === 'PENDING')
      throw badRequest(
        'UNDER_REVIEW',
        'Your application is under review and cannot be edited right now',
      );
    if (status === 'SUSPENDED') throw forbidden('Your seller account is suspended');
  }

  async saveBusiness(sellerId: string, input: SellerBusinessInput): Promise<SellerProfileDto> {
    const s = await this.prisma.sellerProfile.findUniqueOrThrow({ where: { id: sellerId } });
    this.assertEditable(s.status);
    if (input.gstin !== s.gstin) {
      const taken = await this.prisma.sellerProfile.findFirst({
        where: { gstin: input.gstin, id: { not: sellerId }, deletedAt: null },
        select: { id: true },
      });
      if (taken) throw conflict('GSTIN_EXISTS', 'A seller with this GSTIN is already registered');
    }
    const updated = await this.prisma.sellerProfile.update({
      where: { id: sellerId },
      data: {
        // an approved store keeps its public slug stable
        storeName: s.status === 'APPROVED' ? s.storeName : input.storeName,
        description: input.description || null,
        logoUrl: input.logoUrl || null,
        businessName: input.businessName,
        businessType: input.businessType,
        gstin: input.gstin,
        pan: input.pan,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        onboardingStep: Math.max(s.onboardingStep, 1),
      },
      include: withKyc,
    });
    return toSellerDto(updated);
  }

  async saveBank(sellerId: string, input: SellerBankInput): Promise<SellerProfileDto> {
    const s = await this.prisma.sellerProfile.findUniqueOrThrow({ where: { id: sellerId } });
    this.assertEditable(s.status);
    const updated = await this.prisma.sellerProfile.update({
      where: { id: sellerId },
      data: { ...input, onboardingStep: Math.max(s.onboardingStep, 2) },
      include: withKyc,
    });
    return toSellerDto(updated);
  }

  async savePickup(sellerId: string, input: SellerPickupInput): Promise<SellerProfileDto> {
    const s = await this.prisma.sellerProfile.findUniqueOrThrow({ where: { id: sellerId } });
    this.assertEditable(s.status);
    const updated = await this.prisma.sellerProfile.update({
      where: { id: sellerId },
      data: {
        ...input,
        pickupLine2: input.pickupLine2 || null,
        onboardingStep: Math.max(s.onboardingStep, 3),
      },
      include: withKyc,
    });
    return toSellerDto(updated);
  }

  async updateStoreSettings(
    sellerId: string,
    input: { description?: string; logoUrl?: string },
  ): Promise<SellerProfileDto> {
    const updated = await this.prisma.sellerProfile.update({
      where: { id: sellerId },
      data: { description: input.description, logoUrl: input.logoUrl },
      include: withKyc,
    });
    return toSellerDto(updated);
  }

  /** Submit the application for admin review after validating that everything is on file. */
  async submit(sellerId: string): Promise<SellerProfileDto> {
    const s = await this.prisma.sellerProfile.findUniqueOrThrow({
      where: { id: sellerId },
      include: withKyc,
    });
    if (s.status === 'PENDING')
      throw badRequest('ALREADY_SUBMITTED', 'Your application is already under review');
    if (s.status === 'APPROVED' || s.status === 'SUSPENDED')
      throw badRequest('INVALID_STATE', 'This account is already active');

    const missing: string[] = [];
    if (!s.businessName || !s.gstin || !s.pan) missing.push('business details');
    if (!s.bankAccountNumber || !s.bankIfsc) missing.push('bank account');
    if (!s.pickupPincode || !s.pickupLine1) missing.push('pickup address');
    for (const t of REQUIRED_KYC)
      if (!s.kycDocuments.some((d) => d.docType === t))
        missing.push(`${t.replace('_', ' ').toLowerCase()} document`);
    if (missing.length)
      throw badRequest('INCOMPLETE_APPLICATION', `Please complete: ${missing.join(', ')}`);

    await this.prisma.$transaction([
      this.prisma.sellerKyc.updateMany({
        where: { sellerId },
        data: { status: 'PENDING', remarks: null },
      }),
      this.prisma.sellerProfile.update({
        where: { id: sellerId },
        data: { status: 'PENDING', submittedAt: new Date(), adminRemarks: null, onboardingStep: 5 },
      }),
    ]);
    await this.notifications.notifyAdmins({
      type: 'SELLER',
      title: 'New seller application',
      body: `${s.storeName} submitted their KYC for review.`,
      data: { sellerId, link: `/admin/sellers/${sellerId}` },
    });
    return this.getProfile(sellerId);
  }

  // ───────────── admin ─────────────

  async adminList(
    page: number,
    limit: number,
    status?: string,
    q?: string,
    sort?: string,
    order?: 'asc' | 'desc',
  ): Promise<PagedResult<AdminSellerRow>> {
    const where: Prisma.SellerProfileWhereInput = {
      deletedAt: null,
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { storeName: { contains: q, mode: 'insensitive' } },
              { gstin: { contains: q, mode: 'insensitive' } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.sellerProfile.findMany({
        where,
        orderBy:
          sort && ['storeName', 'createdAt', 'submittedAt'].includes(sort)
            ? ({ [sort]: order ?? 'desc' } as Prisma.SellerProfileOrderByWithRelationInput)
            : [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: {
          user: { select: { name: true, email: true } },
          _count: { select: { products: { where: { deletedAt: null } } } },
        },
        ...pageArgs(page, limit),
      }),
      this.prisma.sellerProfile.count({ where }),
    ]);
    return paged(
      rows.map((s) => ({
        id: s.id,
        userId: s.userId,
        storeName: s.storeName,
        ownerName: s.user.name,
        email: s.user.email,
        status: s.status,
        gstin: s.gstin,
        productCount: s._count.products,
        submittedAt: s.submittedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    );
  }

  async adminDetail(
    sellerId: string,
  ): Promise<
    SellerProfileDto & { owner: { name: string; email: string | null; phone: string | null } }
  > {
    const s = await this.prisma.sellerProfile.findFirst({
      where: { id: sellerId, deletedAt: null },
      include: { ...withKyc, user: { select: { name: true, email: true, phone: true } } },
    });
    if (!s) throw notFound('Seller');
    return { ...toSellerDto(s), owner: s.user };
  }

  async decide(sellerId: string, input: SellerDecisionInput): Promise<SellerProfileDto> {
    const s = await this.prisma.sellerProfile.findFirst({
      where: { id: sellerId, deletedAt: null },
      include: { user: true },
    });
    if (!s) throw notFound('Seller');
    if (input.decision !== 'SUSPEND' && s.status !== 'PENDING')
      throw badRequest(
        'INVALID_STATE',
        'Only applications under review can be approved or rejected',
      );

    const status =
      input.decision === 'APPROVE'
        ? 'APPROVED'
        : input.decision === 'REJECT'
          ? 'REJECTED'
          : 'SUSPENDED';
    await this.prisma.$transaction([
      this.prisma.sellerProfile.update({
        where: { id: sellerId },
        data: {
          status,
          adminRemarks: input.remarks ?? null,
          approvedAt: status === 'APPROVED' ? new Date() : s.approvedAt,
        },
      }),
      ...(input.decision === 'APPROVE'
        ? [
            this.prisma.sellerKyc.updateMany({
              where: { sellerId, status: 'PENDING' },
              data: { status: 'APPROVED' },
            }),
          ]
        : []),
    ]);
    // suspended sellers disappear from the storefront immediately
    if (status === 'SUSPENDED' || status === 'APPROVED') await this.aggregates.bumpListings();

    const approved = status === 'APPROVED';
    await this.notifications.notify(s.userId, {
      type: 'SELLER',
      title: approved
        ? 'Your store is approved 🎉'
        : status === 'REJECTED'
          ? 'Seller application needs changes'
          : 'Seller account suspended',
      body: approved
        ? 'You can now list products on Glideinbir Kart.'
        : (input.remarks ?? 'Please review your application.'),
      data: { link: '/seller' },
    });
    if (s.user.email && status !== 'SUSPENDED') {
      await this.mail.send({
        to: s.user.email,
        ...mailTemplates.sellerDecision({
          name: s.user.name,
          storeName: s.storeName,
          approved,
          remarks: input.remarks,
          url: this.webUrl(approved ? '/seller' : '/seller/onboarding'),
        }),
      });
    }
    return this.getProfile(sellerId);
  }
}
