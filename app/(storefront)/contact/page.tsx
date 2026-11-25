import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function ContactPage() {
  return <LegacyPage folder="contact" />;
}
export function generateMetadata() {
  return getLegacyMetadata('contact');
}