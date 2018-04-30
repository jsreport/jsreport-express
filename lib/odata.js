const ODataServer = require('simple-odata-server')
const Promise = require('bluebird')

module.exports = (reporter) => {
  const odataServer = ODataServer()

  odataServer
    .model(reporter.documentStore.model)
    .beforeQuery((col, query, req, cb) => {
      reporter.logger.debug('OData query on ' + col)
      cb()
    }).beforeUpdate((col, query, update, req, cb) => {
      reporter.logger.debug('OData update on ' + col)
      cb()
    }).beforeRemove((col, query, req, cb) => {
      reporter.logger.debug('OData remove from ' + col)
      cb()
    }).beforeInsert((col, doc, req, cb) => {
      reporter.logger.debug('OData insert into ' + col)
      cb()
    }).update((col, query, update, req, cb) => {
      return Promise.resolve(reporter.documentStore.collection(col).update(query, update, req)).asCallback(cb)
    })
    .insert((col, doc, req, cb) => {
      return Promise.resolve(reporter.documentStore.collection(col).insert(doc, req)).asCallback(cb)
    })
    .remove((col, query, req, cb) => {
      return Promise.resolve(reporter.documentStore.collection(col).remove(query, req)).asCallback(cb)
    })
    .query((col, query, req, cb) => {
      let cursor = reporter.documentStore.collection(col).find(query.$filter, query.$select || {}, req)

      if (query.$sort) {
        cursor = cursor.sort(query.$sort)
      }
      if (query.$skip) {
        cursor = cursor.skip(query.$skip)
      }
      if (query.$limit) {
        cursor = cursor.limit(query.$limit)
      }

      if (query.$count) {
        return Promise.resolve(cursor.count()).asCallback(cb)
      }

      if (!query.$inlinecount) {
        return Promise.resolve(cursor.toArray()).asCallback(cb)
      }

      Promise.resolve(cursor.toArray().then((res) => {
        return reporter.documentStore.collection(col).find(query.$filter, query.$req).count().then((c) => {
          return {
            value: res,
            count: c
          }
        })
      })).asCallback(cb)
    }).error((req, res, err, def) => {
      if (err.code === 'UNAUTHORIZED') {
        res.error(err)
      } else {
        reporter.logger.error('Error when processing OData ' + req.method + ': ' + req.originalUrl + ' ' + err.stack)
        def(err)
      }
    })

  return odataServer
}
