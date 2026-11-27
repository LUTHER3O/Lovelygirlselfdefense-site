import { getSiteUrl } from '@/lib/checkout';
import {
  getOrderByPaymentReference,
  persistPaymentState,
  verifyPaystackReference,
} from '@/lib/payments';

export const runtime = 'nodejs';

function redirectToReturn(request: Request, orderId: string | null, status: string) {
  const url = new URL('/checkout/return', getSiteUrl(request));
  if (orderId) url.searchParams.set('order_id', orderId);
  url.searchParams.set('status', status);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get('reference') ?? url.searchParams.get('trxref');
  if (!reference || reference.length > 200) return redirectToReturn(request, null, 'verification_failed');

  try {
    const order = await getOrderByPaymentReference(reference);
    if (!order || order.payment_method !== 'paystack') return redirectToReturn(request, null, 'verification_failed');
    const verification = await verifyPaystackReference(reference);
    const transaction = verification.data;
    const metadata = typeof transaction.metadata === 'string'
      ? JSON.parse(transaction.metadata || '{}')
      : transaction.metadata;
    const valid = verification.status
      && transaction.reference === reference
      && transaction.status === 'success'
      && transaction.currency === 'USD'
      && transaction.amount === Math.round(Number(order.total_amount) * 100)
      && transaction.customer?.email?.toLowerCase() === order.user_email
      && (!metadata?.order_id || String(metadata.order_id) === order.id);

    if (valid) {
      await persistPaymentState({ orderId: order.id, provider: 'paystack', reference, status: 'paid', rawResponse: verification });
      return redirectToReturn(request, order.id, 'paid');
    }
    if (['failed', 'abandoned'].includes(transaction.status)) {
      await persistPaymentState({ orderId: order.id, provider: 'paystack', reference, status: 'failed', rawResponse: verification });
      return redirectToReturn(request, order.id, 'failed');
    }
    return redirectToReturn(request, order.id, 'pending');
  } catch (error) {
    console.error('Paystack callback verification failed', error);
    return redirectToReturn(request, null, 'verification_failed');
  }
}