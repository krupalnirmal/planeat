import 'dotenv/config';
import { db } from '../src/lib/db';

/**
 * Client's updated area-name list (session 2026-11-15, WhatsApp list of 10
 * Nashik localities + pincodes) — applied as-given. Several of the client's
 * names share one pincode with each other or with an existing area
 * (`ServiceArea.pincode` is `@unique`, one row per pincode), so those are
 * merged into one combined name rather than creating a second row for the
 * same pincode:
 *   - 422005: Gangapur Road + College Road + Sharanpur Road (client listed
 *     Sharanpur Road under both 422002 and 422005)
 *   - 422002: Mumbai Naka (existing) + Sharanpur Road
 *   - 422003: Panchavati (existing) + Adgaon Naka (client gave it the same
 *     pincode as Panchavati)
 *   - 422007: Mahatma Nagar replaces the existing "Satpur" name outright —
 *     client said to use exactly what they gave
 *   - 422009: Govind Nagar replaces the existing "Indira Nagar" name
 *
 * NOT touched: the existing separate "Gangapur Road" row at pincode 422013
 * — the client's list puts Gangapur Road at 422005 instead, but nothing was
 * said about removing/renaming the 422013 row, so it's left as-is and
 * flagged back rather than silently deactivated.
 * Deletes itself after running — one-off, not app code.
 */

const UPDATES: { pincode: string; name: string }[] = [
  { pincode: '422005', name: 'Gangapur Road / College Road / Sharanpur Road' },
  { pincode: '422002', name: 'Mumbai Naka / Sharanpur Road' },
  { pincode: '422003', name: 'Panchavati / Adgaon Naka' },
  { pincode: '422007', name: 'Mahatma Nagar' },
  { pincode: '422009', name: 'Govind Nagar' },
];

async function main() {
  for (const { pincode, name } of UPDATES) {
    const result = await db.serviceArea.updateMany({ where: { pincode }, data: { name } });
    console.log(`${pincode} -> "${name}" (${result.count} row updated)`);
  }

  console.log('\nUnchanged (already matched the client list):');
  console.log('  422011 Dwarka, 422101 Nashik Road, 422010 Pathardi Phata');
  console.log('\nNot touched (flagged, not in the client list as given):');
  console.log('  422013 Gangapur Road — client\'s list puts Gangapur Road at 422005 instead');
}

main()
  .catch((error) => {
    console.error('ERR', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
