const supertest = require('supertest')
const JsReport = require('jsreport-core')
require('should')

describe('express', () => {
  let jsreport

  beforeEach(() => {
    jsreport = JsReport()
      .use(require('../')())
      .use(require('jsreport-jsrender')())
      .use(require('jsreport-templates')())
    return jsreport.init()
  })

  afterEach(() => jsreport.close())

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
      .send({template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'}, data: '{ "a": "foo" }'})
      .expect(200, 'foo')
  })

  it('/api/report should use options[Content-Disposition] if set', () => {
    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({
        template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'},
        data: '{ "a": "foo" }',
        options: {'Content-Disposition': 'foo'}
      })
      .expect(200, 'foo')
      .expect('Content-Disposition', 'foo')
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

  it('should make it possible to add response.meta.headers', () => {
    jsreport.beforeRenderListeners.add('test', (req, res) => {
      res.meta.headers['Test'] = 'header'
    })

    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'}, data: '{ "a": "foo" }'})
      .expect(200, 'foo')
      .expect('Test', 'header')
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

    return jsreport.init()
  })

  afterEach(() => jsreport.close())

  it('should merge in req.context from previous middlewares', () => {
    jsreport.beforeRenderListeners.add('test', (req, res) => {
      req.template.content = req.context.foo
    })

    return supertest(jsreport.express.app)
      .post('/api/report')
      .send({template: {content: 'x', engine: 'none', recipe: 'html'}})
      .expect(200, 'hello')
  })
})

describe('express port', () => {
  let jsreport

  afterEach(() => jsreport.close())

  it('should start on httpPort ', async () => {
    jsreport = JsReport({ httpPort: 1000 })
      .use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(1000)
  })

  it('should start on httpsPort ', async () => {
    jsreport = JsReport({ httpsPort: 1000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(1000)
  })

  it('should start on httpsPort ', async () => {
    jsreport = JsReport({ httpsPort: 1000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(1000)
  })

  it('should create redirect server when both httpsPort and httpPort specified', async () => {
    jsreport = JsReport({
      httpsPort: 1000,
      httpPort: 2000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(1000)
    jsreport.express.redirectServer.address().port.should.be.eql(2000)
  })

  it('should listen PORT env when specified', async () => {
    process.env.PORT = 1000
    jsreport = JsReport().use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(1000)
  })

  it('should prefer httpPort over PORT env', async () => {
    process.env.PORT = 1000
    jsreport = JsReport({httpPort: 2000}).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(2000)
  })

  it('should prefer httpsPort over PORT env', async () => {
    process.env.PORT = 1000
    jsreport = JsReport({
      httpsPort: 2000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(2000)
  })

  it('should prefer httpsPort over PORT env', async () => {
    process.env.PORT = 1000
    jsreport = JsReport({
      httpsPort: 2000,
      certificate: {
        key: '../certificates/jsreport.net.key',
        cert: '../certificates/jsreport.net.cert'
      }
    }).use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.eql(2000)
  })

  it('should use random port when no port specified', async () => {
    jsreport = JsReport().use(require('../')())

    await jsreport.init()
    jsreport.express.server.address().port.should.be.ok()
  })
})
