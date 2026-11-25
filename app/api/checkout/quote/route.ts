import { assertSameOrigin, createQuote } from '@/lib/checkout';
import { CheckoutError } from '@/lib/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await request.json();
    const quote = await createQuote(input);
    return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = error instanceof CheckoutError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to calculate checkout totals.';
    if (status >= 500) console.error('Checkout quote failed', error);
    return Response.json({ error: message }, { status });
  }
}