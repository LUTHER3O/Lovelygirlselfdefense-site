import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function MysteryScoopPage() {
  return <LegacyPage folder="mystery-scoop" />;
}
export function generateMetadata() {
  return getLegacyMetadata('mystery-scoop');
}