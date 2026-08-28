import { useParams } from '@tanstack/react-router';
import { OverlayPage } from './OverlayPage';

/**
 * Reads the instance id from the URL and hands it to the overlay.
 *
 * Kept separate so `OverlayPage` takes a plain prop and can be rendered without a router — which is
 * what the admin's live preview will need.
 */
export function OverlayRoute() {
  const { instanceId } = useParams({ from: '/overlay/$instanceId' });
  return <OverlayPage instanceId={instanceId} />;
}
