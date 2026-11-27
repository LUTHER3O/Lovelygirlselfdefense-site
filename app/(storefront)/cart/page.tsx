import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function CartPage() {
  return <LegacyPage folder="cart" />;
}
export function generateMetadata() {
  return getLegacyMetadata('cart');
}