'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Check, ExternalLink, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminSellerRow, KycDocumentDto } from '@gk/types';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/forms';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  StatusBadge,
} from '@/components/ui/data';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/overlay';
import { Img } from '@/components/ui/img';
import { ServerTable } from '@/components/dashboard/data-table';
import { PageHeader, ReasonDialog } from '@/components/dashboard/common';

export function AdminSellersTable() {
  const router = useRouter();
  const params = useSearchParams();
  const columns: ColumnDef<AdminSellerRow>[] = [
    {
      accessorKey: 'storeName',
      header: 'Store',
      meta: { sortKey: 'storeName' },
      cell: ({ row: { original: s } }) => (
        <div>
          <p className="font-bold">{s.storeName}</p>
          <p className="text-xs text-muted-foreground">
            {s.ownerName} · {s.email}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'gstin',
      header: 'GSTIN',
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.gstin ?? '—'}</span>,
    },
    {
      accessorKey: 'productCount',
      header: 'Products',
      cell: ({ row }) => <span className="tabular-nums">{row.original.productCount}</span>,
    },
    {
      accessorKey: 'submittedAt',
      header: 'Submitted',
      meta: { sortKey: 'submittedAt' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.submittedAt)}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Joined',
      meta: { sortKey: 'createdAt' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </span>
      ),
    },
  ];
  return (
    <>
      <PageHeader
        title="Sellers"
        description="Review KYC, approve or reject new sellers, and suspend accounts."
      />
      <ServerTable<AdminSellerRow>
        queryKey="admin-sellers"
        initialFilters={{ status: params.get('status') ?? '' }}
        fetcher={(p) => api.admin.sellers.list(p)}
        columns={columns}
        searchPlaceholder="Search store, GSTIN, email…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            options: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'DRAFT'].map((s) => ({
              value: s,
              label: s,
            })),
          },
        ]}
        onRowClick={(s) => router.push(`/admin/sellers/${s.id}`)}
        emptyTitle="No sellers found"
      />
    </>
  );
}

function KycViewer({
  doc,
  onReview,
}: {
  doc: KycDocumentDto;
  onReview: (status: 'APPROVED' | 'REJECTED') => void;
}) {
  const [open, setOpen] = useState(false);
  const pdf = /\.pdf(\?|$)/i.test(doc.fileUrl);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl border p-3">
      <button
        type="button"
        onClick={() => !pdf && setOpen(true)}
        className="relative grid size-16 shrink-0 place-content-center overflow-hidden rounded-xl border bg-muted"
        aria-label={`View ${doc.docType}`}
      >
        {pdf ? (
          <FileText className="size-7 text-primary" />
        ) : (
          <Img src={doc.fileUrl} alt={doc.docType} fill sizes="64px" className="object-cover" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-bold">
          {doc.docType.replace('_', ' ')} <StatusBadge status={doc.status} />
        </p>
        <p className="text-xs text-muted-foreground">Uploaded {formatDateTime(doc.createdAt)}</p>
        {doc.remarks && <p className="text-xs text-destructive">Note: {doc.remarks}</p>}
        <a
          href={doc.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Open full file <ExternalLink className="size-3" />
        </a>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-success"
          disabled={doc.status === 'APPROVED'}
          onClick={() => onReview('APPROVED')}
        >
          <Check /> Verify
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          disabled={doc.status === 'REJECTED'}
          onClick={() => onReview('REJECTED')}
        >
          <X /> Reject
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="p-2">
          <DialogTitle className="sr-only">{doc.docType}</DialogTitle>
          <div className="relative aspect-[3/2] max-h-[80dvh] w-full">
            <Img
              src={doc.fileUrl}
              alt={doc.docType}
              fill
              sizes="80vw"
              className="rounded-lg object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function AdminSellerDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({
    queryKey: ['admin-seller', id],
    queryFn: () => api.admin.sellers.get(id),
  });
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | 'SUSPEND' | null>(null);
  const [kycReview, setKycReview] = useState<{
    doc: KycDocumentDto;
    status: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-seller', id] });
    void qc.invalidateQueries({ queryKey: ['admin-queues'] });
    void qc.invalidateQueries({ queryKey: ['table', 'admin-sellers'] });
  };
  if (isLoading || !s) return <Skeleton className="h-96" />;
  const rows: Array<[string, string]> = [
    ['Owner', `${s.owner.name} · ${s.owner.email ?? ''} · ${s.owner.phone ?? ''}`],
    ['Business', `${s.businessName ?? '—'} (${(s.businessType ?? '').replace('_', ' ')})`],
    ['GSTIN / PAN', `${s.gstin ?? '—'} / ${s.pan ?? '—'}`],
    [
      'Bank',
      `${s.bankName ?? '—'} · A/c ${s.bankAccountNumber ?? '—'} · ${s.bankIfsc ?? ''} · ${s.bankAccountName ?? ''}`,
    ],
    [
      'Pickup',
      [s.pickupLine1, s.pickupLine2, s.pickupCity, s.pickupState, s.pickupPincode]
        .filter(Boolean)
        .join(', ') || '—',
    ],
    ['Submitted', formatDateTime(s.submittedAt)],
  ];
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/admin/sellers">
          <ArrowLeft /> All sellers
        </Link>
      </Button>
      <PageHeader
        title={s.storeName}
        description={s.description ?? undefined}
        actions={
          <>
            <StatusBadge status={s.status} />
            {s.status === 'PENDING' && (
              <>
                <Button onClick={() => setDecision('APPROVE')} data-testid="approve-seller">
                  <Check /> Approve
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setDecision('REJECT')}
                >
                  <X /> Reject
                </Button>
              </>
            )}
            {s.status === 'APPROVED' && (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setDecision('SUSPEND')}
              >
                Suspend
              </Button>
            )}
          </>
        }
      />
      {s.adminRemarks && (
        <p className="mb-4 rounded-xl bg-muted p-3 text-sm">
          <b>Remarks:</b> {s.adminRemarks}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Business & bank details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 py-2.5">
                  <dt className="font-semibold text-muted-foreground">{k}</dt>
                  <dd className="break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              KYC documents <Badge variant="muted">{s.kycDocuments.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {s.kycDocuments.map((d) => (
                <KycViewer
                  key={d.id}
                  doc={d}
                  onReview={(status) =>
                    status === 'APPROVED'
                      ? api.admin.sellers
                          .reviewKyc(d.id, 'APPROVED')
                          .then(() => {
                            toast.success('Document verified');
                            refresh();
                          })
                          .catch((e) => toast.error(errMsg(e)))
                      : setKycReview({ doc: d, status })
                  }
                />
              ))}
              {s.kycDocuments.length === 0 && (
                <p className="text-sm text-muted-foreground">No documents uploaded.</p>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
      <ReasonDialog
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        title={
          decision === 'APPROVE'
            ? `Approve ${s.storeName}?`
            : decision === 'REJECT'
              ? 'Reject application'
              : 'Suspend seller'
        }
        description={
          decision === 'APPROVE'
            ? 'The seller can immediately list products. They are notified by email.'
            : 'The seller is told why — be specific so they can fix and resubmit.'
        }
        confirmLabel={
          decision === 'APPROVE' ? 'Approve seller' : decision === 'REJECT' ? 'Reject' : 'Suspend'
        }
        destructive={decision !== 'APPROVE'}
        requireReason={decision !== 'APPROVE'}
        minLength={5}
        label={decision === 'APPROVE' ? 'Remarks (optional)' : 'Remarks for the seller'}
        onConfirm={async (remarks) => {
          await api.admin.sellers.decide(id, {
            decision: decision as 'APPROVE',
            remarks: remarks || undefined,
          });
          toast.success(
            `Seller ${decision === 'APPROVE' ? 'approved' : decision === 'REJECT' ? 'rejected' : 'suspended'}`,
          );
          refresh();
        }}
      />
      <ReasonDialog
        open={!!kycReview}
        onOpenChange={(o) => !o && setKycReview(null)}
        title="Reject document"
        description="Tell the seller what’s wrong with this document."
        confirmLabel="Reject document"
        destructive
        label="Reason"
        onConfirm={async (remarks) => {
          await api.admin.sellers.reviewKyc(kycReview!.doc.id, 'REJECTED', remarks);
          toast.success('Document rejected');
          refresh();
        }}
      />
    </>
  );
}
