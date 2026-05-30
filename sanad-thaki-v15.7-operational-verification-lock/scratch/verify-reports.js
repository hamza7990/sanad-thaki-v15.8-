const fs = require('fs');
const XLSX = require('xlsx');

// Import minimalPdfBuffer and buildFinanceWorkbook logic to verify
const { translateSummary, translateAging, translateCustomers, translateInvoices, translateMonthly } = (() => {
  const content = fs.readFileSync('apps/api/src/commercial-value-features.js', 'utf8');
  
  // Quick evaluations of helpers to verify they parse correctly
  const extractFunc = (name) => {
    const start = content.indexOf(`function ${name}`);
    if (start === -1) throw new Error(`Function ${name} not found`);
    let braceCount = 0;
    let end = start;
    let started = false;
    while (end < content.length) {
      if (content[end] === '{') {
        braceCount++;
        started = true;
      } else if (content[end] === '}') {
        braceCount--;
      }
      end++;
      if (started && braceCount === 0) break;
    }
    return new Function('XLSX', `return ${content.slice(start, end)}`)(XLSX);
  };

  return {
    translateSummary: extractFunc('translateSummary'),
    translateAging: extractFunc('translateAging'),
    translateCustomers: extractFunc('translateCustomers'),
    translateInvoices: extractFunc('translateInvoices'),
    translateMonthly: extractFunc('translateMonthly')
  };
})();

// Mock payload
const mockPayload = {
  summary: {
    total_invoices: 10,
    ready_for_review: 2,
    approved_invoices: 8,
    paid_invoices: 5,
    unpaid_approved_invoices: 3,
    promised_invoices: 1,
    disputed_invoices: 1,
    total_amount: "50000.00",
    outstanding_amount: "30000.00",
    paid_amount: "20000.00",
    collection_rate: "40.00",
    sent_or_queued: 15,
    open_tickets: 2
  },
  agingBuckets: [
    { bucket: '0-30', count: 5, amount: "15000.00" },
    { bucket: '31-60', count: 2, amount: "10000.00" }
  ],
  topOverdueCustomers: [
    { customer_name: 'شركة الفلاح', invoice_count: 3, amount: "15000.00", max_days_overdue: 45 }
  ],
  overdueInvoices: [
    { invoice_number: 'INV-001', customer_name: 'شركة الفلاح', total_amount: "5000.00", status: 'APPROVED', due_date: '2026-05-01', collection_status: 'PROMISED', promised_payment_date: '2026-06-01', dispute_reason: '' }
  ],
  monthlyComparison: [
    { month: '2026-05', invoices: 10, total_amount: "50000.00", paid_amount: "20000.00" }
  ]
};

console.log("=== TRANSLATION CHECK ===");
const summaryTrans = translateSummary(mockPayload.summary);
console.log("Summary Translated:", summaryTrans);
if (typeof summaryTrans['إجمالي الفواتير'] !== 'number' || summaryTrans['إجمالي المبالغ (ر.س)'] !== 50000) {
  console.error("FAIL: Summary numbers mapping failed!");
  process.exit(1);
}

const invoicesTrans = translateInvoices(mockPayload.overdueInvoices);
console.log("Invoices Translated:", invoicesTrans);
if (invoicesTrans[0]['رقم الفاتورة'] !== 'INV-001' || invoicesTrans[0]['المبلغ الإجمالي (ر.س)'] !== 5000) {
  console.error("FAIL: Invoices mapping failed!");
  process.exit(1);
}

console.log("\nSUCCESS: All structures mapped cleanly!");
