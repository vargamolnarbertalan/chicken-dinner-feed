import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { AdminPage } from '@/pages/AdminPage';
import { HomePage } from '@/pages/HomePage';
import { OverlayRoute } from '@/pages/OverlayRoute';

const rootRoute = createRootRoute({ component: Outlet });

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

/**
 * One route per overlay instance. The instance id is the whole addressing scheme: a director copies
 * this URL into a browser source, and the same id is what Companion calls at
 * `/api/overlays/:instanceId/show` (ADR-0012).
 */
const overlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/overlay/$instanceId',
  component: OverlayRoute,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
});

const routeTree = rootRoute.addChildren([homeRoute, overlayRoute, adminRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
