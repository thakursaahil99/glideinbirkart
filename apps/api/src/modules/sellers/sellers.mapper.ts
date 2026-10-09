import type { KycDocumentDto, SellerProfileDto } from '@gk/types';
import { num } from '../products/products.mapper';

type KycRow = {
  id: string;
  docType: KycDocumentDto['docType'];
  fileUrl: string;
  fileName: string | null;
  status: KycDocumentDto['status'];
  remarks: string | null;
  createdAt: Date;
};

export const toKycDto = (k: KycRow): KycDocumentDto => ({
  id: k.id,
  docType: k.docType,
  fileUrl: k.fileUrl,
  fileName: k.fileName,
  status: k.status,
  remarks: k.remarks,
  createdAt: k.createdAt.toISOString(),
});

type SellerRow = {
  id: string;
  userId: string;
  storeName: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  businessName: string | null;
  businessType: string | null;
  gstin: string | null;
  pan: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  pickupLine1: string | null;
  pickupLine2: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupPincode: string | null;
  status: SellerProfileDto['status'];
  onboardingStep: number;
  adminRemarks: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  ratingAvg: Parameters<typeof num>[0];
  ratingCount: number;
  createdAt: Date;
  kycDocuments?: KycRow[];
};

export function toSellerDto(s: SellerRow): SellerProfileDto {
  return {
    id: s.id,
    userId: s.userId,
    storeName: s.storeName,
    slug: s.slug,
    description: s.description,
    logoUrl: s.logoUrl,
    businessName: s.businessName,
    businessType: s.businessType,
    gstin: s.gstin,
    pan: s.pan,
    contactEmail: s.contactEmail,
    contactPhone: s.contactPhone,
    bankAccountName: s.bankAccountName,
    bankAccountNumber: s.bankAccountNumber,
    bankIfsc: s.bankIfsc,
    bankName: s.bankName,
    pickupLine1: s.pickupLine1,
    pickupLine2: s.pickupLine2,
    pickupCity: s.pickupCity,
    pickupState: s.pickupState,
    pickupPincode: s.pickupPincode,
    status: s.status,
    onboardingStep: s.onboardingStep,
    adminRemarks: s.adminRemarks,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    approvedAt: s.approvedAt?.toISOString() ?? null,
    ratingAvg: num(s.ratingAvg),
    ratingCount: s.ratingCount,
    kycDocuments: (s.kycDocuments ?? []).map(toKycDto),
    createdAt: s.createdAt.toISOString(),
  };
}
