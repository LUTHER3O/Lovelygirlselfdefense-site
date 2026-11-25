import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function SafetyKeychainSetPage() {
  return <LegacyPage folder="safety-keychain-set" />;
}
export function generateMetadata() {
  return getLegacyMetadata('safety-keychain-set');
}