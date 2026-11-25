import { assertSameOrigin } from '@/lib/checkout';
import { CheckoutError } from '@/lib/errors';
import { getOrderById } from '@/lib/payments';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: RouteContext<'/api/checkout/orders/[orderId]'>) {
  const { orderId } = await context.params;
  if (!/^[\da-f-]{36}$/i.test(orderId)) return Response.json({ error: 'Order not found.' }, { status: 404 });

  try {
    const order = await getOrderById(orderId);
    if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
    return Response.json({
      id: order.id,
      status: order.payment_status,
      paymentMethod: order.payment_method,
      totalAmount: Number(order.total_amount),
      currency: 'USD',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Order status lookup failed', error);
    return Response.json({ error: 'Unable to retrieve payment status.' }, { status: 503 });
  }
}

export async function POST(request: Request, context: RouteContext<'/api/checkout/orders/[orderId]'>) {
  try {
    assertSameOrigin(request);
    const { orderId } = await context.params;
    if (!/^[\da-f-]{36}$/i.test(orderId)) return Response.json({ error: 'Order not found.' }, { status: 404 });
    const order = await getOrderById(orderId);
    if (!order || order.payment_method !== 'paypal') {
      return Response.json({ error: 'This checkout cannot be cancelled from the return page.' }, { status: 409 });
    }
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.rpc('cancel_checkout_order', { p_order_id: orderId });
    if (error) throw new CheckoutError('Could not cancel this checkout.', 503);
    return Response.json({ cancelled: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : 'Could not cancel checkout.' }, { status });
  }
}