#!/usr/bin/env node
// Usage: node scripts/seed-demo-tenant.js <tenant_id> [--teardown]
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars.

var { seedDemoTenant, teardownDemoTenant } = require('../api/_lib/seed-demo-tenant');

var tenantId = process.argv[2];
var teardown = process.argv.includes('--teardown');

if (!tenantId) {
  console.error('Usage: node scripts/seed-demo-tenant.js <tenant_id> [--teardown]');
  process.exit(1);
}

(async function() {
  try {
    if (teardown) {
      await teardownDemoTenant(tenantId);
      console.log('Teardown complete for', tenantId);
    } else {
      var result = await seedDemoTenant(tenantId);
      console.log('Result:', result);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
