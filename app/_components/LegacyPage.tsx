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
  const paymentChoices = `<div class="field"><label>Choose payment method</label><div class="payment-choice" role="radiogroup" aria-label="Payment method">
    <button type="button" class="pay-option" data-payment="paystack" role="radio" aria-checked="false" aria-pressed="false"><span class="payment-mark paystack-mark" aria-hidden="true"><i></i></span><span>Paystack</span></button>
    <button type="button" class="pay-option" data-payment="paypal" role="radio" aria-checked="false" aria-pressed="false"><span class="payment-mark paypal-mark" aria-hidden="true">P</span><span>PayPal</span></button>
    <button type="button" class="pay-option" data-payment="crypto" role="radio" aria-checked="false" aria-pressed="false"><span class="payment-mark crypto-mark" aria-hidden="true">₿</span><span>Crypto</span></button>
  </div></div>`;
  const couponMarkup = '<div class="checkout-coupon"><p><strong>Do you have a coupon?</strong> <button type="button" id="showCoupon" class="text-action" aria-expanded="false" aria-controls="couponEntry">Enter your code</button></p><div id="couponEntry" hidden><label for="couponCode">Coupon code</label><div class="coupon-entry"><input id="couponCode" name="couponCode" autocomplete="off" placeholder="Enter your coupon code"><button type="button" id="applyCoupon" class="btn light">Apply coupon</button></div><small id="couponMessage" aria-live="polite">Your coupon will be validated before payment.</small></div></div>';
  const tipControls = '<div class="field tip-field"><label>Choose a tip</label><div class="tip-choice" role="radiogroup" aria-label="Tip amount"><button type="button" class="tip-option" data-tip-choice="0" role="radio" aria-checked="true" aria-pressed="true">No tip</button><button type="button" class="tip-option" data-tip-choice="10" role="radio" aria-checked="false" aria-pressed="false">10%</button><button type="button" class="tip-option" data-tip-choice="20" role="radio" aria-checked="false" aria-pressed="false">20%</button><button type="button" class="tip-option" data-tip-choice="30" role="radio" aria-checked="false" aria-pressed="false">30%</button><button type="button" class="tip-option" data-tip-choice="custom" role="radio" aria-checked="false" aria-pressed="false">Custom</button></div><select id="tipChoice" name="tipChoice" tabindex="-1" aria-hidden="true"><option value="0" selected>No tip</option><option value="10">10%</option><option value="20">20%</option><option value="30">30%</option><option value="custom">Custom</option></select><div id="otherTipWrap" hidden><label for="otherTipAmount">Custom tip amount (USD)</label><input id="otherTipAmount" type="number" min="0" step="0.01" value="0"></div></div>';
  const cryptoSelector = '<div class="crypto-info" id="cryptoInfo" style="display:none"><label for="cryptoCurrency">Choose cryptocurrency</label><select id="cryptoCurrency" name="cryptoCurrency"><option value="BTC">Bitcoin (BTC)</option><option value="ETH">Ethereum (ETH)</option><option value="USDT_TRC20">Tether (USDT TRC20)</option></select><p>A unique NOWPayments invoice will be created for this order.</p></div>';
  const content = body[2]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<svg class="cart-bag-icon"[\s\S]*?<\/svg>/gi, cartIcon)
    .replace(/♧(?=<span class="count")/g, cartIcon)
    .replace(/<button class="btn" onclick="document\.getElementById\('checkoutModal'\)\.classList\.add\('show'\)">Proceed to checkout<\/button>/i, '<button class="btn" type="button" id="checkoutPageOpen">Proceed to checkout</button>')
    .replace(/<div class="field"><label>Choose payment method<\/label>[\s\S]*?(?=<div class="crypto-info")/i, paymentChoices)
    .replace(/<div class="crypto-info" id="cryptoInfo"[\s\S]*?<\/div>/i, cryptoSelector)
    .replace(/<div class="field"><label for="tipChoice">Tips<\/label><select id="tipChoice"[\s\S]*?<\/select><div id="otherTipWrap"[\s\S]*?<\/div><\/div>/i, tipControls)
    .replace(/<div class="checkout-coupon">[\s\S]*?(?=<div class="field tip-field">)/i, '')
    .replace('<form id="orderForm">', `<form id="orderForm">${couponMarkup}`)
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