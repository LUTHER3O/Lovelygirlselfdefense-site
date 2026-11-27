'use client';

import { useEffect, useState } from 'react';

type CheckoutReturnProps = {
  orderId: string;
  initialStatus: string;
};

const messages: Record<string, { heading: string; detail: string }> = {
  paid: { heading: 'Payment confirmed', detail: 'Your order has been paid successfully.' },
  failed: { heading: 'Payment was not completed', detail: 'No payment was confirmed. You can try checkout again.' },
  expired: { heading: 'Payment expired', detail: 'This payment invoice expired before confirmation.' },
  cancelled: { heading: 'Checkout cancelled', detail: 'Your order has not been paid. Your cart is still available.' },
  verification_failed: { heading: 'Payment is being checked', detail: 'We could not confirm the redirect yet. Check the latest order status below.' },
  pending: { heading: 'Confirming your payment', detail: 'We are waiting for your payment provider to confirm the transaction.' },
};

export default function CheckoutReturn({ orderId, initialStatus }: CheckoutReturnProps) {
  const [status, setStatus] = useState(initialStatus || 'pending');
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let cancellationRequested = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/checkout/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to retrieve payment status.');
        if (!active) return;

        setStatus(result.status);
        setTotal(result.totalAmount);
        setError('');
        if (initialStatus === 'cancelled' && result.paymentMethod === 'paypal' && result.status === 'pending' && !cancellationRequested) {
          cancellationRequested = true;
          await fetch(`/api/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'POST' });
        }
        if (result.status === 'paid') {
          window.localStorage.removeItem('lgsd_cart');
          window.dispatchEvent(new Event('lgsd-checkout-paid'));
        }
        if (!['paid', 'failed', 'expired'].includes(result.status) && attempts < 120) {
          attempts += 1;
          timer = setTimeout(poll, 4000);
        }
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Unable to retrieve payment status.');
        if (attempts < 120) {
          attempts += 1;
          timer = setTimeout(poll, 6000);
        }
      }
    };

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [initialStatus, orderId]);

  const message = messages[status] ?? messages.pending;

  return (
    <main className="checkout-result">
      <span className="eyebrow">LOVELY GIRL SELF DEFENSE</span>
      <h1>{message.heading}</h1>
      <p>{message.detail}</p>
      {orderId ? <p className="checkout-result-order">Order reference: {orderId}</p> : null}
      {total != null ? <p className="checkout-result-total">Total: ${Number(total).toFixed(2)} USD</p> : null}
      {error ? <p role="status">{error}</p> : null}
      <a className="btn" href="/products">Continue shopping</a>
    </main>
  );
}