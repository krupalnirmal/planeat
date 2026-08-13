/**
 * Prefixed, sortable, collision-resistant ids (PART 8: "prefixed CUID ids").
 *
 * Format: `<prefix>_<26 char base32>` where the first 10 characters encode the
 * millisecond timestamp, so ids sort chronologically in the database — which
 * matters on TiDB, where a random primary key spreads writes across regions.
 * Uses Web Crypto only, so it runs on Node, the Edge runtime and Cloudflare
 * Workers alike (R11).
 */

const ENCODING = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, no i/l/o/u
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export const ID_PREFIX = {
  user: 'usr',
  otp: 'otp',
  refreshToken: 'rft',
  address: 'adr',
  serviceArea: 'sva',
  waitlist: 'wtl',
  category: 'cat',
  product: 'prd',
  variant: 'var',
  alias: 'als',
  cart: 'crt',
  cartItem: 'cri',
  order: 'ord',
  orderItem: 'ori',
  orderStatus: 'osh',
  orderIssue: 'oiu',
  healthProfile: 'hpr',
  healthAccess: 'hpa',
  mealPlan: 'mpl',
  mealPlanDay: 'mpd',
  mealPlanItem: 'mpi',
  swapRequest: 'swp',
  subscription: 'sub',
  subscriptionException: 'sbe',
  walletTransaction: 'wtx',
  payment: 'pay',
  smartList: 'sml',
  smartListItem: 'sli',
  deliveryPartner: 'dpt',
  deliveryAssignment: 'das',
  notification: 'ntf',
  pushToken: 'pst',
  aiLog: 'ail',
  auditLog: 'aud',
  banner: 'bnr',
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

function encodeTime(now: number, len: number): string {
  let out = '';
  let t = now;
  for (let i = len - 1; i >= 0; i--) {
    out = ENCODING[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ENCODING[bytes[i] % 32];
  }
  return out;
}

export function newId(prefix: IdPrefix, now: number = Date.now()): string {
  return `${prefix}_${encodeTime(now, TIME_LEN)}${encodeRandom(RANDOM_LEN)}`;
}

export function hasPrefix(id: string, prefix: IdPrefix): boolean {
  return id.startsWith(`${prefix}_`);
}

/** Human-facing order number, e.g. AC-260810-4F7QK2. */
export function newOrderNumber(now: Date = new Date()): string {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `AC-${yy}${mm}${dd}-${encodeRandom(6).toUpperCase()}`;
}
