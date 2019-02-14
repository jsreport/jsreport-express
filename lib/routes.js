const get = require('lodash.get')
const set = require('lodash.set')
const serveStatic = require('serve-static')
const handleError = require('./handleError')
const odata = require('./odata')
const oneMonth = 31 * 86400000

function isInvalidASCII (str) {
  return [...str].some(char => char.charCodeAt(0) > 127)
}

function getPublicOptionsForExtension (reporter, extensionName, extensionOptions) {
  const extensionSchema = reporter.optionsValidator.getSchema(extensionName)
  const publicProps = []

  // support exposing the whole object
  if (extensionSchema && extensionSchema.$exposeToApi === true) {
    return extensionOptions
  }

  if (!extensionSchema || extensionSchema.type !== 'object' || !extensionSchema.properties) {
    return []
  }

  function search (parentName, name, item) {
    const fullName = parentName != null ? `${parentName}.${name}` : name

    if (item.$exposeToApi === true) {
      publicProps.push(fullName)
    } else if (item.type === 'object' || (Array.isArray(item.type) && item.type.includes('object'))) {
      if (item.properties) {
        Object.entries(item.properties).forEach(([childKey, childItem]) => search(fullName, childKey, childItem))
      }
    }
  }

  Object.entries(extensionSchema.properties).forEach(([key, item]) => {
    search(null, key, item)
  })

  if (publicProps.length === 0) {
    return {}
  }

  // sort properties by level
  publicProps.sort((a, b) => {
    const parts = a.split('.')
    const parts2 = b.split('.')

    return parts.length - parts2.length
  })

  const options = {}

  publicProps.forEach((propPath) => {
    const value = get(extensionOptions, propPath)

    if (value != null) {
      set(options, propPath, value)
    }
  })

  return options
}

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
    let renderTimeout = (reporter.options.express || {}).renderTimeout

    if (renderTimeout == null) {
      renderTimeout = 20 * 60 * 1000
    }

    res.setTimeout(renderTimeout)

    let baseUrl

    if (req.context.http && req.context.http.baseUrl != null) {
      baseUrl = req.context.http.baseUrl
    } else {
      baseUrl = req.protocol + '://' + req.get('host') + reporter.options.appPath
    }

    renderRequest = Object.assign({}, renderRequest, {
      options: renderRequest.options || {},
      context: Object.assign({}, renderRequest.context, req.context, {
        http: {
          baseUrl: baseUrl.replace(/\/$/, ''), // remove slash at the end
          headers: req.headers,
          query: req.query
        }
      })
    })

    reporter.render(renderRequest).then((renderResponse) => {
      res.setHeader('X-XSS-Protection', 0)
      res.setHeader('Content-Type', renderResponse.meta.contentType)

      let reportName = renderResponse.meta.reportName
      reportName = isInvalidASCII(reportName) ? 'report' : reportName
      res.setHeader('Content-Disposition', (`inline;filename=${reportName}.${renderResponse.meta.fileExtension}`))

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

  app.get('/api/extensions', (req, res, next) => {
    const extensions = reporter.extensionsManager.extensions.map((extension) => {
      let publicOptions

      if (extension.options && Object.keys(extension.options).length > 0) {
        publicOptions = getPublicOptionsForExtension(reporter, extension.name, extension.options)
      } else {
        publicOptions = extension.options
      }

      return {
        name: extension.name,
        main: extension.main,
        dependencies: extension.dependencies,
        options: publicOptions
      }
    })

    res.json(extensions)
  })

  app.get('/api/ping', (req, res, next) => {
    if (!reporter._initialized) {
      return res.status(403).send('Not yet initialized.')
    }
    res.send('pong')
  })
}
