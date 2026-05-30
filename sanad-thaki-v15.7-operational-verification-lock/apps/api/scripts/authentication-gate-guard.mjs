import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const auth = read('apps/api/src/auth.js');
const rbac = read('apps/api/src/rbac.js');
const server = read('apps/api/src/server.js');
const tenantRouter = read('apps/api/src/tenant-db-router.js');
const migrations = fs.readdirSync(path.join(root, 'apps/api/migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => read(`apps/api/migrations/${f}`))
  .join('\n');

const checks = [
  ['JWT is verified with strict algorithm, issuer, and audience', /jwt\.verify\(token, config\.JWT_SECRET, \{[\s\S]*algorithms: \["HS256"\][\s\S]*issuer: TOKEN_ISSUER[\s\S]*audience: TOKEN_AUDIENCE/.test(auth)],
  ['Strict payload shape enforces issuer, audience, subject, jwtid, exp and iat', /function assertStrictPayloadShape/.test(auth) && /payload\.iss !== TOKEN_ISSUER/.test(auth) && /payload\.aud !== TOKEN_AUDIENCE/.test(auth) && /payload\.sub !== String\(payload\.id\)/.test(auth) && /UUID_V4_RE\.test\(String\(payload\.jti/.test(auth) && /payload\.exp <= payload\.iat/.test(auth)],
  ['Tokens are issued with issuer, audience, subject and jwtid', /issuer: TOKEN_ISSUER/.test(auth) && /audience: TOKEN_AUDIENCE/.test(auth) && /subject: String\(user\.id\)/.test(auth) && /jwtid: randomUUID\(\)/.test(auth)],
  ['JWT IDs are hashed and registered server-side as live auth sessions', /function hashJwtId/.test(auth) && /CREATE TABLE IF NOT EXISTS auth_sessions/.test(migrations) && /jti_hash text NOT NULL UNIQUE/.test(migrations) && /registerAuthSession/.test(auth)],
  ['Every request validates live auth session and updates last_seen_at', /assertLiveAuthSession/.test(auth) && /SET last_seen_at=now\(\)/.test(auth) && /revoked_at IS NULL/.test(auth) && /expires_at > now\(\)/.test(auth)],
  ['Platform tokens cannot include company tenant or company_id spoof fields', /Platform admin token cannot include company tenant/.test(auth) && /payload\.companyId !== null/.test(auth) && /hasOwnProperty\.call\(payload, "company_id"\)/.test(auth)],
  ['Client tokens must include valid tenant and role', /CLIENT_ROLES/.test(auth) && /isValidTenantId/.test(auth) && /payload\.userType !== "CLIENT"/.test(auth)],
  ['Platform sessions are revalidated against platform_admins every request', /validatePlatformSession/.test(auth) && /FROM platform_admins/.test(auth) && /admin\.is_active/.test(auth) && /withPlatformScope/.test(auth)],
  ['Client sessions are revalidated inside withTenant every request', /validateClientSession/.test(auth) && /withTenant\(payload\.companyId/.test(auth) && /JOIN companies/.test(auth) && /u\.company_id=\$3/.test(auth)],
  ['authRequired sets explicit PLATFORM or TENANT scope', /req\.authScope = req\.isPlatformAdmin \? "PLATFORM" : "TENANT"/.test(auth)],
  ['tenantRequired, platformRequired and routeIsolationGuard middleware exist', /function tenantRequired/.test(auth) && /function platformRequired/.test(auth) && /function routeIsolationGuard/.test(auth)],
  ['Server installs absolute route isolation for /platform and /company', /app\.use\("\/platform", authRequired, routeIsolationGuard, platformRequired\)/.test(server) && /app\.use\("\/company", authRequired, routeIsolationGuard, tenantRequired\)/.test(server)],
  ['RBAC blocks platform permissions unless platform scope', /PLATFORM_SCOPE_REQUIRED/.test(rbac) && /isPlatformPermission/.test(rbac) && /req\.authScope !== "PLATFORM"/.test(rbac)],
  ['RBAC blocks tenant permissions for platform sessions', /TENANT_SCOPE_REQUIRED/.test(rbac) && /req\.authScope !== "TENANT"/.test(rbac)],
  ['Platform routes explicitly require platformRequired', /"\/platform\/overview"[\s\S]*authRequired,[\s\S]*platformRequired,[\s\S]*requirePermission\(Permissions\.PLATFORM_DASHBOARD\)/.test(server) && /"\/platform\/companies"[\s\S]*authRequired,[\s\S]*platformRequired/.test(server)],
  ['Company context route requires tenantRequired', /app\.get\("\/company", authRequired, tenantRequired/.test(server)],
  ['Tenant DB context sets both app.company_id and app.current_company_id', /set_config\('app\.company_id'/.test(tenantRouter) && /set_config\('app\.current_company_id'/.test(tenantRouter)],
  ['Security audit trail company_id is text and uses app.company_id', /ALTER TABLE security_audit_trail[\s\S]{0,140}ALTER COLUMN company_id TYPE text/.test(migrations) && /company_id = current_setting\('app\.company_id'/.test(migrations)],
  ['Auth sessions have RLS and scope constraint', /ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY/.test(migrations) && /FORCE ROW LEVEL SECURITY/.test(migrations) && /auth_sessions_scope_check/.test(migrations)],
  ['Company active check is allowed during backend login lookup', /CREATE POLICY companies_login_lookup ON companies FOR SELECT/.test(migrations) && /app\.login_lookup/.test(migrations)],
  ['No client role contains platform dashboard permission', !/\n\s*ADMIN:\s*\[[^\]]*PLATFORM_DASHBOARD/.test(rbac) && !/\n\s*FINANCE_MANAGER:\s*\[[^\]]*PLATFORM_DASHBOARD/.test(rbac) && !/\n\s*ACCOUNTANT:\s*\[[^\]]*PLATFORM_DASHBOARD/.test(rbac)]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`AUTHENTICATION_GATE_FAILED: ${failed} issue(s).`);
  process.exit(1);
}
console.log('AUTHENTICATION_GATE_PASSED');
