
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
          trustProxy: { type: 'boolean' },
          inputRequestLimit: { type: 'string' },
          renderTimeout: { type: 'number' }
        }
      }
    }
  }
}
