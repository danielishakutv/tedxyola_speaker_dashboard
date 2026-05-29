import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const password = 'Tedx@2026';
  const users = [
    { username: 'admin', role: 'admin' },
    { username: 'peace', role: 'editor' },
    { username: 'rachael', role: 'editor' }
  ];

  for (const user of users) {
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.upsert({
      where: { username: user.username },
      update: { role: user.role },
      create: {
        username: user.username,
        passwordHash: hash,
        role: user.role
      }
    });
    console.log(`✓ User '${user.username}' created/updated`);
  }

  console.log('✓ All users seeded successfully!');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
