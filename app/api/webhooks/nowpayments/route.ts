import {
  getOrderById,
  nowPaymentsSignature,
  persistPaymentState,
  safeEqualHex,
  verifyNowPaymentsPayment,
} from '@/lib/payments';

export const runtime = 'nodejs';

const supportedPayCurrencies = new Set(['btc', 'eth', 'usdttrc20']);

export async function POST(request: Request) {
  const secret = process.env.CRYPTO_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: 'Webhook is not configured.' }, { status: 503 });

  try {
    const event = await request.json();
    const signature = request.headers.get('x-nowpayments-sig') ?? '';
    if (!safeEqualHex(nowPaymentsSignature(event, secret), signature)) {
      return Response.json({ error: 'Invalid signature.' }, { status: 401 });
    }
    const paymentId = String(event?.payment_id ?? '');
    const orderId = String(event?.order_id ?? '');
    if (!paymentId || !orderId) return Response.json({ error: 'Invalid payment event.' }, { status: 400 });

    const order = await getOrderById(orderId);
    if (!order || order.payment_method !== 'crypto') return Response.json({ received: true });
    const verified = await verifyNowPaymentsPayment(paymentId);
    const payCurrency = verified.pay_currency?.toLowerCase();
    const valid = String(verified.payment_id) === paymentId
      && verified.order_id === order.id
      && verified.price_currency?.toLowerCase() === 'usd'
      && Number(verified.price_amount) === Number(order.total_amount)
      && supportedPayCurrencies.has(payCurrency);
    if (!valid) return Response.json({ error: 'Payment verification did not match the order.' }, { status: 400 });

    const status = verified.payment_status === 'finished'
      ? 'paid'
      : ['failed', 'expired', 'refunded'].includes(verified.payment_status)
        ? verified.payment_status === 'expired' ? 'expired' : 'failed'
        : 'pending';

    await persistPaymentState({
      orderId: order.id,
      provider: 'nowpayments',
      reference: paymentId,
      status,
      rawResponse: verified,
      cryptoTxHash: verified.payin_hash ?? null,
      cryptoCurrency: payCurrency,
      cryptoAmount: Number(verified.pay_amount),
    });
    return Response.json({ received: true });
  } catch (error) {
    console.error('NOWPayments webhook processing failed', error);
    return Response.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}