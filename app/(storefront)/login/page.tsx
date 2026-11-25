import Script from 'next/script';
import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function LoginPage() {
  return (
    <>
      <LegacyPage folder="login" />
      <Script src="/assets/supabase-auth.js" type="module" strategy="lazyOnload" />
    </>
  );
}
export function generateMetadata() {
  return {
    ...getLegacyMetadata('login'),
    other: {
      'supabase-url': process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      'supabase-anon-key': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  };
}