import type { NextConfig } from 'next';

const legacyRoutes = [
  ['index.html', '/'],
  ['about.html', '/about'],
  ['cart.html', '/cart'],
  ['contact.html', '/contact'],
  ['false-nails.html', '/false-nails'],
  ['faq.html', '/faq'],
  ['fashion-bag.html', '/fashion-bag'],
  ['login.html', '/login'],
  ['mystery-scoop.html', '/mystery-scoop'],
  ['privacy.html', '/privacy'],
  ['product.html', '/product'],
  ['products.html', '/products'],
  ['returns.html', '/returns'],
  ['safety-keychain-set.html', '/safety-keychain-set'],
  ['single-safety-items.html', '/single-safety-items'],
  ['terms.html', '/terms'],
  ['wishlist.html', '/wishlist'],
] as const;

const nextConfig: NextConfig = {
  async redirects() {
    return legacyRoutes.map(([source, destination]) => ({
      source: `/${source}`,
      destination,
      permanent: false,
    }));
  },
};

export default nextConfig;