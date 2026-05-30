import pg from 'pg';

const ctrl = new pg.Client({ connectionString: 'postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable' });
await ctrl.connect();
await ctrl.query("SELECT set_config('app.platform_admin','1',true)");
const r = await ctrl.query("SELECT * FROM user_directory WHERE email_lower IN ('owner@sanadthaki.com','admin@sanadthaki.com','finance@sanadthaki.com')");
console.log('user_directory:', JSON.stringify(r.rows, null, 2));
await ctrl.end();

const tenant = new pg.Client({ connectionString: 'postgres://postgres:123456@127.0.0.1:5432/sanad_company_demo_local?sslmode=disable' });
await tenant.connect();
await tenant.query("SELECT set_config('app.company_id','company-demo-local',true)");
const u = await tenant.query("SELECT id, email, role, is_active, user_status FROM app_users");
console.log('app_users:', JSON.stringify(u.rows, null, 2));
const s = await tenant.query("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='auth_sessions_scope_check'");
console.log('auth_sessions constraint:', s.rows[0]?.pg_get_constraintdef);
await tenant.end();
