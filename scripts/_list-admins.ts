import 'dotenv/config';
import { db } from '../src/lib/db';

async function main() {
  const admins = await db.user.findMany({
    where: { role: { in: ['STORE_ADMIN', 'SUPER_ADMIN'] } },
    select: { phone: true, name: true, role: true },
  });
  console.log(JSON.stringify(admins, null, 2));
}

main()
  .catch((e) => console.error('ERR', e))
  .finally(() => db.$disconnect());
