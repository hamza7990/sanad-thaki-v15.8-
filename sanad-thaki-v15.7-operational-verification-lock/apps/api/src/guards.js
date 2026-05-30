function blockClientCompanyId(req, res, next) {
  const body = req.body || {};
  const query = req.query || {};
  const params = req.params || {};

  if (
    Object.prototype.hasOwnProperty.call(body, "companyId") ||
    Object.prototype.hasOwnProperty.call(body, "company_id") ||
    Object.prototype.hasOwnProperty.call(query, "companyId") ||
    Object.prototype.hasOwnProperty.call(query, "company_id") ||
    Object.prototype.hasOwnProperty.call(params, "companyId") ||
    Object.prototype.hasOwnProperty.call(params, "company_id")
  ) {
    return res.status(400).json({
      error: "companyId لا يُقبل من العميل. العزل يتم من جلسة المستخدم فقط."
    });
  }

  next();
}

module.exports = { blockClientCompanyId };
