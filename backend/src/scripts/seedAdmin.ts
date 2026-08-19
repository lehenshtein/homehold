import prisma from '../library/prisma';
import { generateSalt, hashPassword } from '../library/password';

// Bootstraps the first admin account. Safe to run on every deploy: it only
// creates the user if it doesn't already exist, so it never resets a
// password the admin has since changed. Run from the Docker entrypoint,
// after `prisma db push` and before the server starts.
const ADMIN_USERNAME = 'lehenshtein';
const ADMIN_DEFAULT_PASSWORD = 'admin';

async function seedAdmin() {
  const existing = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (existing) {
    console.log(`[seed] "${ADMIN_USERNAME}" already exists, skipping.`);
    return;
  }

  const salt = generateSalt();
  const password = hashPassword(ADMIN_DEFAULT_PASSWORD, salt);
  await prisma.user.create({
    data: { username: ADMIN_USERNAME, password, salt, role: 'admin' },
  });
  console.log(`[seed] Created admin user "${ADMIN_USERNAME}" with the default password — change it after first login.`);
}

seedAdmin()
  .catch((err) => {
    console.error('[seed] Failed to seed admin user:', err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
