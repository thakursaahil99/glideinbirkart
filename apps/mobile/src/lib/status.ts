import type { OrderStatus, ReturnStatus, SubOrderStatus } from '@gk/types';

export type Tone = 'success' | 'warning' | 'destructive' | 'primary' | 'muted';

export const ORDER_TONE: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: 'warning',
  PLACED: 'primary',
  PROCESSING: 'primary',
  SHIPPED: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
  PAYMENT_FAILED: 'destructive',
};

export const SUB_ORDER_TONE: Record<SubOrderStatus, Tone> = {
  PENDING: 'warning',
  ACCEPTED: 'primary',
  PACKED: 'primary',
  SHIPPED: 'primary',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
  RETURNED: 'muted',
};

export const RETURN_TONE: Record<ReturnStatus, Tone> = {
  REQUESTED: 'warning',
  APPROVED: 'primary',
  REJECTED: 'destructive',
  ESCALATED: 'warning',
  PICKED_UP: 'primary',
  RECEIVED: 'primary',
  REFUNDED: 'success',
  CLOSED: 'muted',
};
