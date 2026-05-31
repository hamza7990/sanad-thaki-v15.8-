// ============================================================
// Sanad Thaki — API Service Layer
// Comprehensive HTTP client with typed endpoints
// ============================================================

import type {
  Invoice,
  BankTransaction,
  ReconciliationMatch,
  User,
  Company,
  AuditLog,
  Entitlements,
  WhatsAppSettings,
  WhatsAppTemplate,
  WhatsAppMessage,
  SupportTicket,
  BankImport,
  BankMapping,
  AccountingConnector,
  AccountingMapping,
  SyncLog,
  PlatformOverview,
  BillingPlan,
  FinanceReport,
  TenantUsage,
  ProcessingJob,
  SecurityAuditEntry,
  DbNotification,
} from '@/types';

import type {
  LoginRequest,
  LoginResponse,
  ProfileResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
  InvoiceListParams,
  PaginatedResponse,
  InvoiceCreateRequest,
  InvoiceUpdateRequest,
  CollectionStatusRequest,
  BatchInvoiceRequest,
  CreateUserRequest,
  UpdateUserStatusRequest,
  UpdateCompanyRequest,
  CreateBankTransactionRequest,
  UpdateWhatsAppSettingsRequest,
  UpdateWhatsAppTemplatesRequest,
  ReportFilters,
  CreateTicketRequest,
  CreateCompanyRequest,
  TicketResponseRequest,
  SaveAccountingMappingRequest,
} from '@/types/api';

// ============================================================
// Base URL
// ============================================================

const BASE_URL = '/api';

// ============================================================
// ApiError — Structured error with status, code, field details
// ============================================================

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ============================================================
// HTTP Helpers
// ============================================================

/**
 * Generic JSON HTTP helper. Throws ApiError on non-2xx responses.
 */
async function http<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(
      errorBody.error || `HTTP ${response.status}`,
      response.status,
      errorBody.code,
      errorBody.details,
    );
  }

  // Handle 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

/**
 * FormData upload helper (no Content-Type header — browser sets boundary).
 */
async function httpFormData<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => ({ error: 'Upload failed' }));
    throw new ApiError(
      errorBody.error || `HTTP ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Blob download helper (for file exports).
 */
async function httpBlob(path: string): Promise<Blob> {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError('Export failed', response.status);
  }

  return response.blob();
}

// ============================================================
// Query-string builder
// ============================================================

function toQueryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return '';
  const qs = entries
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join('&');
  return `?${qs}`;
}

// ============================================================
// API Service — All endpoints
// ============================================================

export const apiService = {
  // ── Auth ─────────────────────────────────────────────────────

  login(email: string, password: string) {
    return http<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password } satisfies LoginRequest),
    });
  },

  signup(companyName: string, name: string, email: string, password: string) {
    return http<LoginResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ companyName, name, email, password }),
    });
  },

  logout() {
    return http<void>('/auth/logout', { method: 'POST' });
  },

  getProfile() {
    return http<ProfileResponse>('/me');
  },

  forgotPassword(email: string) {
    return http<void>('/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email } satisfies ForgotPasswordRequest),
    });
  },

  resetPassword(email: string, code: string, newPassword: string) {
    return http<void>('/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword } satisfies ResetPasswordRequest),
    });
  },

  changePassword(currentPassword: string, newPassword: string) {
    return http<void>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword } satisfies ChangePasswordRequest),
    });
  },

  // ── Company ──────────────────────────────────────────────────

  async getCompany() {
    const res = await http<{ company: Company; entitlements: unknown }>('/company');
    return res.company;
  },

  async updateCompany(data: UpdateCompanyRequest) {
    const res = await http<{ company: Company }>('/company', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.company;
  },

  // ── Users ────────────────────────────────────────────────────

  async getUsers() {
    const res = await http<{ users: User[] }>('/users');
    return res.users ?? [];
  },

  createUser(data: CreateUserRequest) {
    return http<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  resetUserInvite(userId: string) {
    return http<void>(`/users/${userId}/reset-invite`, { method: 'POST' });
  },

  updateUserStatus(userId: string, status: UpdateUserStatusRequest['status']) {
    return http<User>(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status } satisfies UpdateUserStatusRequest),
    });
  },

  archiveUser(userId: string) {
    return http<void>(`/users/${userId}/archive`, { method: 'PATCH' });
  },

  // ── Invoices ─────────────────────────────────────────────────

  async getInvoices(params?: InvoiceListParams) {
    const qs = params ? toQueryString(params as Record<string, unknown>) : '';
    const res = await http<{ invoices: Invoice[] }>(`/invoices${qs}`);
    // Backend returns { invoices: [...] } – normalise to PaginatedResponse shape
    const invoices = res.invoices ?? [];
    return {
      data: invoices,
      total: invoices.length,
      page: 1,
      pageSize: invoices.length,
      totalPages: 1,
    } as PaginatedResponse<Invoice>;
  },

  async getInvoice(id: string) {
    const res = await http<{ invoice: Invoice }>(`/invoices/${id}`);
    return res.invoice;
  },

  async createInvoice(data: InvoiceCreateRequest) {
    const res = await http<{ invoice: Invoice }>('/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.invoice;
  },

  async updateInvoice(id: string, data: InvoiceUpdateRequest) {
    const res = await http<{ invoice: Invoice }>(`/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.invoice;
  },

  async submitForReview(id: string) {
    const res = await http<{ invoice: Invoice }>(`/invoices/${id}/submit-review`, { method: 'POST' });
    return res.invoice;
  },

  async approveInvoice(id: string) {
    const res = await http<{ invoice: Invoice }>(`/invoices/${id}/approve`, { method: 'POST' });
    return res.invoice;
  },

  async setCollectionStatus(
    id: string,
    status: CollectionStatusRequest['status'],
    promisedDate?: string,
    disputeReason?: string,
  ) {
    const res = await http<{ invoice: Invoice }>(`/invoices/${id}/collection-status`, {
      method: 'POST',
      body: JSON.stringify({ status, promisedDate, disputeReason } satisfies CollectionStatusRequest),
    });
    return res.invoice;
  },

  uploadInvoiceFile(file: File) {
    return new Promise<{ jobId: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const res = await http<{ jobId: string }>('/invoices/read-file', {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type,
              dataUrl: dataUrl
            })
          });
          resolve(res);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  },

  getProcessingJobs() {
    return http<{ jobs: ProcessingJob[] }>('/invoices/jobs').then(res => res.jobs ?? []);
  },

  getProcessingJob(jobId: string) {
    return http<{ job: ProcessingJob }>(`/invoices/jobs/${jobId}`).then(res => res.job);
  },

  createBatchInvoices(invoices: InvoiceCreateRequest[]) {
    return http<Invoice[]>('/invoices/batch', {
      method: 'POST',
      body: JSON.stringify({ invoices } satisfies BatchInvoiceRequest),
    });
  },

  sendWhatsApp(invoiceId: string) {
    return http<void>(`/invoices/${invoiceId}/whatsapp/send`, {
      method: 'POST',
    });
  },

  // ── Bank ─────────────────────────────────────────────────────

  async getBankTransactions() {
    const res = await http<{ transactions: BankTransaction[] } | BankTransaction[]>('/bank/transactions');
    return Array.isArray(res) ? res : ((res as any).transactions ?? []);
  },

  createBankTransaction(data: CreateBankTransactionRequest) {
    return http<BankTransaction>('/bank/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  uploadBankStatement(file: File, bankKey?: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (bankKey) formData.append('bankKey', bankKey);
    return httpFormData<BankImport>('/bank/statement/upload', formData);
  },

  async getBankImports() {
    const res = await http<{ imports: BankImport[] }>('/bank/statement/imports');
    return res.imports ?? [];
  },

  async getBankMapping() {
    const res = await http<{ mappings: BankMapping[] }>('/bank/mapping');
    return res.mappings ?? [];
  },

  saveBankMapping(bankKey: string, mapping: Omit<BankMapping, 'bankKey'>) {
    return http<BankMapping>(`/bank/mapping/${bankKey}`, {
      method: 'PUT',
      body: JSON.stringify(mapping),
    });
  },

  // ── Matches ──────────────────────────────────────────────────

  async getMatches() {
    const res = await http<{ matches: ReconciliationMatch[] }>('/matches');
    return res.matches ?? [];
  },

  runMatching() {
    return http<{ matchesFound: number }>('/matches/run', { method: 'POST' });
  },

  approveMatch(id: string) {
    return http<ReconciliationMatch>(`/matches/${id}/approve`, {
      method: 'POST',
    });
  },

  rejectMatch(id: string) {
    return http<ReconciliationMatch>(`/matches/${id}/reject`, {
      method: 'POST',
    });
  },

  // ── WhatsApp ─────────────────────────────────────────────────

  getWhatsAppSettings() {
    // Returns { settings: {...}, templates: [...] }
    return http<{ settings: WhatsAppSettings; templates: WhatsAppTemplate[] }>('/whatsapp/settings');
  },

  updateWhatsAppSettings(data: UpdateWhatsAppSettingsRequest) {
    return http<WhatsAppSettings>('/whatsapp/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  updateWhatsAppTemplates(data: UpdateWhatsAppTemplatesRequest) {
    return http<WhatsAppTemplate[]>('/whatsapp/templates', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getWhatsAppMessages() {
    const res = await http<{ messages: WhatsAppMessage[] }>('/whatsapp/messages');
    return res.messages ?? [];
  },

  // ── Reports ──────────────────────────────────────────────────

  getFinanceReport(filters?: ReportFilters) {
    const qs = filters ? toQueryString(filters as Record<string, unknown>) : '';
    return http<FinanceReport>(`/reports/finance${qs}`);
  },

  exportReport(format: 'pdf' | 'csv' | 'xlsx', filters?: ReportFilters) {
    const params: Record<string, unknown> = { format, ...filters };
    const qs = toQueryString(params);
    return httpBlob(`/reports/finance/export${qs}`);
  },

  getTenantUsage() {
    return http<{ companyId: string; period: string; usage: Array<{ metric: string; quantity: number }> }>('/tenant/usage');
  },

  // ── Support ──────────────────────────────────────────────────

  async getTickets() {
    const res = await http<{ tickets: SupportTicket[] }>('/support/tickets');
    return res.tickets ?? [];
  },

  createTicket(data: CreateTicketRequest) {
    return http<SupportTicket>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // ── Audit ────────────────────────────────────────────────────

  getAuditLogs() {
    return http<{ auditLogs: AuditLog[] }>('/audit-logs');
  },

  getSecurityAuditTrail() {
    return http<{ securityAuditTrail: SecurityAuditEntry[] }>('/security-audit-trail');
  },

  getNotifications() {
    return http<{ notifications: DbNotification[] }>('/notifications');
  },

  markNotificationRead(id: string) {
    return http<void>(`/notifications/${id}/read`, { method: 'POST' });
  },

  // ── Integrations ─────────────────────────────────────────────

  async getAccountingConnectors() {
    const res = await http<{ connectors: AccountingConnector[] }>('/integrations/accounting/connectors');
    return res.connectors ?? [];
  },

  getAccountingMapping() {
    return http<AccountingMapping>('/integrations/accounting/mapping');
  },

  saveAccountingMapping(data: SaveAccountingMappingRequest) {
    return http<AccountingMapping>('/integrations/accounting/mapping', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  uploadAccountingImport(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return httpFormData<{ importId: string }>(
      '/integrations/accounting/imports/upload',
      formData,
    );
  },

  async getSyncLogs() {
    const res = await http<{ logs: SyncLog[] }>('/integrations/accounting/sync-logs');
    return res.logs ?? [];
  },

  generateApiKey() {
    return http<{ apiKey: string }>('/integrations/api-keys', {
      method: 'POST',
    });
  },

  // ── Platform (SANAD_ADMIN) ───────────────────────────────────

  async getPlatformOverview() {
    const res = await http<{ overview: PlatformOverview }>('/platform/overview');
    return res.overview ?? res as unknown as PlatformOverview;
  },

  async getPlatformCompanies() {
    const res = await http<{ companies: Company[] }>('/platform/companies');
    return res.companies ?? [];
  },

  createPlatformCompany(data: CreateCompanyRequest) {
    return http<Company>('/platform/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  updateCompanyStatus(companyId: string, status: string) {
    return http<Company>(`/platform/companies/${companyId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  rotateCompanyKey(companyId: string, confirmation: string) {
    return http<{ ok: boolean; rotation: unknown }>(`/platform/companies/${companyId}/rotate-key`, {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    });
  },

  reprovisionCompany(companyId: string, confirmation: string) {
    return http<{ ok: boolean; companyId: string; provisioning: unknown }>(`/platform/companies/${companyId}/reprovision`, {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    });
  },

  async getPlatformTickets() {
    const res = await http<{ tickets: SupportTicket[] }>('/platform/support/tickets');
    return res.tickets ?? [];
  },

  respondToTicket(ticketId: string, response: string) {
    return http<SupportTicket>(
      `/platform/support/tickets/${ticketId}/response`,
      {
        method: 'PATCH',
        body: JSON.stringify({ response } satisfies TicketResponseRequest),
      },
    );
  },

  getPlatformSecurityLogs() {
    // Backend returns { platformLogs: [...], clientAuditSummary: [...] }
    return http<{ platformLogs: SecurityAuditEntry[]; clientAuditSummary: SecurityAuditEntry[] }>('/platform/security/logs');
  },

  // ── Billing ──────────────────────────────────────────────────

  async getPlans() {
    const res = await http<{ plans: BillingPlan[] } | BillingPlan[]>('/billing/plans');
    return Array.isArray(res) ? res : ((res as any).plans ?? []);
  },

  upgradePlan(planCode: string) {
    return http<{ company: Company; entitlements: Entitlements }>('/company/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify({ planCode }),
    });
  },
} as const;
