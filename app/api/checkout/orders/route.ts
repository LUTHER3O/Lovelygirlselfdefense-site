import {
  assertSameOrigin,
  createQuote,
  isPaymentMethod,
} from '@/lib/checkout';
import { CheckoutError } from '@/lib/errors';
import {
  isSupportedCryptoCurrency,
  persistPaymentState,
  startNowPayments,
  startPayPal,
  startPaystack,
  type OrderForPayment,
} from '@/lib/payments';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

function customerDetails(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CheckoutError('Enter your delivery details.');
  }
  const data = input as Record<string, unknown>;
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new CheckoutError('Enter a valid email address.');
  }
  const result: Record<string, string> = { email };
  for (const key of ['firstName', 'lastName', 'phone', 'address', 'city', 'country', 'notes', 'deliveryInstructions']) {
    const value = data[key];
    if (typeof value !== 'string') continue;
    if (value.length > 1000) throw new CheckoutError('A delivery field is too long.');
    result[key] = value.trim();
  }
  for (const key of ['firstName', 'lastName', 'phone', 'address', 'city', 'country']) {
    if (!result[key]) throw new CheckoutError('Complete all required delivery details.');
  }
  return result;
}

async function releaseFailedOrder(order: OrderForPayment, provider: 'paystack' | 'paypal' | 'nowpayments', error: unknown) {
  try {
    await persistPaymentState({
      orderId: order.id,
      provider,
      reference: `failed-${crypto.randomUUID()}`,
      status: 'failed',
      rawResponse: { message: error instanceof Error ? error.message : 'Payment initialization failed' },
    });
  } catch (persistError) {
    console.error('Could not release failed checkout reservation', persistError);
  }
}

export async function POST(request: Request) {
  let orderForCleanup: OrderForPayment | undefined;
  let providerForCleanup: 'paystack' | 'paypal' | 'nowpayments' | undefined;
  try {
    assertSameOrigin(request);
    const input = await request.json();
    if (!isPaymentMethod(input?.paymentMethod)) throw new CheckoutError('Choose a payment method before paying.');
    if (input.paymentMethod === 'crypto' && !isSupportedCryptoCurrency(input.cryptoCurrency)) {
      throw new CheckoutError('Choose BTC, ETH, or USDT TRC20.');
    }

    const customer = customerDetails(input.customer);
    const quote = await createQuote({
      items: input.items,
      couponCode: input.couponCode,
      tipChoice: input.tipChoice,
      customTip: input.customTip,
    });
    const supabase = getSupabaseAdmin();
    const { data: createdRows, error: createError } = await supabase.rpc('create_checkout_order', {
      p_user_email: customer.email,
      p_customer_details: customer,
      p_items: quote.items,
      p_subtotal: quote.subtotal,
      p_coupon_code: quote.couponCode,
      p_tip_percentage: quote.tipPercentage,
      p_custom_tip: quote.tipPercentage == null ? quote.tipAmount : 0,
      p_payment_method: input.paymentMethod,
    });
    if (createError || !createdRows?.[0]) {
      console.error('Could not create checkout order', createError?.message);
      throw new CheckoutError('Your coupon or order changed. Refresh checkout and try again.', 409);
    }

    const order: OrderForPayment = {
      id: createdRows[0].order_id,
      user_email: customer.email,
      total_amount: Number(createdRows[0].total_amount),
      subtotal: quote.subtotal,
      discount_amount: Number(createdRows[0].discount_amount),
      tip_amount: Number(createdRows[0].tip_amount),
      coupon_code: quote.couponCode,
      payment_method: input.paymentMethod,
      payment_status: 'pending',
      payment_reference: null,
    };
    orderForCleanup = order;

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
    let started;
    if (input.paymentMethod === 'paystack') {
      providerForCleanup = 'paystack';
      started = await startPaystack(order, siteUrl);
    } else if (input.paymentMethod === 'paypal') {
      providerForCleanup = 'paypal';
      started = await startPayPal(order, siteUrl);
    } else {
      providerForCleanup = 'nowpayments';
      started = await startNowPayments(order, siteUrl, input.cryptoCurrency);
    }

    await persistPaymentState({
      orderId: order.id,
      provider: started.provider,
      reference: started.reference,
      status: 'pending',
      rawResponse: started.rawResponse,
      cryptoCurrency: started.cryptoCurrency ?? null,
    });

    return Response.json({
      orderId: order.id,
      paymentMethod: input.paymentMethod,
      totalAmount: order.total_amount,
      currency: 'USD',
      redirectUrl: started.redirectUrl,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (orderForCleanup && providerForCleanup) await releaseFailedOrder(orderForCleanup, providerForCleanup, error);
    const status = error instanceof CheckoutError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to start checkout.';
    if (status >= 500) console.error('Checkout order failed', error);
    return Response.json({ error: message }, { status });
  }
}