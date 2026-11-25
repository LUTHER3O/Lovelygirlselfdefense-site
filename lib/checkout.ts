import productData from '@/public/assets/products.json';
import { CheckoutError } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
export { CheckoutError } from '@/lib/errors';

type CatalogProduct = {
  id: number;
  name: string;
  price: number;
  old?: number;
  category: string;
  sizes?: string[];
  colors?: string[];
  scoopOptions?: string[];
  brandOptions?: string[];
  videoOptions?: string[];
  variants?: { name: string; options: string[] }[];
};

export type RequestedItem = {
  id: number;
  qty: number;
  options?: Record<string, unknown>;
};

export type CheckoutItem = {
  productId: number;
  name: string;
  quantity: number;
  options: Record<string, string>;
  unitPrice: number;
  videoAddon: number;
};

export type TipChoice = {
  percentage: number | null;
  customAmount: number;
};

export type CheckoutQuote = {
  items: CheckoutItem[];
  merchandiseSubtotal: number;
  videoAddonSubtotal: number;
  subtotal: number;
  couponCode: string | null;
  discountAmount: number;
  tipAmount: number;
  tipPercentage: number | null;
  totalAmount: number;
  currency: 'USD';
};

const products = productData as CatalogProduct[];
const saleStart = Date.parse('2026-12-01T00:00:00+01:00');
const saleEnd = Date.parse('2027-01-06T00:00:00+01:00');

function cents(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100);
}

function dollars(value: number) {
  return Math.round(value) / 100;
}

function isSaleActive(now = Date.now()) {
  return now >= saleStart && now < saleEnd;
}

function productPrice(product: CatalogProduct) {
  const price = Number(product.price) || 0;
  const alternate = Number(product.old) || 0;
  const startingPrice = alternate > 0 && alternate < price ? alternate : price;
  return dollars(cents(startingPrice) * (isSaleActive() ? 0.25 : 1));
}

function validateOptions(product: CatalogProduct, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const values: Record<string, string[]> = {
    Color: product.colors ?? [],
    'Color / Design': product.colors ?? [],
    Size: product.sizes ?? [],
    'Scoop Amount': product.scoopOptions ?? [],
    Brand: product.brandOptions ?? [],
    'Would you like a video?': product.videoOptions ?? [],
  };
  for (const variant of product.variants ?? []) values[variant.name] = variant.options;

  const output: Record<string, string> = {};
  for (const [name, rawValue] of Object.entries(input)) {
    if (typeof rawValue !== 'string' || rawValue.length > 120) continue;
    if (name === 'Selected photo / style') {
      output[name] = rawValue;
    } else if (values[name]?.includes(rawValue)) {
      output[name] = rawValue;
    }
  }
  return output;
}

export function normalizeItems(input: unknown): CheckoutItem[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) {
    throw new CheckoutError('Your cart is empty or contains too many different products.');
  }

  return input.map((raw: RequestedItem) => {
    const id = Number(raw?.id);
    const quantity = Number(raw?.qty);
    const product = products.find((entry) => entry.id === id);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new CheckoutError('A cart item is invalid. Refresh your cart and try again.');
    }

    const options = validateOptions(product, raw.options);
    const videoAddon = product.category === 'mystery-scoop' && options['Would you like a video?'] === 'Yes' ? 10 : 0;
    return {
      productId: product.id,
      name: product.name,
      quantity,
      options,
      unitPrice: productPrice(product),
      videoAddon,
    };
  });
}

function normalizeCouponCode(input: unknown) {
  if (input == null || input === '') return null;
  if (typeof input !== 'string' || input.trim().length > 64) {
    throw new CheckoutError('Enter a valid coupon code.');
  }
  return input.trim().toUpperCase();
}

export function normalizeTip(input: unknown, customAmount: unknown): TipChoice {
  if (input === 'custom' || input === 'other') {
    const amount = Number(customAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000) {
      throw new CheckoutError('Enter a valid tip amount.');
    }
    return { percentage: null, customAmount: dollars(cents(amount)) };
  }

  const percentage = Number(input ?? 0);
  if (![0, 10, 20, 30].includes(percentage)) {
    throw new CheckoutError('Choose a valid tip option.');
  }
  return { percentage, customAmount: 0 };
}

export async function createQuote(input: {
  items: unknown;
  couponCode?: unknown;
  tipChoice?: unknown;
  customTip?: unknown;
}): Promise<CheckoutQuote> {
  const items = normalizeItems(input.items);
  const code = normalizeCouponCode(input.couponCode);
  const tip = normalizeTip(input.tipChoice, input.customTip);
  const merchandiseCents = items.reduce((sum, item) => sum + cents(item.unitPrice) * item.quantity, 0);
  const videoAddonCents = items.reduce((sum, item) => sum + cents(item.videoAddon) * item.quantity, 0);
  const subtotalCents = merchandiseCents + videoAddonCents;

  let discountCents = 0;
  if (code) {
    const supabase = getSupabaseAdmin();
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('code, discount_type, discount_value, expiry_date, max_uses, used_count, reserved_count, is_active')
      .eq('code', code)
      .maybeSingle();

    if (error) throw new CheckoutError('Coupon validation is temporarily unavailable.', 503);
    if (!coupon || !coupon.is_active) throw new CheckoutError('This coupon is not active.');
    if (coupon.expiry_date && coupon.expiry_date < new Date().toISOString().slice(0, 10)) {
      throw new CheckoutError('This coupon has expired.');
    }
    if (coupon.max_uses != null && coupon.used_count + coupon.reserved_count >= coupon.max_uses) {
      throw new CheckoutError('This coupon has reached its usage limit.');
    }

    const valueCents = cents(Number(coupon.discount_value));
    discountCents = coupon.discount_type === 'percentage'
      ? Math.round(subtotalCents * Number(coupon.discount_value) / 100)
      : valueCents;
    discountCents = Math.min(subtotalCents, Math.max(0, discountCents));
  }

  const discountedSubtotal = subtotalCents - discountCents;
  const tipCents = tip.percentage == null
    ? cents(tip.customAmount)
    : Math.round(discountedSubtotal * tip.percentage / 100);

  return {
    items,
    merchandiseSubtotal: dollars(merchandiseCents),
    videoAddonSubtotal: dollars(videoAddonCents),
    subtotal: dollars(subtotalCents),
    couponCode: code,
    discountAmount: dollars(discountCents),
    tipAmount: dollars(tipCents),
    tipPercentage: tip.percentage,
    totalAmount: dollars(discountedSubtotal + tipCents),
    currency: 'USD',
  };
}

export function isPaymentMethod(value: unknown): value is 'paystack' | 'paypal' | 'crypto' {
  return value === 'paystack' || value === 'paypal' || value === 'crypto';
}

export function getSiteUrl(request: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return;

  try {
    if (new URL(origin).host !== host.split(',')[0].trim()) {
      throw new CheckoutError('Cross-origin checkout requests are not allowed.', 403);
    }
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    throw new CheckoutError('Invalid request origin.', 403);
  }
}