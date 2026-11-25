import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function AboutPage() {
  return <LegacyPage folder="about" />;
}
export function generateMetadata() {
  return getLegacyMetadata('about');
}