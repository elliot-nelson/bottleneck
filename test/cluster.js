var makeTest = require('./context')
var Bottleneck = require('./bottleneck')
var Scripts = require('../lib/Scripts.js')
var assert = require('assert')
var packagejson = require('../package.json')

if (process.env.DATASTORE === 'redis' || process.env.DATASTORE === 'ioredis') {

  var limiterKeys = function (limiter) {
    return Scripts.keys("init", limiter._store.originalId)
  }
  var countKeys = function (limiter) {
    return runCommand(limiter, 'exists', limiterKeys(limiter))
  }
  var deleteKeys = function (limiter) {
    return runCommand(limiter, 'del', limiterKeys(limiter))
  }
  var runCommand = function (limiter, command, args) {
    return new Promise(function (resolve, reject) {
      limiter._store.clients.client[command](...args, function (err, data) {
        if (err != null) return reject(err)
        return resolve(data)
      })
    })
  }

  describe('Cluster-only', function () {
    var c

    afterEach(function () {
      return c.limiter.disconnect(false)
    })

    it('Should return a promise for ready()', function () {
      c = makeTest({ maxConcurrent: 2 })

      return c.limiter.ready()
    })

    it('Should return clients', function () {
      c = makeTest({ maxConcurrent: 2 })

      return c.limiter.ready()
      .then(function (clients) {
        c.mustEqual(Object.keys(clients), ['client', 'subscriber'])
        c.mustEqual(Object.keys(c.limiter.clients()), ['client', 'subscriber'])
      })
    })

    it('Should return a promise when disconnecting', function () {
      c = makeTest({ maxConcurrent: 2 })

      return c.limiter.disconnect()
      .then(function () {
        // do nothing
      })
    })

    it('Should allow passing a limiter\'s connection to a new limiter', function () {
      c = makeTest()
      c.limiter.connection.id = 'some-id'
      var limiter = new Bottleneck({
        minTime: 50,
        connection: c.limiter.connection
      })

      return Promise.all([c.limiter.ready(), limiter.ready()])
      .then(function () {
        c.mustEqual(limiter.connection.id, 'some-id')
        c.mustEqual(limiter.datastore, process.env.DATASTORE)

        return Promise.all([
          c.pNoErrVal(c.limiter.schedule(c.promise, null, 1), 1),
          c.pNoErrVal(limiter.schedule(c.promise, null, 2), 2)
        ])
      })
      .then(c.last)
      .then(function (results) {
        c.checkResultsOrder([[1], [2]])
        c.checkDuration(0)
      })
    })

    it('Should allow passing a limiter\'s connection to a new Group', function () {
      c = makeTest()
      c.limiter.connection.id = 'some-id'
      var group = new Bottleneck.Group({
        minTime: 50,
        connection: c.limiter.connection
      })
      var limiter1 = group.key('A')
      var limiter2 = group.key('B')

      return Promise.all([c.limiter.ready(), limiter1.ready(), limiter2.ready()])
      .then(function () {
        c.mustEqual(limiter1.connection.id, 'some-id')
        c.mustEqual(limiter2.connection.id, 'some-id')
        c.mustEqual(limiter1.datastore, process.env.DATASTORE)
        c.mustEqual(limiter2.datastore, process.env.DATASTORE)

        return Promise.all([
          c.pNoErrVal(c.limiter.schedule(c.promise, null, 1), 1),
          c.pNoErrVal(limiter1.schedule(c.promise, null, 2), 2),
          c.pNoErrVal(limiter2.schedule(c.promise, null, 3), 3)
        ])
      })
      .then(c.last)
      .then(function (results) {
        c.checkResultsOrder([[1], [2], [3]])
        c.checkDuration(0)
      })
    })

    it('Should allow passing a Group\'s connection to a new limiter', function () {
      c = makeTest()
      var group = new Bottleneck.Group({
        minTime: 50,
        datastore: process.env.DATASTORE,
        clearDatastore: true
      })
      group.connection.id = 'some-id'

      var limiter1 = group.key('A')
      var limiter2 = new Bottleneck({
        minTime: 50,
        connection: group.connection
      })

      return Promise.all([limiter1.ready(), limiter2.ready()])
      .then(function () {
        c.mustEqual(limiter1.connection.id, 'some-id')
        c.mustEqual(limiter2.connection.id, 'some-id')
        c.mustEqual(limiter1.datastore, process.env.DATASTORE)
        c.mustEqual(limiter2.datastore, process.env.DATASTORE)

        return Promise.all([
          c.pNoErrVal(limiter1.schedule(c.promise, null, 1), 1),
          c.pNoErrVal(limiter2.schedule(c.promise, null, 2), 2)
        ])
      })
      .then(c.last)
      .then(function (results) {
        c.checkResultsOrder([[1], [2]])
        c.checkDuration(0)
        return group.disconnect()
      })
    })

    it('Should allow passing a Group\'s connection to a new Group', function () {
      c = makeTest()
      var group1 = new Bottleneck.Group({
        minTime: 50,
        datastore: process.env.DATASTORE,
        clearDatastore: true
      })
      group1.connection.id = 'some-id'

      var group2 = new Bottleneck.Group({
        minTime: 50,
        connection: group1.connection,
        clearDatastore: true
      })

      var limiter1 = group1.key('AAA')
      var limiter2 = group1.key('BBB')
      var limiter3 = group1.key('CCC')
      var limiter4 = group1.key('DDD')

      return Promise.all([
        limiter1.ready(),
        limiter2.ready(),
        limiter3.ready(),
        limiter4.ready()
      ])
      .then(function () {
        c.mustEqual(group1.connection.id, 'some-id')
        c.mustEqual(group2.connection.id, 'some-id')
        c.mustEqual(limiter1.connection.id, 'some-id')
        c.mustEqual(limiter2.connection.id, 'some-id')
        c.mustEqual(limiter3.connection.id, 'some-id')
        c.mustEqual(limiter4.connection.id, 'some-id')
        c.mustEqual(limiter1.datastore, process.env.DATASTORE)
        c.mustEqual(limiter2.datastore, process.env.DATASTORE)
        c.mustEqual(limiter3.datastore, process.env.DATASTORE)
        c.mustEqual(limiter4.datastore, process.env.DATASTORE)

        return Promise.all([
          c.pNoErrVal(limiter1.schedule(c.promise, null, 1), 1),
          c.pNoErrVal(limiter2.schedule(c.promise, null, 2), 2),
          c.pNoErrVal(limiter3.schedule(c.promise, null, 3), 3),
          c.pNoErrVal(limiter4.schedule(c.promise, null, 4), 4)
        ])
      })
      .then(c.last)
      .then(function (results) {
        c.checkResultsOrder([[1], [2], [3], [4]])
        c.checkDuration(0)
        return group1.disconnect()
      })
    })

    it('Should not have a key TTL by default for standalone limiters', function () {
      c = makeTest()

      return c.limiter.ready()
      .then(function () {
        var settings_key = limiterKeys(c.limiter)[0]
        return runCommand(c.limiter, 'ttl', [settings_key])
      })
      .then(function (ttl) {
        assert(ttl < 0)
      })
    })

    it('Should allow timeout setting for standalone limiters', function () {
      c = makeTest({ timeout: 5 * 60 * 1000 })

      return c.limiter.ready()
      .then(function () {
        var settings_key = limiterKeys(c.limiter)[0]
        return runCommand(c.limiter, 'ttl', [settings_key])
      })
      .then(function (ttl) {
        assert(ttl >= 290 && ttl <= 305)
      })
    })

    it('Should migrate from 2.8.0', function () {
      c = makeTest({ id: 'migrate' })
      var settings_key = limiterKeys(c.limiter)[0]
      var limiter2

      return c.limiter.ready()
      .then(function () {
        var settings_key = limiterKeys(c.limiter)[0]
        return Promise.all([
          runCommand(c.limiter, 'hset', [settings_key, 'version', '2.8.0']),
          runCommand(c.limiter, 'hdel', [settings_key, 'done']),
          runCommand(c.limiter, 'hset', [settings_key, 'lastReservoirRefresh', ''])
        ])
      })
      .then(function () {
        limiter2 = new Bottleneck({
          id: 'migrate',
          datastore: process.env.DATASTORE
        })
        return limiter2.ready()
      })
      .then(function () {
        return runCommand(c.limiter, 'hmget', [
          settings_key,
          'version',
          'done',
          'reservoirRefreshInterval',
          'reservoirRefreshAmount',
          'lastReservoirRefresh'
        ])
      })
      .then(function (values) {
        var lastReservoirRefresh = values[values.length - 1]
        assert(parseInt(lastReservoirRefresh) > Date.now() - 500)
        c.mustEqual(values.slice(0, values.length - 1), ['2.14.0', '0', '', ''])
      })
      .then(function () {
        return limiter2.disconnect(false)
      })
    })

    it('Should keep track of each client\'s queue length', function () {
      c = makeTest({
        id: 'queues',
        maxConcurrent: 1,
        trackDoneStatus: true
      })
      var limiter2 = new Bottleneck({
        datastore: process.env.DATASTORE,
        id: 'queues',
        maxConcurrent: 1,
        trackDoneStatus: true
      })
      var client_num_queued_key = limiterKeys(c.limiter)[5]
      var clientId1 = c.limiter._store.clientId
      var clientId2 = limiter2._store.clientId
      var p0, p1, p2, p3

      return c.limiter.ready()
      .then(function () {
        return limiter2.ready()
      })
      .then(function () {
        p0 = c.limiter.schedule({id: 0}, c.slowPromise, 100, null, 0)
        return c.limiter._submitLock.schedule(() => Promise.resolve())
      })
      .then(function () {
        p1 = c.limiter.schedule({id: 1}, c.promise, null, 1)
        p2 = c.limiter.schedule({id: 2}, c.promise, null, 2)
        p3 = limiter2.schedule({id: 3}, c.promise, null, 3)
        return Promise.all([
          c.limiter._submitLock.schedule(() => Promise.resolve()),
          limiter2._submitLock.schedule(() => Promise.resolve())
        ])
      })
      .then(function () {
        return runCommand(c.limiter, 'hgetall', [client_num_queued_key])
      })
      .then(function (queued) {
        c.mustEqual(c.limiter.counts().QUEUED, 2)
        c.mustEqual(limiter2.counts().QUEUED, 1)
        c.mustEqual(~~queued[clientId1], 2)
        c.mustEqual(~~queued[clientId2], 1)

        return Promise.all([p0, p1, p2, p3])
      })
      .then(function () {
        return runCommand(c.limiter, 'hgetall', [client_num_queued_key])
      })
      .then(function (queued) {
        c.mustEqual(c.limiter.counts().QUEUED, 0)
        c.mustEqual(limiter2.counts().QUEUED, 0)
        c.mustEqual(~~queued[clientId1], 0)
        c.mustEqual(~~queued[clientId2], 0)
        c.mustEqual(c.limiter.counts().DONE, 3)
        c.mustEqual(limiter2.counts().DONE, 1)

        return limiter2.disconnect(false)
      })
    })

    it('Should publish capacity increases', function () {
      c = makeTest({ maxConcurrent: 2 })
      var limiter2
      var p3, p4

      return c.limiter.ready()
      .then(function () {
        limiter2 = new Bottleneck({ datastore: process.env.DATASTORE })
        return limiter2.ready()
      })
      .then(function () {
        var p1 = c.limiter.schedule({id: 1}, c.slowPromise, 100, null, 1)
        var p2 = c.limiter.schedule({id: 2}, c.slowPromise, 100, null, 2)

        return c.limiter.schedule({id: 0, weight: 0}, c.promise, null, 0)
      })
      .then(function () {
        return limiter2.schedule({id: 3}, c.slowPromise, 100, null, 3)
      })
      .then(c.last)
      .then(function (results) {
        c.checkResultsOrder([[0], [1], [2], [3]])
        c.checkDuration(200)

        return limiter2.disconnect(false)
      })
    })

    it('Should publish capacity changes on reservoir changes', function () {
      c = makeTest({
        maxConcurrent: 2,
        reservoir: 2
      })
      var limiter2
      var p3, p4

      return c.limiter.ready()
      .then(function () {
        limiter2 = new Bottleneck({
          datastore: process.env.DATASTORE,
        })
        return limiter2.ready()
      })
      .then(function () {
        var p1 = c.limiter.schedule({id: 1}, c.slowPromise, 100, null, 1)
        var p2 = c.limiter.schedule({id: 2}, c.slowPromise, 100, null, 2)

        return c.limiter.schedule({id: 0, weight: 0}, c.promise, null, 0)
      })
      .then(function () {
        p3 = limiter2.schedule({id: 3, weight: 2}, c.slowPromise, 100, null, 3)
        return c.limiter.currentReservoir()
      })
      .then(function (reservoir) {
        c.mustEqual(reservoir, 0)
        return c.limiter.updateSettings({ reservoir: 1 })
      })
      .then(function () {
        return c.limiter.incrementReservoir(1)
      })
      .then(function (reservoir) {
        c.mustEqual(reservoir, 2)
        return p3
      })
      .then(function (result) {
        c.mustEqual(result, [3])
        return c.limiter.currentReservoir()
      })
      .then(function (reservoir) {
        c.mustEqual(reservoir, 0)
        return c.last({ weight: 0 })
      })
      .then(function (results) {
        c.checkResultsOrder([[0], [1], [2], [3]])
        c.checkDuration(210)
      })
      .then(function (data) {
        return limiter2.disconnect(false)
      })
    })

    it('Should remove lost jobs', function () {
      c = makeTest({
        id: 'lost',
        errorEventsExpected: true
      })
      var clientId = c.limiter._store.clientId
      var limiter1 = new Bottleneck({ datastore: process.env.DATASTORE })
      var limiter2 = new Bottleneck({
          id: 'lost',
          datastore: process.env.DATASTORE,
          heartbeatInterval: 150
        })
      var getData = function (limiter) {
        c.mustEqual(limiterKeys(limiter).length, 6) // Asserting, to remember to edit this test when keys change
        var [
          settings_key,
          job_weights_key,
          job_expirations_key,
          job_clients_key,
          client_running_key
        ] = limiterKeys(limiter)
        return Promise.all([
          runCommand(limiter1, 'hmget', [settings_key, 'running', 'done']),
          runCommand(limiter1, 'hgetall', [job_weights_key]),
          runCommand(limiter1, 'zcard', [job_expirations_key]),
          runCommand(limiter1, 'hvals', [job_clients_key]),
          runCommand(limiter1, 'zrange', [client_running_key, '0', '-1', 'withscores'])
        ])
      }
      var sumWeights = function (weights) {
        return Object.keys(weights).reduce((acc, x) => {
          return acc + ~~weights[x]
        }, 0)
      }

      return Promise.all([c.limiter.ready(), limiter1.ready(), limiter2.ready()])
      .then(function () {
        // No expiration, it should not be removed
        c.pNoErrVal(c.limiter.schedule({ weight: 1 }, c.slowPromise, 150, null, 1), 1),

        // Expiration present, these jobs should be removed automatically
        c.limiter.schedule({ expiration: 50, weight: 2 }, c.slowPromise, 75, null, 2),
        c.limiter.schedule({ expiration: 50, weight: 3 }, c.slowPromise, 75, null, 3),
        c.limiter.schedule({ expiration: 50, weight: 4 }, c.slowPromise, 75, null, 4),
        c.limiter.schedule({ expiration: 50, weight: 5 }, c.slowPromise, 75, null, 5)

        return c.limiter._submitLock.schedule(() => Promise.resolve(true))
      })
      .then(function () {
        return c.limiter._drainAll()
      })
      .then(function () {
        return c.limiter.disconnect(false)
      })
      .then(function () {
      })
      .then(function () {
        return getData(c.limiter)
      })
      .then(function ([settings, job_weights, job_expirations, job_clients, client_running]) {
        c.mustEqual(settings, ['15', '0'])
        c.mustEqual(sumWeights(job_weights), 15)
        c.mustEqual(job_expirations, 4)
        c.mustEqual(job_clients.length, 5)
        job_clients.forEach((id) => c.mustEqual(id, clientId))
        c.mustEqual(sumWeights(client_running), 15)

        return c.wait(170)
      })
      .then(function () {
        return getData(c.limiter)
      })
      .then(function ([settings, job_weights, job_expirations, job_clients, client_running]) {
        c.mustEqual(settings, ['1', '14'])
        c.mustEqual(sumWeights(job_weights), 1)
        c.mustEqual(job_expirations, 0)
        c.mustEqual(job_clients.length, 1)
        job_clients.forEach((id) => c.mustEqual(id, clientId))
        c.mustEqual(sumWeights(client_running), 1)
      })
      .then(function () {
        return Promise.all([
          limiter1.disconnect(false),
          limiter2.disconnect(false)
        ])
      })
    })

    it('Should use shared settings', function () {
      c = makeTest({ maxConcurrent: 2 })
      var limiter2 = new Bottleneck({ maxConcurrent: 1, datastore: process.env.DATASTORE })

      return Promise.all([
        limiter2.schedule(c.slowPromise, 100, null, 1),
        limiter2.schedule(c.slowPromise, 100, null, 2)
      ])
      .then(function () {
        return limiter2.disconnect(false)
      })
      .then(function () {
        return c.last()
      })
      .then(function (results) {
        c.checkResultsOrder([[1], [2]])
        c.checkDuration(100)
      })
    })

    it('Should clear previous settings', function () {
      c = makeTest({ maxConcurrent: 2 })
      var limiter2

      return c.limiter.ready()
      .then(function () {
        limiter2 = new Bottleneck({ maxConcurrent: 1, datastore: process.env.DATASTORE, clearDatastore: true })
        return limiter2.ready()
      })
      .then(function () {
        return Promise.all([
          c.limiter.schedule(c.slowPromise, 100, null, 1),
          c.limiter.schedule(c.slowPromise, 100, null, 2)
        ])
      })
      .then(function () {
        return limiter2.disconnect(false)
      })
      .then(function () {
        return c.last()
      })
      .then(function (results) {
        c.checkResultsOrder([[1], [2]])
        c.checkDuration(200)
      })
    })

    it('Should safely handle connection failures', function () {
      c = makeTest({
        clientOptions: { port: 1 },
        errorEventsExpected: true
      })

      return new Promise(function (resolve, reject) {
        c.limiter.on('error', function (err) {
          assert(err != null)
          resolve()
        })

        c.limiter.ready()
        .then(function () {
          reject(new Error('Should not have connected'))
        })
        .catch(function (err) {
          reject(err)
        })
      })
    })

    it('Should chain local and distributed limiters (total concurrency)', function () {
      c = makeTest({ maxConcurrent: 3 })
      var limiter2 = new Bottleneck({ maxConcurrent: 1 })
      var limiter3 = new Bottleneck({ maxConcurrent: 2 })

      limiter2.chain(c.limiter)
      limiter3.chain(c.limiter)

      return Promise.all([
        limiter2.schedule(c.slowPromise, 100, null, 1),
        limiter2.schedule(c.slowPromise, 100, null, 2),
        limiter2.schedule(c.slowPromise, 100, null, 3),
        limiter3.schedule(c.slowPromise, 100, null, 4),
        limiter3.schedule(c.slowPromise, 100, null, 5),
        limiter3.schedule(c.slowPromise, 100, null, 6)
      ])
      .then(c.last)
      .then(function (results) {
        c.checkDuration(300)
        c.checkResultsOrder([[1], [4], [5], [2], [6], [3]])

        assert(results.calls[0].time >= 100 && results.calls[0].time < 200)
        assert(results.calls[1].time >= 100 && results.calls[1].time < 200)
        assert(results.calls[2].time >= 100 && results.calls[2].time < 200)

        assert(results.calls[3].time >= 200 && results.calls[3].time < 300)
        assert(results.calls[4].time >= 200 && results.calls[4].time < 300)

        assert(results.calls[5].time >= 300 && results.calls[2].time < 400)
      })
    })

    it('Should chain local and distributed limiters (partial concurrency)', function () {
      c = makeTest({ maxConcurrent: 2 })
      var limiter2 = new Bottleneck({ maxConcurrent: 1 })
      var limiter3 = new Bottleneck({ maxConcurrent: 2 })

      limiter2.chain(c.limiter)
      limiter3.chain(c.limiter)

      return Promise.all([
        limiter2.schedule(c.slowPromise, 100, null, 1),
        limiter2.schedule(c.slowPromise, 100, null, 2),
        limiter2.schedule(c.slowPromise, 100, null, 3),
        limiter3.schedule(c.slowPromise, 100, null, 4),
        limiter3.schedule(c.slowPromise, 100, null, 5),
        limiter3.schedule(c.slowPromise, 100, null, 6)
      ])
      .then(c.last)
      .then(function (results) {
        c.checkDuration(300)
        c.checkResultsOrder([[1], [4], [5], [2], [6], [3]])

        assert(results.calls[0].time >= 100 && results.calls[0].time < 200)
        assert(results.calls[1].time >= 100 && results.calls[1].time < 200)

        assert(results.calls[2].time >= 200 && results.calls[2].time < 300)
        assert(results.calls[3].time >= 200 && results.calls[3].time < 300)

        assert(results.calls[4].time >= 300 && results.calls[4].time < 400)
        assert(results.calls[5].time >= 300 && results.calls[2].time < 400)
      })
    })

    it('Should use the limiter ID to build Redis keys', function () {
      c = makeTest()
      var randomId = c.limiter._randomIndex()
      var limiter = new Bottleneck({ id: randomId, datastore: process.env.DATASTORE, clearDatastore: true })

      return limiter.ready()
      .then(function () {
        var keys = limiterKeys(limiter)
        keys.forEach((key) => assert(key.indexOf(randomId) > 0))
        return deleteKeys(limiter)
      })
      .then(function (deleted) {
        c.mustEqual(deleted, 1)
        return limiter.disconnect(false)
      })
    })

    it('Should not fail when Redis data is missing', function () {
      c = makeTest()
      var limiter = new Bottleneck({ datastore: process.env.DATASTORE, clearDatastore: true })

      return limiter.running()
      .then(function (running) {
        c.mustEqual(running, 0)
        return deleteKeys(limiter)
      })
      .then(function (deleted) {
        c.mustEqual(deleted, 1) // Should be 1, since 1 key should have been deleted
        return countKeys(limiter)
      })
      .then(function (count) {
        c.mustEqual(count, 0)
        return limiter.running()
      })
      .then(function (running) {
        c.mustEqual(running, 0)
        return countKeys(limiter)
      })
      .then(function (count) {
        c.mustEqual(count, 1)
        return limiter.disconnect(false)
      })
    })

    it('Should drop all jobs in the Cluster when entering blocked mode', function () {
      c = makeTest()
      var limiter1 = new Bottleneck({
        id: 'blocked',
        trackDoneStatus: true,
        datastore: process.env.DATASTORE,
        clearDatastore: true,

        maxConcurrent: 1,
        minTime: 50,
        highWater: 2,
        strategy: Bottleneck.strategy.BLOCK
      })
      var limiter2
      var client_num_queued_key = limiterKeys(limiter1)[5]

      return limiter1.ready()
      .then(function () {
        limiter2 = new Bottleneck({
          id: 'blocked',
          trackDoneStatus: true,
          datastore: process.env.DATASTORE,
          clearDatastore: false,
        })
        return limiter2.ready()
      })
      .then(function () {
        return Promise.all([
          limiter1.submit(c.slowJob, 100, null, 1, c.noErrVal(1)),
          limiter1.submit(c.slowJob, 100, null, 2, (err) => c.mustExist(err))
        ])
      })
      .then(function () {
        return Promise.all([
          limiter2.submit(c.slowJob, 100, null, 3, (err) => c.mustExist(err)),
          limiter2.submit(c.slowJob, 100, null, 4, (err) => c.mustExist(err)),
          limiter2.submit(c.slowJob, 100, null, 5, (err) => c.mustExist(err))
        ])
      })
      .then(function () {
        return runCommand(limiter1, 'exists', [client_num_queued_key])
      })
      .then(function (exists) {
        c.mustEqual(exists, 0)
        return c.wait(100)
      })
      .then(function () {
        var counts1 = limiter1.counts()
        c.mustEqual(counts1.RECEIVED, 0)
        c.mustEqual(counts1.QUEUED, 0)
        c.mustEqual(counts1.RUNNING, 0)
        c.mustEqual(counts1.EXECUTING, 0)
        c.mustEqual(counts1.DONE, 1)

        var counts2 = limiter2.counts()
        c.mustEqual(counts2.RECEIVED, 0)
        c.mustEqual(counts2.QUEUED, 0)
        c.mustEqual(counts2.RUNNING, 0)
        c.mustEqual(counts2.EXECUTING, 0)
        c.mustEqual(counts2.DONE, 0)

        return c.last()
      })
      .then(function (results) {
        c.checkResultsOrder([[1]])
        c.checkDuration(100)

        return Promise.all([
          limiter1.disconnect(false),
          limiter2.disconnect(false)
        ])
      })
    })

    it('Should pass messages to all limiters in Cluster', function (done) {
      c = makeTest({
        maxConcurrent: 1,
        minTime: 100,
        id: 'super-duper'
      })
      var limiter1 = new Bottleneck({
        maxConcurrent: 1,
        minTime: 100,
        id: 'super-duper',
        datastore: process.env.DATASTORE
      })
      var limiter2 = new Bottleneck({
        maxConcurrent: 1,
        minTime: 100,
        id: 'nope',
        datastore: process.env.DATASTORE
      })
      var received = []

      c.limiter.on('message', (msg) => {
        received.push(1, msg)
      })
      limiter1.on('message', (msg) => {
        received.push(2, msg)
      })
      limiter2.on('message', (msg) => {
        received.push(3, msg)
      })

      Promise.all([c.limiter.ready(), limiter2.ready()])
      .then(function () {
        limiter1.publish(555)
      })

      setTimeout(function () {
        limiter1.disconnect()
        limiter2.disconnect()
        c.mustEqual(received.sort(), [1, 2, '555', '555'])
        done()
      }, 150)
    })

    it('Should pass messages to correct limiter after Group re-instantiations', function () {
      c = makeTest()
      var group = new Bottleneck.Group({
        maxConcurrent: 1,
        minTime: 100,
        datastore: process.env.DATASTORE
      })
      var received = []

      return new Promise(function (resolve, reject) {
        var limiter = group.key('A')

        limiter.on('message', function (msg) {
          received.push('1', msg)
          return resolve()
        })
        limiter.publish('Bonjour!')
      })
      .then(function () {
        return new Promise(function (resolve, reject) {
          var limiter = group.key('B')

          limiter.on('message', function (msg) {
            received.push('2', msg)
            return resolve()
          })
          limiter.publish('Comment allez-vous?')
        })
      })
      .then(function () {
        return new Promise(function (resolve, reject) {
          group.deleteKey('A')
          var limiter = group.key('A')

          limiter.on('message', function (msg) {
            received.push('3', msg)
            return resolve()
          })
          limiter.publish('Au revoir!')
        })
      })
      .then(function () {
        c.mustEqual(received, ['1', 'Bonjour!', '2', 'Comment allez-vous?', '3', 'Au revoir!'])
        group.disconnect()
      })
    })

    it('Should have a default key TTL when using Groups', function () {
      c = makeTest()
      var group = new Bottleneck.Group({
        datastore: process.env.DATASTORE
      })

      return group.key('one').ready()
      .then(function () {
        var limiter = group.key('one')
        var settings_key = limiterKeys(limiter)[0]
        return runCommand(limiter, 'ttl', [settings_key])
      })
      .then(function (ttl) {
        assert(ttl >= 290 && ttl <= 305)
      })
      .then(function () {
        return group.disconnect(false)
      })
    })

    it('Should support Groups and expire Redis keys', function () {
      c = makeTest()
      var group = new Bottleneck.Group({
        datastore: process.env.DATASTORE,
        clearDatastore: true,
        minTime: 50,
        timeout: 200
      })
      var limiter1
      var limiter2
      var limiter3

      var t0 = Date.now()
      var results = {}
      var job = function (x) {
        results[x] = Date.now() - t0
        return Promise.resolve()
      }

      return c.limiter.ready()
      .then(function () {
        limiter1 = group.key('one')
        limiter2 = group.key('two')
        limiter3 = group.key('three')

        return Promise.all([limiter1.ready(), limiter2.ready(), limiter3.ready()])
      })
      .then(function () {
        return Promise.all([countKeys(limiter1), countKeys(limiter2), countKeys(limiter3)])
      })
      .then(function (counts) {
        c.mustEqual(counts, [1, 1, 1])
        return Promise.all([
          limiter1.schedule(job, 'a'),
          limiter1.schedule(job, 'b'),
          limiter1.schedule(job, 'c'),
          limiter2.schedule(job, 'd'),
          limiter2.schedule(job, 'e'),
          limiter3.schedule(job, 'f')
        ])
      })
      .then(function () {
        c.mustEqual(Object.keys(results).length, 6)
        assert(results.a < results.b)
        assert(results.b < results.c)
        assert(results.b - results.a >= 40)
        assert(results.c - results.b >= 40)

        assert(results.d < results.e)
        assert(results.e - results.d >= 40)

        assert(Math.abs(results.a - results.d) <= 10)
        assert(Math.abs(results.d - results.f) <= 10)
        assert(Math.abs(results.b - results.e) <= 10)

        return c.wait(400)
      })
      .then(function () {
        return Promise.all([countKeys(limiter1), countKeys(limiter2), countKeys(limiter3)])
      })
      .then(function (counts) {
        c.mustEqual(counts, [0, 0, 0])
        c.mustEqual(group.keys().length, 0)
        c.mustEqual(Object.keys(group.connection.limiters).length, 0)
        return group.disconnect(false)
      })

    })

    it('Should not recreate a key when running heartbeat', function () {
      c = makeTest()
      var group = new Bottleneck.Group({
        datastore: process.env.DATASTORE,
        clearDatastore: true,
        maxConcurrent: 50,
        minTime: 50,
        timeout: 300,
        heartbeatInterval: 5
      })
      var key = 'heartbeat'

      var limiter = group.key(key)
      return c.pNoErrVal(limiter.schedule(c.promise, null, 1), 1)
      .then(function () {
        return limiter.done()
      })
      .then(function (done) {
        c.mustEqual(done, 1)
        return c.wait(500)
      })
      .then(function () {
        return countKeys(limiter)
      })
      .then(function (count) {
        c.mustEqual(count, 0)
        return group.disconnect(false)
      })
    })

    it('Should delete Redis key when manually deleting a group key', function () {
      c = makeTest()
      var group1 = new Bottleneck.Group({
        datastore: process.env.DATASTORE,
        clearDatastore: true,
        maxConcurrent: 50,
        minTime: 50,
        timeout: 300
      })
      var group2 = new Bottleneck.Group({
        datastore: process.env.DATASTORE,
        clearDatastore: true,
        maxConcurrent: 50,
        minTime: 50,
        timeout: 300
      })
      var key = 'deleted'
      var limiter = group1.key(key) // only for countKeys() use

      return c.pNoErrVal(group1.key(key).schedule(c.promise, null, 1), 1)
      .then(function () {
        return c.pNoErrVal(group2.key(key).schedule(c.promise, null, 2), 2)
      })
      .then(function () {
        c.mustEqual(group1.keys().length, 1)
        c.mustEqual(group2.keys().length, 1)
        return group1.deleteKey(key)
      })
      .then(function (deleted) {
        c.mustEqual(deleted, true)
        return countKeys(limiter)
      })
      .then(function (count) {
        c.mustEqual(count, 0)
        c.mustEqual(group1.keys().length, 0)
        c.mustEqual(group2.keys().length, 1)
        return c.wait(200)
      })
      .then(function () {
        c.mustEqual(group1.keys().length, 0)
        c.mustEqual(group2.keys().length, 0)
        return Promise.all([
          group1.disconnect(false),
          group2.disconnect(false)
        ])
      })
    })

  })
}