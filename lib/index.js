'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var semver = require('semver');
var _ = require('lodash');
var uuid = require('uuid');

var SemverResolver = function () {
  function SemverResolver(dependencies, getVersions, getDependencies) {
    _classCallCheck(this, SemverResolver);

    this.getVersions = getVersions;
    this.getDependencies = getDependencies;
    var rootName = uuid.v4();
    this.root = rootName;
    var state = this.state = {};
    var rootState = state[rootName] = {};
    rootState.dependencies = _.mapValues(dependencies, function (range) {
      return {
        range: range
      };
    });
    this.queuedCalculations = Object.keys(dependencies);
    this.queuedConstraintUpdates = [];
    this.cachedVersions = {};
    this.cachedDependencies = {};
  }

  _createClass(SemverResolver, [{
    key: 'cleanQueuedCalculations',
    value: function cleanQueuedCalculations() {
      var state = this.state;
      var knownLibraries = Object.keys(state);
      knownLibraries.forEach(function (library) {
        var dependencies = state[library].dependencies;
        // dependencies will always be populated
        // here because we just finished updating
        // from the queued constraints - if it isn't
        // then something probably changed around
        // the refillQueues/updateConstraints functions
        knownLibraries = _.union(knownLibraries, Object.keys(dependencies));
      });
      this.queuedCalculations = _.intersection(this.queuedCalculations, knownLibraries);
    }
  }, {
    key: 'cleanQueuedConstraintUpdates',
    value: function cleanQueuedConstraintUpdates() {
      var state = this.state;
      var knownLibraries = Object.keys(state);
      // we only want to look up dependencies for
      // libraries still in the state
      this.queuedConstraintUpdates = _.intersection(this.queuedConstraintUpdates, knownLibraries);
    }
  }, {
    key: 'dropLibrary',
    value: function dropLibrary(library) {
      var _this = this;

      var queuedCalculations = this.queuedCalculations;
      var state = this.state;
      var libraryState = state[library];
      if (libraryState) {
        // remove from state
        delete state[library];
        var dependencies = libraryState.dependencies;
        if (dependencies) {
          _.forEach(Object.keys(dependencies), function (dependency) {
            // drop old data for dependency if we have it
            // already as it should not
            // be used in calculations anymore
            _this.dropLibrary(dependency);
            // queue dependency for recalculation
            // as a constraint has been dropped
            // but it may still be a dependency
            // of another library still in the tree
            queuedCalculations.push(dependency);
          });
        }
      }
    }
  }, {
    key: 'updateConstraints',
    value: function updateConstraints(library) {
      var _this2 = this;

      var state = this.state;
      var cachedDependencies = this.cachedDependencies;
      var libraryState = state[library];
      // check if this library is still in the state.
      // it may already have been dropped in an earlier
      // update, in which case the information we would
      // apply now is invalid anyway
      if (libraryState) {
        (function () {
          var version = libraryState.version;
          var dependencies = cachedDependencies[library][version];
          var queuedCalculations = _this2.queuedCalculations;
          libraryState.dependencies = dependencies;
          // We don't need to worry about the possibility that there were already
          // dependencies attached to the library. It should
          // never happen as the only way to get into the update
          // queue is from the calculation queue and the only way
          // into the caclulation queue is on initialisation or
          // immediately after being dropped from the state. Thus
          // all these dependency constraints are new and none
          // will be dropped.
          Object.keys(dependencies).forEach(function (dependency) {
            // drop old data for dependency if we have it
            // already as it should not
            // be used in calculations anymore
            _this2.dropLibrary(dependency);
            // queue dependency for recalculation
            // as a constraint has been dropped
            // but it may still be a dependency
            // of another library still in the tree
            queuedCalculations.push(dependency);
          });
        })();
      }
    }
  }, {
    key: 'maxSatisfying',
    value: function maxSatisfying(library) {
      var _this3 = this;

      var state = this.state;
      var versions = this.cachedVersions[library];
      var queuedCalculations = this.queuedCalculations;
      var dependencyLibraries = {};
      // first collect all the constraints and the max versions
      // satisfying them, keyed by the parent that adds the constraint
      _.forOwn(state, function (libraryState, parent) {
        var dependencies = libraryState.dependencies;
        if (dependencies) {
          var dependencyLibrary = dependencies[library];
          if (dependencyLibrary) {
            if (!dependencyLibrary.maxSatisfying) {
              var range = dependencyLibrary.range;
              var maxSatisfying = semver.maxSatisfying(versions, range);
              if (maxSatisfying === null) {
                var backtrackedDueTo = dependencyLibrary.backtrackedDueTo;
                var constrainingLibrary = 'root';
                var _version = libraryState.version;
                if (_version) {
                  constrainingLibrary = parent + '@' + _version;
                }
                if (backtrackedDueTo) {
                  throw new Error('Unable to satisfy backtracked version constraint: ' + (library + '@' + range + ' from ') + (constrainingLibrary + ' due to shared ') + ('constraint on ' + backtrackedDueTo));
                } else {
                  throw new Error('Unable to satisfy version constraint: ' + (library + '@' + range + ' from ') + ('' + constrainingLibrary));
                }
              }
              dependencyLibrary.maxSatisfying = maxSatisfying;
            }
            dependencyLibraries[parent] = dependencyLibrary;
          }
        }
      });
      // next scan the max versions to find the minimum
      var lowestMaxSatisfying = null;
      _.forOwn(dependencyLibraries, function (dependencyLibrary, parent) {
        var maxSatisfying = dependencyLibrary.maxSatisfying;
        if (lowestMaxSatisfying === null) {
          lowestMaxSatisfying = {
            parent: parent,
            version: maxSatisfying
          };
        }
        if (maxSatisfying < lowestMaxSatisfying.version) {
          lowestMaxSatisfying.parent = parent;
          lowestMaxSatisfying.version = maxSatisfying;
        }
      });
      // then check if that minimum satisfies the other constraints
      // if a conflicting constraint is found then we have no version and should
      // drop and requeue the library version that adds the conflict, with
      // a new constraint to check for an earlier version of it
      var constrainingParent = lowestMaxSatisfying.parent;
      var version = lowestMaxSatisfying.version;
      var resolutionFound = true;
      _.forOwn(dependencyLibraries, function (dependencyLibrary, parent) {
        if (parent !== constrainingParent) {
          var range = dependencyLibrary.range;
          if (!semver.satisfies(version, range)) {
            // check if parent is root as root
            // cannot be backtracked
            var constrainingState = state[constrainingParent];
            var constrainedState = state[parent];
            var constrainedStateVersion = constrainedState.version;
            if (!constrainedStateVersion) {
              throw new Error('Unable to satisfy version constraint: ' + (library + '@' + range + ' from root due to ') + 'shared constraint from ' + (constrainingParent + '@' + constrainingState.version));
            }

            // constraint cannot be met so add a new constraint
            // to the parent providing the lowest version for this
            // conflicting parent to backtrack to the next lowest version
            constrainingState.dependencies[parent] = {
              range: '<' + constrainedStateVersion,
              backtrackedDueTo: library
            };
            // drop old data for dependency if we have it
            // already as it should not
            // be used in calculations anymore
            _this3.dropLibrary(parent);
            // queue dependency for recalculation
            // as a constraint has been dropped
            // but it may still be a dependency
            // of another library still in the tree
            queuedCalculations.push(parent);
            resolutionFound = false;
            return resolutionFound;
          }
        }
      });
      if (resolutionFound) {
        return version;
      }
      return null;
    }
  }, {
    key: 'cacheVersions',
    value: function cacheVersions() {
      var cachedVersions = this.cachedVersions;
      var librariesAlreadyCached = Object.keys(cachedVersions);
      var queuedCalculations = this.queuedCalculations;
      var librariesToCache = _.difference(queuedCalculations, librariesAlreadyCached);
      return Promise.all(librariesToCache.map(this.getVersions)).then(function (versionsArray) {
        versionsArray.forEach(function (versions, index) {
          cachedVersions[librariesToCache[index]] = versions.slice(0).sort(semver.rcompare);
        });
      });
    }
  }, {
    key: 'resolveVersions',
    value: function resolveVersions() {
      var _this4 = this;

      var queuedCalculations = this.queuedCalculations;
      var nextQueuedCalculations = this.queuedCalculations = [];
      var state = this.state;
      var queuedConstraintUpdates = this.queuedConstraintUpdates;
      queuedCalculations.forEach(function (library) {
        // don't calculate now if the library was already requeued
        // due to backtracking - it may have been orphaned
        // and anyway tracking the state gets complicated
        if (!_.includes(nextQueuedCalculations, library)) {
          var version = _this4.maxSatisfying(library);
          if (version) {
            state[library] = {
              version: version
            };
            queuedConstraintUpdates.push(library);
          }
        }
      });
      // clean up the queued constraint updates
      // as some of the libraries may no longer
      // even be in dependencies
      this.cleanQueuedConstraintUpdates();
    }
  }, {
    key: 'cacheDependencies',
    value: function cacheDependencies() {
      var _this5 = this;

      var state = this.state;
      var cachedDependencies = this.cachedDependencies;
      var queuedConstraintUpdates = this.queuedConstraintUpdates;
      var dependenciesToCache = queuedConstraintUpdates.filter(function (library) {
        var version = state[library].version;
        var versions = cachedDependencies[library];
        if (versions) {
          if (versions[version]) {
            return false;
          }
        }
        return true;
      });
      return Promise.all(dependenciesToCache.map(function (library) {
        return _this5.getDependencies(library, state[library].version);
      })).then(function (dependenciesArray) {
        dependenciesArray.forEach(function (dependencies, index) {
          var library = dependenciesToCache[index];
          cachedDependencies[library] = cachedDependencies[library] || {};
          cachedDependencies[library][state[library].version] = _.mapValues(dependencies, function (range) {
            return {
              range: range
            };
          });
        });
      });
    }
  }, {
    key: 'refillQueues',
    value: function refillQueues() {
      var _this6 = this;

      var queuedConstraintUpdates = _.uniq(this.queuedConstraintUpdates);
      this.queuedConstraintUpdates = [];
      queuedConstraintUpdates.forEach(function (library) {
        _this6.updateConstraints(library);
      });
      // clean up the queued calculations
      // as some of the libraries may no longer
      // even be in dependencies
      this.cleanQueuedCalculations();
    }
  }, {
    key: 'recurse',
    value: function recurse() {
      if (this.queuedCalculations.length) {
        return this.start();
      }
    }
  }, {
    key: 'start',
    value: function start() {
      return this.cacheVersions().then(this.resolveVersions.bind(this)).then(this.cacheDependencies.bind(this)).then(this.refillQueues.bind(this)).then(this.recurse.bind(this));
    }
  }, {
    key: 'resolve',
    value: function resolve() {
      var _this7 = this;

      return this.start().then(function () {
        var resolution = _.mapValues(_this7.state, function (value) {
          return value.version;
        });
        delete resolution[_this7.root];
        return resolution;
      });
    }
  }]);

  return SemverResolver;
}();

module.exports = SemverResolver;