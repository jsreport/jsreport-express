const serveStatic = require('serve-static')
const oneMonth = 31 * 86400000

module.exports = (app, reporter) => {
  function handleError (req, res, err) {
    res.status(500)

    if (typeof err === 'string') {
      err = {
        message: err
      }
    }

    err = err || {}
    err.message = err.message || 'Unrecognized error'

    if (err.unauthorized) {
      res.setHeader('WWW-Authenticate', (req.authSchema || 'Basic') + ' realm=\'realm\'')
      res.status(401).end()
      return
    }

    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl

    const logFn = err.weak ? reporter.logger.warn : reporter.logger.error

    logFn('Error during processing request: ' + fullUrl + ' details: ' + err.message + ' ' + err.stack)

    if ((req.get('Content-Type') && (req.get('Content-Type').indexOf('application/json') !== -1)) ||
      (req.get('Accept') && (req.get('Accept').indexOf('application/json') !== -1))) {
      return res.send({ message: err.message, stack: err.stack })
    }

    res.write('Error occured - ' + err.message + '\n')
    if (err.stack) {
      res.write('Stak - ' + err.stack)
    }
    res.end()
  }

  app.use((req, res, next) => {
    res.error = (err) => handleError(req, res, err)
    next()
  })

  reporter.emit('after-express-static-configure', app)
  reporter.emit('express-before-odata', app)

  const odataServer = require('simple-odata-server')()
  reporter.documentStore.adaptOData(odataServer)

  odataServer.error((req, res, err, def) => {
    if (err.unauthorized) {
      res.error(err)
    } else {
      reporter.logger.error('Error when processing OData ' + req.method + ': ' + req.originalUrl + ' ' + err.stack)
      def(err)
    }
  })

  app.use('/odata', (req, res) => odataServer.handle(req, res))

  reporter.extensionsManager.extensions.forEach((e) => app.use('/extension/' + e.name, serveStatic(e.directory, { maxAge: oneMonth })))

  /**
   * Main entry point for invoking report rendering
   */
  app.post('/api/report/:name?', (req, res, next) => {
    res.setTimeout((reporter.options.express || {}).renderTimeout || (20 * 60 * 1000))

    if (!req.body.template) {
      return next("Could not parse report template, aren't you missing content type?")
    }

    const renderRequest = {
      template: req.body.template,
      data: req.body.data,
      options: req.body.options || {},
      context: {
        http: {
          headers: req.body.headers
        }
      }
    }

    reporter.render(renderRequest).then((renderResponse) => {
      if (renderResponse.meta.headers) {
        for (const key in renderResponse.meta.headers) {
          res.setHeader(key, renderResponse.meta.headers[key])
        }
      }

      if (renderResponse.contentType) {
        res.setHeader('Content-Type', renderResponse.contentType)
      }

      if (!renderResponse.meta.contentDisposition && !renderRequest.options['Content-Disposition']) {
        res.setHeader('Content-Disposition', (renderRequest.options.preview ? 'inline' : 'attachment') + ';filename=report.' + renderResponse.meta.fileExtension)
      }

      if (renderRequest.options['Content-Disposition']) {
        res.setHeader('Content-Disposition', renderRequest.options['Content-Disposition'])
      }

      if (renderRequest.options.download) {
        res.setHeader('Content-Disposition', res.getHeader('Content-Disposition').replace('inline;', 'attachment;'))
      }

      res.setHeader('X-XSS-Protection', 0)

      renderResponse.stream.pipe(res)
    }).catch(next)
  })

  app.get('/api/version', (req, res, next) => res.send(reporter.version))

  app.get('/api/settings', (req, res, next) => res.send({
    tenant: req.user
  }))

  app.get('/api/recipe', (req, res, next) => res.json(reporter.extensionsManager.recipes.map((r) => r.name)))

  app.get('/api/engine', (req, res, next) => res.json(reporter.extensionsManager.engines.map((r) => r.name)))

  app.get('/api/extensions', (req, res, next) => res.json(reporter.extensionsManager.extensions))

  app.get('/api/ping', (req, res, next) => {
    if (!reporter._initialized) {
      return res.status(403).send('Not yet initialized.')
    }
    res.send('pong')
  })

  app.use((err, req, res, next) => handleError(req, res, err))
}
