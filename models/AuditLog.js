const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema({
  resourceType: { type: String, required: true },
  resourceId: { type: String, required: true },
  actorId: { type: String, required: true },
  action: { type: String, enum: ['create', 'update', 'delete', 'restore'], required: true },
  changes: { type: Object, default: {} },
}, { timestamps: true })

auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 })

const AuditLog = mongoose.model('AuditLog', auditLogSchema)

module.exports = AuditLog
