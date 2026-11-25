import LegacyPage, { getLegacyMetadata } from '../../_components/LegacyPage';

export default function WishlistPage() {
  return <LegacyPage folder="wishlist" />;
}
export function generateMetadata() {
  return getLegacyMetadata('wishlist');
}