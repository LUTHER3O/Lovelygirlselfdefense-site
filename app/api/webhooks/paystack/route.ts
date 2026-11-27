import { CheckoutError } from '@/lib/errors';
import {
  getOrderByPaymentReference,
  paystackSignature,
  persistPaymentState,
  safeEqualHex,
  verifyPaystackReference,
} from '@/lib/payments';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return Response.json({ error: 'Webhook is not configured.' }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature') ?? '';
  if (!safeEqualHex(paystackSignature(rawBody, secret), signature)) {
    return Response.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);
    if (!['charge.success', 'charge.failed'].includes(event?.event)) {
      return Response.json({ received: true });
    }
    const reference = event?.data?.reference;
    if (typeof reference !== 'string' || reference.length > 200) {
      return Response.json({ error: 'Invalid event reference.' }, { status: 400 });
    }
    const order = await getOrderByPaymentReference(reference);
    if (!order || order.payment_method !== 'paystack') return Response.json({ received: true });

    if (event.event === 'charge.failed') {
      await persistPaymentState({ orderId: order.id, provider: 'paystack', reference, status: 'failed', rawResponse: event });
      return Response.json({ received: true });
    }

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
    if (!valid) throw new CheckoutError('Paystack verification did not match this order.', 400);

    await persistPaymentState({ orderId: order.id, provider: 'paystack', reference, status: 'paid', rawResponse: verification });
    return Response.json({ received: true });
  } catch (error) {
    console.error('Paystack webhook processing failed', error);
    return Response.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}