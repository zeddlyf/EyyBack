const axios = require('axios')

async function emit(event, payload) {
  const url = process.env.CONTACTS_WEBHOOK_URL || ''
  if (!url) return
  try { await axios.post(url, { event, payload }, { timeout: 5000 }) } catch {}
}

module.exports = { emit }
