var serveStatic = require('serve-static')
var _ = require('underscore')
var extend = require('node.extend')

var oneMonth = 31 * 86400000

module.exports = function (app, reporter) {
  function handleError (req, res, err) {
    res.status(500)

    if (_.isString(err)) {
      err = {
        message: err
      }
    }

    err = err || {}
    err.message = err.message || 'Unrecognized error'

    if (err.unauthorized) {
      res.setHeader('WWW-Authenticate', 'Basic realm=\'realm\'')
      res.status(401).end()
      return
    }

    var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl

    var logFn = err.weak ? reporter.logger.warn : reporter.logger.error

    logFn('Error during processing request: ' + fullUrl + ' details: ' + err.message + ' ' + err.stack)

    if ((req.get('Content-Type') && (req.get('Content-Type').indexOf('application/json') !== -1)) ||
      (req.get('Accept') && (req.get('Accept').indexOf('application/json') !== -1))) {
      return res.send({message: err.message, stack: err.stack})
    }

    res.write('Error occured - ' + err.message + '\n')
    if (err.stack) {
      res.write('Stak - ' + err.stack)
    }
    res.end()
  }

  app.use(function (req, res, next) {
    res.error = function (err) {
      handleError(req, res, err)
    }

    next()
  })

  reporter.emit('after-express-static-configure', app)
  reporter.emit('express-before-odata', app)

  var odataServer = require('simple-odata-server')()
  reporter.documentStore.adaptOData(odataServer)

  odataServer.error(function (req, res, err, def) {
    if (err.unauthorized) {
      res.error(err)
    } else {
      reporter.logger.error('Error when processing OData ' + req.method + ': ' + req.originalUrl + ' ' + err.stack)
      def(err)
    }
  })

  app.use('/odata', function (req, res) {
    odataServer.handle(req, res)
  })

  reporter.extensionsManager.extensions.map(function (e) {
    app.use('/extension/' + e.name, serveStatic(e.directory, {maxAge: oneMonth}))
  })

  /**
   * Main entry point for invoking report rendering
   */
  app.post('/api/report', function (req, res, next) {
    res.setTimeout((reporter.options.express || {}).renderTimeout || (20 * 60 * 1000))
    req.template = req.body.template
    req.data = req.body.data
    req.options = req.body.options || {}

    extend(true, req.headers, req.body.headers)

    if (!req.template) {
      return next("Could not parse report template, aren't you missing content type?")
    }

    reporter.render(req).then(function (response) {
      // copy headers to the final response
      if (response.headers) {
        for (var key in response.headers) {
          if (response.headers.hasOwnProperty(key)) {
            res.setHeader(key, response.headers[key])
          }
        }
      }

      if (!response.headers['Content-Disposition'] && !req.options['Content-Disposition']) {
        res.setHeader('Content-Disposition', (req.options.preview ? 'inline' : 'attachment') + ';filename=report.' + response.headers['File-Extension'])
      }

      if (req.options['Content-Disposition']) {
        res.setHeader('Content-Disposition', req.options['Content-Disposition'])
      }

      res.setHeader('X-XSS-Protection', 0)

      response.stream.pipe(res)
    }).catch(next).done()
  })

  app.get('/api/version', function (req, res, next) {
    res.send(reporter.version)
  })

  app.get('/api/settings', function (req, res, next) {
    res.send({
      tenant: req.user
    })
  })

  app.get('/api/recipe', function (req, res, next) {
    res.json(_.map(reporter.extensionsManager.recipes, function (r) {
      return r.name
    }))
  })

  app.get('/api/engine', function (req, res, next) {
    res.json(_.map(reporter.extensionsManager.engines, function (r) {
      return r.name
    }))
  })

  app.get('/api/extensions', function (req, res, next) {
    res.json(reporter.extensionsManager.extensions)
  })

  app.get('/api/ping', function (req, res, next) {
    res.send('pong')
  })

  app.use(function (err, req, res, next) {
    handleError(req, res, err)
  })
}
