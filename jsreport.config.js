
const schemaProperties = {
  hostname: { type: 'string' },
  httpPort: { type: 'number' },
  httpsPort: { type: 'number' },
  certificate: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      cert: { type: 'string' }
    }
  }
}

module.exports = {
  'name': 'express',
  'main': 'lib/reporter.express.js',
  'optionsSchema': {
    ...schemaProperties,
    extensions: {
      express: {
        type: 'object',
        properties: {
          ...schemaProperties,
          start: {
            type: 'boolean',
            default: true,
            description: 'specifies if the server should be started automatically during jsreport initialization, if false you should start the server manually by using jsreport.express.start() after jsreport is initialized'
          },
          trustProxy: { type: 'boolean', default: true },
          inputRequestLimit: { type: 'string', default: '20mb' },
          renderTimeout: { type: 'number', default: 1200000 }
        }
      }
    }
  }
}
