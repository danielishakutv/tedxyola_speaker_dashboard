import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Require environment variables - no fallback defaults for security
  const requiredEnvVars = [
    'ADMIN_USER', 'ADMIN_PASS',
    'EDITOR1_USER', 'EDITOR1_PASS',
    'EDITOR2_USER', 'EDITOR2_PASS'
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nSet them in your .env file or export them before running this script.');
    console.error('Example:\n');
    console.error('  export ADMIN_USER="@Admin"');
    console.error('  export ADMIN_PASS="YourSecurePassword123"');
    console.error('  export EDITOR1_USER="@Peace"');
    console.error('  export EDITOR1_PASS="YourSecurePassword123"');
    console.error('  export EDITOR2_USER="@Rachael"');
    console.error('  export EDITOR2_PASS="YourSecurePassword123"\n');
    process.exit(1);
  }

  const users = [
    { 
      username: process.env.ADMIN_USER,
      password: process.env.ADMIN_PASS,
      role: 'admin'
    },
    { 
      username: process.env.EDITOR1_USER,
      password: process.env.EDITOR1_PASS,
      role: 'editor'
    },
    { 
      username: process.env.EDITOR2_USER,
      password: process.env.EDITOR2_PASS,
      role: 'editor'
    }
  ];

  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    await prisma.user.upsert({
      where: { username: user.username },
      update: { role: user.role, passwordHash: hash },
      create: {
        username: user.username,
        passwordHash: hash,
        role: user.role
      }
    });
    console.log(`✓ User '${user.username}' (${user.role}) created/updated`);
  }

  console.log('\n✓ All users seeded successfully!\n');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
