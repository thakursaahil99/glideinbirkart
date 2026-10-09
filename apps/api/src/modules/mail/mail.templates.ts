import { formatINR } from '@gk/utils';

const BRAND = 'Glideinbir Kart';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(opts: {
  preheader: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
}): string {
  const cta = opts.cta
    ? `<p style="margin:28px 0"><a href="${esc(opts.cta.url)}" style="background:#4338ca;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;display:inline-block">${esc(opts.cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#faf8f4;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#17172b">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ece7dc">
<tr><td style="background:#4338ca;padding:22px 32px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">${BRAND}<span style="color:#fbbf24">.</span></td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${esc(opts.heading)}</h1>
<div style="font-size:15px;line-height:1.65;color:#3a3a52">${opts.body}${cta}</div>
</td></tr>
<tr><td style="padding:18px 32px;background:#f5f2ea;font-size:12px;color:#77768a">You are receiving this email because of activity on your ${BRAND} account. Need help? Reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}

export interface RenderedMail {
  subject: string;
  html: string;
}

export const mailTemplates = {
  verifyEmail(name: string, url: string): RenderedMail {
    return {
      subject: `Verify your email — ${BRAND}`,
      html: layout({
        preheader: 'Confirm your email address to finish setting up your account.',
        heading: `Welcome, ${esc(name.split(' ')[0] ?? name)}!`,
        body: '<p>Confirm your email address so we can keep your account secure and send order updates.</p><p style="color:#77768a;font-size:13px">This link expires in 24 hours.</p>',
        cta: { label: 'Verify email', url },
      }),
    };
  },

  resetPassword(name: string, url: string): RenderedMail {
    return {
      subject: `Reset your ${BRAND} password`,
      html: layout({
        preheader: 'Use this link to choose a new password.',
        heading: 'Reset your password',
        body: `<p>Hi ${esc(name)}, we received a request to reset your password. If this was you, choose a new one below.</p><p style="color:#77768a;font-size:13px">The link expires in 30 minutes. If you did not request this, you can ignore this email — your password will not change.</p>`,
        cta: { label: 'Choose new password', url },
      }),
    };
  },

  orderConfirmation(input: {
    name: string;
    orderNumber: string;
    total: number;
    method: string;
    items: Array<{ name: string; quantity: number; lineTotal: number }>;
    url: string;
  }): RenderedMail {
    const rows = input.items
      .map(
        (i) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #f0ece2">${esc(i.name)} × ${i.quantity}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f0ece2">${formatINR(i.lineTotal, true)}</td></tr>`,
      )
      .join('');
    return {
      subject: `Order ${input.orderNumber} confirmed`,
      html: layout({
        preheader: `We have received your order ${input.orderNumber}.`,
        heading: 'Thank you — your order is confirmed',
        body: `<p>Hi ${esc(input.name)}, your order <strong>${esc(input.orderNumber)}</strong> has been placed (${input.method === 'COD' ? 'Cash on Delivery' : 'Paid online'}).</p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:12px 0">${rows}
<tr><td style="padding-top:12px;font-weight:700">Total (incl. GST)</td><td align="right" style="padding-top:12px;font-weight:700">${formatINR(input.total, true)}</td></tr></table>`,
        cta: { label: 'View order', url: input.url },
      }),
    };
  },

  orderStatus(input: {
    name: string;
    orderNumber: string;
    headline: string;
    detail: string;
    url: string;
  }): RenderedMail {
    return {
      subject: `${input.headline} — order ${input.orderNumber}`,
      html: layout({
        preheader: input.detail,
        heading: input.headline,
        body: `<p>Hi ${esc(input.name)},</p><p>${esc(input.detail)}</p>`,
        cta: { label: 'Track order', url: input.url },
      }),
    };
  },

  sellerDecision(input: {
    name: string;
    storeName: string;
    approved: boolean;
    remarks?: string | null;
    url: string;
  }): RenderedMail {
    return {
      subject: input.approved
        ? `${input.storeName} is approved on ${BRAND}`
        : `Update on your seller application`,
      html: layout({
        preheader: input.approved
          ? 'You can now list products.'
          : 'Action needed on your application.',
        heading: input.approved
          ? 'Welcome aboard — you are approved!'
          : 'Your application needs attention',
        body: input.approved
          ? `<p>Hi ${esc(input.name)}, <strong>${esc(input.storeName)}</strong> is now live on ${BRAND}. Add your first product and start selling.</p>`
          : `<p>Hi ${esc(input.name)}, we could not approve <strong>${esc(input.storeName)}</strong> yet.</p><p><em>${esc(input.remarks ?? 'Please review your details and resubmit.')}</em></p>`,
        cta: {
          label: input.approved ? 'Open seller dashboard' : 'Update application',
          url: input.url,
        },
      }),
    };
  },

  productDecision(input: {
    name: string;
    product: string;
    approved: boolean;
    reason?: string | null;
    url: string;
  }): RenderedMail {
    return {
      subject: input.approved ? `"${input.product}" is live` : `"${input.product}" needs changes`,
      html: layout({
        preheader: input.approved
          ? 'Your product passed moderation.'
          : 'Your product was not approved.',
        heading: input.approved ? 'Your product is live' : 'Your product was not approved',
        body: input.approved
          ? `<p>Hi ${esc(input.name)}, <strong>${esc(input.product)}</strong> passed moderation and is now visible to customers.</p>`
          : `<p>Hi ${esc(input.name)}, <strong>${esc(input.product)}</strong> was rejected.</p><p><em>${esc(input.reason ?? '')}</em></p>`,
        cta: { label: 'Open product', url: input.url },
      }),
    };
  },

  payoutSettled(input: {
    name: string;
    amount: number;
    reference: string;
    url: string;
  }): RenderedMail {
    return {
      subject: `Payout of ${formatINR(input.amount, true)} settled`,
      html: layout({
        preheader: 'Your payout has been transferred.',
        heading: 'Payout settled',
        body: `<p>Hi ${esc(input.name)}, we have transferred <strong>${formatINR(input.amount, true)}</strong> to your bank account.</p><p>Reference: <code>${esc(input.reference)}</code></p>`,
        cta: { label: 'View payouts', url: input.url },
      }),
    };
  },

  returnUpdate(input: {
    name: string;
    orderNumber: string;
    headline: string;
    detail: string;
    url: string;
  }): RenderedMail {
    return {
      subject: `${input.headline} — order ${input.orderNumber}`,
      html: layout({
        preheader: input.detail,
        heading: input.headline,
        body: `<p>Hi ${esc(input.name)},</p><p>${esc(input.detail)}</p>`,
        cta: { label: 'View return', url: input.url },
      }),
    };
  },
};
