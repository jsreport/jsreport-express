var supertest = require('supertest')
var path = require('path')
var Reporter = require('jsreport-core').Reporter
var domain = require('domain')

describe('express', function () {
  var reporter

  beforeEach(function (done) {
    reporter = new Reporter({
      rootDirectory: path.join(__dirname, '../')
    })

    reporter.init().then(function () {
      process.domain = process.domain || domain.create()
      process.domain.req = {}
      done()
    }).fail(done)
  })

  it('/api/settings should return 200', function (done) {
    supertest(reporter.express.app)
      .get('/api/settings')
      .expect(200, done)
  })

  it('/api/recipe should return 200', function (done) {
    supertest(reporter.express.app)
      .get('/api/recipe')
      .expect(200, done)
  })

  it('/api/version should return a package.json version', function (done) {
    supertest(reporter.express.app)
      .get('/api/version')
      .expect(200, reporter.version)
      .end(function (err, res) {
        if (err) {
          done(err)
        } else {
          done()
        }
      })
  })

  it('/api/report should render report', function (done) {
    supertest(reporter.express.app)
      .post('/api/report')
      .send({template: {content: 'Hey', engine: 'none', recipe: 'html'}})
      .expect(200, 'Hey')
      .end(function (err, res) {
        if (err) {
          done(err)
        } else {
          done()
        }
      })
  })

  it('/api/report should parse data if string and  render report', function (done) {
    supertest(reporter.express.app)
      .post('/api/report')
      .send({template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'}, data: '{ "a": "foo" }'})
      .expect(200, 'foo')
      .end(function (err, res) {
        if (err) {
          done(err)
        } else {
          done()
        }
      })
  })

  it('/api/report should use options[Content-Disposition] if set', function (done) {
    supertest(reporter.express.app)
      .post('/api/report')
      .send({
        template: {content: '{{:a}}', engine: 'jsrender', recipe: 'html'},
        data: '{ "a": "foo" }',
        options: {'Content-Disposition': 'foo'}
      })
      .expect(200, 'foo')
      .expect('Content-Disposition', 'foo')
      .end(function (err, res) {
        if (err) {
          done(err)
        } else {
          done()
        }
      })
  })

  it('/odata/templates should return 200', function (done) {
    supertest(reporter.express.app)
      .get('/odata/templates')
      .expect(200, done)
  })
})

