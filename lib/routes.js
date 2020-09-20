const { pipeline } = require('stream')
const typeis = require('type-is')
const serveStatic = require('serve-static')
const clarinet = require('clarinet')
const handleError = require('./handleError')
const odata = require('./odata')
const omit = require('lodash.omit')
const oneMonth = 31 * 86400000

module.exports = (app, reporter, exposedOptions) => {
  reporter.on('export-public-route', (route) => reporter.authentication.publicRoutes.push('/api/ping'))
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

    renderRequest = Object.assign({}, renderRequest, {
      options: renderRequest.options || {},
      context: Object.assign({}, renderRequest.context, req.context)
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
  app.post('/api/report/:name?', customJSONParseMiddleware(reporter), (req, res, next) => {
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
    tenant: omit(req.user, 'password')
  }))

  app.get('/api/recipe', (req, res, next) => res.json(reporter.extensionsManager.recipes.map((r) => r.name)))

  app.get('/api/engine', (req, res, next) => res.json(reporter.extensionsManager.engines.map((r) => r.name)))

  app.get('/api/extensions', (req, res, next) => {
    const extensions = reporter.extensionsManager.extensions.map((extension) => {
      let publicOptions = {}

      if (exposedOptions[extension.name] != null) {
        publicOptions = exposedOptions[extension.name]
      }

      return {
        name: extension.name,
        main: extension.main,
        source: extension.source,
        version: extension.version,
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

function isInvalidASCII (str) {
  return [...str].some(char => char.charCodeAt(0) > 127)
}

function typeChecker (type) {
  return function checkType (req) {
    return Boolean(typeis(req, type))
  }
}

function customJSONParseMiddleware (reporter) {
  const strategy = reporter.options.templatingEngines.strategy

  if (strategy === 'worker-threads') {
    return (req, res, next) => parseJSONWithDataAsShared(reporter, req, res, next)
  }

  return reporter.express.JSONParseMiddleware
}

function parseJSONWithDataAsShared (reporter, req, res, next) {
  if (req._body) {
    return next()
  }

  req.body = req.body || {}

  // skip requests without bodies
  if (!typeis.hasBody(req)) {
    return next()
  }

  const shouldParse = typeChecker('application/json')

  if (!shouldParse(req)) {
    return next()
  }

  req._body = true

  const jsonStreamParser = clarinet.createStream()

  const stack = []
  let currentKey
  let result
  let concatStr = false
  const strParts = []

  const closeConcatStr = () => {
    normalizeLastStrPart()
    concatStr = false
    stack[0].data = reporter.createRequestData(strParts.join(''))
  }

  const removeLastFromStack = () => {
    const removed = stack.pop()

    if (stack.length === 0) {
      result = removed
    }
  }

  const normalizeLastStrPart = () => {
    const lastPart = strParts[strParts.length - 1]

    if (lastPart && lastPart.endsWith(',')) {
      strParts[strParts.length - 1] = strParts[strParts.length - 1].slice(0, -1)
    }
  }

  jsonStreamParser.on('value', (val) => {
    if (concatStr) {
      strParts.push(`${JSON.stringify(val)},`)
      return
    }

    const item = stack[stack.length - 1]

    if (item == null) {
      result = val
      return
    }

    if (typeof item.push === 'function' && currentKey == null) {
      item.push(val)
    } else if (currentKey != null) {
      item[currentKey] = val
      currentKey = undefined
    }
  })

  jsonStreamParser.on('openobject', function (key) {
    if (concatStr) {
      strParts.push(`{"${key}":`)
      stack.push(null)
      return
    }

    if (stack.length === 1 && key === 'data') {
      concatStr = true
      stack.push(null)
      return
    }

    const item = stack[stack.length - 1]
    const obj = {}

    if (item != null) {
      if (typeof item.push === 'function' && currentKey == null) {
        item.push(obj)
      } else if (currentKey != null) {
        item[currentKey] = obj
      }
    }

    stack.push(obj)
    currentKey = key
  })

  jsonStreamParser.on('openarray', function () {
    if (concatStr) {
      strParts.push('[')
      stack.push(null)
      return
    }

    const item = stack[stack.length - 1]
    const arr = []

    if (item != null) {
      if (typeof item.push === 'function' && currentKey == null) {
        item.push(arr)
      } else if (currentKey != null) {
        item[currentKey] = arr
      }
    }

    currentKey = undefined
    stack.push(arr)
  })

  jsonStreamParser.on('closeobject', function () {
    if (concatStr) {
      normalizeLastStrPart()
      strParts.push('},')
    }

    removeLastFromStack()

    if (concatStr && stack.length === 1) {
      closeConcatStr()
    }
  })

  jsonStreamParser.on('closearray', function () {
    if (concatStr) {
      normalizeLastStrPart()
      strParts.push('],')
    }

    removeLastFromStack()

    if (concatStr && stack.length === 1) {
      closeConcatStr()
    }
  })

  jsonStreamParser.on('key', function (key) {
    if (concatStr) {
      strParts.push(`"${key}":`)
      return
    }

    if (stack.length === 1 && key === 'data') {
      concatStr = true
      return
    }

    currentKey = key
  })

  jsonStreamParser.on('end', function () {
    // finish the write stream for the pipeline to finish
    this.emit('finish')
  })

  pipeline(req, jsonStreamParser, (err) => {
    if (err) {
      return next(err)
    }

    req.body = result

    next()
  })
}
