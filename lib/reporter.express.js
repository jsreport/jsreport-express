/*!
 * Copyright(c) 2014 Jan Blaha
 */
var path = require('path')
var Promise = require('bluebird')
var bodyParser = require('body-parser')
var cookieParser = require('cookie-parser')
var fs = require('fs')
var http = require('http')
var https = require('https')
var cors = require('cors')
var routes = require('./routes.js')

var startAsync = function (reporter, server, port) {
  return new Promise(function (resolve, reject) {
    server.on('error', function (e) {
      reporter.logger.error('Error when starting http server on port ' + port + ' ' + e.stack)
      reject(e)
    }).on('listen', function () {
      resolve()
    })

    server.listen(port, reporter.options.hostname, function () {
      resolve()
    })
  })
}

var startExpressApp = function (reporter, app, config) {
  if (process.env.PORT) {
    if (process.env.PORT === '443') {
      config.httpPort = null
      config.httpsPort = 443
    } else {
      config.httpPort = process.env.PORT
      config.httpsPort = null
    }
  }

  // use random port if nothing specified
  if (!config.httpPort && !config.httpsPort) {
    config.httpPort = 0
  }

  // just http port is specified, lets start server on http
  if (!config.httpsPort) {
    reporter.express.server = http.createServer(app)

    return startAsync(reporter, reporter.express.server, config.httpPort)
  }

  // http and https port specified
  // fist start http => https redirector
  if (config.httpPort) {
    http.createServer(function (req, res) {
      res.writeHead(302, {
        'Location': 'https://' + req.headers.host.split(':')[0] + ':' + config.httpsPort + req.url
      })
      res.end()
    }).listen(config.httpPort, reporter.options.hostname).on('error', function (e) {
      console.error('Error when starting http server on port ' + config.httpPort + ' ' + e.stack)
    })
  }

  // second start https server

  // suport cert and relative path to rootdir
  if (config.certificate.cert && fs.existsSync(path.join(reporter.options.rootDirectory, config.certificate.cert))) {
    config.certificate.cert = path.join(reporter.options.rootDirectory, config.certificate.cert)
  }

  // no certificate, use default one
  if (!config.certificate || (config.certificate.cert && !fs.existsSync(config.certificate.key))) {
    config.certificate.key = path.join(__dirname, '../', 'certificates', 'jsreport.net.key')
    config.certificate.cert = path.join(__dirname, '../', 'certificates', 'jsreport.net.cert')
  }

  var credentials = {}

  if (config.certificate.cert) {
    reporter.logger.debug('Reading ssl certificate from ' + config.certificate.cert)
    credentials = {
      key: fs.readFileSync(config.certificate.key, 'utf8'),
      cert: fs.readFileSync(config.certificate.cert, 'utf8'),
      rejectUnauthorized: false // support invalid certificates
    }
  }

  // support pfx certificates through relative or absolute path
  if (config.certificate.pfx) {
    if (fs.existsSync(path.join(reporter.options.rootDirectory, config.certificate.pfx))) {
      config.certificate.pfx = path.join(reporter.options.rootDirectory, config.certificate.pfx)
    }

    reporter.logger.debug('Reading ssl certificate from ' + config.certificate.pfx)

    credentials = {
      pfx: fs.readFileSync(config.certificate.pfx),
      passphrase: config.certificate.passphrase,
      rejectUnauthorized: false // support invalid certificates
    }
  }

  reporter.express.server = https.createServer(credentials, app)

  return startAsync(reporter, reporter.express.server, config.httpsPort)
}

var configureExpressApp = function (app, reporter, definition) {
  reporter.express.app = app

  app.options('*', function (req, res) {
    require('cors')({
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'MERGE'],
      origin: true
    })(req, res)
  })

  app.use(cookieParser())
  app.use(bodyParser.urlencoded({ extended: true, limit: definition.options.inputRequestLimit || '20mb' }))
  app.use(bodyParser.json({
    limit: definition.options.inputRequestLimit || '20mb'
  }))

  app.use(cors())

  reporter.emit('before-express-configure', app)

  routes(app, reporter)

  reporter.emit('express-configure', app)
}

module.exports = function (reporter, definition) {
  reporter.options.appPath = reporter.options.appPath || '/'
  if (reporter.options.appPath.substr(-1) !== '/') {
    reporter.options.appPath += '/'
  }

  reporter.options.httpPort = definition.options.httpPort || reporter.options.httpPort
  reporter.options.httpsPort = definition.options.httpsPort || reporter.options.httpsPort
  reporter.options.certificate = definition.options.certificate || reporter.options.certificate

  reporter.express = {}
  var app = definition.options.app

  if (!app) {
    app = require('express')()
  }

  reporter.initializeListeners.add(definition.name, this, function () {
    function logStart () {
      if (reporter.options.httpsPort) {
        reporter.logger.info('jsreport server successfully started on https port: ' + reporter.options.httpsPort)
      }

      if (reporter.options.httpPort) {
        reporter.logger.info('jsreport server successfully started on http port: ' + reporter.options.httpPort)
      }

      if (!reporter.options.httpPort && !reporter.options.httpsPort && reporter.express.server) {
        reporter.logger.info('jsreport server successfully started on http port: ' + reporter.express.server.address().port)
      }
    }

    if (definition.options.app) {
      reporter.logger.info('Configuring routes for existing express app.')
      configureExpressApp(app, reporter, definition)

      if (definition.options.server) {
        reporter.logger.info('Using existing server instance.')
        reporter.express.server = definition.options.server
        // deleting server option otherwise requests to list available extensions
        // will fail, see https://github.com/jsreport/jsreport/issues/118#issuecomment-148965452
        delete definition.options.server
      }

      return
    }

    reporter.logger.info('Creating default express app.')
    configureExpressApp(app, reporter, definition)

    return startExpressApp(reporter, app, reporter.options).then(function () {
      logStart()
    })
  })
}
