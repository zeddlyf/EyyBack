function toResource(type, doc) {
  return { type, id: String(doc._id), attributes: strip(doc) }
}

function strip(doc) {
  const obj = doc.toObject ? doc.toObject() : doc
  const { _id, __v, ...attrs } = obj
  return attrs
}

function ok(type, data, meta) {
  const payload = Array.isArray(data) ? data.map(d => toResource(type, d)) : toResource(type, data)
  const res = { data: payload }
  if (meta) res.meta = meta
  return res
}

function error(status, title, detail) {
  return { errors: [{ status, title, detail }] }
}

module.exports = { toResource, ok, error }
