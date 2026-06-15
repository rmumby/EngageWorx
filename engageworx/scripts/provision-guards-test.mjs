// scripts/provision-guards-test.mjs
//
// Deterministic guard test for tenant provisioning — exercises the deployed
// provision_tenant_and_bind RPC directly: idempotency (duplicate event_id → 23505),
// atomic bind (one membership, no duplicate tenant), slug self-heal, and is_sandbox passthrough.
//
// ⚠ RUNS AGAINST THE LIVE DATABASE. It creates and then deletes real auth users + tenants.
//   - Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (service-role key — never the anon key).
//   - Self-cleans on success (and via the finally block on error).
//   - MUST NOT auto-run in CI — that's why this lives in scripts/, not __tests__/, and is gated
//     behind RUN_PROVISION_GUARDS=1 so an accidental invocation no-ops instead of touching prod.
//
// Run:
//   RUN_PROVISION_GUARDS=1 SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/provision-guards-test.mjs

import { createClient } from '@supabase/supabase-js';

if (process.env.RUN_PROVISION_GUARDS !== '1') {
  console.log('No-op: set RUN_PROVISION_GUARDS=1 to run the provisioning guards test. It hits the LIVE DB (creates/deletes real users + tenants) and must never auto-run in CI.');
  process.exit(0);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service-role) are both required.');
  process.exit(1);
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const stamp = Date.now();
const ev = `evt_idemtest_${stamp}`;
const slug = `idemtest-${stamp}`;
const users = [], tenants = [], events = [ev, `${ev}_b`];
let pass = true;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) pass = false; };
const mkUser = async (email) => {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error; users.push(data.user.id); return data.user.id; // profile auto-created by trigger
};

try {
  const u1 = await mkUser(`idemtest1+${stamp}@example.test`);
  const u2 = await mkUser(`idemtest2+${stamp}@example.test`);

  const r1 = await admin.rpc('provision_tenant_and_bind', { p_user_id: u1, p_name: 'Idem Test 1', p_slug: slug, p_is_sandbox: true, p_event_id: ev });
  check('1st call returns a tenant id', !r1.error && !!r1.data);
  if (r1.data) tenants.push(r1.data);

  const r2 = await admin.rpc('provision_tenant_and_bind', { p_user_id: u1, p_name: 'dup', p_slug: `${slug}-x`, p_event_id: ev });
  check('duplicate event_id rejected with 23505', r2.error?.code === '23505');

  const { count: c1 } = await admin.from('tenant_members').select('*', { count: 'exact', head: true }).eq('user_id', u1);
  check('user1 has exactly 1 membership (no duplicate tenant)', c1 === 1);

  const r3 = await admin.rpc('provision_tenant_and_bind', { p_user_id: u2, p_name: 'Idem Test 2', p_slug: slug, p_event_id: `${ev}_b` });
  check('colliding slug still provisions (self-heal)', !r3.error && !!r3.data);
  if (r3.data) tenants.push(r3.data);

  const { data: trows } = await admin.from('tenants').select('id,slug,is_sandbox').in('id', tenants);
  const slugs = (trows || []).map(t => t.slug);
  check('the two tenants got different slugs', new Set(slugs).size === slugs.length);
  console.log('   slugs:', slugs);
  const sbRow = (trows || []).find(t => t.id === r1.data);
  check('p_is_sandbox:true → tenant.is_sandbox === true', sbRow?.is_sandbox === true);
} catch (e) { console.error('ERROR', e); pass = false; }
finally {
  if (tenants.length) { await admin.from('tenant_members').delete().in('tenant_id', tenants); await admin.from('tenants').delete().in('id', tenants); }
  await admin.from('stripe_events').delete().in('event_id', events);
  for (const id of users) { await admin.from('user_profiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id); }
  console.log(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
}
