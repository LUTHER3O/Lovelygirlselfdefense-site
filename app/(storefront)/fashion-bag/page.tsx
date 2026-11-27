import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function FashionBagPage() {
  return <LegacyPage folder="fashion-bag" />;
}
export function generateMetadata() {
  return getLegacyMetadata('fashion-bag');
}