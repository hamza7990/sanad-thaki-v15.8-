import pg from 'pg';

const urls = [
  process.env.CONTROL_URL || 'postgres://postgres:123456@127.0.0.1:5432/postgres?sslmode=disable',
  process.env.TENANT_URL  || 'postgres://postgres:123456@127.0.0.1:5432/sanad_company_demo_local?sslmode=disable'
];

const fixRoleConstraint = `
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('OWNER','ADMIN','MEMBER','FINANCE_MANAGER','ACCOUNTANT'));
`;

const fixSessionConstraint = `
ALTER TABLE auth_sessions DROP CONSTRAINT IF EXISTS auth_sessions_scope_check;
ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_scope_check CHECK (
  (user_type = 'PLATFORM' AND company_id IS NULL AND role = 'SANAD_ADMIN')
  OR
  (user_type = 'CLIENT' AND company_id IS NOT NULL AND role IN ('OWNER','ADMIN','MEMBER','FINANCE_MANAGER','ACCOUNTANT'))
);
`;

import bcrypt from 'bcryptjs';
const COMPANY_ID = 'company-demo-local';
const SHARED_PASSWORD = 'SanadThaki2024!';
const pwHash = await bcrypt.hash(SHARED_PASSWORD, 12);

const users = [
  { id: 'u-owner-001',     name: 'مالك الشركة',    email: 'owner@sanadthaki.com',           role: 'OWNER' },
  { id: 'u-admin-001',     name: 'مدير النظام',     email: 'admin@sanadthaki.com',           role: 'ADMIN' },
  { id: 'u-finance-001',   name: 'المدير المالي',   email: 'finance@sanadthaki.com',         role: 'FINANCE_MANAGER' },
  { id: 'u-accountant-001',name: 'المحاسب الرئيسي', email: 'accountant@sanadthaki.com',     role: 'ACCOUNTANT' },
  { id: 'u-member-001',    name: 'عضو الفريق',      email: 'member@sanadthaki.com',          role: 'MEMBER' },
];

// ── Fix control DB ─────────────────────────────────────────────────────────
console.log('\n🔧 Fixing control DB (postgres)...');
{
  const ctrl = new pg.Client({ connectionString: urls[0] });
  await ctrl.connect();
  try {
    await ctrl.query('BEGIN');
    await ctrl.query("SELECT set_config('app.platform_admin','1',true)");
    
    // Fix auth_sessions constraint
    await ctrl.query(fixSessionConstraint);
    console.log('  ✅ auth_sessions constraint fixed in control DB');
    
    // Clean expired sessions
    const del = await ctrl.query('DELETE FROM auth_sessions WHERE expires_at < now()');
    console.log(`  ✅ Deleted ${del.rowCount} expired sessions`);
    
    // Revoke all sessions (force re-login)
    const rev = await ctrl.query("UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL");
    console.log(`  ✅ Revoked ${rev.rowCount} active sessions`);
    
    // Upsert platform admin
    const platformHash = await bcrypt.hash(SHARED_PASSWORD, 12);
    await ctrl.query(`
      INSERT INTO platform_admins (id, email, password_hash, role, is_active)
      VALUES ('platform-admin-main', 'admin@sanadthaki.com', $1, 'SANAD_ADMIN', true)
      ON CONFLICT (id) DO UPDATE SET
        email='admin@sanadthaki.com', password_hash=$1, role='SANAD_ADMIN', is_active=true
    `, [platformHash]);
    console.log('  ✅ Platform admin: admin@sanadthaki.com');

    // Ensure company in control
    await ctrl.query(`
      INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
      VALUES ($1,'شركة سند ذكي التجريبية','300000000000003','demo@sanadthaki.com','الرياض','ACTIVE','professional',1200,800,true)
      ON CONFLICT (id) DO UPDATE SET status='ACTIVE', is_active=true, package_code='professional'
    `, [COMPANY_ID]);
    console.log('  ✅ Company in control DB');
    
    // Register all users in user_directory
    for (const u of users) {
      await ctrl.query(`
        INSERT INTO user_directory (email_lower, company_id, user_id, is_active)
        VALUES (lower($1), $2, $3, true)
        ON CONFLICT (email_lower) DO UPDATE SET company_id=$2, user_id=$3, is_active=true, updated_at=now()
      `, [u.email, COMPANY_ID, u.id]);
    }
    console.log(`  ✅ ${users.length} users registered in user_directory`);
    
    // Ensure tenant_registry
    await ctrl.query(`
      INSERT INTO tenant_registry (company_id, db_secret_ref, kms_secret_ref, provision_status, schema_version)
      VALUES ($1,'local','local','READY',26)
      ON CONFLICT (company_id) DO UPDATE SET provision_status='READY', schema_version=26, last_error=NULL, updated_at=now()
    `, [COMPANY_ID]);
    console.log('  ✅ tenant_registry READY');
    
    // Update rollup
    await ctrl.query(`
      INSERT INTO tenant_rollups (company_id, user_count)
      VALUES ($1, $2)
      ON CONFLICT (company_id) DO UPDATE SET user_count=$2, updated_at=now()
    `, [COMPANY_ID, users.length]);
    
    await ctrl.query('COMMIT');
  } catch(e) {
    await ctrl.query('ROLLBACK').catch(()=>{});
    console.error('  ❌ Control DB error:', e.message);
  } finally {
    await ctrl.end();
  }
}

// ── Fix tenant DB ─────────────────────────────────────────────────────────
console.log('\n🔧 Fixing tenant DB (sanad_company_demo_local)...');
{
  const tenant = new pg.Client({ connectionString: urls[1] });
  await tenant.connect();
  try {
    await tenant.query('BEGIN');
    await tenant.query("SELECT set_config('app.company_id','company-demo-local',true)");
    await tenant.query("SELECT set_config('app.current_company_id','company-demo-local',true)");
    
    // Fix role constraint
    await tenant.query(fixRoleConstraint);
    console.log('  ✅ app_users role constraint fixed');
    
    // Fix session constraint
    await tenant.query(fixSessionConstraint);
    console.log('  ✅ auth_sessions constraint fixed in tenant DB');
    
    // Clean sessions
    await tenant.query('DELETE FROM auth_sessions WHERE expires_at < now()');
    await tenant.query("UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL");
    console.log('  ✅ Sessions cleaned');
    
    // Ensure company row
    await tenant.query(`
      INSERT INTO companies (id, name, tax_number, email, city, status, package_code, invoice_monthly_limit, whatsapp_monthly_limit, is_active)
      VALUES ($1,'شركة سند ذكي التجريبية','300000000000003','demo@sanadthaki.com','الرياض','ACTIVE','professional',1200,800,true)
      ON CONFLICT (id) DO UPDATE SET status='ACTIVE', is_active=true
    `, [COMPANY_ID]);
    console.log('  ✅ Company row in tenant DB');
    
    // Seed all users
    for (const u of users) {
      await tenant.query(`
        INSERT INTO app_users (id, company_id, name, email, password_hash, role, is_active, user_status, password_must_change)
        VALUES ($1,$2,$3,$4,$5,$6,true,'ACTIVE',false)
        ON CONFLICT (email) DO UPDATE SET
          id=$1, name=$3, password_hash=$5, role=$6,
          is_active=true, user_status='ACTIVE', password_must_change=false
      `, [u.id, COMPANY_ID, u.name, u.email, pwHash, u.role]);
      console.log(`  ✅ [${u.role.padEnd(15)}] ${u.email}`);
    }
    
    await tenant.query('COMMIT');
  } catch(e) {
    await tenant.query('ROLLBACK').catch(()=>{});
    console.error('  ❌ Tenant DB error:', e.message);
  } finally {
    await tenant.end();
  }
}

console.log('\n' + '='.repeat(60));
console.log('🎉  DONE! Password for all accounts: ' + SHARED_PASSWORD);
console.log('='.repeat(60));
console.log('\n  PLATFORM ADMIN:');
console.log('    admin@sanadthaki.com');
console.log('\n  CLIENT USERS (company-demo-local):');
for (const u of users) {
  console.log(`    [${u.role.padEnd(15)}] ${u.email}`);
}
console.log('');
