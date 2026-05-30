const { redactSecrets } = require("./secure-logger");

async function writeAudit(client, req, action, entityType, entityId, metadata = {}) {
  await client.query(
    `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      req.companyId,
      req.user?.id || null,
      action,
      entityType,
      entityId || null,
      JSON.stringify(redactSecrets(metadata))
    ]
  );
}

async function writePlatformAudit(client, req, action, entityType, entityId, metadata = {}) {
  await client.query(
    `INSERT INTO platform_audit_logs (user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      req.user?.id || null,
      action,
      entityType,
      entityId || null,
      JSON.stringify(redactSecrets(metadata))
    ]
  );
}

async function writeSecurityAuditTrail(client, req, eventType, entityType, entityId, metadata = {}, severity = "INFO") {
  const safeMetadata = redactSecrets(metadata || {});
  await client.query(
    `INSERT INTO security_audit_trail
       (company_id, actor_user_id, actor_role, event_type, entity_type, entity_id, severity, ip, user_agent, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      req.companyId || null,
      req.user?.id || null,
      req.user?.role || null,
      eventType,
      entityType || null,
      entityId ? String(entityId) : null,
      severity,
      req.ip || null,
      String(req.headers?.["user-agent"] || "").slice(0, 500) || null,
      JSON.stringify(safeMetadata)
    ]
  );
}

module.exports = { writeAudit, writePlatformAudit, writeSecurityAuditTrail };
