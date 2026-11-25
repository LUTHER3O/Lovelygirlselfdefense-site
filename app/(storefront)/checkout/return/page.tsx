import type { Metadata } from 'next';
import CheckoutReturn from './CheckoutReturn';

export const metadata: Metadata = {
  title: 'Payment status | Lovely Girl Self Defense',
  robots: { index: false, follow: false },
};

type CheckoutReturnPageProps = {
  searchParams: Promise<{ order_id?: string; status?: string }>;
};

export default async function CheckoutReturnPage({ searchParams }: CheckoutReturnPageProps) {
  const params = await searchParams;
  return <CheckoutReturn orderId={params.order_id ?? ''} initialStatus={params.status ?? 'pending'} />;
}