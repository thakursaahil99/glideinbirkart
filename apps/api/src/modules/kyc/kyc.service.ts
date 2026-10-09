import { Injectable } from '@nestjs/common';
import type { KycDocumentDto } from '@gk/types';
import type { KycDocumentInput } from '@gk/validators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { toKycDto } from '../sellers/sellers.mapper';

/** Seller KYC documents (PAN, GSTIN certificate, bank proof…) and the admin review of each. */
@Injectable()
export class KycService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertEditable(sellerId: string) {
    const s = await this.prisma.sellerProfile.findUniqueOrThrow({ where: { id: sellerId } });
    if (s.status === 'PENDING')
      throw badRequest(
        'UNDER_REVIEW',
        'Your application is under review and cannot be edited right now',
      );
    if (s.status === 'SUSPENDED') throw forbidden('Your seller account is suspended');
    return s;
  }

  async add(sellerId: string, input: KycDocumentInput): Promise<KycDocumentDto> {
    const seller = await this.assertEditable(sellerId);
    // one live document per type — a new upload supersedes an unapproved previous one
    await this.prisma.sellerKyc.deleteMany({
      where: { sellerId, docType: input.docType, status: { not: 'APPROVED' } },
    });
    const doc = await this.prisma.sellerKyc.create({ data: { sellerId, ...input } });
    await this.prisma.sellerProfile.update({
      where: { id: sellerId },
      data: { onboardingStep: Math.max(seller.onboardingStep, 4) },
    });
    return toKycDto(doc);
  }

  async remove(sellerId: string, docId: string): Promise<void> {
    await this.assertEditable(sellerId);
    const res = await this.prisma.sellerKyc.deleteMany({ where: { id: docId, sellerId } });
    if (res.count === 0) throw notFound('Document');
  }

  async review(
    docId: string,
    status: 'APPROVED' | 'REJECTED',
    remarks: string | undefined,
    reviewerId: string,
  ): Promise<KycDocumentDto> {
    const doc = await this.prisma.sellerKyc.findUnique({ where: { id: docId } });
    if (!doc) throw notFound('Document');
    const updated = await this.prisma.sellerKyc.update({
      where: { id: docId },
      data: { status, remarks: remarks ?? null, reviewedById: reviewerId, reviewedAt: new Date() },
    });
    return toKycDto(updated);
  }
}
