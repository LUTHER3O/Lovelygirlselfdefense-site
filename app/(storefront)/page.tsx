import LegacyPage, { getLegacyMetadata } from '../_components/LegacyPage';

export default function HomePage() {
  return <LegacyPage folder="" />;
}
export function generateMetadata() {
  return getLegacyMetadata('');
}