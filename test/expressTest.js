const supertest = require('supertest')
const JsReport = require('jsreport-core')
require('should')

describe('express', () => {
  let jsreport

  beforeEach(() => {
    jsreport = JsReport({ templatingEngines: { strategy: 'in-process' } })
      .use(require('../')())
      .use(require('jsreport-jsrender')())
      .use(require('jsreport-templates')())
      .use(require('jsreport-scripts')())
      .use({
        name: 'test',
        directory: __dirname,
        main: function (reporter, definition) {
          reporter.documentStore.registerEntityType('DemoType', {
            _id: {type: 'Edm.String', key: true},
            name: {type: 'Edm.String'},
            secret: {type: 'Edm.String', visible: false}
          })

          reporter.documentStore.registerEntitySet('demos', {entityType: 'jsreport.DemoType', humanReadableKey: '_id'})
        }
      })

    return jsreport.init()
  })

  afterEach(async () => {
    await jsreport.close()
  })

  it('/api/settings should return 200', () => {
    return supertest(jsreport.express.app)
      .get('/api/settings')
      .expect(200)
  })

  it('/api/recipe should return 200', () => {
    return supertest(jsreport.express.app)
      .get('/api/recipe')
      .expect(200)
  })

  it('/api/version should return a package.json version', () => {
    return supertest(jsreport.express.app)
      .get('/api/version')
      .expect(200, jsreport.version)
  })

  it('/api/report should render report', () => {
    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({template: {content: 'Hey', engine: 'none', recipe: 'html'}})
      .expect(200, 'Hey')
  })

  it('/api/report should parse data if string and  render report', () => {
    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'}, data: { 'a': 'foo' }})
      .expect(200, 'foo')
  })

  it('/api/report should use options[Content-Disposition] if set', () => {
    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({
        template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'},
        data: { 'a': 'foo' },
        options: {'Content-Disposition': 'foo'}
      })
      .expect(200, 'foo')
      .expect('Content-Disposition', 'foo')
  })

  it('/api/report should not crash when template name has invalid characters', () => {
    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({template: {content: 'Hey', engine: 'none', recipe: 'html', name: 'čščěš'}})
      .expect(200, 'Hey')
  })

  it('/odata/$metadata should return 200', () => {
    return supertest(jsreport.express.app)
      .get('/odata/$metadata')
      .expect(200)
  })

  it('/odata/templates?$filter=name eq test should return entity', async () => {
    await jsreport.documentStore.collection('templates').insert({
      name: 'test',
      engine: 'none',
      recipe: 'html'
    })

    return supertest(jsreport.express.app)
      .get(`/odata/templates?$filter=name eq test`)
      .expect(200)
      .expect((res) => {
        res.body.value.should.have.length(1)
        res.body.value[0].name.should.be.eql('test')
      })
  })

  it('/odata endpoint should not return non visible properties of entity', async () => {
    await jsreport.documentStore.collection('demos').insert({
      name: 'test',
      secret: 'secret'
    })

    return supertest(jsreport.express.app)
      .get(`/odata/demos`)
      .expect(200)
      .expect((res) => {
        res.body.value.should.have.length(1)
        res.body.value[0].name.should.be.eql('test')
        res.body.value[0].should.not.have.property('secret')
      })
  })

  it('/odata endpoint should not return non visible properties of entity and not fail when other $select set', async () => {
    await jsreport.documentStore.collection('demos').insert({
      name: 'test',
      secret: 'secret'
    })

    return supertest(jsreport.express.app)
      .get(`/odata/demos?$select=name,secret`)
      .expect(200)
      .expect((res) => {
        res.body.value.should.have.length(1)
        res.body.value[0].name.should.be.eql('test')
        res.body.value[0].should.not.have.property('secret')
      })
  })

  it('should make it possible to add response.meta.headers', () => {
    jsreport.beforeRenderListeners.add('test', (req, res) => {
      res.meta.headers['Test'] = 'header'
    })

    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'}, data: { 'a': 'foo' }})
      .expect(200, 'foo')
      .expect('Test', 'header')
  })

  it('should work with scripts', async () => {
    const res = await jsreport.render({
      template: {
        content: 'foo',
        engine: 'none',
        recipe: 'html',
        scripts: [{
          content: `
            function beforeRender(req, res) {
              req.template.content = 'hello'
            }
          `
        }]
      }
    })
    res.content.toString().should.be.eql('hello')
  })
})

describe('express with appPath and mountOnAppPath config', () => {
  let jsreport
  beforeEach(() => {
    jsreport = JsReport({ appPath: '/test', mountOnAppPath: true })
      .use(require('../')())
      .use(require('jsreport-jsrender')())
      .use(require('jsreport-templates')())

    return jsreport.init()
  })

  afterEach(async () => {
    await jsreport.close()
  })

  it('/test/api/settings should return 200', async () => {
    return supertest(jsreport.express.server)
      .get('/test/api/settings')
      .expect(200)
  })

  it('/api/settings should return 404', async () => {
    return supertest(jsreport.express.server)
      .get('/api/settings')
      .expect(404)
  })
})

describe('express with custom middleware', () => {
  let jsreport

  beforeEach(() => {
    jsreport = JsReport()
      .use(require('../')())

    jsreport.on('before-express-configure', (app) => app.use((req, res, next) => {
      req.context = { foo: 'hello' }
      next()
    }))

    jsreport.on('express-configure', (app) => app.post('/test-error-middleware-propagation', (req, res, next) => {
      next(new Error('error propagation'))
    }))

    return jsreport.init()
  })

  afterEach(async () => { await jsreport.close() })

  it('should merge in req.context from previous middlewares', () => {
    jsreport.beforeRenderListeners.add('test', (req, res) => {
      req.template.content = req.context.foo
    })

    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({template: {content: 'x', engine: 'none', recipe: 'html'}})
      .expect(200, 'hello')
  })

  it('should receive errors from custom middlewares', () => {
    return supertest(jsreport.express.app)
      .post('/test-error-middleware-propagation')
      .send()
      .expect(500)
      .then(res => {
        res.text.should.startWith('Error: error propagation')
      })
  })
})

describe('express limit', () => {
  let jsreport

  afterEach(async () => {
    await jsreport.close()
  })

  it('should fail with custom message when limit is reached', async () => {
    jsreport = JsReport({ httpPort: 7000 }).use(require('../')({
      inputRequestLimit: '1kb'
    }))

    await jsreport.init()

    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({
        template: {
          content: `
            Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          `,
          engine: 'none',
          recipe: 'html'
        }
      })
      .expect((res) => {
        res.statusCode.should.be.eql(413)
        res.body.message.includes('The limit can be increased using config').should.be.true()
      })
  })
})

describe('express port', () => {
  let jsreport

  afterEach(async () => {
    if (process.env.PORT != null) {
      delete process.env.PORT
    }

    await jsreport.close()
  })

  it('should not start on port automatically when option start: false', async () => {
    jsreport = JsReport({ httpPort: 7000 })
      .use(require('../')({ start: false }))

    await jsreport.init()
    jsreport.express.server.listening.should.be.eql(false)
  })

  it('should start on httpPort ', async () => {
    jsreport = JsReport({ httpPort: 7000 })
      .use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(7000)
  })

  it('should start on httpsPort ', async () => {
    jsreport = JsReport({ httpsPort: 7000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(7000)
  })

  it('should start on httpsPort ', async () => {
    jsreport = JsReport({ httpsPort: 7000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(7000)
  })

  it('should create redirect server when both httpsPort and httpPort specified', async () => {
    jsreport = JsReport({
      httpsPort: 7000,
      httpPort: 8000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(7000)
    jsreport.express.redirectServer.address().port.should.be.eql(8000)
  })

  it('should listen PORT env when specified', async () => {
    process.env.PORT = 7000
    jsreport = JsReport().use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(7000)
  })

  it('should prefer httpPort over PORT env', async () => {
    process.env.PORT = 7000
    jsreport = JsReport({httpPort: 8000}).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(8000)
  })

  it('should prefer httpsPort over PORT env', async () => {
    process.env.PORT = 7000
    jsreport = JsReport({
      httpsPort: 8000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(8000)
  })

  it('should prefer httpsPort over PORT env', async () => {
    process.env.PORT = 7000
    jsreport = JsReport({
      httpsPort: 8000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(8000)
  })

  it('should use 5488 port when no port specified', async () => {
    jsreport = JsReport().use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(5488)
  })
})
