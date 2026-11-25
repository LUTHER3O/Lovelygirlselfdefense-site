import { createHmac, timingSafeEqual } from 'node:crypto';
import { CheckoutError } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type OrderForPayment = {
  id: string;
  user_email: string;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  tip_amount: number;
  coupon_code: string | null;
  payment_method: 'paystack' | 'paypal' | 'crypto';
  payment_status: string;
  payment_reference: string | null;
};

type StartedPayment = {
  provider: 'paystack' | 'paypal' | 'nowpayments';
  reference: string;
  redirectUrl: string;
  rawResponse: unknown;
  cryptoCurrency?: string;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new CheckoutError(`Payment configuration is missing ${name}.`, 503);
  return value;
}

async function providerJson<T>(url: string, init: RequestInit, provider: string): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`${provider} request failed`, response.status, body);
    throw new CheckoutError(`${provider} could not start this payment. Please try another method.`, 502);
  }
  return body as T;
}

function money(value: number) {
  return Number(value).toFixed(2);
}

export async function startPaystack(order: OrderForPayment, siteUrl: string): Promise<StartedPayment> {
  const secret = requireEnv('PAYSTACK_SECRET_KEY');
  const response = await providerJson<{
    status: boolean;
    message?: string;
    data: { reference: string; authorization_url: string };
  }>('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: order.user_email,
      amount: Math.round(Number(order.total_amount) * 100),
      currency: 'USD',
      callback_url: `${siteUrl}/api/payments/paystack/callback`,
      metadata: {
        order_id: order.id,
        tip_amount: Number(order.tip_amount),
        coupon_code: order.coupon_code ?? '',
      },
    }),
  }, 'Paystack');

  if (!response.status || !response.data?.reference || !response.data.authorization_url) {
    throw new CheckoutError('Paystack returned an invalid checkout response.', 502);
  }
  return {
    provider: 'paystack',
    reference: response.data.reference,
    redirectUrl: response.data.authorization_url,
    rawResponse: response,
  };
}

function paypalBaseUrl() {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
  if (mode === 'sandbox') return 'https://api-m.sandbox.paypal.com';
  if (mode === 'live') return 'https://api-m.paypal.com';
  throw new CheckoutError('PAYPAL_MODE must be sandbox or live.', 503);
}

async function paypalAccessToken() {
  const clientId = requireEnv('PAYPAL_CLIENT_ID');
  const clientSecret = requireEnv('PAYPAL_CLIENT_SECRET');
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await providerJson<{ access_token: string }>(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  }, 'PayPal');
  return response.access_token;
}

export async function paypalRequest<T>(path: string, init: RequestInit = {}) {
  const accessToken = await paypalAccessToken();
  return providerJson<T>(`${paypalBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  }, 'PayPal');
}

export async function startPayPal(order: OrderForPayment, siteUrl: string): Promise<StartedPayment> {
  requireEnv('PAYPAL_CLIENT_ID');
  const response = await paypalRequest<{
    id: string;
    links: { rel: string; href: string }[];
  }>('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: order.id,
        invoice_id: order.id,
        amount: { currency_code: 'USD', value: money(Number(order.total_amount)) },
      }],
      application_context: {
        return_url: `${siteUrl}/api/payments/paypal/capture?order_id=${encodeURIComponent(order.id)}`,
        cancel_url: `${siteUrl}/checkout/return?order_id=${encodeURIComponent(order.id)}&status=cancelled`,
        user_action: 'PAY_NOW',
      },
    }),
  });
  const approvalUrl = response.links?.find((link) => link.rel === 'approve')?.href;
  if (!response.id || !approvalUrl) throw new CheckoutError('PayPal returned an invalid checkout response.', 502);
  return { provider: 'paypal', reference: response.id, redirectUrl: approvalUrl, rawResponse: response };
}

const cryptoCurrencies: Record<string, string> = {
  BTC: 'btc',
  ETH: 'eth',
  USDT_TRC20: 'usdttrc20',
};

export function isSupportedCryptoCurrency(value: unknown): value is keyof typeof cryptoCurrencies {
  return typeof value === 'string' && Object.hasOwn(cryptoCurrencies, value);
}

export async function startNowPayments(
  order: OrderForPayment,
  siteUrl: string,
  currency: keyof typeof cryptoCurrencies,
): Promise<StartedPayment> {
  const apiKey = requireEnv('CRYPTO_API_KEY');
  const response = await providerJson<{
    id: string | number;
    invoice_url: string;
  }>('https://api.nowpayments.io/v1/invoice', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      price_amount: Number(order.total_amount),
      price_currency: 'usd',
      pay_currency: cryptoCurrencies[currency],
      order_id: order.id,
      order_description: `Lovely Girl Self Defense order ${order.id}`,
      ipn_callback_url: `${siteUrl}/api/webhooks/nowpayments`,
      success_url: `${siteUrl}/checkout/return?order_id=${encodeURIComponent(order.id)}`,
      cancel_url: `${siteUrl}/checkout/return?order_id=${encodeURIComponent(order.id)}&status=cancelled`,
    }),
  }, 'NOWPayments');
  if (!response.id || !response.invoice_url) {
    throw new CheckoutError('NOWPayments returned an invalid invoice response.', 502);
  }
  return {
    provider: 'nowpayments',
    reference: String(response.id),
    redirectUrl: response.invoice_url,
    rawResponse: response,
    cryptoCurrency: currency,
  };
}

export async function getOrderById(orderId: string): Promise<OrderForPayment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select('id, user_email, total_amount, subtotal, discount_amount, tip_amount, coupon_code, payment_method, payment_status, payment_reference')
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new CheckoutError('Order lookup failed.', 503);
  return data as OrderForPayment | null;
}

export async function getOrderByPaymentReference(reference: string): Promise<OrderForPayment | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('orders')
    .select('id, user_email, total_amount, subtotal, discount_amount, tip_amount, coupon_code, payment_method, payment_status, payment_reference')
    .eq('payment_reference', reference)
    .maybeSingle();
  if (error) throw new CheckoutError('Order lookup failed.', 503);
  return data as OrderForPayment | null;
}

export async function verifyPaystackReference(reference: string) {
  const secret = requireEnv('PAYSTACK_SECRET_KEY');
  return providerJson<{
    status: boolean;
    data: {
      reference: string;
      status: string;
      amount: number;
      currency: string;
      customer?: { email?: string };
      metadata?: { order_id?: string | number } | string;
    };
  }>(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  }, 'Paystack');
}

export async function verifyNowPaymentsPayment(paymentId: string) {
  const apiKey = requireEnv('CRYPTO_API_KEY');
  return providerJson<{
    payment_id: number | string;
    payment_status: string;
    order_id: string;
    price_amount: number;
    price_currency: string;
    pay_amount: number;
    pay_currency: string;
    payin_hash?: string | null;
  }>(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(paymentId)}`, {
    headers: { 'x-api-key': apiKey },
  }, 'NOWPayments');
}

export async function persistPaymentState(input: {
  orderId: string;
  provider: StartedPayment['provider'];
  reference: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  rawResponse: unknown;
  cryptoTxHash?: string | null;
  cryptoCurrency?: string | null;
  cryptoAmount?: number | null;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc('finalize_checkout_payment', {
    p_order_id: input.orderId,
    p_provider: input.provider,
    p_reference: input.reference,
    p_status: input.status,
    p_raw_response: input.rawResponse ?? {},
    p_crypto_tx_hash: input.cryptoTxHash ?? null,
    p_crypto_currency: input.cryptoCurrency ?? null,
    p_crypto_amount: input.cryptoAmount ?? null,
  });
  if (error) {
    console.error('Could not persist payment state', error.message);
    throw new CheckoutError('The payment state could not be saved.', 500);
  }

  if (input.status === 'pending') {
    const { error: orderError } = await supabase
      .from('orders')
      .update({ payment_reference: input.reference })
      .eq('id', input.orderId);
    if (orderError) throw new CheckoutError('The payment reference could not be saved.', 500);
  }
}

export function safeEqualHex(expected: string, received: string) {
  if (!/^[a-f\d]+$/i.test(expected) || !/^[a-f\d]+$/i.test(received)) return false;
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(received, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function paystackSignature(rawBody: string, secret: string) {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeys(child)]),
    );
  }
  return value;
}

export function nowPaymentsSignature(payload: unknown, secret: string) {
  const canonicalPayload = JSON.stringify(sortKeys(payload));
  return createHmac('sha512', secret).update(canonicalPayload).digest('hex');
}