// Populates the Phase 0 "master tables" (Business, Branch, User, Membership,
// BranchAccess) with a standing demo dataset so the API can be tested
// manually (Postman, curl, Prisma Studio) without having to sign up fresh
// accounts every time. Safe to re-run — every write is an upsert keyed on
// the same fixed demo identifiers, so running it twice never duplicates data.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');

const SALT_ROUNDS = 10;
const DEMO_PASSWORD = 'Demo@12345';
const BUSINESS_NAME = 'Chai Junction (Demo)';

const BRANCHES = [
  { code: 'MUM-01', name: 'Andheri West', city: 'Mumbai', region: 'Maharashtra', latitude: 19.1364, longitude: 72.8296 },
  { code: 'PUN-01', name: 'Koregaon Park', city: 'Pune', region: 'Maharashtra', latitude: 18.5362, longitude: 73.8938 },
  { code: 'AMD-01', name: 'SG Highway', city: 'Ahmedabad', region: 'Gujarat', latitude: 23.0304, longitude: 72.5108 },
  { code: 'SUR-01', name: 'Vesu', city: 'Surat', region: 'Gujarat', latitude: 21.1354, longitude: 72.7738 },
  { code: 'VAD-01', name: 'Alkapuri', city: 'Vadodara', region: 'Gujarat', latitude: 22.3103, longitude: 73.1815 },
];

// Branch codes the demo manager is scoped to (the rest stay owner/admin-only
// access), so branch-scoping can be exercised manually the same way the
// Postman collection's "Manager Scoping Checks" folder does, but against
// fixed, reusable data instead of a throwaway per-run account.
const MANAGER_SCOPED_CODES = ['MUM-01', 'PUN-01'];

async function upsertUser({ email, name, preferredLocale }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name, preferredLocale, status: 'ACTIVE' },
  });
}

async function main() {
  let business = await prisma.business.findFirst({ where: { name: BUSINESS_NAME } });
  if (!business) {
    business = await prisma.business.create({
      data: {
        name: BUSINESS_NAME,
        industry: 'FOOD_BEVERAGE',
        country: 'IN',
        defaultCurrency: 'INR',
        defaultLocale: 'EN',
        timezone: 'Asia/Kolkata',
      },
    });
  }

  const owner = await upsertUser({ email: 'owner.demo@buisnessops.dev', name: 'Demo Owner', preferredLocale: 'EN' });
  const manager = await upsertUser({ email: 'manager.demo@buisnessops.dev', name: 'Demo Manager', preferredLocale: 'HI' });

  await prisma.membership.upsert({
    where: { userId_businessId: { userId: owner.id, businessId: business.id } },
    update: {},
    create: { userId: owner.id, businessId: business.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
  });

  const managerMembership = await prisma.membership.upsert({
    where: { userId_businessId: { userId: manager.id, businessId: business.id } },
    update: {},
    create: { userId: manager.id, businessId: business.id, role: 'MANAGER', status: 'ACTIVE', joinedAt: new Date() },
  });

  const branches = [];
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { businessId_code: { businessId: business.id, code: b.code } },
      update: {},
      create: {
        businessId: business.id,
        name: b.name,
        code: b.code,
        city: b.city,
        region: b.region,
        country: 'IN',
        latitude: b.latitude,
        longitude: b.longitude,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        status: 'ACTIVE',
        openedAt: new Date('2023-01-15'),
      },
    });
    branches.push(branch);
  }

  const scopedBranches = branches.filter((b) => MANAGER_SCOPED_CODES.includes(b.code));
  for (const branch of scopedBranches) {
    await prisma.branchAccess.upsert({
      where: { membershipId_branchId: { membershipId: managerMembership.id, branchId: branch.id } },
      update: {},
      create: { membershipId: managerMembership.id, branchId: branch.id },
    });
  }

  console.log('\nSeed complete.\n');
  console.log(`Business: ${business.name}  (${business.id})`);
  console.log('Branches:');
  branches.forEach((b) => console.log(`  ${b.code}  ${b.name} (${b.city})  ->  ${b.id}`));
  console.log(`\nLogin credentials (same password for both): ${DEMO_PASSWORD}`);
  console.log(`  Owner    ${owner.email}   — full access to all ${branches.length} branches`);
  console.log(`  Manager  ${manager.email} — scoped to ${scopedBranches.map((b) => b.code).join(', ')} only`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
