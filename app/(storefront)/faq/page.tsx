import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function FaqPage() {
  return <LegacyPage folder="faq" />;
}
export function generateMetadata() {
  return getLegacyMetadata('faq');
}