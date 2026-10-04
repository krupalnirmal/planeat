// One-off: promotes the given phone numbers to SUPER_ADMIN (session
// 2026-10-04) — bootstrapping the owner's own accounts, since the admin
// panel's own staff-creation UI needs an existing admin to use it.
// Idempotent: re-running is harmless, existing users just get their role
// updated, new ones are created outright (profile-complete still runs on
// their first login since `name` is left unset, same as any new signup).
import 'dotenv/config';
import { normalisePhone } from '../src/lib/auth/otp';
import { db } from '../src/lib/db';
import { ID_PREFIX, newId } from '../src/lib/ids';
import { Prisma } from '../src/generated/prisma/client';

const PHONES = ['9762415808', '9529770921'];

async function main() {
  for (const raw of PHONES) {
    const phone = normalisePhone(raw);
    const user = await db.user.upsert({
      where: { phone },
      update: { role: 'SUPER_ADMIN', permissions: Prisma.JsonNull, isActive: true },
      create: {
        id: newId(ID_PREFIX.user),
        phone,
        role: 'SUPER_ADMIN',
      },
      select: { id: true, phone: true, name: true, role: true },
    });
    console.log(`${user.phone} -> ${user.role} (${user.id}${user.name ? `, ${user.name}` : ', no name yet'})`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
