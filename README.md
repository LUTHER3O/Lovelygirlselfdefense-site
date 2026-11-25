# Lovely Girl Self Defense

Lovely Girl Self Defense is a storefront built with the Next.js App Router. The project keeps the existing storefront content and browser behavior while organizing each page beside its route so it is straightforward to find and update.

## Requirements

- Node.js 20.9 or newer
- npm (included with Node.js)

## Install and run

Open a terminal in this project folder and run:

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser. Stop the development server with `Ctrl+C`.

If PowerShell reports that `npm.ps1` cannot run because script execution is disabled, use the Windows command shim instead: `npm.cmd install`, `npm.cmd run dev`, and so on. This does not require changing PowerShell's execution policy.

Node.js is installed under `%LOCALAPPDATA%\Programs\nodejs` and added to the current user's `PATH`. Terminals that were already open may need VS Code restarted before `node` and `npm.cmd` are available.

Other useful commands:

```powershell
npm run build
npm run start
npm run lint
```

Run `npm run build` before deployment. `npm run start` serves the production build and should be used after building.

## Project map

```text
app/
  layout.tsx                    Root document, site metadata, and global styles
  globals.css                   Shared storefront stylesheet
  _components/
    LegacyPage.tsx              Shared adapter for the existing page content
  (storefront)/
    layout.tsx                  Loads shared storefront browser scripts
    content.html                Home page content, beside the home route
    page.tsx                    Home route: /
    about/
      content.html              About page content
      page.tsx                  About route: /about
    products/
      content.html              Product listing content
      page.tsx                  Product listing route: /products
    product/
      content.html              Product detail content
      page.tsx                  Product detail route: /product?id=...
    ...                         Remaining pages follow the same pattern
public/
  assets/
    images/                     Store and customer-uploaded images
    products.json               Product catalogue
    store.js                    Cart, catalogue, wishlist, and storefront behavior
    supabase-auth.js            Browser-based account sign-in and registration
package.json                   Dependencies and common commands
next.config.ts                 Redirects from the original .html URLs
```

The route folders are inside `(storefront)`, a Next.js route group. The parentheses organize related files without appearing in the browser URL. For example, `app/(storefront)/about/page.tsx` serves `/about`.

Each page's `content.html` sits beside its `page.tsx`. `LegacyPage.tsx` reads the saved page body on the server and renders it, preserving the existing layout and IDs used by the storefront scripts. This is a compatibility-first migration: route handling, document metadata, shared styles, and asset hosting are now part of Next.js, while most page markup and interactive behavior remain in the original HTML and browser JavaScript. As the site evolves, individual `content.html` files can be replaced with React components without changing the route URLs.

## Routes

| Page | URL |
| --- | --- |
| Home | `/` |
| All products | `/products` |
| Product detail | `/product?id=1` |
| Mystery Scoop | `/mystery-scoop` |
| Safety Keychain Set | `/safety-keychain-set` |
| Single Safety Items | `/single-safety-items` |
| Fashion Bags | `/fashion-bag` |
| False Nails | `/false-nails` |
| Shopping bag | `/cart` |
| Wishlist | `/wishlist` |
| About, Contact, FAQ, Login | `/about`, `/contact`, `/faq`, `/login` |
| Returns, Privacy, Terms | `/returns`, `/privacy`, `/terms` |

The old `.html` URLs redirect to their new routes so existing links and bookmarks continue to work.

## Catalogue and storefront behavior

- Product information is stored in `public/assets/products.json`.
- Product listings, detail pages, the cart, and the wishlist use the shared browser code in `public/assets/store.js`.
- Cart and wishlist data are saved in the current browser's `localStorage`; they are not synced between devices or accounts.
- The EMBER promotion applies a 75% discount from December 1, 2026 through January 5, 2027, using Lagos time. Browser prices are for display only.
- Product images may reference an external host. Confirm that you have permission to use those images and that the host allows them before publishing.

## Before accepting orders

Checkout is currently a front-end demonstration. It does not process or confirm payment or create a real order. Before launch, connect a trusted server-side order and payment provider. That server must load its own product prices, recalculate totals, and independently enforce any promotion dates; never trust a total submitted by the browser.

The catalogue's availability is not live inventory, product reviews are placeholders, and some products use price ranges whose cart starting price is the lowest listed price. Verify product-specific variants, prices, stock, shipping, and return details before taking payment.

Account screens use the Supabase browser client in `public/assets/supabase-auth.js`. Configure and verify the Supabase project, redirect URLs, and authentication settings before enabling customer accounts. A public client key is not a substitute for server-side authorization or database access policies.

## Checkout and payments

The checkout API calculates product prices, coupon discounts, tips, and totals on the server. It ignores browser-submitted prices. All provider amounts are USD. The tip is calculated on the subtotal after a coupon discount; select no tip, 10%, 20%, 30%, or enter a custom USD amount.

Before testing checkout:

1. Copy `.env.example` to `.env` and add your real Supabase and provider credentials. Keep `.env` private; only the Supabase URL and anon key use the `NEXT_PUBLIC_` prefix. Do not put secret keys in browser code.
2. Apply `supabase/migrations/20261125000000_checkout_payments.sql` to your Supabase project using the SQL editor or Supabase CLI.
3. Add active coupon rows to `public.coupons`. `discount_type` is `percentage` or `fixed`, `discount_value` is the percent or USD amount, `expiry_date` is optional, and `max_uses` can be null for unlimited use. The server reserves a use during checkout and counts it only after payment is verified.
4. Configure provider credentials in sandbox/test mode and set `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin when testing provider callbacks.

Provider endpoints to register:

| Provider | Callback or webhook URL | Notes |
| --- | --- | --- |
| Paystack | `https://your-domain/api/payments/paystack/callback` | Configure the webhook at `https://your-domain/api/webhooks/paystack`; it verifies Paystack's HMAC signature and rechecks the transaction API. The Paystack account must support USD transactions. |
| PayPal | Return/capture is configured automatically | Set `PAYPAL_MODE=sandbox` while testing and provide sandbox client credentials. Orders are marked paid only after the server captures and verifies the USD amount. |
| NOWPayments | `https://your-domain/api/webhooks/nowpayments` | Add this as the IPN callback URL. The checkout creates hosted invoices for BTC, ETH, or USDT TRC20 and verifies IPNs with the NOWPayments API before marking orders paid. |

The payment API routes are in `app/api/checkout` and `app/api/payments`; provider webhooks are in `app/api/webhooks`. `SUPABASE_SERVICE_ROLE_KEY` is used only by server-side route handlers, with client access blocked by RLS. `DATABASE_URL` is included for direct database administration/tooling; the running app uses the Supabase server client. `CRYPTO_WALLET_ADDRESS` is a placeholder for a future direct-wallet flow; hosted NOWPayments invoices do not use it.

Provider API credentials and a deployed HTTPS webhook are required to complete live payments; this repository cannot verify an external merchant account or payment. Test each provider in its sandbox/test mode before enabling live checkout. In particular, check that Paystack has enabled USD for your merchant account and that NOWPayments has enabled the selected coins/networks.

## Updating the site

- To change a page's current copy or layout, edit that route's `content.html`.
- To change a route or add a new page, create a sibling folder under `app/(storefront)` with a `page.tsx` and `content.html`.
- To change shared styling, edit `app/globals.css`.
- To update product data, edit `public/assets/products.json` and keep its JSON valid.
- To update shared storefront interactions, edit `public/assets/store.js`.
- If a page's old `.html` URL must keep working, add its redirect in `next.config.ts`.