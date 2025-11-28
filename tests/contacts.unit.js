const assert = require('assert')
const mongoose = require('mongoose')
const Contact = require('../models/Contact')

;(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eyytrike_test')
  const owner = new mongoose.Types.ObjectId()
  const ok = await Contact.create({ owner, userType: 'driver', name: 'John Doe', phone: '+639123456789', email: 'john@example.com' })
  assert.ok(ok._id)
  try { await Contact.create({ owner, userType: 'driver', name: 'Bad', phone: '123' }) } catch (e) { assert.ok(String(e.message).includes('Invalid phone')) }
  const upd = await Contact.findByIdAndUpdate(ok._id, { email: 'bad' }, { new: true, runValidators: true }).catch(e => e)
  assert.ok(String(upd.message || '').includes('Invalid email'))
  await Contact.deleteMany({ owner })
  await mongoose.disconnect()
  console.log('contacts.unit.js passed')
})()
