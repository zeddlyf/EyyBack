const axios = require('axios');

async function sendSmsPhilSMS({ to, message }) {
  const apiKey = process.env.PHILSMS_API_KEY;
  if (!apiKey) {
    throw new Error('PHILSMS_API_KEY is not configured');
  }

  // PHILSMS API reference varies; using common pattern. Adjust endpoint/params if needed.
  const payload = {
    recipient: to,
    message,
  };

  if (process.env.PHILSMS_SENDER_ID) {
    payload.sender_id = process.env.PHILSMS_SENDER_ID;
  }

  try {
    const res = await axios.post(
      process.env.PHILSMS_ENDPOINT || 'https://api.philsms.com/v1/messages',
      payload,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return res.data;
  } catch (err) {
    const message = err.response?.data?.message || err.message || 'SMS send failed';
    throw new Error(message);
  }
}

module.exports = { sendSmsPhilSMS };
