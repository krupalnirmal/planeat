import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const areas = await db.serviceArea.findMany({
    select: { name: true, pincode: true, isActive: true, centerLat: true, centerLng: true },
    orderBy: { pincode: 'asc' },
  });
  console.log(JSON.stringify(areas, null, 2));
}

main()
  .catch((e) => console.error('ERR', e))
  .finally(() => db.$disconnect());
