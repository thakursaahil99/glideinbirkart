import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import {
  DELIVERY_GST_RATE,
  fromPaise,
  gstContained,
  sameState,
  splitGst,
  toPaise,
} from '@gk/utils';
import type { AppConfig } from '../../config/config.types';
import { badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../infra/prisma.service';
import { num } from '../products/products.mapper';

const money = (n: number) =>
  `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(`${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
  } else if (n > 0) {
    parts.push(ONES[n] as string);
  }
  return parts.join(' ');
}

/** 1234567.5 → "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Fifty Paise Only" (Indian grouping) */
export function amountInWords(amount: number): string {
  const paise = toPaise(amount);
  let rupees = Math.floor(paise / 100);
  const ps = paise % 100;
  if (rupees === 0 && ps === 0) return 'Zero Rupees Only';
  const units: Array<[number, string]> = [
    [10_000_000, 'Crore'],
    [100_000, 'Lakh'],
    [1000, 'Thousand'],
  ];
  const words: string[] = [];
  for (const [value, label] of units) {
    if (rupees >= value) {
      words.push(`${below1000(Math.floor(rupees / value))} ${label}`);
      rupees %= value;
    }
  }
  if (rupees > 0) words.push(below1000(rupees));
  const rupeePart = words.length ? `${words.join(' ')} Rupees` : '';
  const paisePart = ps ? `${rupeePart ? ' and ' : ''}${below1000(ps)} Paise` : '';
  return `${rupeePart}${paisePart} Only`;
}

function render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Producer: 'Glideinbir Kart' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

const INDIGO = '#3b32b0';
const INK = '#17172b';
const MUTED = '#6b6a80';
const LINE = '#e4e0d4';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: AppConfig,
  ) {}

  /** Assigns the invoice number once (idempotent). Called by the invoice worker and on first download. */
  async ensureInvoice(orderId: string): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, invoiceNumber: true, createdAt: true, status: true },
    });
    if (!order) throw notFound('Order');
    if (order.invoiceNumber) return order.invoiceNumber;
    const fy =
      order.createdAt.getMonth() >= 3
        ? order.createdAt.getFullYear()
        : order.createdAt.getFullYear() - 1;
    const invoiceNumber = `GK/${String(fy).slice(2)}-${String(fy + 1).slice(2)}/${order.orderNumber.slice(2)}`;
    const base = this.config.get('API_PUBLIC_URL', { infer: true }).replace(/\/$/, '');
    await this.prisma.order.update({
      where: { id: orderId },
      data: { invoiceNumber, invoiceUrl: `${base}/api/v1/orders/${orderId}/invoice` },
    });
    return invoiceNumber;
  }

  async invoiceForCustomer(
    userId: string,
    orderId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, status: true },
    });
    if (!order) throw notFound('Order');
    return this.generate(orderId);
  }

  async invoiceForAdmin(orderId: string) {
    return this.generate(orderId);
  }

  private async generate(orderId: string): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        subOrders: {
          include: {
            seller: {
              select: {
                storeName: true,
                businessName: true,
                gstin: true,
                pickupLine1: true,
                pickupCity: true,
                pickupState: true,
                pickupPincode: true,
              },
            },
            items: { include: { product: { select: { hsnCode: true } } } },
          },
        },
      },
    });
    if (!order) throw notFound('Order');
    if (['PENDING_PAYMENT', 'PAYMENT_FAILED'].includes(order.status))
      throw badRequest('NO_INVOICE', 'An invoice is available once the order is confirmed');
    const invoiceNumber = await this.ensureInvoice(orderId);
    const ship = order.shippingAddress as {
      fullName: string;
      phone: string;
      line1: string;
      line2?: string | null;
      landmark?: string | null;
      city: string;
      state: string;
      pincode: string;
    };

    const buffer = await render((doc) => {
      const L = 40;
      const R = 555;
      // ── header ──
      doc.rect(0, 0, 595, 86).fill(INDIGO);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Glideinbir Kart', L, 28);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#d7d4ff')
        .text('Marketplace invoice issued on behalf of the sellers listed below', L, 56);
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#ffffff')
        .text('TAX INVOICE', 380, 30, { width: R - 380, align: 'right' });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#d7d4ff')
        .text(invoiceNumber, 380, 52, { width: R - 380, align: 'right' });

      doc.fillColor(INK);
      let y = 106;
      const meta = (label: string, value: string, x: number, yy: number) => {
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, yy);
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor(INK)
          .text(value, x, yy + 11);
      };
      meta('Order number', order.orderNumber, L, y);
      meta(
        'Order date',
        order.createdAt.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        200,
        y,
      );
      meta(
        'Payment',
        order.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Paid online (Razorpay)',
        340,
        y,
      );
      y += 44;

      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('BILL TO / SHIP TO', L, y);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(INK)
        .text(ship.fullName, L, y + 12);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(INK)
        .text(
          [
            ship.line1,
            ship.line2,
            ship.landmark,
            `${ship.city}, ${ship.state} - ${ship.pincode}`,
            `Phone: ${ship.phone}`,
          ]
            .filter(Boolean)
            .join('\n'),
          L,
          y + 26,
          { width: 260 },
        );
      y += 96;

      let grandTaxable = 0;
      let grandCgst = 0;
      let grandSgst = 0;
      let grandIgst = 0;

      for (const so of order.subOrders.filter((s) => s.status !== 'CANCELLED')) {
        if (y > 640) {
          doc.addPage();
          y = 40;
        }
        const intra = sameState(so.seller.pickupState, ship.state);
        doc.rect(L, y, R - L, 34).fill('#f4f1ea');
        doc
          .fillColor(INK)
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .text(`Sold by: ${so.seller.businessName ?? so.seller.storeName}`, L + 8, y + 6);
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(MUTED)
          .text(
            `GSTIN: ${so.seller.gstin ?? 'n/a'}   |   ${[so.seller.pickupLine1, so.seller.pickupCity, so.seller.pickupState, so.seller.pickupPincode].filter(Boolean).join(', ')}   |   Sub-order ${so.subOrderNumber}`,
            L + 8,
            y + 20,
            { width: R - L - 16 },
          );
        y += 42;

        const cols = {
          n: L,
          item: L + 18,
          hsn: 250,
          qty: 295,
          rate: 318,
          taxable: 372,
          gst: 430,
          tax: 466,
          amt: 512,
        };
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
        doc
          .text('#', cols.n, y)
          .text('ITEM', cols.item, y)
          .text('HSN', cols.hsn, y)
          .text('QTY', cols.qty, y);
        doc
          .text('RATE', cols.rate, y)
          .text('TAXABLE', cols.taxable, y)
          .text('GST%', cols.gst, y)
          .text(intra ? 'CGST+SGST' : 'IGST', cols.tax, y)
          .text('TOTAL', cols.amt, y);
        y += 12;
        doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).stroke();
        y += 5;

        let subTaxable = 0;
        let subTax = 0;
        let subTotal = 0;
        so.items.forEach((it, idx) => {
          const net = toPaise(num(it.lineTotal)) - toPaise(num(it.discount));
          const gst = toPaise(num(it.gstAmount));
          const taxable = net - gst;
          const split = splitGst(fromPaise(gst), intra);
          grandCgst += split.cgst;
          grandSgst += split.sgst;
          grandIgst += split.igst;
          subTaxable += taxable;
          subTax += gst;
          subTotal += net;
          const name = `${it.name}${it.variantName && it.variantName !== 'Default' ? ` (${it.variantName})` : ''}`;
          const h = Math.max(doc.heightOfString(name, { width: 220, lineGap: 1 }), 12);
          doc.font('Helvetica').fontSize(8.5).fillColor(INK);
          doc.text(String(idx + 1), cols.n, y).text(name, cols.item, y, { width: 220, lineGap: 1 });
          doc.text(it.product.hsnCode ?? '-', cols.hsn, y).text(String(it.quantity), cols.qty, y);
          doc
            .text(fromPaise(Math.round(taxable / it.quantity)).toFixed(2), cols.rate, y)
            .text(fromPaise(taxable).toFixed(2), cols.taxable, y);
          doc
            .text(`${num(it.gstRate)}%`, cols.gst, y)
            .text(fromPaise(gst).toFixed(2), cols.tax, y)
            .text(fromPaise(net).toFixed(2), cols.amt, y);
          y += h + 6;
          if (y > 760) {
            doc.addPage();
            y = 40;
          }
        });
        grandTaxable += subTaxable;
        doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).stroke();
        y += 6;
        doc
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor(INK)
          .text(
            `Seller subtotal: ${money(fromPaise(subTotal))}  (taxable ${money(fromPaise(subTaxable))}, GST ${money(fromPaise(subTax))})`,
            L,
            y,
            { width: R - L, align: 'right' },
          );
        y += 26;
      }

      // ── totals ──
      if (y > 620) {
        doc.addPage();
        y = 40;
      }
      const deliveryFee = toPaise(num(order.deliveryFee));
      const deliveryGst = gstContained(deliveryFee, DELIVERY_GST_RATE);
      const dSplit = splitGst(
        fromPaise(deliveryGst),
        sameState(order.subOrders[0]?.seller.pickupState, ship.state),
      );
      grandCgst += dSplit.cgst;
      grandSgst += dSplit.sgst;
      grandIgst += dSplit.igst;
      grandTaxable += deliveryFee - deliveryGst;

      const row = (label: string, value: string, bold = false) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 11 : 9)
          .fillColor(INK);
        doc
          .text(label, 300, y, { width: 150 })
          .text(value, 450, y, { width: R - 450, align: 'right' });
        y += bold ? 20 : 15;
      };
      row('Taxable value', money(fromPaise(grandTaxable)));
      if (grandIgst > 0) row(`IGST`, money(grandIgst));
      if (grandCgst > 0) row('CGST', money(grandCgst));
      if (grandSgst > 0) row('SGST', money(grandSgst));
      if (deliveryFee > 0) row(`Delivery charges (incl. GST)`, money(fromPaise(deliveryFee)));
      if (num(order.couponDiscount) > 0)
        row(
          `Coupon ${order.couponCode ?? ''} (already applied)`,
          `- ${money(num(order.couponDiscount))}`,
        );
      doc.moveTo(300, y).lineTo(R, y).strokeColor(LINE).stroke();
      y += 6;
      row('Invoice total', money(num(order.total)), true);
      doc
        .font('Helvetica-Oblique')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(`Amount in words: ${amountInWords(num(order.total))}`, L, y + 4, { width: R - L });
      y += 34;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          'All prices are inclusive of GST. This is a computer generated invoice and does not require a signature. Returns are accepted as per the product return policy.',
          L,
          Math.min(y, 770),
          { width: R - L },
        );
    });

    return { buffer, filename: `invoice-${order.orderNumber}.pdf` };
  }

  /** Packing slip + shipping label for a seller's sub-order. */
  async packingSlip(
    sellerId: string,
    subOrderId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const so = await this.prisma.subOrder.findFirst({
      where: { id: subOrderId, sellerId },
      include: {
        order: {
          select: {
            orderNumber: true,
            paymentMethod: true,
            total: true,
            shippingAddress: true,
            createdAt: true,
          },
        },
        seller: {
          select: {
            storeName: true,
            businessName: true,
            pickupLine1: true,
            pickupLine2: true,
            pickupCity: true,
            pickupState: true,
            pickupPincode: true,
            contactPhone: true,
            gstin: true,
          },
        },
        items: true,
      },
    });
    if (!so) throw notFound('Order');
    const ship = so.order.shippingAddress as {
      fullName: string;
      phone: string;
      line1: string;
      line2?: string | null;
      landmark?: string | null;
      city: string;
      state: string;
      pincode: string;
    };
    const cod = so.order.paymentMethod === 'COD';

    const buffer = await render((doc) => {
      const L = 40;
      const R = 555;
      doc
        .rect(L, 40, R - L, 250)
        .lineWidth(1.5)
        .strokeColor(INK)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(MUTED)
        .text('SHIP TO', L + 14, 54);
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(INK)
        .text(ship.fullName, L + 14, 68);
      doc
        .font('Helvetica')
        .fontSize(12)
        .text(
          [ship.line1, ship.line2, ship.landmark, `${ship.city}, ${ship.state}`]
            .filter(Boolean)
            .join('\n'),
          L + 14,
          92,
          { width: 300 },
        );
      doc
        .font('Helvetica-Bold')
        .fontSize(26)
        .text(ship.pincode, L + 14, 170);
      doc
        .font('Helvetica')
        .fontSize(11)
        .text(`Phone: ${ship.phone}`, L + 14, 206);

      doc.rect(360, 54, 185, 70).fill(cod ? INDIGO : '#e8f5ee');
      doc
        .fillColor(cod ? '#ffffff' : '#1b6b45')
        .font('Helvetica-Bold')
        .fontSize(cod ? 13 : 14)
        .text(cod ? 'CASH ON DELIVERY' : 'PREPAID', 368, 66, { width: 170, align: 'center' });
      if (cod)
        doc.fontSize(20).text(money(num(so.order.total)), 368, 88, { width: 170, align: 'center' });
      else
        doc
          .fontSize(10)
          .font('Helvetica')
          .text('Do not collect payment', 368, 90, { width: 170, align: 'center' });

      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('ORDER', 360, 140)
        .font('Helvetica-Bold')
        .fontSize(13)
        .text(so.subOrderNumber, 360, 152);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Courier: ${so.courier ?? '—'}\nAWB / Tracking: ${so.trackingId ?? '—'}`, 360, 176);
      // simple code-39 style bar strip derived from the tracking / order number (visual aid for scanners at the dock)
      const code = (so.trackingId ?? so.subOrderNumber).toUpperCase();
      let bx = L + 14;
      for (const ch of code) {
        const w = 1 + (ch.charCodeAt(0) % 3);
        doc.rect(bx, 238, w, 34).fill(INK);
        bx += w + 2;
        if (bx > R - 20) break;
      }
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(code, L + 14, 275);

      doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text('FROM', L, 310);
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(
          [
            so.seller.businessName ?? so.seller.storeName,
            so.seller.pickupLine1,
            so.seller.pickupLine2,
            `${so.seller.pickupCity ?? ''}, ${so.seller.pickupState ?? ''} - ${so.seller.pickupPincode ?? ''}`,
            so.seller.contactPhone ? `Phone: ${so.seller.contactPhone}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          L,
          324,
          { width: 300 },
        );

      let y = 400;
      doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text('Packing slip', L, y);
      y += 24;
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(MUTED)
        .text('ITEM', L, y)
        .text('SKU', 330, y)
        .text('QTY', 500, y);
      y += 12;
      doc.moveTo(L, y).lineTo(R, y).strokeColor(LINE).stroke();
      y += 6;
      for (const it of so.items) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(INK)
          .text(`${it.name}${it.variantName ? ` — ${it.variantName}` : ''}`, L, y, { width: 280 });
        doc
          .text(it.sku, 330, y, { width: 160 })
          .font('Helvetica-Bold')
          .text(String(it.quantity), 500, y);
        y += Math.max(doc.heightOfString(it.name, { width: 280 }), 14) + 8;
      }
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(
          `Order ${so.order.orderNumber} · placed ${so.order.createdAt.toLocaleDateString('en-IN')} · Packed by ${so.seller.storeName}`,
          L,
          Math.min(y + 20, 780),
        );
    });
    return { buffer, filename: `label-${so.subOrderNumber}.pdf` };
  }
}
