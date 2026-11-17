import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const area = await db.serviceArea.findUnique({ where: { pincode: '422101' } });
  console.log(JSON.stringify(area, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

main()
  .catch((e) => console.error('ERR', e))
  .finally(() => db.$disconnect());
