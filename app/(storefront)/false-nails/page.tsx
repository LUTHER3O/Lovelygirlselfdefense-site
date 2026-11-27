import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function FalseNailsPage() {
  return <LegacyPage folder="false-nails" />;
}
export function generateMetadata() {
  return getLegacyMetadata('false-nails');
}