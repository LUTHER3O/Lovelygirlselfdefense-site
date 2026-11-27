import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function TermsPage() {
  return <LegacyPage folder="terms" />;
}
export function generateMetadata() {
  return getLegacyMetadata('terms');
}