
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
}

module.exports = handleError
