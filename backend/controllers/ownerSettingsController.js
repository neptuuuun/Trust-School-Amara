/**
 * ownerSettingsController.js
 * --------------------------
 * Owner-only financial settings (cross-branch). Currently exposes the annual
 * registration fee. Reads/writes the `config/finance` doc via financeSettings.
 * Every change is appended to the immutable audit log.
 */

const { writeAudit } = require('../services/auditService');
const financeSettings = require('../services/financeSettings');

// GET /api/owner/settings — current finance settings (+ metadata for the UI).
const getSettings = async (req, res, next) => {
  try {
    const settings = await financeSettings.getFinanceSettings();
    return res.json({ settings });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/owner/annual-fee — set the global annual fee amount. Body: { amount }
const updateAnnualFee = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return res.status(400).json({ code: 'invalid-amount', message: 'المبلغ غير صالح. يجب أن يكون رقماً موجباً.' });
    }

    const before = await financeSettings.getAnnualFeeAmount();
    const actor  = { uid: req.user.uid, email: req.user.email || '', name: req.owner?.name || '', role: 'owner' };
    const value  = await financeSettings.setAnnualFeeAmount(numeric, actor);

    await writeAudit({
      actor,
      action:     'settings.update',
      targetType: 'config',
      targetId:   'finance',
      before:     { annualFeeAmount: before },
      after:      { annualFeeAmount: value },
    });

    return res.json({ annualFeeAmount: value });
  } catch (err) {
    if (err.code === 'invalid-amount') {
      return res.status(400).json({ code: 'invalid-amount', message: err.message });
    }
    next(err);
  }
};

module.exports = { getSettings, updateAnnualFee };
