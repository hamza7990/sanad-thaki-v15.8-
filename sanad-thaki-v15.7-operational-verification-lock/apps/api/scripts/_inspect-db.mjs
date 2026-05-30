import pg from 'pg';

const tenant = new pg.Client({ connectionString: 'postgres://postgres:123456@127.0.0.1:5432/sanad_company_demo_local?sslmode=disable' });
await tenant.connect();
await tenant.query("SELECT set_config('app.company_id','company-demo-local',true)");

// List all tables
const tables = await tenant.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
console.log('=== TABLES ===');
tables.rows.forEach(r => console.log(' ', r.table_name));

// Check notifications table specifically
try {
  const notif = await tenant.query("SELECT column_name FROM information_schema.columns WHERE table_name='notifications' ORDER BY ordinal_position");
  console.log('\n=== notifications columns ===');
  notif.rows.forEach(r => console.log(' ', r.column_name));
} catch(e) { console.log('notifications table ERROR:', e.message); }

// Check security_audit_trail
try {
  const sat = await tenant.query("SELECT COUNT(*) FROM security_audit_trail");
  console.log('\nsecurity_audit_trail count:', sat.rows[0].count);
} catch(e) { console.log('security_audit_trail ERROR:', e.message); }

// Check tenant_usage_events 
try {
  const usage = await tenant.query("SELECT COUNT(*) FROM tenant_usage_events");
  console.log('tenant_usage_events count:', usage.rows[0].count);
} catch(e) { console.log('tenant_usage_events ERROR:', e.message); }

await tenant.end();
