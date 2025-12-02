const axios = require('axios')

const base = process.env.BASE_URL || 'http://localhost:3000'
const token = process.env.TEST_JWT || ''

async function run() {
  if (!process.env.XENDIT_API_KEY) {
    console.log('Skipping: XENDIT_API_KEY not set')
    return
  }
  if (!token) {
    console.log('Skipping: TEST_JWT not set')
    return
  }
  try {
    const headers = { Authorization: `Bearer ${token}` }
    const create = await axios.post(`${base}/api/payments`, { amount: 100, currency: 'PHP', method: 'invoice', description: 'Test payment' }, { headers })
    console.log('Created:', create.data)
    const list = await axios.get(`${base}/api/payments`, { headers })
    console.log('List count:', Array.isArray(list.data) ? list.data.length : 0)
  } catch (e) {
    console.error('Test error:', e.message)
  }
}

run()

