import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function ProductPage() {
  return <LegacyPage folder="product" />;
}
export function generateMetadata() {
  return getLegacyMetadata('product');
}