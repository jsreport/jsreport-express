
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

    if (err.unauthorized) {
      res.setHeader('WWW-Authenticate', (req.authSchema || 'Basic') + ' realm=\'realm\'')
      res.status(401).end()
      return
    }

    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl

    if (!req.__isJsreportRequest__) {
      const logFn = err.weak ? reporter.logger.warn : reporter.logger.error
      logFn('Error during processing request: ' + fullUrl + ' details: ' + err.message + ' ' + err.stack)
    }

    if ((req.get('Content-Type') && (req.get('Content-Type').indexOf('application/json') !== -1)) ||
      (req.get('Accept') && (req.get('Accept').indexOf('application/json') !== -1))) {
      return res.send({ message: err.message, stack: err.stack })
    }

    // err.stack itself normally includes the message
    // we try to not duplicate it in the output
    if (err.stack && err.stack.includes(err.message)) {
      res.write(err.stack)
    } else {
      res.write(err.message)
    }

    res.end()
  }
}

module.exports = handleError
