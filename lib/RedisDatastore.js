"use strict";

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

// Generated by CoffeeScript 2.2.4
(function () {
  var BottleneckError, IORedisConnection, RedisConnection, RedisDatastore, Scripts, parser;

  parser = require("./parser");

  BottleneckError = require("./BottleneckError");

  RedisConnection = require("./RedisConnection");

  IORedisConnection = require("./IORedisConnection");

  Scripts = require("./Scripts");

  RedisDatastore = class RedisDatastore {
    constructor(instance, initSettings, options) {
      this.instance = instance;
      this.initSettings = initSettings;
      this.originalId = this.instance.id;
      parser.load(options, options, this);
      this.isReady = false;
      this.connection = this._groupConnection ? this._groupConnection : this.instance.datastore === "redis" ? new RedisConnection(this.clientOptions, this.Promise, this.instance.Events) : this.instance.datastore === "ioredis" ? new IORedisConnection(this.clusterNodes, this.clientOptions, this.Promise, this.instance.Events) : void 0;
      this.ready = this.connection.ready.then(clients => {
        var args;
        this.clients = clients;
        args = this.prepareInitSettings(this.clearDatastore);
        this.isReady = true;
        return this.runScript("init", args);
      }).then(() => {
        this.connection.addLimiter(this.instance, message => {
          var info, type;

          var _message$split = message.split(":");

          var _message$split2 = _slicedToArray(_message$split, 2);

          type = _message$split2[0];
          info = _message$split2[1];

          if (type === "freed") {
            return this.instance._drainAll(~~info);
          }
        });
        return this.clients;
      });
    }

    __disconnect__(flush) {
      this.connection.removeLimiter(this.instance);
      if (this._groupConnection == null) {
        return this.connection.disconnect(flush);
      }
    }

    runScript(name, args) {
      var keys;
      if (!this.isReady) {
        return this.Promise.reject(new BottleneckError("This limiter is not done connecting to Redis yet. Wait for the '.ready()' promise to resolve before submitting requests."));
      } else {
        keys = Scripts.keys(name, this.originalId);
        return new this.Promise((resolve, reject) => {
          var arr;
          this.instance.Events.trigger("debug", [`Calling Redis script: ${name}.lua`, args]);
          arr = this.connection.scriptArgs(name, this.originalId, args, function (err, replies) {
            if (err != null) {
              return reject(err);
            }
            return resolve(replies);
          });
          return this.connection.scriptFn(name).apply({}, arr);
        }).catch(e => {
          if (e.message === "SETTINGS_KEY_NOT_FOUND") {
            return this.runScript("init", this.prepareInitSettings(false)).then(() => {
              return this.runScript(name, args);
            });
          } else {
            return this.Promise.reject(e);
          }
        });
      }
    }

    prepareArray(arr) {
      return arr.map(function (x) {
        if (x != null) {
          return x.toString();
        } else {
          return "";
        }
      });
    }

    prepareObject(obj) {
      var arr, k, v;
      arr = [];
      for (k in obj) {
        v = obj[k];
        arr.push(k, v != null ? v.toString() : "");
      }
      return arr;
    }

    prepareInitSettings(clear) {
      var args;
      args = this.prepareObject(Object.assign({}, this.initSettings, {
        id: this.originalId,
        nextRequest: Date.now(),
        running: 0,
        unblockTime: 0,
        version: this.instance.version,
        groupTimeout: this.timeout
      }));
      args.unshift(clear ? 1 : 0);
      return args;
    }

    convertBool(b) {
      return !!b;
    }

    __updateSettings__(options) {
      var _this = this;

      return _asyncToGenerator(function* () {
        return yield _this.runScript("update_settings", _this.prepareObject(options));
      })();
    }

    __running__() {
      var _this2 = this;

      return _asyncToGenerator(function* () {
        return yield _this2.runScript("running", [Date.now()]);
      })();
    }

    __groupCheck__() {
      var _this3 = this;

      return _asyncToGenerator(function* () {
        return _this3.convertBool((yield _this3.runScript("group_check", [])));
      })();
    }

    __incrementReservoir__(incr) {
      var _this4 = this;

      return _asyncToGenerator(function* () {
        return yield _this4.runScript("increment_reservoir", [incr]);
      })();
    }

    __currentReservoir__() {
      var _this5 = this;

      return _asyncToGenerator(function* () {
        return yield _this5.runScript("current_reservoir", []);
      })();
    }

    __check__(weight) {
      var _this6 = this;

      return _asyncToGenerator(function* () {
        return _this6.convertBool((yield _this6.runScript("check", _this6.prepareArray([weight, Date.now()]))));
      })();
    }

    __register__(index, weight, expiration) {
      var _this7 = this;

      return _asyncToGenerator(function* () {
        var reservoir, success, wait;

        var _ref = yield _this7.runScript("register", _this7.prepareArray([index, weight, expiration, Date.now()]));

        var _ref2 = _slicedToArray(_ref, 3);

        success = _ref2[0];
        wait = _ref2[1];
        reservoir = _ref2[2];

        return {
          success: _this7.convertBool(success),
          wait,
          reservoir
        };
      })();
    }

    __submit__(queueLength, weight) {
      var _this8 = this;

      return _asyncToGenerator(function* () {
        var blocked, e, maxConcurrent, overweight, reachedHWM, strategy;
        try {
          var _ref3 = yield _this8.runScript("submit", _this8.prepareArray([queueLength, weight, Date.now()]));

          var _ref4 = _slicedToArray(_ref3, 3);

          reachedHWM = _ref4[0];
          blocked = _ref4[1];
          strategy = _ref4[2];

          return {
            reachedHWM: _this8.convertBool(reachedHWM),
            blocked: _this8.convertBool(blocked),
            strategy
          };
        } catch (error) {
          e = error;
          if (e.message.indexOf("OVERWEIGHT") === 0) {
            var _e$message$split = e.message.split(":");

            var _e$message$split2 = _slicedToArray(_e$message$split, 3);

            overweight = _e$message$split2[0];
            weight = _e$message$split2[1];
            maxConcurrent = _e$message$split2[2];

            throw new BottleneckError(`Impossible to add a job having a weight of ${weight} to a limiter having a maxConcurrent setting of ${maxConcurrent}`);
          } else {
            throw e;
          }
        }
      })();
    }

    __free__(index, weight) {
      var _this9 = this;

      return _asyncToGenerator(function* () {
        var result;
        result = yield _this9.runScript("free", _this9.prepareArray([index, Date.now()]));
        return {
          running: result
        };
      })();
    }

  };

  module.exports = RedisDatastore;
}).call(undefined);