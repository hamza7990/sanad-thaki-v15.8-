// ─── Type Aliases / Enums ────────────────────────────────────────────────────

export type UserRole = 'SANAD_ADMIN' | 'OWNER' | 'ADMIN' | 'MEMBER' | 'FINANCE_MANAGER' | 'ACCOUNTANT';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export type InvoiceStatus =
  | 'DRAFT'
  | 'NEEDS_REVIEW'
  | 'READY_FOR_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID';

export type CollectionStatus = 'NORMAL' | 'PROMISED' | 'DISPUTED';
export type BankTransactionStatus = 'UNMATCHED' | 'MATCHED';
export type MatchStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type WhatsAppStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type ReminderStage = 'FIRST' | 'SECOND' | 'FINAL';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'CLOSED';

export type CompanyStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
export type PackageCode = 'basic' | 'growth' | 'professional';

export type Theme = 'light' | 'dark' | 'system';
export type Locale = 'ar' | 'en';

// ─── Domain Interfaces ──────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId?: string;
  status: UserStatus;
  passwordMustChange?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface Company {
  id: string;
  name: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  defaultCurrency: string;
  status: CompanyStatus;
  packageCode: PackageCode;
  invoiceMonthlyLimit: number;
  whatsappMonthlyLimit: number;
  isActive: boolean;
}

export interface Entitlements {
  code: string;
  label: string;
  priceSar: number;
  marketing: string;
  invoiceMonthlyLimit: number;
  whatsappMonthlyLimit: number;
  userLimit: number;
  roleSeatLimits: Record<string, number>;
  features: {
    whatsapp: boolean;
    bankMatching: boolean;
    advancedReports: boolean;
    exports: boolean;
    prioritySupport: boolean;
  };
}

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string;
  customerName: string;
  supplierTaxNumber?: string;
  totalAmount: number;
  vatAmount?: number;
  customerPhone?: string;
  invoiceDate?: string;
  dueDate?: string;
  status: InvoiceStatus;
  collectionStatus: CollectionStatus;
  promisedPaymentDate?: string;
  disputeReason?: string;
  lockedForReview?: boolean;
  lockedAt?: string;
  lockedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  sourceSystem?: string;
  externalSource?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface InvoiceProcessingJob {
  id: string;
  companyId: string;
  fileName: string;
  mimeType: string;
  status: 'QUEUED' | 'PROCESSING' | 'PASSED' | 'PENDING_REVIEW' | 'FAILED';
  confidence?: number;
  extractedJson?: Record<string, unknown>;
  reviewReasons?: string[];
  errorMessage?: string;
  attempts: number;
  createdAt: string;
  processingStartedAt?: string;
  processingFinishedAt?: string;
}

export interface BankTransaction {
  id: string;
  companyId: string;
  transactionDate: string;
  description: string;
  amount: number;
  reference?: string;
  status: BankTransactionStatus;
  importBatchId?: string;
  createdAt: string;
}

export interface ReconciliationMatch {
  id: string;
  companyId: string;
  invoiceId: string;
  bankTransactionId: string;
  score: number;
  status: MatchStatus;
  approvedAt?: string;
  approvedBy?: string;
  invoice?: Invoice;
  bankTransaction?: BankTransaction;
}

export interface BankStatementImport {
  id: string;
  companyId: string;
  bankKey: string;
  originalFilename: string;
  fileType: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  status: string;
  createdAt: string;
  completedAt?: string;
}

export interface WhatsAppMessage {
  id: string;
  companyId: string;
  invoiceId: string;
  sentBy: string;
  message?: string;
  toPhone: string;
  reminderStage: ReminderStage;
  status: WhatsAppStatus;
  deliveryStatus?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedReason?: string;
  createdAt: string;
}

export interface WhatsAppTemplate {
  id: string;
  companyId: string;
  reminderStage: ReminderStage;
  metaTemplateName: string;
  language: string;
  bodyPreview: string;
  metaStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  isActive: boolean;
}

export interface SupportTicket {
  id: string;
  companyId: string;
  createdBy: string;
  category: string;
  priority: string;
  description: string;
  status: TicketStatus;
  supportResponse?: string;
  createdAt: string;
  respondedAt?: string;
  closedAt?: string;
}

export interface AuditLog {
  id: string;
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface FinanceReport {
  summary: {
    totalInvoices: number;
    readyForReview: number;
    approved: number;
    paid: number;
    outstandingAmount: number;
    paidAmount: number;
    collectionRate: number;
  };
  aging: {
    '0_30': { count: number; amount: number };
    '31_60': { count: number; amount: number };
    '61_90': { count: number; amount: number };
    '90_plus': { count: number; amount: number };
  };
  topOverdueCustomers: Array<{
    customerName: string;
    totalAmount: number;
    overdueAmount: number;
    invoiceCount: number;
  }>;
  monthlyComparison: Array<{
    month: string;
    invoicesCreated: number;
    totalAmount: number;
    paidAmount: number;
  }>;
}

// ─── WhatsApp Settings ──────────────────────────────────────────────────────

export interface WhatsAppSettings {
  id: string;
  companyId: string;
  providerName?: string;
  apiKey?: string;
  phoneNumber?: string;
  webhookUrl?: string;
  enabled: boolean;
  monthlyLimit: number;
  usedThisMonth: number;
}

// ─── Bank Imports & Mapping ─────────────────────────────────────────────────

export interface BankImport {
  id: string;
  companyId: string;
  bankKey: string;
  originalFilename: string;
  fileType: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  status: string;
  createdAt: string;
  completedAt?: string;
}

export interface BankMapping {
  bankKey: string;
  dateColumn: string;
  amountColumn: string;
  descriptionColumn: string;
  referenceColumn: string;
}

// ─── Integrations ───────────────────────────────────────────────────────────

export interface AccountingConnector {
  id: string;
  name: string;
  description: string;
  status: 'CONNECTED' | 'NOT_CONNECTED';
  connectedAt?: string;
}

export interface AccountingMapping {
  connectorId: string;
  mappings: Array<{
    sourceField: string;
    targetField: string;
  }>;
}

export interface SyncLog {
  id: string;
  connectorId: string;
  direction: 'IMPORT' | 'EXPORT';
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  recordsProcessed: number;
  recordsFailed: number;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

// ─── Billing ────────────────────────────────────────────────────────────────

export interface BillingPlan {
  code: PackageCode;
  label: string;
  priceSar: number;
  marketing: string;
  invoiceMonthlyLimit: number;
  whatsappMonthlyLimit: number;
  userLimit: number;
  roleSeatLimits: Record<string, number>;
  features: {
    whatsapp: boolean;
    bankMatching: boolean;
    advancedReports: boolean;
    exports: boolean;
    prioritySupport: boolean;
  };
}

// ─── Tenant Usage ───────────────────────────────────────────────────────────

export interface TenantUsage {
  invoicesUsed: number;
  invoicesLimit: number;
  whatsappUsed: number;
  whatsappLimit: number;
  usersUsed: number;
  usersLimit: number;
}

// ─── Processing Job ─────────────────────────────────────────────────────────

export interface ProcessingJob {
  id: string;
  companyId: string;
  fileName: string;
  mimeType: string;
  status: 'QUEUED' | 'PROCESSING' | 'PASSED' | 'PENDING_REVIEW' | 'FAILED';
  confidence?: number;
  extractedJson?: Record<string, unknown>;
  reviewReasons?: string[];
  errorMessage?: string;
  attempts: number;
  createdAt: string;
  processingStartedAt?: string;
  processingFinishedAt?: string;
}

// ─── Security Audit ─────────────────────────────────────────────────────────

export interface SecurityAuditEntry {
  id: string;
  companyId: string;
  userId: string;
  action: string;
  ipAddress: string;
  userAgent?: string;
  resource?: string;
  result: 'SUCCESS' | 'FAILURE';
  createdAt: string;
}

// ─── Platform (SANAD_ADMIN) ──────────────────────────────────────────────────

export interface PlatformOverview {
  totalCompanies: number;
  activeCompanies: number;
  totalInvoices: number;
  totalWhatsappMessages: number;
  openTickets: number;
}

// ─── API Response Wrappers ───────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}

// ─── Notification ────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

export interface DbNotification {
  id: string;
  companyId: string;
  userId?: string;
  title: string;
  message?: string;
  type: 'success' | 'error' | 'warning' | 'info';
  is_read: boolean;
  createdAt: string;
}
