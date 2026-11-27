import { getSiteUrl } from '@/lib/checkout';
import { getOrderById, paypalRequest, persistPaymentState } from '@/lib/payments';

export const runtime = 'nodejs';

type CaptureResponse = {
  id: string;
  status: string;
  purchase_units?: {
    custom_id?: string;
    payments?: {
      captures?: { id: string; status: string; amount: { currency_code: string; value: string } }[];
    };
  }[];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paypalOrderId = url.searchParams.get('token');
  const orderId = url.searchParams.get('order_id');
  const siteUrl = getSiteUrl(request);
  if (!paypalOrderId || !orderId) return Response.redirect(new URL('/checkout/return?status=verification_failed', siteUrl), 303);

  try {
    const order = await getOrderById(orderId);
    if (!order || order.payment_method !== 'paypal' || order.payment_reference !== paypalOrderId) {
      return Response.redirect(new URL(`/checkout/return?order_id=${encodeURIComponent(orderId)}&status=verification_failed`, siteUrl), 303);
    }
    if (order.payment_status === 'paid') {
      return Response.redirect(new URL(`/checkout/return?order_id=${encodeURIComponent(order.id)}&status=paid`, siteUrl), 303);
    }
    if (order.payment_status !== 'pending') {
      return Response.redirect(new URL(`/checkout/return?order_id=${encodeURIComponent(order.id)}&status=${order.payment_status}`, siteUrl), 303);
    }

    const capture = await paypalRequest<CaptureResponse>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `capture-${order.id}` },
      body: '{}',
    });
    const purchase = capture.purchase_units?.[0];
    const transaction = purchase?.payments?.captures?.[0];
    const valid = capture.id === paypalOrderId
      && capture.status === 'COMPLETED'
      && purchase?.custom_id === order.id
      && transaction?.status === 'COMPLETED'
      && transaction.amount.currency_code === 'USD'
      && Number(transaction.amount.value) === Number(order.total_amount);

    if (!valid || !transaction) {
      return Response.redirect(new URL(`/checkout/return?order_id=${encodeURIComponent(order.id)}&status=verification_failed`, siteUrl), 303);
    }

    await persistPaymentState({ orderId: order.id, provider: 'paypal', reference: paypalOrderId, status: 'paid', rawResponse: capture });
    return Response.redirect(new URL(`/checkout/return?order_id=${encodeURIComponent(order.id)}&status=paid`, siteUrl), 303);
  } catch (error) {
    console.error('PayPal capture failed', error);
    return Response.redirect(new URL(`/checkout/return?order_id=${encodeURIComponent(orderId)}&status=pending`, siteUrl), 303);
  }
}