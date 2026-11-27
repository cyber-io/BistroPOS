/**
 * Portal & Subdomain Resolution Service
 * Provides clean domain / subdomain / path level separation between:
 * 1. Staff / Admin POS Portal (pos.*, admin.*, /pos, /admin, /kitchen, /waiter)
 * 2. Customer Restaurant Website (*.bistropos.com, *.localhost, ?r=RST-101, /menu, /delivery)
 */

export const PORTAL_MODES = {
  STAFF_POS: 'STAFF_POS',
  CUSTOMER_WEBSITE: 'CUSTOMER_WEBSITE'
};

const STAFF_SUBDOMAINS = new Set(['pos', 'admin', 'app', 'staff', 'portal', 'manager', 'kds', 'waiter']);
const SYSTEM_SUBDOMAINS = new Set(['www', 'api', 'cdn', 'static', 'assets', 'dev', 'test', 'stage']);

/**
 * Parses the current browser URL and environment to determine the portal mode,
 * active restaurant slug/code, and routing context.
 */
export function getPortalContext() {
  if (typeof window === 'undefined') {
    return {
      mode: PORTAL_MODES.STAFF_POS,
      subdomain: null,
      restaurantParam: null,
      isStaffPath: false,
      isWebsitePath: false,
      hostname: ''
    };
  }

  const hostname = (window.location.hostname || '').toLowerCase();
  const pathname = (window.location.pathname || '/').toLowerCase();
  const searchParams = new URLSearchParams(window.location.search || '');

  // 1. Query Overrides (useful for development, explicit navigation, & testing)
  const portalParam = (searchParams.get('portal') || searchParams.get('mode') || searchParams.get('app') || '').toLowerCase();
  const rParam = searchParams.get('r') || searchParams.get('restaurant') || searchParams.get('rst') || searchParams.get('code');

  // 2. Extract Subdomain (e.g. "nacl.bistropos.com" -> "nacl", "pos.localhost" -> "pos")
  let subdomain = null;
  const hostParts = hostname.split('.');
  if (hostParts.length > 2 && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    // e.g. nacl.bistropos.com, pos.bistropos.com
    subdomain = hostParts[0];
  } else if (hostParts.length === 2 && hostParts[1] === 'localhost') {
    // e.g. nacl.localhost, pos.localhost
    subdomain = hostParts[0];
  }

  // 3. Classify Path
  const isStaffPath = /^\/(pos|admin|kitchen|waiter|receptionist|staff)(\/|$)/.test(pathname) ||
                      pathname === '/pos/login' || pathname === '/staff/login';

  const isWebsitePath = /^\/(menu|delivery|takeaway|book-table|track-order|profile|home)(\/|$)/.test(pathname) ||
                        pathname.startsWith('/r/') || pathname.startsWith('/qr/');

  // 4. Determine Portal Mode
  let mode = PORTAL_MODES.CUSTOMER_WEBSITE;

  if (portalParam === 'pos' || portalParam === 'staff' || portalParam === 'admin') {
    mode = PORTAL_MODES.STAFF_POS;
  } else if (portalParam === 'website' || portalParam === 'customer') {
    mode = PORTAL_MODES.CUSTOMER_WEBSITE;
  } else if (subdomain && STAFF_SUBDOMAINS.has(subdomain)) {
    mode = PORTAL_MODES.STAFF_POS;
  } else if (subdomain && !SYSTEM_SUBDOMAINS.has(subdomain)) {
    // Specific restaurant subdomain: e.g. nacl.bistropos.com
    mode = PORTAL_MODES.CUSTOMER_WEBSITE;
  } else if (isStaffPath) {
    mode = PORTAL_MODES.STAFF_POS;
  } else if (isWebsitePath || rParam) {
    mode = PORTAL_MODES.CUSTOMER_WEBSITE;
  } else if (pathname === '/') {
    // Root default:
    // If a restaurant is specified (via query or restaurant subdomain), it is a Customer Website.
    // Otherwise, root base link loads the Staff / Admin POS portal.
    if (rParam || (subdomain && !SYSTEM_SUBDOMAINS.has(subdomain))) {
      mode = PORTAL_MODES.CUSTOMER_WEBSITE;
    } else {
      mode = PORTAL_MODES.STAFF_POS;
    }
  }

  // 5. Determine active restaurant identifier
  let restaurantIdentifier = rParam ? rParam.trim() : null;
  if (!restaurantIdentifier && subdomain && !STAFF_SUBDOMAINS.has(subdomain) && !SYSTEM_SUBDOMAINS.has(subdomain)) {
    restaurantIdentifier = subdomain;
  }

  return {
    mode,
    subdomain,
    restaurantParam: restaurantIdentifier,
    isStaffPath,
    isWebsitePath,
    hostname,
    pathname
  };
}

/**
 * Returns whether the current route view should render customer website chrome (Navbar, Cart Drawer).
 */
export function isCustomerWebsiteView(pathname, search) {
  const isStaffPath = /^\/(pos|admin|kitchen|waiter|receptionist|staff)(\/|$)/.test(pathname) ||
                      pathname === '/pos/login' || pathname === '/staff/login';
  const isQr = pathname.startsWith('/qr/');
  if (isStaffPath || isQr) return false;

  const searchParams = new URLSearchParams(search || '');
  const portalParam = (searchParams.get('portal') || searchParams.get('mode') || '').toLowerCase();
  if (portalParam === 'pos') return false;

  const rParam = searchParams.get('r') || searchParams.get('restaurant') || searchParams.get('rst') || searchParams.get('code');
  if (pathname === '/' && !rParam) {
    const ctx = getPortalContext();
    return ctx.mode === PORTAL_MODES.CUSTOMER_WEBSITE;
  }

  return true;
}

/**
 * Builds the URL for a restaurant's public website.
 */
export function buildRestaurantWebsiteUrl(restaurant) {
  if (!restaurant) return '/';
  const identifier = restaurant.restaurantCode || restaurant.restaurantId;
  const isLocal = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.localhost')
  );

  // If local, use query parameter ?r=... for universal reliability
  if (isLocal) {
    return `/?r=${encodeURIComponent(identifier)}`;
  }

  // In production: if restaurant name or code is present, can use https://<subdomain>.domain.com
  const slug = (restaurant.restaurantCode || restaurant.name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug && typeof window !== 'undefined' && !window.location.hostname.includes('localhost')) {
    const parts = window.location.hostname.split('.');
    if (parts.length >= 2) {
      const baseDomain = parts.slice(-2).join('.');
      return `${window.location.protocol}//${slug}.${baseDomain}`;
    }
  }

  return `/?r=${encodeURIComponent(identifier)}`;
}
