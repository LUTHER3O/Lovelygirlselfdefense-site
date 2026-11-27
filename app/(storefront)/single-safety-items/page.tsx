import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function SingleSafetyItemsPage() {
  return <LegacyPage folder="single-safety-items" />;
}
export function generateMetadata() {
  return getLegacyMetadata('single-safety-items');
}