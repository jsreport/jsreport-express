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
      name: 'test'
    })

    return supertest(jsreport.express.app)
      .get(`/odata/templates?$filter=name eq test`)
      .expect(200)
      .expect((res) => {
        res.body.value.should.have.length(1)
        res.body.value[0].name.should.be.eql('test')
      })
  })
})
