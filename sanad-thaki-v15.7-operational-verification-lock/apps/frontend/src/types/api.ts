// Sanad Thaki — API Request & Response Types

import type {
  User,
  Company,
  Entitlements,
  Invoice,
  CollectionStatus,
  UserStatus,
} from '@/types';

// ============================================================
// Auth
// ============================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  company: Company | null;
  companies: Company[];
  entitlements: Entitlements | null;
  token?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ProfileResponse {
  user: User;
  company: Company | null;
  companies: Company[];
  entitlements: Entitlements | null;
}

// ============================================================
// Invoices
// ============================================================

export interface InvoiceListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InvoiceCreateRequest {
  invoiceNumber: string;
  customerName: string;
  supplierTaxNumber: string;
  totalAmount: number;
  vatAmount?: number;
  customerPhone?: string;
  invoiceDate?: string;
  dueDate?: string;
}

export interface InvoiceUpdateRequest extends Partial<InvoiceCreateRequest> {
  status?: Invoice['status'];
}

export interface CollectionStatusRequest {
  status: CollectionStatus;
  promisedDate?: string;
  disputeReason?: string;
}

export interface BatchInvoiceRequest {
  invoices: InvoiceCreateRequest[];
}

export interface UploadFileResponse {
  jobId: string;
}

// ============================================================
// Users
// ============================================================

export interface CreateUserRequest {
  email: string;
  name: string;
  role: User['role'];
  password?: string;
}

export interface UpdateUserStatusRequest {
  status: UserStatus;
}

// ============================================================
// Company
// ============================================================

export interface UpdateCompanyRequest {
  name?: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  defaultCurrency?: string;
}

// ============================================================
// Bank
// ============================================================

export interface CreateBankTransactionRequest {
  bankName: string;
  amount: number;
  transactionDate: string;
  description?: string;
  reference?: string;
}

// ============================================================
// WhatsApp
// ============================================================

export interface UpdateWhatsAppSettingsRequest {
  enabled: boolean;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
}

export interface UpdateWhatsAppTemplatesRequest {
  templates: Array<{
    name: string;
    language: string;
    body: string;
  }>;
}

// ============================================================
// Reports
// ============================================================

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  status?: string;
  vendorName?: string;
}

// ============================================================
// Support
// ============================================================

export interface CreateTicketRequest {
  category: string;
  subject: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

// ============================================================
// Platform
// ============================================================

export interface CreateCompanyRequest {
  name: string;
  taxNumber?: string;
  email?: string;
  city?: string;
  packageCode: 'basic' | 'growth' | 'professional';
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
  primaryUserEmail?: string;
  primaryUserPassword?: string;
  primaryUserRole?: 'ADMIN' | 'FINANCE_MANAGER' | 'ACCOUNTANT';
}

export interface TicketResponseRequest {
  response: string;
}

// ============================================================
// Integrations
// ============================================================

export interface SaveAccountingMappingRequest {
  connectorId: string;
  mappings: Array<{
    sourceField: string;
    targetField: string;
  }>;
}

// ============================================================
// Generic API Error Shape
// ============================================================

export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, string[]>;
}
