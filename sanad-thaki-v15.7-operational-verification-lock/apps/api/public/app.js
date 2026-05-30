const state = {
  token: "",
  user: null,
  company: null,
  view: "dashboard",
  data: {},
  entitlements: null
};

const roleLabel = {
  SANAD_ADMIN: "أدمن سند ذكي",
  ADMIN: "مدير النظام",
  FINANCE_MANAGER: "المدير المالي",
  ACCOUNTANT: "المحاسب"
};
const statusLabel = {
  DRAFT: "مسودة",
  NEEDS_REVIEW: "تحتاج مراجعة",
  READY_FOR_REVIEW: "جاهزة للمراجعة",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
  PAID: "مدفوعة",
  UNMATCHED: "غير مطابقة",
  MATCHED: "مطابقة",
  PENDING: "بانتظار القرار",
  QUEUED: "قيد الإرسال",
  SENT: "مرسلة",
  DELIVERED: "تم التسليم",
  READ: "مقروءة",
  FAILED: "فشلت"
};

function qs(id) { return document.getElementById(id); }
function money(v) { return `${Number(v || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال`; }
function fmtDate(v) { return v ? new Date(v).toLocaleString("ar-SA") : "-"; }
function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c])); }
function can(...roles) { return state.user && roles.includes(state.user.role); }
function isPlatformAdmin() { return state.user?.role === "SANAD_ADMIN"; }


// CSP-safe UI actions: no inline event attributes are generated anywhere.
// All clicks/submits/changes are routed through delegated addEventListener handlers.
const UI_CLICK_ACTIONS = Object.create(null);
const UI_SUBMIT_ACTIONS = Object.create(null);

function registerUiActions() {
  Object.assign(UI_CLICK_ACTIONS, {
    logout: () => logout(),
    loadView: el => loadView(el.dataset.view),
    setPlatformCompanyStatus: el => setPlatformCompanyStatus(el.dataset.id, el.dataset.status),
    setPlatformTicketStatus: el => setPlatformTicketStatus(el.dataset.id, el.dataset.status),
    toggleUser: el => toggleUser(el.dataset.id, el.dataset.active === "true"),
    resetInvite: el => resetInvite(el.dataset.id),
    archiveUser: el => archiveUser(el.dataset.id),
    readInvoiceFile: () => readInvoiceFile(),
    readInvoiceBatch: () => readInvoiceBatch(),
    saveBatchInvoices: () => saveBatchInvoices(),
    sendWhatsapp: el => sendWhatsapp(el.dataset.id),
    submitReview: el => submitReview(el.dataset.id),
    approveInvoice: el => approveInvoice(el.dataset.id),
    runMatching: () => runMatching(),
    approveMatch: el => approveMatch(el.dataset.id),
    rejectMatch: el => rejectMatch(el.dataset.id),
    showForgot: () => renderForgotPassword(),
    showLogin: () => renderLogin(),
    sendWhatsappStage: el => sendWhatsapp(el.dataset.id, el.dataset.stage),
    downloadFinanceExcel: () => { window.location.href = "/reports/finance/export?format=xlsx"; },
    downloadFinancePdf: () => { window.location.href = "/reports/finance/export?format=pdf"; }
  });
  Object.assign(UI_SUBMIT_ACTIONS, {
    loginSubmit,
    setupSubmit,
    changePasswordSubmit,
    addPlatformCompany,
    saveCompany,
    addUser,
    addInvoice,
    uploadBankStatement,
    saveBankMapping,
    forgotPasswordSubmit,
    resetPasswordSubmit,
    addBank,
    addTicket,
    saveWhatsappSettings,
    saveWhatsappTemplates,
    uploadAccountingInvoices,
    saveAccountingMapping
  });
}

function installCspSafeUiHandlers() {
  registerUiActions();
  document.addEventListener("click", event => {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    const action = UI_CLICK_ACTIONS[el.dataset.action];
    if (!action) return console.warn("Blocked unknown UI action", el.dataset.action);
    event.preventDefault();
    Promise.resolve(action(el, event)).catch(err => setMsg(err.message || String(err), "error"));
  });
  document.addEventListener("submit", event => {
    const form = event.target.closest("form[data-submit]");
    if (!form) return;
    const action = UI_SUBMIT_ACTIONS[form.dataset.submit];
    if (!action) return console.warn("Blocked unknown UI submit", form.dataset.submit);
    event.preventDefault();
    Promise.resolve(action(event, form)).catch(err => setMsg(err.message || String(err), "error"));
  });
  document.addEventListener("change", event => {
    const el = event.target.closest("[data-batch-field]");
    if (!el) return;
    const idx = Number(el.dataset.batchIndex);
    const field = el.dataset.batchField;
    if (!Array.isArray(batchExtractedInvoices) || !batchExtractedInvoices[idx] || !field) return;
    batchExtractedInvoices[idx][field] = el.dataset.batchNumber === "true" ? Number(el.value) : el.value;
  });
}
installCspSafeUiHandlers();

function planFeature(name) { return Boolean(state.entitlements?.features?.[name]); }
function currentPlanLabel() { return state.entitlements?.label || ""; }
function planLockedHtml(title, requiredPlan, reason) {
  return `<div class="card"><h2>${esc(title)}</h2><p class="message error">هذه الميزة غير متاحة في باقتك الحالية (${esc(currentPlanLabel())}).</p><p>${esc(reason)}</p><p class="muted">للترقية: هذه الميزة متاحة في باقة ${esc(requiredPlan)}.</p></div>`;
}
function pricingHtml() {
  return `<div class="pricing">
    <div class="price-card"><h3>الأساسية</h3><strong>99 ريال</strong><p>تنظيم فواتير العملاء ومراجعتها</p><small>100 فاتورة • 2 مستخدمين • بدون واتساب أو مطابقة بنك</small></div>
    <div class="price-card featured"><h3>النمو</h3><strong>249 ريال</strong><p>تسريع التحصيل ومتابعة العملاء وإرسال واتساب ومطابقة بنك</p><small>400 فاتورة • 400 واتساب • مطابقة بنك • تقارير التحصيل</small></div>
    <div class="price-card"><h3>الاحترافية</h3><strong>499 ريال</strong><p>للفواتير الأعلى التي تحتاج تحكمًا ماليًا أوسع وتقارير متقدمة</p><small>1,200 فاتورة • 800 واتساب • تقارير متقدمة • دعم أولوية</small></div>
  </div>`;
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const text = await res.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!res.ok) throw new Error(body.error || "فشل الطلب");
  return body;
}

function msg(text, type="") { return `<div class="message ${type}">${esc(text)}</div>`; }
function setMsg(text, type="") { const el = qs("msg"); if (el) el.innerHTML = text ? msg(text, type) : ""; }

async function boot() {
  try {
    const me = await api("/me");
    state.user = me.user;
    state.company = me.company;
    state.entitlements = me.entitlements || null;
    if (state.user?.mustChangePassword) return renderPasswordChange();
    const defaultView = isPlatformAdmin() ? "dashboard" : (can("ADMIN") ? "dashboard" : (can("ACCOUNTANT") ? "invoices" : (can("FINANCE_MANAGER") ? "review" : "support")));
    state.view = defaultView;
    renderShell();
    await loadView(defaultView);
  } catch {
    state.token = "";
    renderLogin();
  }
}

async function renderLogin() {
  const setup = await api("/setup/status").catch(() => ({ setupRequired: false }));
  document.body.className = "";
  qs("app").innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand"><div class="logo">سذ</div><div><h1>سند ذكي</h1><p class="tagline">منصة التحكم في فواتير العملاء، متابعة التحصيل، ومطابقة السداد البنكي قبل المحاسبة</p></div></div>
        <div id="msg"></div>
        ${setup.setupRequired ? setupHtml() : loginHtml()}
        <div class="login-links"><a href="/landing.html">صفحة الهبوط</a><span>•</span><a href="/legal.html">الشروط والسياسات</a></div>
      </div>
    </div>`;
}

function loginHtml() {
  return `
    <form data-submit="loginSubmit" autocomplete="off">
      <div class="field"><label>البريد الإلكتروني</label><input id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label>كلمة المرور</label><input id="password" type="password" autocomplete="current-password" minlength="12" required></div>
      <button class="btn teal full-width">دخول</button>
      <button type="button" class="btn light full-width" data-action="showForgot">نسيت كلمة المرور؟</button>
    </form>`;
}

function renderForgotPassword() {
  document.body.className = "";
  qs("app").innerHTML = `<div class="login-wrap"><div class="login-card"><div class="brand"><div class="logo">سذ</div><div><h1>استعادة كلمة المرور</h1><p class="tagline">أدخل بريدك وسيصل رمز استعادة إذا كان الحساب موجودًا.</p></div></div><div id="msg"></div><form data-submit="forgotPasswordSubmit" autocomplete="off"><div class="field"><label>البريد الإلكتروني</label><input id="forgotEmail" type="email" required></div><button class="btn teal full-width">إرسال الرمز</button><button type="button" class="btn light full-width" data-action="showLogin">عودة للدخول</button></form></div></div>`;
}

async function forgotPasswordSubmit(e) {
  e.preventDefault();
  const email = qs("forgotEmail").value;
  await api("/auth/forgot", { method:"POST", body: JSON.stringify({ email }) });
  qs("app").innerHTML = `<div class="login-wrap"><div class="login-card"><div class="brand"><div class="logo">سذ</div><div><h1>إدخال الرمز</h1><p class="tagline">إذا كان البريد مسجلاً فستصلك رسالة خلال دقائق.</p></div></div><div id="msg"></div><form data-submit="resetPasswordSubmit" autocomplete="off"><div class="field"><label>البريد</label><input id="resetEmail" type="email" value="${esc(email)}" required></div><div class="field"><label>الرمز</label><input id="resetCode" inputmode="numeric" required></div><div class="field"><label>كلمة المرور الجديدة</label><input id="resetPassword" type="password" minlength="12" required></div><button class="btn teal full-width">تغيير كلمة المرور</button><button type="button" class="btn light full-width" data-action="showLogin">عودة للدخول</button></form></div></div>`;
}

async function resetPasswordSubmit(e) {
  e.preventDefault();
  await api("/auth/reset", { method:"POST", body: JSON.stringify({ email:qs("resetEmail").value, code:qs("resetCode").value, newPassword:qs("resetPassword").value }) });
  setMsg("تم تغيير كلمة المرور. سجل الدخول الآن.", "ok");
  setTimeout(renderLogin, 900);
}

function setupHtml() {
  return `
    ${msg("هذه أول تهيئة للنظام. أنشئ حساب مدير النظام الأول لشركتك فقط.", "ok")}
    <form data-submit="setupSubmit" autocomplete="off">
      <div class="field"><label>اسم الشركة</label><input id="setupCompany" required value="شركة سند ذكي التجريبية"></div>
      <div class="field"><label>البريد الإلكتروني للأدمن</label><input id="setupEmail" type="email" autocomplete="off" required value="admin@sanad.local"></div>
      <div class="field"><label>كلمة المرور</label><input id="setupPassword" type="password" autocomplete="new-password" minlength="12" required value="ChangeMe123!Secure"></div>
      <div class="grid two">
        <div class="field"><label>الرقم الضريبي</label><input id="setupTax" value="300000000000003"></div>
        <div class="field"><label>المدينة</label><input id="setupCity" value="الرياض"></div>
      </div>
      <button class="btn teal full-width">إنشاء حساب الأدمن</button>
    </form>`;
}

async function setupSubmit(e) {
  e.preventDefault();
  try {
    await api("/setup/initial-admin", { method: "POST", body: JSON.stringify({
      companyName: qs("setupCompany").value,
      email: qs("setupEmail").value,
      password: qs("setupPassword").value,
      taxNumber: qs("setupTax").value,
      city: qs("setupCity").value
    })});
    setMsg("تم إنشاء الأدمن. سجل الدخول الآن.", "ok");
    setTimeout(renderLogin, 700);
  } catch (err) { setMsg(err.message, "error"); }
}

function renderPasswordChange() {
  document.body.className = "";
  qs("app").innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <div class="brand"><div class="logo">سذ</div><div><h1>سند ذكي</h1><p class="tagline">يجب تغيير كلمة المرور المؤقتة قبل استخدام النظام</p></div></div>
        <div id="msg"></div>
        <form data-submit="changePasswordSubmit" autocomplete="off">
          <div class="field"><label>كلمة المرور المؤقتة</label><input id="currentPassword" type="password" autocomplete="current-password" required></div>
          <div class="field"><label>كلمة المرور الجديدة</label><input id="newPassword" type="password" autocomplete="new-password" minlength="12" required></div>
          <button class="btn teal full-width">تغيير كلمة المرور والمتابعة</button>
        </form>
        <p class="muted">لا يمكن الوصول للفواتير أو النظام قبل تغيير كلمة المرور.</p>
      </div>
    </div>`;
}

async function changePasswordSubmit(e) {
  e.preventDefault();
  try {
    await api("/auth/change-password", { method:"POST", body: JSON.stringify({ currentPassword: qs("currentPassword").value, newPassword: qs("newPassword").value }) });
    setMsg("تم تغيير كلمة المرور. سجل الدخول بكلمتك الجديدة.", "ok");
    state.token = "";
    setTimeout(renderLogin, 800);
  } catch (err) { setMsg(err.message, "error"); }
}

async function loginSubmit(e) {
  e.preventDefault();
  try {
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify({ email: qs("email").value, password: qs("password").value }) });
    state.token = result.token || "cookie-session";
    state.user = result.user;
    if (result.user?.mustChangePassword) return renderPasswordChange();
    await boot();
  } catch (err) { setMsg(err.message, "error"); }
}

function renderShell() {
  document.body.className = "app-body";
  qs("app").innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="logo">سذ</div><div><h2>سند ذكي</h2><small>${isPlatformAdmin() ? "لوحة مشغل المنصة" : esc(state.company?.name || "")}</small></div></div>
        <small>${esc(state.user.email)} — ${roleLabel[state.user.role] || state.user.role}</small>
        <div class="nav" id="nav"></div>
      </aside>
      <main class="main">
        <div class="topbar"><div><h1 id="title">لوحة التحكم</h1><div class="muted">${isPlatformAdmin() ? "إدارة الشركات والاشتراكات والدعم والأمان" : "نظام فواتير العملاء والتحصيل والمطابقة"}</div></div><button class="btn light" data-action="logout">خروج</button></div>
        <div id="msg"></div>
        <div id="content"></div>
      </main>
    </div>`;
  renderNav();
}

function navItems() {
  const items = [];
  if (can("SANAD_ADMIN")) items.push(
    { id: "dashboard", label: "لوحة تشغيل المنصة" },
    { id: "platformCompanies", label: "شركات العملاء" },
    { id: "platformSupport", label: "الدعم الفني" },
    { id: "platformSecurity", label: "سجل عمليات المنصة" }
  );
  if (can("ADMIN")) items.push(
    { id: "dashboard", label: "لوحة التحكم" },
    { id: "company", label: "بيانات الشركة" },
    { id: "users", label: "المستخدمون" },
    { id: "support", label: "الدعم الفني" },
    { id: "accounting", label: "استيراد محاسبي" },
    { id: "audit", label: "سجل التدقيق" }
  );
  if (can("ACCOUNTANT")) items.push(
    { id: "invoices", label: "الفواتير" },
    { id: "whatsapp", label: planFeature("whatsapp") ? "واتساب العملاء" : "واتساب العملاء 🔒" },
    { id: "support", label: "الدعم الفني" }
  );
  if (can("FINANCE_MANAGER")) items.push(
    { id: "review", label: "مراجعة الفواتير" },
    { id: "bank", label: planFeature("bankMatching") ? "البنك والمطابقة" : "البنك والمطابقة 🔒" },
    { id: "reports", label: "التقارير" },
    { id: "support", label: "الدعم الفني" }
  );
  return [...new Map(items.map(i => [i.id, i])).values()];
}
function renderNav() {
  qs("nav").innerHTML = navItems().map(i => `<button class="${state.view===i.id?'active':''}" data-action="loadView" data-view="${i.id}">${i.label}</button>`).join("");
}

async function loadView(view) {
  state.view = view;
  renderNav();
  setMsg("");
  const titles = { dashboard:(isPlatformAdmin()?"لوحة تشغيل المنصة":"لوحة التحكم"), company:"بيانات الشركة", users:"المستخدمون", invoices:"الفواتير", review:"مراجعة الفواتير", whatsapp:"واتساب العملاء", bank:"البنك والمطابقة", reports:"التقارير", accounting:"استيراد محاسبي", support:"الدعم الفني", audit:"سجل التدقيق", platformCompanies:"شركات العملاء", platformSupport:"الدعم الفني", platformSecurity:"سجل عمليات المنصة" };
  qs("title").textContent = titles[view] || "سند ذكي";
  try {
    if (view === "dashboard") return isPlatformAdmin() ? renderPlatformDashboard() : renderDashboard();
    if (view === "company") return renderCompany();
    if (view === "users") return renderUsers();
    if (view === "invoices") return renderInvoices();
    if (view === "review") return renderReview();
    if (view === "whatsapp") {
      if (!planFeature("whatsapp")) { qs("content").innerHTML = planLockedHtml("واتساب العملاء", "النمو", "تحتاج تذكير العملاء عبر واتساب؟ انتقل إلى باقة النمو."); return; }
      return renderWhatsapp();
    }
    if (view === "bank") {
      if (!planFeature("bankMatching")) { qs("content").innerHTML = planLockedHtml("البنك والمطابقة", "النمو", "مطابقة السداد البنكي متاحة في باقة النمو والاحترافية."); return; }
      return renderBank();
    }
    if (view === "reports") {
      // v14.3.8: basic financial report is available to Finance Manager on all plans.
      // Advanced analytics/exports remain controlled separately by plan features.
      return renderReports();
    }
    if (view === "accounting") {
      if (!can("ADMIN")) { qs("content").innerHTML = `<div class="card"><h2>استيراد محاسبي</h2><p class="message error">هذه الصفحة لأدمن الشركة فقط لإعداد الربط والاستيراد.</p></div>`; return; }
      return renderAccountingImport();
    }
    if (view === "support") return renderSupport();
    if (view === "audit") return renderAudit();
    if (view === "platformCompanies") return renderPlatformCompanies();
    if (view === "platformSupport") return renderPlatformSupport();
    if (view === "platformSecurity") return renderPlatformSecurity();
  } catch (err) { qs("content").innerHTML = msg(err.message, "error"); }
}



async function renderPlatformDashboard() {
  const { overview } = await api("/platform/overview");
  qs("content").innerHTML = `
    <div class="grid">
      <div class="kpi">الشركات المسجلة<strong>${overview.total_companies}</strong></div>
      <div class="kpi">الشركات النشطة<strong>${overview.active_companies}</strong></div>
      <div class="kpi">تذاكر مفتوحة<strong>${overview.open_tickets}</strong></div>
      <div class="kpi">استخدام الفواتير<strong>${overview.invoice_count}</strong></div>
      <div class="kpi">رسائل واتساب<strong>${overview.whatsapp_count}</strong></div>
      <div class="kpi">شركات موقوفة<strong>${overview.suspended_companies}</strong></div>
    </div>
    <div class="card"><h2>لوحة تشغيل المنصة</h2><p class="muted">هذه لوحة مشغل المنصة فقط: شركات، اشتراكات، استخدام، دعم، وتنبيهات. لا تعرض تفاصيل فواتير العملاء ولا تسمح بالاعتماد المالي أو المطابقة أو الإرسال المالي.</p></div>
    ${platformCompanyTable(overview.recentCompanies || [], true)}`;
}

async function renderPlatformCompanies() {
  const { companies } = await api("/platform/companies");
  qs("content").innerHTML = `
    <div class="card"><h2>إضافة شركة عميلة</h2><p class="muted">إضافة الشركة من أدمن سند ذكي لا تمنح أي وصول لتفاصيل فواتير العميل. الصلاحيات محمية من الخلفية.</p>
      <form data-submit="addPlatformCompany" autocomplete="off">
        <div class="grid">
          <div class="field"><label>اسم الشركة</label><input id="pcName" autocomplete="off" required></div>
          <div class="field"><label>الباقة</label><select id="pcPackage"><option value="basic">الأساسية 99</option><option value="growth">النمو 249</option><option value="professional">الاحترافية 499</option></select></div>
          <div class="field"><label>الحالة</label><select id="pcStatus"><option value="TRIAL">تجريبية</option><option value="ACTIVE">نشطة</option><option value="SUSPENDED">موقوفة</option></select></div>
          <div class="field"><label>الرقم الضريبي</label><input id="pcTax" autocomplete="off"></div>
          <div class="field"><label>بريد الشركة</label><input id="pcEmail" type="email" autocomplete="off"></div>
          <div class="field"><label>المدينة</label><input id="pcCity" autocomplete="off"></div>
          <div class="field"><label>بريد المستخدم الأول</label><input id="pcUserEmail" type="email" autocomplete="off"></div>
          <div class="field"><label>كلمة مرور المستخدم الأول</label><input id="pcUserPass" type="password" minlength="12" autocomplete="new-password"></div>
          <div class="field"><label>دور المستخدم الأول</label><select id="pcUserRole"><option value="ADMIN">أدمن الشركة</option><option value="FINANCE_MANAGER">مدير مالي</option><option value="ACCOUNTANT">محاسب</option></select></div>
        </div>
        <button class="btn teal">إضافة الشركة</button>
      </form>
    </div>
    ${platformCompanyTable(companies || [])}`;
}

function platformCompanyTable(rows, compact=false) {
  return `<div class="card"><h2>${compact ? "آخر الشركات" : "شركات العملاء"}</h2><div class="table-wrap"><table><thead><tr><th>الشركة</th><th>الحالة</th><th>الباقة</th><th>الفواتير</th><th>واتساب</th><th>الدعم</th><th>الإجراء</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${esc(c.name)}</td><td><span class="status ${c.is_active?'APPROVED':'REJECTED'}">${companyStatusLabel(c.status, c.is_active)}</span></td><td>${packageLabel(c.package_code)}</td><td>${Number(c.invoice_count || 0)} / ${Number(c.invoice_monthly_limit || 0)}</td><td>${Number(c.whatsapp_count || 0)} / ${Number(c.whatsapp_monthly_limit || 0)}</td><td>${Number(c.open_tickets || 0)}</td><td>${compact ? '-' : platformCompanyActions(c)}</td></tr>`).join("") || `<tr><td colspan="7">لا توجد شركات.</td></tr>`}</tbody></table></div></div>`;
}
function packageLabel(v) { return ({basic:"الأساسية", growth:"النمو", professional:"الاحترافية"})[v] || v; }
function companyStatusLabel(status, active) { if (!active) return "موقوفة"; return ({TRIAL:"تجريبية", ACTIVE:"نشطة", SUSPENDED:"موقوفة", CANCELLED:"ملغاة"})[status] || status; }
function platformCompanyActions(c) {
  return `<div class="actions"><button class="btn teal" data-action="setPlatformCompanyStatus" data-id="${esc(c.id)}" data-status="ACTIVE">تفعيل</button><button class="btn danger" data-action="setPlatformCompanyStatus" data-id="${esc(c.id)}" data-status="SUSPENDED">إيقاف</button></div>`;
}
async function addPlatformCompany(e) {
  e.preventDefault();
  await api("/platform/companies", { method:"POST", body: JSON.stringify({
    name: qs("pcName").value,
    taxNumber: qs("pcTax").value,
    email: qs("pcEmail").value,
    city: qs("pcCity").value,
    packageCode: qs("pcPackage").value,
    status: qs("pcStatus").value,
    primaryUserEmail: qs("pcUserEmail").value,
    primaryUserPassword: qs("pcUserPass").value,
    primaryUserRole: qs("pcUserRole").value
  })});
  setMsg("تمت إضافة الشركة من أدمن سند ذكي.", "ok");
  await renderPlatformCompanies();
}
async function setPlatformCompanyStatus(id, status) { await api(`/platform/companies/${id}/status`, { method:"PATCH", body: JSON.stringify({ status }) }); setMsg("تم تحديث حالة الشركة.", "ok"); await renderPlatformCompanies(); }

async function renderPlatformSupport() {
  const { tickets } = await api("/platform/support/tickets");
  qs("content").innerHTML = `<div class="card"><h2>الدعم الفني - أدمن سند ذكي</h2><p class="muted">يعرض التذاكر ومعلومات الشركة فقط، ولا يكشف فواتير العميل التفصيلية.</p></div><div class="card"><div class="table-wrap"><table><thead><tr><th>الشركة</th><th>التصنيف</th><th>الأولوية</th><th>الحالة</th><th>الوصف</th><th>الإجراء</th></tr></thead><tbody>${tickets.map(t=>`<tr><td>${esc(t.company_name)}</td><td>${esc(t.category)}</td><td>${esc(t.priority)}</td><td><span class="status ${t.status==='CLOSED'?'APPROVED':'PENDING'}">${esc(t.status)}</span></td><td>${esc(t.description_preview)}</td><td><button class="btn teal" data-action="setPlatformTicketStatus" data-id="${esc(t.id)}" data-status="IN_PROGRESS">جاري المعالجة</button> <button class="btn light" data-action="setPlatformTicketStatus" data-id="${esc(t.id)}" data-status="CLOSED">إغلاق</button></td></tr>`).join("") || `<tr><td colspan="6">لا توجد تذاكر.</td></tr>`}</tbody></table></div></div>`;
}
async function setPlatformTicketStatus(id, status) { await api(`/platform/support/tickets/${id}/status`, { method:"PATCH", body: JSON.stringify({ status }) }); setMsg("تم تحديث حالة التذكرة.", "ok"); await renderPlatformSupport(); }

async function renderPlatformSecurity() {
  const data = await api("/platform/security/logs");
  const platform = data.platformLogs || [];
  const clientLogs = data.clientAuditSummary || [];
  qs("content").innerHTML = `<div class="card"><h2>سجل عمليات المنصة</h2><p class="muted">سجل مختصر لعمليات المنصة والتنبيهات. لا توجد تفاصيل فواتير أو بيانات مالية حساسة هنا.</p></div><div class="card"><h2>سجل عمليات المنصة</h2><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الإجراء</th><th>الكيان</th><th>المستخدم</th></tr></thead><tbody>${platform.map(l=>`<tr><td>${fmtDate(l.created_at)}</td><td>${esc(l.action)}</td><td>${esc(l.entity_type)}</td><td>${esc(l.user_id || '-')}</td></tr>`).join("") || `<tr><td colspan="4">لا توجد سجلات.</td></tr>`}</tbody></table></div></div><div class="card"><h2>ملخص سجلات الشركات</h2><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الشركة</th><th>الإجراء</th><th>الكيان</th></tr></thead><tbody>${clientLogs.map(l=>`<tr><td>${fmtDate(l.created_at)}</td><td>${esc(l.company_id)}</td><td>${esc(l.action)}</td><td>${esc(l.entity_type)}</td></tr>`).join("") || `<tr><td colspan="4">لا توجد سجلات.</td></tr>`}</tbody></table></div></div>`;
}

async function renderDashboard() {
  const rep = can("ADMIN") ? null : await api("/reports/finance").catch(()=>null);
  qs("content").innerHTML = `
    <div class="grid">
      <div class="kpi">الدور الحالي<strong>${roleLabel[state.user.role]}</strong></div>
      <div class="kpi">الشركة<strong>${esc(state.company?.name || "-")}</strong></div>
      <div class="kpi">حالة النظام<strong>جاهز</strong></div>
    </div>
    <div class="card"><h2>الباقة الحالية</h2><p><strong>${esc(currentPlanLabel())}</strong> — ${esc(state.entitlements?.marketing || "")}</p><p class="muted">تُطبق حدود وميزات الباقة من الخلفية، وليس من الواجهة فقط.</p></div>
    <div class="card"><h2>مسار العمل المعتمد</h2><p>المحاسب يدخل الفاتورة ويثبتها للمراجعة، المدير المالي يعتمدها، بعدها تظهر الميزات حسب الباقة: واتساب ومطابقة السداد للباقات المؤهلة.</p></div>
    ${rep ? `<div class="grid"><div class="kpi">فواتير معتمدة غير مدفوعة<strong>${rep.summary.approved_invoices}</strong></div><div class="kpi">المبلغ المستحق<strong>${money(rep.summary.outstanding_amount)}</strong></div><div class="kpi">المدفوع<strong>${money(rep.summary.paid_amount)}</strong></div></div>` : ""}`;
}

async function renderCompany() {
  const { company } = await api("/company");
  qs("content").innerHTML = `
    <div class="card"><h2>بيانات الشركة</h2><p class="muted">تُحفظ هذه البيانات لحساب شركتك فقط، ويظهر اسم الشركة تلقائيًا للمستخدمين داخل نفس الشركة.</p>
      <form data-submit="saveCompany" autocomplete="off">
        <div class="grid two">
          <div class="field"><label>اسم الشركة</label><input id="cName" value="${esc(company.name)}" required></div>
          <div class="field"><label>الرقم الضريبي</label><input id="cTax" value="${esc(company.tax_number || "")}"></div>
          <div class="field"><label>البريد</label><input id="cEmail" value="${esc(company.email || "")}"></div>
          <div class="field"><label>الجوال</label><input id="cPhone" value="${esc(company.phone || "")}"></div>
          <div class="field"><label>المدينة</label><input id="cCity" value="${esc(company.city || "")}"></div>
          <div class="field"><label>العنوان</label><input id="cAddress" value="${esc(company.address || "")}"></div>
        </div><button class="btn teal">حفظ بيانات الشركة</button>
      </form></div>`;
}
async function saveCompany(e) {
  e.preventDefault();
  const result = await api("/company", { method:"PUT", body: JSON.stringify({ name: qs("cName").value, taxNumber: qs("cTax").value, email: qs("cEmail").value, phone: qs("cPhone").value, city: qs("cCity").value, address: qs("cAddress").value }) });
  state.company = result.company;
  renderShell(); await loadView("company"); setMsg("تم حفظ بيانات الشركة وتحديث اسمها في الواجهة.", "ok");
}

async function renderUsers() {
  const { users } = await api("/users");
  qs("content").innerHTML = `
    <div class="card"><h2>إضافة موظف</h2>
      <p class="muted">أدخل الاسم والبريد والدور فقط. النظام يولّد كلمة مرور مؤقتة ويجبر الموظف على تغييرها عند أول دخول.</p>
      <form data-submit="addUser" autocomplete="off">
        <div class="grid">
          <div class="field"><label>الاسم</label><input id="uName" autocomplete="off" required></div>
          <div class="field"><label>البريد</label><input id="uEmail" type="email" autocomplete="off" required></div>
          <div class="field"><label>الدور</label><select id="uRole"><option value="ACCOUNTANT">محاسب</option><option value="FINANCE_MANAGER">مدير مالي</option></select></div>
        </div>
        <button class="btn teal">إضافة وإرسال دعوة</button>
      </form>
    </div>${tableUsers(users)}`;
}
function userStatusLabel(u) {
  if (u.user_status === "ARCHIVED") return "مؤرشف";
  if (!u.is_active || u.user_status === "SUSPENDED") return "موقوف";
  if (u.password_must_change) return "دعوة/تغيير كلمة مرور";
  return "نشط";
}
function tableUsers(users) { return `<div class="card"><h2>مستخدمو الشركة</h2><div class="table-wrap"><table><thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.name || "-")}</td><td>${esc(u.email)}</td><td>${roleLabel[u.role]}</td><td>${esc(userStatusLabel(u))}</td><td>${u.user_status === "ARCHIVED" ? `<span class="muted">محفوظ في السجل</span>` : `<button class="btn light" data-action="toggleUser" data-id="${esc(u.id)}" data-active="${!u.is_active}">${u.is_active?'إيقاف':'تفعيل'}</button> <button class="btn gold" data-action="resetInvite" data-id="${esc(u.id)}">إعادة دعوة/كلمة مرور</button> ${u.role !== "ADMIN" ? `<button class="btn danger" data-action="archiveUser" data-id="${esc(u.id)}">أرشفة</button>` : ""}`}</td></tr>`).join("")}</tbody></table></div></div>`; }
function showInvite(result) {
  if (result.invite?.temporaryPassword) {
    setMsg(`تم تجهيز الدعوة. كلمة المرور المؤقتة للاختبار تظهر مرة واحدة فقط: ${result.invite.temporaryPassword}`, "ok");
  } else {
    setMsg(result.message || "تم إرسال الدعوة.", "ok");
  }
}
async function addUser(e) { e.preventDefault(); const r = await api("/users", { method:"POST", body: JSON.stringify({ name:qs("uName").value, email:qs("uEmail").value, role:qs("uRole").value }) }); await renderUsers(); showInvite(r); }
async function toggleUser(id, isActive) { await api(`/users/${id}/status`, { method:"PATCH", body: JSON.stringify({ isActive }) }); await renderUsers(); }
async function resetInvite(id) { const r = await api(`/users/${id}/reset-invite`, { method:"POST" }); await renderUsers(); showInvite(r); }
async function archiveUser(id) { if (!confirm("أرشفة المستخدم؟ لن يستطيع الدخول ولن يُحسب ضمن حدود الباقة، وستبقى سجلاته محفوظة.")) return; await api(`/users/${id}/archive`, { method:"PATCH" }); setMsg("تمت أرشفة المستخدم.", "ok"); await renderUsers(); }

function invoiceReaderHtml() { return `<div class="card"><h2>رفع/قراءة فاتورة</h2><p class="muted">هدف القراءة 95%. إذا كانت الثقة أقل أو يوجد حقل ناقص ستظهر للمحاسب للتصحيح اليدوي قبل الحفظ.</p><div class="grid"><div class="field"><label>ملف الفاتورة</label><input id="invoiceFile" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></div><div class="field"><label>&nbsp;</label><button class="btn gold" type="button" data-action="readInvoiceFile">رفع/قراءة فاتورة</button></div></div><div id="readerHint" class="muted"></div></div>
  <div class="card"><h2>مجموعة فواتير للمحاسب</h2><p class="muted">ارفع عدة فواتير دفعة واحدة. كل فاتورة ستظهر بحالة قراءة ونسبة ثقة، ثم تحفظ المجموعة بعد مراجعة الحقول.</p><div class="grid"><div class="field"><label>ملفات الفواتير</label><input id="invoiceFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"></div><div class="field"><label>&nbsp;</label><button class="btn gold" type="button" data-action="readInvoiceBatch">قراءة مجموعة الفواتير</button></div></div><div id="batchHint" class="muted"></div><div id="batchPreview"></div></div>`; }
function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("تعذر قراءة الملف من المتصفح")); reader.readAsDataURL(file); }); }
async function fileToPreparedDataUrl(file) {
  if (!file.type.startsWith("image/")) return fileToDataUrl(file);
  const original = await fileToDataUrl(file);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1800;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      ctx.filter = "contrast(1.18) brightness(1.04) grayscale(1)";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}
let batchExtractedInvoices = [];
function applyExtractedInvoice(data) {
  const x = data?.extracted || {};
  if (x.invoiceNumber) qs("iNo").value = x.invoiceNumber;
  if (x.customerName) qs("iCustomer").value = x.customerName;
  if (x.supplierTaxNumber) qs("iTax").value = x.supplierTaxNumber;
  if (x.totalAmount) qs("iAmount").value = x.totalAmount;
  const confidence = Math.round(Number(x.confidence || 0) * 100);
  qs("readerHint").innerHTML = `<div class="message ${data.needsManualReview ? "error" : "ok"}">${esc(data.message || "تمت القراءة")}</div><p>مصدر القراءة: ${esc(data.extractionSource || x.source || "-")} • نسبة الثقة: ${confidence}%</p><p class="muted">لا يتم قفل أو اعتماد أي فاتورة من القراءة وحدها. احفظ البيانات ثم أرسلها للمراجعة.</p>`;
}
async function readInvoiceFile() {
  const file = qs("invoiceFile")?.files?.[0];
  if (!file) return setMsg("اختر ملف الفاتورة أولًا.", "error");
  if (file.size > 8 * 1024 * 1024) return setMsg("حجم الملف أكبر من 8MB.", "error");
  try {
    setMsg("جاري قراءة الفاتورة...", "ok");
    const dataUrl = await fileToPreparedDataUrl(file);
    const r = await api("/invoices/read-file", { method:"POST", body: JSON.stringify({ fileName:file.name, mimeType:file.type || "application/pdf", dataUrl }) });
    applyExtractedInvoice(r);
    setMsg(r.message, r.needsManualReview ? "error" : "ok");
  } catch (err) { setMsg(err.message, "error"); }
}

function renderBatchPreview() {
  const el = qs("batchPreview");
  if (!el) return;
  el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>الملف</th><th>رقم الفاتورة</th><th>العميل</th><th>الرقم الضريبي</th><th>المبلغ</th><th>الثقة</th><th>الحالة</th></tr></thead><tbody>${batchExtractedInvoices.map((b,idx)=>`<tr><td>${esc(b.fileName)}</td><td><input value="${esc(b.invoiceNumber)}" data-batch-index="${idx}" data-batch-field="invoiceNumber"></td><td><input value="${esc(b.customerName)}" data-batch-index="${idx}" data-batch-field="customerName"></td><td><input value="${esc(b.supplierTaxNumber)}" data-batch-index="${idx}" data-batch-field="supplierTaxNumber"></td><td><input type="number" step="0.01" value="${esc(b.totalAmount || '')}" data-batch-index="${idx}" data-batch-field="totalAmount" data-batch-number="true"></td><td>${Math.round(Number(b.confidence||0)*100)}%</td><td>${b.needsManualReview ? '<span class="status REJECTED">تصحيح مطلوب</span>' : '<span class="status APPROVED">جاهزة</span>'}</td></tr>`).join("")}</tbody></table></div><button class="btn teal" data-action="saveBatchInvoices">حفظ مجموعة الفواتير</button>`;
}
async function readInvoiceBatch() {
  const files = Array.from(qs("invoiceFiles")?.files || []);
  if (!files.length) return setMsg("اختر ملفات الفواتير أولًا.", "error");
  if (files.length > 25) return setMsg("الحد الأقصى 25 فاتورة في المجموعة الواحدة.", "error");
  batchExtractedInvoices = [];
  qs("batchHint").innerHTML = "جاري قراءة المجموعة...";
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) {
      batchExtractedInvoices.push({ fileName:file.name, invoiceNumber:"", customerName:"", supplierTaxNumber:"", totalAmount:"", confidence:0, needsManualReview:true });
      continue;
    }
    try {
      const dataUrl = await fileToPreparedDataUrl(file);
      const r = await api("/invoices/read-file", { method:"POST", body: JSON.stringify({ fileName:file.name, mimeType:file.type || "application/pdf", dataUrl }) });
      batchExtractedInvoices.push({ fileName:file.name, ...r.extracted, needsManualReview:r.needsManualReview });
    } catch {
      batchExtractedInvoices.push({ fileName:file.name, invoiceNumber:"", customerName:"", supplierTaxNumber:"", totalAmount:"", confidence:0, needsManualReview:true });
    }
    renderBatchPreview();
  }
  qs("batchHint").innerHTML = "اكتملت القراءة. راجع الحقول، خصوصًا الصفوف التي تحتاج تصحيحًا.";
}
async function saveBatchInvoices() {
  const invoices = batchExtractedInvoices.map(b => ({ invoiceNumber:String(b.invoiceNumber||"").trim(), customerName:String(b.customerName||"").trim(), supplierTaxNumber:String(b.supplierTaxNumber||"").trim(), totalAmount:Number(b.totalAmount) })).filter(b => b.invoiceNumber && b.customerName && b.supplierTaxNumber && b.totalAmount > 0);
  if (!invoices.length || invoices.length !== batchExtractedInvoices.length) return setMsg("صحح جميع حقول المجموعة قبل الحفظ.", "error");
  const r = await api("/invoices/batch", { method:"POST", body: JSON.stringify({ invoices }) });
  setMsg(r.message || "تم حفظ المجموعة.", "ok");
  batchExtractedInvoices = [];
  await renderInvoices();
}
function invoiceForm() { return `<div class="card"><h2>إدخال يدوي / تصحيح بيانات الفاتورة</h2><form data-submit="addInvoice" autocomplete="off"><div class="grid"><div class="field"><label>رقم الفاتورة</label><input id="iNo" autocomplete="off" required></div><div class="field"><label>اسم العميل</label><input id="iCustomer" autocomplete="off" required></div><div class="field"><label>جوال/واتساب العميل</label><input id="iPhone" inputmode="tel" autocomplete="off" placeholder="9665xxxxxxxx"></div><div class="field"><label>الرقم الضريبي للمورد</label><input id="iTax" autocomplete="off" required></div><div class="field"><label>المبلغ</label><input id="iAmount" type="number" step="0.01" autocomplete="off" required></div><div class="field"><label>تاريخ الفاتورة</label><input id="iDate" type="date"></div><div class="field"><label>تاريخ الاستحقاق</label><input id="iDue" type="date"></div></div><button class="btn teal">حفظ الفاتورة</button></form></div>`; }
async function renderInvoices() { const { invoices } = await api("/invoices"); qs("content").innerHTML = invoiceReaderHtml() + invoiceForm() + invoiceTable(invoices, "accountant"); }
async function renderReview() { const { invoices } = await api("/invoices"); qs("content").innerHTML = invoiceTable(invoices, "finance"); }
function invoiceTable(invoices, mode) { return `<div class="card"><h2>${mode==='finance'?'مراجعة الفواتير':'الفواتير'}</h2><div class="table-wrap"><table><thead><tr><th>رقم</th><th>العميل</th><th>واتساب</th><th>الضريبي</th><th>المبلغ</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${invoices.map(i=>`<tr><td>${esc(i.invoice_number)}</td><td>${esc(i.customer_name)}</td><td>${esc(i.customer_phone || "-")}</td><td>${esc(i.supplier_tax_number)}</td><td>${money(i.total_amount)}</td><td><span class="status ${i.status}">${statusLabel[i.status] || i.status}</span></td><td>${invoiceActions(i, mode)}</td></tr>`).join("") || `<tr><td colspan="7">لا توجد فواتير.</td></tr>`}</tbody></table></div></div>`; }
function invoiceActions(i, mode) {
  if (mode === "accountant") {
    const canSendWhatsapp = i.status === "APPROVED" && planFeature("whatsapp");
    const send = canSendWhatsapp
      ? `<button class="btn gold" data-action="sendWhatsappStage" data-id="${esc(i.id)}" data-stage="FIRST">تذكير أول</button> <button class="btn light" data-action="sendWhatsappStage" data-id="${esc(i.id)}" data-stage="SECOND">ثاني</button> <button class="btn danger" data-action="sendWhatsappStage" data-id="${esc(i.id)}" data-stage="FINAL">نهائي</button>`
      : i.status === "APPROVED"
        ? `<span class="muted">واتساب غير متاح في الباقة الحالية</span>`
        : `<span class="muted">بانتظار اعتماد المدير المالي قبل إرسال الواتساب</span>`;
    const submit = ["DRAFT","NEEDS_REVIEW"].includes(i.status) ? `<button class="btn teal" data-action="submitReview" data-id="${esc(i.id)}">تثبيت/إرسال للمراجعة</button>` : "";
    return `<div class="actions">${submit}${send}</div>`;
  }
  if (mode === "finance" && i.status === "READY_FOR_REVIEW") return `<button class="btn teal" data-action="approveInvoice" data-id="${esc(i.id)}">اعتماد مالي</button>`;
  return `<span class="muted">لا يوجد إجراء</span>`;
}
async function addInvoice(e) { e.preventDefault(); await api("/invoices", { method:"POST", body: JSON.stringify({ invoiceNumber:qs("iNo").value, customerName:qs("iCustomer").value, customerPhone:qs("iPhone").value, supplierTaxNumber:qs("iTax").value, totalAmount: Number(qs("iAmount").value), invoiceDate:qs("iDate").value, dueDate:qs("iDue").value }) }); setMsg("تم حفظ الفاتورة.", "ok"); await renderInvoices(); }
async function submitReview(id) { await api(`/invoices/${id}/submit-review`, { method:"POST" }); setMsg("تم تثبيت الفاتورة وإرسالها للمراجعة.", "ok"); await renderInvoices(); }
async function approveInvoice(id) { await api(`/invoices/${id}/approve`, { method:"POST" }); setMsg("تم اعتماد الفاتورة ماليًا.", "ok"); await renderReview(); }
async function sendWhatsapp(id, stage="FIRST") {
  const r = await api(`/invoices/${id}/whatsapp/send`, { method:"POST", body: JSON.stringify({ reminderStage: stage }) });
  setMsg(`تمت جدولة تذكير واتساب (${stage}) للإرسال من رقم الشركة.`, "ok");
  if (state.view === "whatsapp") await renderWhatsapp();
}


async function renderWhatsapp() {
  const inv = await api("/invoices");
  const msgres = await api("/whatsapp/messages");
  const settings = await api("/whatsapp/settings").catch(()=>({ settings:null, templates:[] }));
  qs("content").innerHTML = `<div class="card"><h2>إعداد WhatsApp Business للشركة</h2><p class="muted">يُرسل كل عميل من رقم واتساب الشركة المستقل، ولا تُحفظ توكنات Meta كنص صريح.</p><form data-submit="saveWhatsappSettings" autocomplete="off"><div class="grid"><div class="field"><label>المزود</label><select id="waProvider"><option value="meta">Meta Cloud API</option><option value="bsp">BSP Provider</option></select></div><div class="field"><label>Phone Number ID</label><input id="waPhoneId" value="${esc(settings.settings?.phone_number_id || '')}" required></div><div class="field"><label>WhatsApp Business Account ID</label><input id="waBusinessId" value="${esc(settings.settings?.business_account_id || '')}"></div><div class="field"><label>اسم الظهور</label><input id="waDisplayName" value="${esc(settings.settings?.display_name || state.company?.name || '')}" required></div><div class="field"><label>Access Token / BSP Token</label><input id="waToken" type="password" placeholder="اتركه فارغًا للإبقاء على الحالي"></div><div class="field"><label>App Secret للتوقيع</label><input id="waAppSecret" type="password" placeholder="اختياري للتحقق من Webhook"></div><div class="field"><label>BSP Endpoint</label><input id="waBspEndpoint" placeholder="https://provider.example/send"></div><div class="field"><label>اسم BSP</label><input id="waBspName" value="${esc(settings.settings?.bsp_name || '')}"></div></div><button class="btn teal">حفظ إعدادات واتساب</button></form></div>
  <div class="card"><h2>قوالب Meta المعتمدة</h2><p class="muted">أدخل أسماء القوالب المعتمدة في Meta لكل مرحلة تذكير.</p><form data-submit="saveWhatsappTemplates"><div class="grid">${['FIRST','SECOND','FINAL'].map(stage=>{ const t=(settings.templates||[]).find(x=>x.reminder_stage===stage)||{}; return `<div class="field"><label>${stage}</label><input id="tpl_${stage}" value="${esc(t.meta_template_name||'')}" placeholder="template_name"></div><div class="field"><label>لغة ${stage}</label><input id="tpl_lang_${stage}" value="${esc(t.language||'ar')}"></div><div class="field"><label>معاينة ${stage}</label><input id="tpl_body_${stage}" value="${esc(t.body_preview||'عميلنا {{1}}، فاتورة من {{2}} رقم {{3}} بمبلغ {{4}} ريال')}"></div>` }).join('')}</div><button class="btn gold">حفظ القوالب</button></form></div>
  <div class="card"><h2>تذكيرات الفواتير المعتمدة</h2><p class="muted">لا يوجد إدخال يدوي لرقم العميل هنا؛ يجب حفظ رقم واتساب العميل داخل الفاتورة.</p></div>${invoiceTable(inv.invoices, "accountant")}
  <div class="card"><h2>سجل رسائل واتساب</h2><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>المرحلة</th><th>الرقم</th><th>الحالة</th><th>التسليم</th><th>المحاولات</th><th>الرسالة</th></tr></thead><tbody>${msgres.messages.map(m=>`<tr><td>${fmtDate(m.created_at)}</td><td>${esc(m.reminder_stage||'-')}</td><td>${esc(m.to_phone||'-')}</td><td><span class="status ${m.status}">${statusLabel[m.status]||m.status}</span></td><td>${esc(statusLabel[m.delivery_status]||m.delivery_status||'-')}</td><td>${esc(m.attempts||0)}</td><td>${esc(m.message).slice(0,180)}</td></tr>`).join("") || `<tr><td colspan="7">لا توجد رسائل.</td></tr>`}</tbody></table></div></div>`;
}

async function saveWhatsappSettings(e) { e.preventDefault(); await api("/whatsapp/settings", { method:"PUT", body: JSON.stringify({ provider:qs("waProvider").value, phoneNumberId:qs("waPhoneId").value, businessAccountId:qs("waBusinessId").value, displayName:qs("waDisplayName").value, accessToken:qs("waToken").value, appSecret:qs("waAppSecret").value, bspEndpoint:qs("waBspEndpoint").value, bspToken:qs("waToken").value, bspName:qs("waBspName").value }) }); setMsg("تم حفظ إعدادات واتساب للشركة.", "ok"); await renderWhatsapp(); }
async function saveWhatsappTemplates(e) { e.preventDefault(); const templates = ['FIRST','SECOND','FINAL'].map(stage => ({ reminderStage:stage, metaTemplateName:qs(`tpl_${stage}`).value, language:qs(`tpl_lang_${stage}`).value || 'ar', bodyPreview:qs(`tpl_body_${stage}`).value, metaStatus:'APPROVED', isActive:true })).filter(t=>t.metaTemplateName); await api("/whatsapp/templates", { method:"PUT", body: JSON.stringify({ templates }) }); setMsg("تم حفظ قوالب واتساب.", "ok"); await renderWhatsapp(); }


async function renderBank() {
  const tx = await api("/bank/transactions");
  const matches = await api("/matches");
  const imports = await api("/bank/statement/imports").catch(()=>({imports:[]}));
  const mappingRes = await api("/bank/mapping").catch(()=>({mappings:[]}));
  const firstMap = (mappingRes.mappings || [])[0] || { bank_key:"default", mapping:{} };
  const m = firstMap.mapping || {};
  qs("content").innerHTML = `<div class="card"><h2>رفع كشف البنك Excel/CSV</h2><p class="muted">يرفعه المدير المالي فقط. النظام يقرأ الصفوف، يحولها إلى عمليات بنكية، ثم يشغل المطابقة تلقائيًا بدون Open Banking.</p><form data-submit="uploadBankStatement" enctype="multipart/form-data"><div class="grid"><div class="field"><label>اسم البنك / المفتاح</label><input id="bankKey" value="${esc(firstMap.bank_key || "default")}" autocomplete="off"></div><div class="field"><label>ملف كشف البنك</label><input id="bankFile" type="file" accept=".csv,.xlsx,.xls" required></div></div><details><summary>خريطة أعمدة اختيارية إذا لم يتعرف النظام تلقائيًا</summary><div class="grid"><div class="field"><label>عمود التاريخ</label><input id="mapDate" value="${esc(m.date || "")}" placeholder="مثلاً: تاريخ العملية"></div><div class="field"><label>عمود الوصف</label><input id="mapDesc" value="${esc(m.description || "")}" placeholder="مثلاً: الوصف"></div><div class="field"><label>عمود المبلغ</label><input id="mapAmount" value="${esc(m.amount || "")}" placeholder="مثلاً: المبلغ"></div><div class="field"><label>عمود الدائن</label><input id="mapCredit" value="${esc(m.credit || "")}" placeholder="مثلاً: دائن"></div><div class="field"><label>عمود المدين</label><input id="mapDebit" value="${esc(m.debit || "")}" placeholder="مثلاً: مدين"></div><div class="field"><label>عمود المرجع</label><input id="mapRef" value="${esc(m.reference || "")}" placeholder="مثلاً: المرجع"></div></div></details><button class="btn teal">رفع وقراءة الكشف</button> <button type="button" class="btn gold" data-action="runMatching">تشغيل المطابقة</button></form></div><div class="card"><h2>إدارة خريطة أعمدة البنك</h2><p class="muted">احفظ الخريطة مرة واحدة لكل بنك بدل إدخالها مع كل ملف.</p><form data-submit="saveBankMapping"><div class="field"><label>ملاحظات</label><input id="mapNotes" value="${esc(firstMap.notes || "")}" placeholder="مثلاً: كشف بنك الإنماء صيغة مايو 2026"></div><button class="btn gold">حفظ خريطة البنك الحالية</button></form></div><div class="card"><h2>إضافة عملية بنك يدويًا</h2><form data-submit="addBank" autocomplete="off"><div class="grid"><div class="field"><label>التاريخ</label><input id="bDate" type="date" required></div><div class="field"><label>الوصف</label><input id="bDesc" required></div><div class="field"><label>المبلغ</label><input id="bAmount" type="number" step="0.01" required></div><div class="field"><label>المرجع</label><input id="bRef"></div></div><button class="btn teal">حفظ العملية</button></form></div>${bankMappingTable(mappingRes.mappings || [])}${bankImportTable(imports.imports)}${bankTable(tx.transactions)}${matchTable(matches.matches)}`;
}
function bankMappingTable(rows) { return `<div class="card"><h2>خرائط البنوك المحفوظة</h2><div class="table-wrap"><table><thead><tr><th>البنك</th><th>الخريطة</th><th>آخر تحديث</th><th>ملاحظات</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.bank_key)}</td><td><pre>${esc(JSON.stringify(r.mapping || {}))}</pre></td><td>${fmtDate(r.updated_at)}</td><td>${esc(r.notes || "-")}</td></tr>`).join("") || `<tr><td colspan="4">لا توجد خرائط محفوظة.</td></tr>`}</tbody></table></div></div>`; }
function bankTable(rows) { return `<div class="card"><h2>آخر العمليات البنكية المقروءة</h2><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.transaction_date)}</td><td>${esc(r.description)}</td><td>${money(r.amount)}</td><td><span class="status ${r.status}">${statusLabel[r.status]}</span></td></tr>`).join("") || `<tr><td colspan="4">لا توجد عمليات.</td></tr>`}</tbody></table></div></div>`; }
function bankImportTable(rows) { return `<div class="card"><h2>آخر ملفات كشوف البنك</h2><div class="table-wrap"><table><thead><tr><th>الملف</th><th>البنك</th><th>الصفوف</th><th>المستوردة</th><th>المتجاهلة</th><th>الحالة</th></tr></thead><tbody>${(rows||[]).map(r=>`<tr><td>${esc(r.original_filename)}</td><td>${esc(r.bank_key)}</td><td>${esc(r.total_rows)}</td><td>${esc(r.imported_rows)}</td><td>${esc(r.skipped_rows)}</td><td>${esc(r.status)}</td></tr>`).join("") || `<tr><td colspan="6">لم يتم رفع أي كشف.</td></tr>`}</tbody></table></div></div>`; }
function matchTable(rows) { return `<div class="card"><h2>مطابقة السداد</h2><div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>العميل</th><th>البنك</th><th>النسبة</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.invoice_number)}</td><td>${esc(r.customer_name)}</td><td>${esc(r.bank_description)} — ${money(r.bank_amount)}</td><td>${Math.min(100, Number(r.score))}%</td><td><span class="status ${r.status}">${statusLabel[r.status]}</span></td><td>${r.status==='PENDING'?`<button class="btn teal" data-action="approveMatch" data-id="${esc(r.id)}">اعتماد</button> <button class="btn danger" data-action="rejectMatch" data-id="${esc(r.id)}">رفض</button>`:'-'}</td></tr>`).join("") || `<tr><td colspan="6">لا توجد مطابقات.</td></tr>`}</tbody></table></div></div>`; }
async function addBank(e) { e.preventDefault(); await api("/bank/transactions", { method:"POST", body: JSON.stringify({ transactionDate:qs("bDate").value, description:qs("bDesc").value, amount:Number(qs("bAmount").value), reference:qs("bRef").value }) }); setMsg("تم حفظ العملية البنكية.", "ok"); await renderBank(); }
function collectBankMappingFromForm() {
  const mapping = {};
  if (qs("mapDate")?.value) mapping.date = qs("mapDate").value;
  if (qs("mapDesc")?.value) mapping.description = qs("mapDesc").value;
  if (qs("mapAmount")?.value) mapping.amount = qs("mapAmount").value;
  if (qs("mapCredit")?.value) mapping.credit = qs("mapCredit").value;
  if (qs("mapDebit")?.value) mapping.debit = qs("mapDebit").value;
  if (qs("mapRef")?.value) mapping.reference = qs("mapRef").value;
  return mapping;
}
async function uploadBankStatement(e) { e.preventDefault(); const file = qs("bankFile").files[0]; if (!file) return setMsg("اختر ملف كشف البنك.", "error"); const fd = new FormData(); fd.append("file", file); fd.append("bankKey", qs("bankKey").value || "default"); const mapping = collectBankMappingFromForm(); if (Object.keys(mapping).length) fd.append("mapping", JSON.stringify(mapping)); try { const r = await api("/bank/statement/upload", { method:"POST", body: fd }); setMsg(`تم استيراد ${r.imported} عملية من كشف البنك، وتم إنشاء ${r.matching?.created || 0} مطابقة مقترحة.`, "ok"); await renderBank(); } catch (err) { setMsg(err.message, "error"); } }
async function saveBankMapping(e) { e.preventDefault(); const bankKey = qs("bankKey").value || "default"; const mapping = collectBankMappingFromForm(); if (!mapping.date || !mapping.description || !(mapping.amount || mapping.credit)) return setMsg("احفظ التاريخ والوصف وعمود المبلغ أو الدائن على الأقل.", "error"); await api(`/bank/mapping/${encodeURIComponent(bankKey)}`, { method:"PUT", body: JSON.stringify({ mapping, notes: qs("mapNotes")?.value || "" }) }); setMsg("تم حفظ خريطة البنك.", "ok"); await renderBank(); }
async function runMatching() { const r = await api("/matches/run", { method:"POST" }); setMsg(`تم إنشاء ${r.created} مطابقة محتملة.`, "ok"); await renderBank(); }
async function approveMatch(id) { await api(`/matches/${id}/approve`, { method:"POST" }); setMsg("تم اعتماد المطابقة.", "ok"); await renderBank(); }
async function rejectMatch(id) { await api(`/matches/${id}/reject`, { method:"POST" }); setMsg("تم رفض المطابقة.", "ok"); await renderBank(); }

async function renderReports() {
  const data = await api("/reports/finance");
  const s = data.summary || {};
  qs("content").innerHTML = `<div class="card"><h2>لوحة CFO للتحصيل</h2><div class="grid"><div class="field"><label>من تاريخ</label><input id="repFrom" type="date"></div><div class="field"><label>إلى تاريخ</label><input id="repTo" type="date"></div><div class="field"><label>العميل</label><input id="repCustomer" placeholder="اسم العميل"></div><div class="field"><label>&nbsp;</label><button class="btn teal" data-action="loadView" data-view="reports">تحديث</button></div></div><div class="actions"><button class="btn gold" data-action="downloadFinanceExcel">تصدير Excel</button><button class="btn light" data-action="downloadFinancePdf">تصدير PDF</button></div></div>
  <div class="grid"><div class="kpi">إجمالي الفواتير<strong>${s.total_invoices}</strong></div><div class="kpi">المستحق<strong>${money(s.outstanding_amount)}</strong></div><div class="kpi">المحصل<strong>${money(s.paid_amount)}</strong></div><div class="kpi">نسبة التحصيل<strong>${Number(s.collection_rate||0)}%</strong></div><div class="kpi">وعود سداد<strong>${s.promised_invoices||0}</strong></div><div class="kpi">متنازع عليها<strong>${s.disputed_invoices||0}</strong></div></div>
  ${agingTable(data.agingBuckets||[])}${topOverdueTable(data.topOverdueCustomers||[])}${overdueTable(data.overdueInvoices||[])}${monthlyTable(data.monthlyComparison||[])}`;
}
function agingTable(rows){ return `<div class="card"><h2>أعمار الذمم</h2><div class="table-wrap"><table><thead><tr><th>العمر</th><th>العدد</th><th>المبلغ</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.bucket)}</td><td>${esc(r.count)}</td><td>${money(r.amount)}</td></tr>`).join('') || `<tr><td colspan="3">لا توجد مبالغ مستحقة.</td></tr>`}</tbody></table></div></div>`; }
function topOverdueTable(rows){ return `<div class="card"><h2>العملاء الأعلى تأخرًا</h2><div class="table-wrap"><table><thead><tr><th>العميل</th><th>الفواتير</th><th>المبلغ</th><th>أعلى تأخر</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.customer_name)}</td><td>${esc(r.invoice_count)}</td><td>${money(r.amount)}</td><td>${esc(r.max_days_overdue||0)} يوم</td></tr>`).join('') || `<tr><td colspan="4">لا توجد فواتير متأخرة.</td></tr>`}</tbody></table></div></div>`; }
function overdueTable(rows){ return `<div class="card"><h2>الفواتير المتأخرة</h2><div class="table-wrap"><table><thead><tr><th>الفاتورة</th><th>العميل</th><th>المبلغ</th><th>الأيام</th><th>الحالة</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.invoice_number)}</td><td>${esc(r.customer_name)}</td><td>${money(r.total_amount)}</td><td>${esc(r.days_overdue||0)}</td><td>${esc(r.collection_status||'NORMAL')}</td></tr>`).join('') || `<tr><td colspan="5">لا توجد فواتير متأخرة.</td></tr>`}</tbody></table></div></div>`; }
function monthlyTable(rows){ return `<div class="card"><h2>مقارنة شهرية للتحصيل</h2><div class="table-wrap"><table><thead><tr><th>الشهر</th><th>الفواتير</th><th>الإجمالي</th><th>المحصل</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.month)}</td><td>${esc(r.invoices)}</td><td>${money(r.total_amount)}</td><td>${money(r.paid_amount)}</td></tr>`).join('') || `<tr><td colspan="4">لا توجد بيانات.</td></tr>`}</tbody></table></div></div>`; }

async function renderAccountingImport() {
  const connectors = await api("/integrations/accounting/connectors").catch(()=>({connectors:[]}));
  const logs = await api("/integrations/accounting/sync-logs").catch(()=>({logs:[]}));
  qs("content").innerHTML = `<div class="card"><h2>استيراد فواتير من النظام المحاسبي</h2><p class="muted">يدعم قيود، دفترة، Odoo، Zoho، أو ملف Excel/CSV من أي نظام. لا تُرسل أسرار النظام المحاسبي عبر المتصفح إلا عبر HTTPS.</p><form data-submit="uploadAccountingInvoices" enctype="multipart/form-data"><div class="grid"><div class="field"><label>النظام</label><select id="accSystem"><option value="qoyod">قيود</option><option value="daftara">دفترة</option><option value="odoo">Odoo</option><option value="zoho">Zoho</option><option value="generic">أخرى</option></select></div><div class="field"><label>ملف الفواتير Excel/CSV</label><input id="accFile" type="file" accept=".csv,.xlsx,.xls" required></div></div><details><summary>خريطة الأعمدة</summary><div class="grid"><div class="field"><label>رقم الفاتورة</label><input id="accMapInvoice" placeholder="Invoice Number"></div><div class="field"><label>اسم العميل</label><input id="accMapCustomer" placeholder="Customer"></div><div class="field"><label>الرقم الضريبي</label><input id="accMapTax" placeholder="VAT"></div><div class="field"><label>المبلغ</label><input id="accMapAmount" placeholder="Total"></div><div class="field"><label>رقم واتساب العميل</label><input id="accMapPhone" placeholder="Phone"></div><div class="field"><label>تاريخ الفاتورة</label><input id="accMapDate" placeholder="Invoice Date"></div><div class="field"><label>تاريخ الاستحقاق</label><input id="accMapDue" placeholder="Due Date"></div></div></details><button class="btn teal">استيراد الفواتير</button><button class="btn gold" type="button" data-action="loadView" data-view="invoices">عرض الفواتير</button></form></div>
  <div class="card"><h2>حفظ خريطة النظام</h2><form data-submit="saveAccountingMapping"><div class="field"><label>ملاحظات</label><input id="accMapNotes" placeholder="مثلاً: ملف تصدير قيود القياسي"></div><button class="btn gold">حفظ الخريطة</button></form></div>
  <div class="card"><h2>الأنظمة المدعومة</h2><div class="table-wrap"><table><thead><tr><th>النظام</th><th>الحالة</th><th>المتطلبات</th></tr></thead><tbody>${connectors.connectors.map(c=>`<tr><td>${esc(c.label)}</td><td>${esc(c.status)}</td><td>${esc((c.required||[]).join('، '))}</td></tr>`).join('')}</tbody></table></div></div>${accountingLogsTable(logs.logs||[])}`;
}
function accountingMappingFromForm(){ return { invoiceNumber:qs("accMapInvoice").value || "invoiceNumber", customerName:qs("accMapCustomer").value || "customerName", supplierTaxNumber:qs("accMapTax").value || "supplierTaxNumber", totalAmount:qs("accMapAmount").value || "totalAmount", customerPhone:qs("accMapPhone").value || "customerPhone", invoiceDate:qs("accMapDate").value || "invoiceDate", dueDate:qs("accMapDue").value || "dueDate" }; }
async function uploadAccountingInvoices(e){ e.preventDefault(); const file=qs("accFile").files[0]; if(!file) return setMsg("اختر ملف فواتير.","error"); const fd=new FormData(); fd.append("file",file); fd.append("systemName",qs("accSystem").value); fd.append("mapping",JSON.stringify(accountingMappingFromForm())); const r=await api("/integrations/accounting/imports/upload",{method:"POST",body:fd}); setMsg(`تم استيراد ${r.imported} فاتورة، وتجاهل ${r.skipped}.`,"ok"); await renderAccountingImport(); }
async function saveAccountingMapping(e){ e.preventDefault(); await api("/integrations/accounting/mapping",{method:"PUT",body:JSON.stringify({systemName:qs("accSystem").value,mapping:accountingMappingFromForm(),notes:qs("accMapNotes").value})}); setMsg("تم حفظ خريطة استيراد الفواتير.","ok"); }
function accountingLogsTable(rows){ return `<div class="card"><h2>سجل المزامنة المحاسبية</h2><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>النظام</th><th>الاتجاه</th><th>الحدث</th><th>الحالة</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDate(r.created_at)}</td><td>${esc(r.system_name)}</td><td>${esc(r.direction)}</td><td>${esc(r.event_type)}</td><td>${esc(r.status)}</td></tr>`).join('') || `<tr><td colspan="5">لا توجد عمليات مزامنة.</td></tr>`}</tbody></table></div></div>`; }


async function renderSupport() { const { tickets } = await api("/support/tickets"); qs("content").innerHTML = `<div class="card"><h2>تذكرة دعم فني</h2><form data-submit="addTicket"><div class="grid"><div class="field"><label>التصنيف</label><select id="sCat"><option value="login">الدخول</option><option value="invoice">الفواتير</option><option value="whatsapp">واتساب</option><option value="bank">البنك</option><option value="reports">التقارير</option><option value="permissions">الصلاحيات</option><option value="other">أخرى</option></select></div><div class="field"><label>الأولوية</label><select id="sPri"><option value="normal">عادية</option><option value="high">عالية</option><option value="low">منخفضة</option></select></div></div><div class="field"><label>وصف مختصر</label><textarea id="sDesc" minlength="5" required></textarea><small class="muted">الوصف يجب أن يكون 5 أحرف على الأقل.</small></div><button class="btn teal">إرسال التذكرة</button></form></div><div class="card"><h2>التذاكر</h2><div class="table-wrap"><table><thead><tr><th>الرقم</th><th>التصنيف</th><th>الأولوية</th><th>الحالة</th><th>الوصف</th><th>رد الدعم</th></tr></thead><tbody>${tickets.map(t=>`<tr><td>${esc(t.id.slice(0,8))}</td><td>${esc(t.category)}</td><td>${esc(t.priority)}</td><td>${esc(t.status)}</td><td>${esc(t.description)}</td><td>${esc(t.support_response || "بانتظار رد الدعم")}</td></tr>`).join("") || `<tr><td colspan="6">لا توجد تذاكر.</td></tr>`}</tbody></table></div></div>`; }
async function addTicket(e) { e.preventDefault(); if ((qs("sDesc").value || "").trim().length < 5) return setMsg("الوصف يجب أن يكون 5 أحرف على الأقل.", "error"); await api("/support/tickets", { method:"POST", body: JSON.stringify({ category:qs("sCat").value, priority:qs("sPri").value, description:qs("sDesc").value }) }); setMsg("تم إرسال تذكرة الدعم.", "ok"); await renderSupport(); }

async function renderAudit() { const { auditLogs } = await api("/audit-logs"); qs("content").innerHTML = `<div class="card"><h2>سجل التدقيق</h2><div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>الإجراء</th><th>الكيان</th><th>المستخدم</th></tr></thead><tbody>${auditLogs.map(a=>`<tr><td>${fmtDate(a.created_at)}</td><td>${esc(a.action)}</td><td>${esc(a.entity_type)}</td><td>${esc(a.user_id || "-")}</td></tr>`).join("") || `<tr><td colspan="4">لا توجد سجلات.</td></tr>`}</tbody></table></div></div>`; }

async function logout() { await api("/auth/logout", { method: "POST" }).catch(()=>{}); state.token = ""; state.user = null; state.company = null; renderLogin(); }

boot();
