import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function ReturnsPage() {
  return <LegacyPage folder="returns" />;
}
export function generateMetadata() {
  return getLegacyMetadata('returns');
}