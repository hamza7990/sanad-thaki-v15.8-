import pg from 'pg';

const tenantUrl = 'postgres://postgres:123456@127.0.0.1:5432/sanad_company_demo_local?sslmode=disable';
const client = new pg.Client({ connectionString: tenantUrl });
await client.connect();

// Apply notifications migration manually
console.log('Creating notifications table...');
await client.query("SELECT set_config('app.company_id', 'company-demo-local', true)");

await client.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id text,
    title text NOT NULL,
    message text,
    type text NOT NULL DEFAULT 'info' CHECK (type IN ('success','error','warning','info')),
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )
`);

await client.query(`ALTER TABLE notifications ENABLE ROW LEVEL SECURITY`);
await client.query(`ALTER TABLE notifications FORCE ROW LEVEL SECURITY`);

// Drop and recreate policy to avoid conflicts
await client.query(`DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications`);
await client.query(`
  CREATE POLICY notifications_tenant_isolation ON notifications
    FOR ALL USING (company_id = current_setting('app.company_id', true))
`);

console.log('✅ notifications table created');

// Insert some sample notifications
await client.query(`
  INSERT INTO notifications (company_id, user_id, title, message, type, is_read)
  VALUES
    ('company-demo-local', 'u-owner-001', 'مرحباً بك في سند ذكي', 'تم إعداد حسابك بنجاح. استكشف لوحة التحكم.', 'success', false),
    ('company-demo-local', 'u-owner-001', 'فاتورة جاهزة للمراجعة', 'تم رفع فاتورة جديدة وهي بانتظار المراجعة والاعتماد.', 'info', false),
    ('company-demo-local', NULL, 'تحديث النظام', 'تم تحديث النظام للإصدار v15.8 مع تحسينات في الأمان.', 'info', true)
  ON CONFLICT DO NOTHING
`);
console.log('✅ Sample notifications inserted');

await client.end();
console.log('\n✅ Done!');
