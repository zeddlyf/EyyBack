// middlewares/xenditWebhook.js
const xenditService = require('../services/xendit');

const verifyXenditWebhook = (req, res, next) => {
  const signature = req.headers['x-callback-token'];
  const isValid = xenditService.verifyWebhookSignature(
    signature,
    req.body,
    process.env.XENDIT_CALLBACK_TOKEN
  );

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
};

module.exports = verifyXenditWebhook;