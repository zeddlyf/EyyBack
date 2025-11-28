const express = require('express')
const router = express.Router()
const auth = require('../../middleware/auth')
const Contact = require('../../models/Contact')
const AuditLog = require('../../models/AuditLog')
const { ok, error } = require('../../utils/jsonapi')
const { emit } = require('../../services/webhook')

router.use(auth)

router.post('/', async (req, res) => {
  try {
    const { userType, name, phone, email, metadata } = req.body || {}
    const doc = await Contact.create({ owner: req.user._id, userType, name, phone, email, metadata })
    await AuditLog.create({ resourceType: 'contact', resourceId: String(doc._id), actorId: String(req.user._id), action: 'create', changes: req.body })
    emit('contacts.created', { id: String(doc._id) })
    res.status(201).json(ok('contact', doc))
  } catch (e) {
    res.status(400).json(error('400', 'Bad Request', e.message))
  }
})

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1))
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)))
    const includeDeleted = String(req.query.includeDeleted || 'false') === 'true'
    const filter = { owner: req.user._id }
    if (!includeDeleted) filter.isDeleted = false
    const total = await Contact.countDocuments(filter)
    const items = await Contact.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
    res.json(ok('contact', items, { page, limit, total, totalPages: Math.ceil(total / limit) }))
  } catch (e) {
    res.status(400).json(error('400', 'Bad Request', e.message))
  }
})

router.get('/user/:type', async (req, res) => {
  try {
    const type = String(req.params.type)
    const items = await Contact.find({ owner: req.user._id, userType: type, isDeleted: false }).sort({ createdAt: -1 })
    res.json(ok('contact', items))
  } catch (e) {
    res.status(400).json(error('400', 'Bad Request', e.message))
  }
})

router.get('/:id', async (req, res) => {
  try {
    const doc = await Contact.findOne({ _id: req.params.id, owner: req.user._id })
    if (!doc) return res.status(404).json(error('404', 'Not Found', 'Contact not found'))
    res.json(ok('contact', doc))
  } catch (e) {
    res.status(400).json(error('400', 'Bad Request', e.message))
  }
})

router.put('/:id', async (req, res) => {
  try {
    const patch = { ...req.body }
    delete patch.owner
    const doc = await Contact.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, patch, { new: true, runValidators: true })
    if (!doc) return res.status(404).json(error('404', 'Not Found', 'Contact not found'))
    await AuditLog.create({ resourceType: 'contact', resourceId: String(doc._id), actorId: String(req.user._id), action: 'update', changes: patch })
    emit('contacts.updated', { id: String(doc._id) })
    res.json(ok('contact', doc))
  } catch (e) {
    res.status(400).json(error('400', 'Bad Request', e.message))
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const doc = await Contact.findOne({ _id: req.params.id, owner: req.user._id })
    if (!doc) return res.status(404).json(error('404', 'Not Found', 'Contact not found'))
    doc.isDeleted = true
    doc.deletedAt = new Date()
    await doc.save()
    await AuditLog.create({ resourceType: 'contact', resourceId: String(doc._id), actorId: String(req.user._id), action: 'delete', changes: {} })
    emit('contacts.deleted', { id: String(doc._id) })
    res.json(ok('contact', doc))
  } catch (e) {
    res.status(400).json(error('400', 'Bad Request', e.message))
  }
})

module.exports = router
