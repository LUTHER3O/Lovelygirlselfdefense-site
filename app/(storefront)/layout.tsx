import Script from 'next/script';

export default function StorefrontLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <Script src="/assets/store.js" strategy="lazyOnload" />
      {/* <Script src="/assets/supabase-auth.js" type="module" strategy="afterInteractive" /> */}
    </>
  );
}