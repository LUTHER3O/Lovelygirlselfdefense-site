import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function PrivacyPage() {
  return <LegacyPage folder="privacy" />;
}
export function generateMetadata() {
  return getLegacyMetadata('privacy');
}