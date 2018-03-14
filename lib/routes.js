const serveStatic = require('serve-static')
const handleError = require('./handleError')
const odata = require('./odata')
const oneMonth = 31 * 86400000

module.exports = (app, reporter) => {
  const handleErrorMiddleware = handleError(reporter)

  app.use((req, res, next) => {
    res.error = (err) => handleErrorMiddleware(req, res, err)
    next()
  })

  reporter.emit('after-express-static-configure', app)
  reporter.emit('express-before-odata', app)

  const odataServer = odata(reporter)
  app.use('/odata', (req, res) => odataServer.handle(req, res))

  reporter.extensionsManager.extensions.forEach((e) => app.use('/extension/' + e.name, serveStatic(e.directory, { maxAge: oneMonth })))

  reporter.express.render = (renderRequest, req, res, next) => {
    res.setTimeout((reporter.options.express || {}).renderTimeout || (20 * 60 * 1000))

    const baseUrl = req.protocol + '://' + req.get('host') + reporter.options.appPath

    renderRequest = Object.assign({}, renderRequest, {
      options: renderRequest.options || {},
      context: Object.assign({}, renderRequest.context, req.context, {
        http: {
          baseUrl: baseUrl.replace(/\/$/, ''), // remove slash at the end
          headers: req.body.headers
        }
      })
    })

    reporter.render(renderRequest).then((renderResponse) => {
      res.setHeader('X-XSS-Protection', 0)
      res.setHeader('Content-Type', renderResponse.meta.contentType)
      res.setHeader('Content-Disposition', `inline;filename=${renderResponse.meta.reportName}.${renderResponse.meta.fileExtension}`)

      if (renderRequest.options['Content-Disposition']) {
        res.setHeader('Content-Disposition', renderRequest.options['Content-Disposition'])
      }

      if (renderRequest.options.download) {
        res.setHeader('Content-Disposition', res.getHeader('Content-Disposition').replace('inline;', 'attachment;'))
      }

      if (renderResponse.meta.headers) {
        for (const key in renderResponse.meta.headers) {
          res.setHeader(key, renderResponse.meta.headers[key])
        }
      }

      renderResponse.stream.pipe(res)
    }).catch(next)
  }
  /**
   * Main entry point for invoking report rendering
   */
  app.post('/api/report/:name?', (req, res, next) => {
    if (!req.body.template) {
      return next("Could not parse report template, aren't you missing content type?")
    }

    reporter.express.render({
      template: req.body.template,
      data: req.body.data,
      options: req.body.options
    }, req, res, next)
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
}
