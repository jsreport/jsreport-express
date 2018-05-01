
function handleError (reporter) {
  return function handleErrorMiddleware (req, res, err) {
    res.status(500)

    if (typeof err === 'string') {
      err = {
        message: err
      }
    }

    err = err || {}
    err.message = err.message || 'Unrecognized error'

    if (err.statusCode != null) {
      res.status(err.statusCode)
    }

    if (err.code === 'UNAUTHORIZED') {
      res.setHeader('WWW-Authenticate', (req.authSchema || 'Basic') + ' realm=\'realm\'')
      res.status(err.statusCode != null ? err.statusCode : 401).end()
      return
    }

    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl
    let logFn
    let msg
    let isJSON = false

    if (!req.__isJsreportRequest__) {
      if (err.weak) {
        res.status(err.statusCode != null ? err.statusCode : 400)
      }

      logFn = err.weak ? reporter.logger.warn : reporter.logger.error
    } else {
      logFn = () => {}
    }

    if (
      (req.get('Content-Type') &&
      (req.get('Content-Type').indexOf('application/json') !== -1)) ||
      (req.get('Accept') && (req.get('Accept').indexOf('application/json') !== -1))
    ) {
      isJSON = true
      msg = err.message
    } else {
      // err.stack itself normally includes the message
      // we try to not duplicate it in the output
      if (err.stack && err.stack.includes(err.message)) {
        msg = err.stack
      } else {
        msg = `${err.message}\n${err.stack}`
      }
    }

    if (isRequestTooLarge(err)) {
      msg = `Input request reached limit of ${err.limit} byte(s), current size: ${err.length} byte(s). The limit can be increased using config extensions.express.inputRequestLimit=50mb. ${msg}`
    }

    logFn(`Error during processing request: ${fullUrl} details: ${msg}${isJSON ? ` stack: ${err.stack}` : ''}`)

    if (isJSON) {
      res.send({ message: msg, stack: err.stack })
    } else {
      res.write(msg)
      res.end()
    }
  }
}

function isRequestTooLarge (err) {
  // add more clear message when error comes from express
  if (err && err.status === 413 && err.type === 'entity.too.large') {
    return true
  }

  return false
}

module.exports = handleError
