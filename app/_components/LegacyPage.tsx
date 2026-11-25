import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import parse from 'html-react-parser';
import type { Metadata } from 'next';

type LegacyPageProps = {
  folder: string;
};

export function getLegacyMetadata(folder: string): Metadata {
  const filePath = join(process.cwd(), 'app', '(storefront)', folder, 'content.html');
  const source = readFileSync(filePath, 'utf8');
  const title = source.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const description = source.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1];

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  };
}

export default function LegacyPage({ folder }: LegacyPageProps) {
  const filePath = join(process.cwd(), 'app', '(storefront)', folder, 'content.html');
  const source = readFileSync(filePath, 'utf8');
  const body = source.match(/<body\b([^>]*)>([\s\S]*?)<\/body>/i);

  if (!body) {
    throw new Error(`The page template for "${folder}" does not contain a body element.`);
  }

  const bodyAttributes = body[1];
  const bodyClass = bodyAttributes.match(/\bclass=["']([^"']*)["']/i)?.[1] ?? '';
  const category = bodyAttributes.match(/\bdata-category=["']([^"']*)["']/i)?.[1];
  const cartIcon = '<svg class="cart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2.4 12.1a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 1.9-1.4L22 8H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="21" r="1" fill="currentColor"/><circle cx="19" cy="21" r="1" fill="currentColor"/></svg>';
  const paymentChoices = '<div class="payment-choice" role="radiogroup" aria-label="Payment method"><button type="button" class="pay-option" data-payment="paystack" aria-pressed="false">Paystack</button><button type="button" class="pay-option" data-payment="paypal" aria-pressed="false">PayPal</button><button type="button" class="pay-option" data-payment="crypto" aria-pressed="false">Crypto</button></div>';
  const cryptoSelector = '<div class="crypto-info" id="cryptoInfo" style="display:none"><label for="cryptoCurrency">Choose cryptocurrency</label><select id="cryptoCurrency" name="cryptoCurrency"><option value="BTC">Bitcoin (BTC)</option><option value="ETH">Ethereum (ETH)</option><option value="USDT_TRC20">Tether (USDT TRC20)</option></select><p>A unique NOWPayments invoice will be created for this order.</p></div>';
  const content = body[2]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<svg class="cart-bag-icon"[\s\S]*?<\/svg>/gi, cartIcon)
    .replace(/♧(?=<span class="count")/g, cartIcon)
    .replace(/<button class="btn" onclick="document\.getElementById\('checkoutModal'\)\.classList\.add\('show'\)">Proceed to checkout<\/button>/i, '<button class="btn" type="button" id="checkoutPageOpen">Proceed to checkout</button>')
    .replace(/<div class="payment-choice">[\s\S]*?<\/div><\/div>(?=<div class="crypto-info")/i, paymentChoices)
    .replace(/<div class="crypto-info" id="cryptoInfo"[\s\S]*?<\/div>/i, cryptoSelector)
    .replace('<option value="other">Other</option>', '<option value="custom">Custom</option>')
    .replace('Other tip amount (USD)', 'Custom tip amount (USD)')
    .replace('Coupon codes will be activated when the 35 accepted codes are added.', 'Coupon eligibility and discount are confirmed before payment.')
    .replace('<div class="subtotal"><span>Video add-ons</span>', '<div class="subtotal"><span>Coupon discount</span><span id="checkoutDiscount">-$0.00</span></div><div class="subtotal"><span>Video add-ons</span>')
    .replace('Continue with PayPal', 'Continue with Paystack')
    .replace('<button class="btn full" type="submit" id="placeOrder">Continue with Paystack</button>', '<button class="btn full" type="submit" id="placeOrder" disabled>Choose a payment method</button>')
    .replace('Payment processing must be connected before accepting live payments.', 'Your payment is confirmed securely by the selected provider.')
    .replace('This front end does not itself process or confirm PayPal or cryptocurrency payments.', 'An order is marked paid only after the provider confirms your payment.')
    .replace(/\s+on[a-z]+="[^"]*"/gi, '');

  return (
    <div
      className={`legacy-page ${bodyClass}`.trim()}
      data-category={category}
    >
      {parse(content)}
    </div>
  );
}