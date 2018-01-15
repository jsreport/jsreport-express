var supertest = require('supertest')
var Reporter = require('jsreport-core')

describe('express', () => {
  let reporter

  beforeEach(() => {
    reporter = Reporter().use(require('../')()).use(require('jsreport-jsrender')())
    return reporter.init()
  })

  afterEach(() => reporter.close())

  it('/api/settings should return 200', () => {
    return supertest(reporter.express.app)
      .get('/api/settings')
      .expect(200)
  })

  it('/api/recipe should return 200', () => {
    return supertest(reporter.express.app)
      .get('/api/recipe')
      .expect(200)
  })

  it('/api/version should return a package.json version', () => {
    return supertest(reporter.express.app)
      .get('/api/version')
      .expect(200, reporter.version)
  })

  it('/api/report should render report', () => {
    return supertest(reporter.express.app)
      .post('/api/report')
      .send({template: {content: 'Hey', engine: 'none', recipe: 'html'}})
      .expect(200, 'Hey')
  })

  it('/api/report should parse data if string and  render report', () => {
    return supertest(reporter.express.app)
      .post('/api/report')
      .send({template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'}, data: '{ "a": "foo" }'})
      .expect(200, 'foo')
  })

  it('/api/report should use options[Content-Disposition] if set', () => {
    return supertest(reporter.express.app)
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
    return supertest(reporter.express.app)
      .get('/odata/$metadata')
      .expect(200)
  })
})
