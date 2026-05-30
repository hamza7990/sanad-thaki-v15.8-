const Permissions = Object.freeze({
  USERS_MANAGE: "USERS_MANAGE",
  COMPANY_SETTINGS_MANAGE: "COMPANY_SETTINGS_MANAGE",
  INVOICE_CREATE: "INVOICE_CREATE",
  INVOICE_SUBMIT_REVIEW: "INVOICE_SUBMIT_REVIEW",
  INVOICE_APPROVE: "INVOICE_APPROVE",
  INVOICE_READ: "INVOICE_READ",
  WHATSAPP_SEND_APPROVED: "WHATSAPP_SEND_APPROVED",
  BANK_MANAGE: "BANK_MANAGE",
  MATCH_READ: "MATCH_READ",
  MATCH_APPROVE: "MATCH_APPROVE",
  REPORTS_READ: "REPORTS_READ",
  REPORTS_EXPORT: "REPORTS_EXPORT",
  SUPPORT_SUBMIT: "SUPPORT_SUBMIT",
  SUPPORT_MANAGE: "SUPPORT_MANAGE",
  AUDIT_READ: "AUDIT_READ",
  PLATFORM_DASHBOARD: "PLATFORM_DASHBOARD",
  PLATFORM_COMPANIES_MANAGE: "PLATFORM_COMPANIES_MANAGE",
  PLATFORM_SUPPORT_MANAGE: "PLATFORM_SUPPORT_MANAGE",
  PLATFORM_SECURITY_READ: "PLATFORM_SECURITY_READ",
  PLATFORM_SECURITY_MANAGE: "PLATFORM_SECURITY_MANAGE",
  PLATFORM_TENANT_PROVISION_MANAGE: "PLATFORM_TENANT_PROVISION_MANAGE",
  INTEGRATIONS_MANAGE: "INTEGRATIONS_MANAGE"
});

const rolePermissions = {
  SANAD_ADMIN: [
    Permissions.PLATFORM_DASHBOARD,
    Permissions.PLATFORM_COMPANIES_MANAGE,
    Permissions.PLATFORM_SUPPORT_MANAGE,
    Permissions.PLATFORM_SECURITY_READ,
    Permissions.PLATFORM_SECURITY_MANAGE,
    Permissions.PLATFORM_TENANT_PROVISION_MANAGE
  ],
  OWNER: [
    Permissions.USERS_MANAGE,
    Permissions.COMPANY_SETTINGS_MANAGE,
    Permissions.INVOICE_CREATE,
    Permissions.INVOICE_SUBMIT_REVIEW,
    Permissions.INVOICE_APPROVE,
    Permissions.INVOICE_READ,
    Permissions.WHATSAPP_SEND_APPROVED,
    Permissions.BANK_MANAGE,
    Permissions.MATCH_READ,
    Permissions.MATCH_APPROVE,
    Permissions.REPORTS_READ,
    Permissions.REPORTS_EXPORT,
    Permissions.SUPPORT_SUBMIT,
    Permissions.SUPPORT_MANAGE,
    Permissions.AUDIT_READ,
    Permissions.INTEGRATIONS_MANAGE
  ],
  ADMIN: [
    Permissions.USERS_MANAGE,
    Permissions.COMPANY_SETTINGS_MANAGE,
    Permissions.INVOICE_READ,
    Permissions.REPORTS_READ,
    Permissions.REPORTS_EXPORT,
    Permissions.SUPPORT_SUBMIT,
    Permissions.SUPPORT_MANAGE,
    Permissions.AUDIT_READ,
    Permissions.INTEGRATIONS_MANAGE
  ],
  MEMBER: [
    Permissions.INVOICE_CREATE,
    Permissions.INVOICE_SUBMIT_REVIEW,
    Permissions.INVOICE_READ,
    Permissions.SUPPORT_SUBMIT
  ],
  FINANCE_MANAGER: [
    Permissions.INVOICE_READ,
    Permissions.INVOICE_APPROVE,
    Permissions.BANK_MANAGE,
    Permissions.MATCH_READ,
    Permissions.MATCH_APPROVE,
    Permissions.REPORTS_READ,
    Permissions.REPORTS_EXPORT,
    Permissions.SUPPORT_SUBMIT
  ],
  ACCOUNTANT: [
    Permissions.INVOICE_CREATE,
    Permissions.INVOICE_SUBMIT_REVIEW,
    Permissions.INVOICE_READ,
    Permissions.WHATSAPP_SEND_APPROVED,
    Permissions.SUPPORT_SUBMIT
  ]
};

function isPlatformPermission(permission) {
  return String(permission || "").startsWith("PLATFORM_");
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user?.mustChangePassword) {
      return res.status(403).json({
        code: "PASSWORD_CHANGE_REQUIRED",
        error: "يجب تغيير كلمة المرور قبل المتابعة."
      });
    }

    const platformPermission = isPlatformPermission(permission);
    if (platformPermission) {
      if (!req.isPlatformAdmin || req.authScope !== "PLATFORM" || req.companyId !== null) {
        return res.status(403).json({ code: "PLATFORM_SCOPE_REQUIRED", error: "هذا المسار مخصص لأدمن سند فقط" });
      }
    } else {
      if (req.isPlatformAdmin || req.authScope !== "TENANT" || !req.companyId) {
        return res.status(403).json({ code: "TENANT_SCOPE_REQUIRED", error: "هذا المسار مخصص لمستخدمي الشركة فقط" });
      }
    }

    const allowed = rolePermissions[req.user?.role] || [];
    if (!allowed.includes(permission)) {
      return res.status(403).json({ error: "لا تملك الصلاحية المطلوبة" });
    }
    next();
  };
}

module.exports = { Permissions, requirePermission, rolePermissions, isPlatformPermission };
