var RSVP = require('rsvp')
var _ = require('lodash')

var fetch = require('./lib/fetch')
var readDocs = require('./lib/read-docs')
var addSinceTags = require('./lib/add-since-tags')
var putClassesInCouch = require('./lib/classes-in-couch')
var PouchDB = require('pouchdb')
var createVersionIndex = require('./lib/create-version-index')


fetch()
  .then(readDocs)
  .then(createVersionIndex)
  .then(function (versions) {
    addSinceTags(versions)

    var PouchDB = require('pouchdb')

    var db = new PouchDB('http://localhost:5984/project-versions')

    var tojsonapi = require('yuidoc-to-jsonapi/lib/converter')

    var jsonapidocs = versions.map(function (version) {
      var jsonapidoc = tojsonapi(version.data)

      // now that we have one giant ass document, put it on a diet to something smaller.
      var projectData = {
        type: 'project',
        id: 'ember',
        attributes: {
          github: 'https://github.com/emberjs/ember.js'
        }
      }

      var data = {
        _id: version.version,
        data: {
          id: version.version,
          type: 'project-version',
          relationships: {
            classes: {
              data: jsonapidoc.data.filter(item => item.type === 'class').map(item => ({id: item.id, type: 'class'}))
            },
            modules: {
              data: jsonapidoc.data.filter(item => item.type === 'module').map(item => ({id: item.id, type: 'module'}))
            },
            project: {
              data: {
                id: 'ember',
                type: 'project'
              }
            }
          },
        },
        included: [projectData]
      }

      return data
    })

    return RSVP.map(jsonapidocs, function (jsonapidoc) {
      return db.get(jsonapidoc._id).then(function (doc) {
        return _.merge({}, {_rev: doc._rev}, jsonapidoc)
      }).catch(function () {
        // 404 probably
        return jsonapidoc
      })
    }).then(function (docs) {
      return RSVP.map(docs, function (doc) {
        console.log('updating ' + doc._id)
        return db.put(doc)
      })
    }).then(function () {
      return RSVP.map(versions, (version) => {
        return putClassesInCouch(tojsonapi(version.data), 'ember', version.version)
      })
    })
  }).catch(function (err) {
    console.warn('err!', err, err.stack)
    process.exit(1)
  })