import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function ProductsPage() {
  return <LegacyPage folder="products" />;
}
export function generateMetadata() {
  return getLegacyMetadata('products');
}