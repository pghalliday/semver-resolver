'use strict';

import 'babel-polyfill';
import semver from 'semver';
import _ from 'lodash';
import uuid from 'uuid';

export class SemverResolver {
  constructor(dependencies, getVersions, getDependencies) {
    this.getVersions = getVersions;
    this.getDependencies = getDependencies;
    let rootName = uuid.v4();
    this.root = rootName;
    let state = this.state = {};
    let rootState = state[rootName] = {};
    rootState.dependencies = _.mapValues(dependencies, range => {
      return {
        range: range
      };
    });
    this.queuedCalculations = Object.keys(dependencies);
    this.queuedConstraintUpdates = [];
    this.cachedVersions = {};
    this.cachedDependencies = {};
  }

  cleanQueuedCalculations() {
    let state = this.state;
    let knownLibraries = Object.keys(state);
    knownLibraries.forEach(library => {
      let dependencies = state[library].dependencies;
      // dependencies will always be populated
      // here because we just finished updating
      // from the queued constraints - if it isn't
      // then something probably changed around
      // the refillQueues/updateConstraints functions
      knownLibraries = _.union(
        knownLibraries,
        Object.keys(dependencies)
      );
    });
    this.queuedCalculations = _.intersection(
      this.queuedCalculations,
      knownLibraries
    );
  }

  cleanQueuedConstraintUpdates() {
    let state = this.state;
    let knownLibraries = Object.keys(state);
    // we only want to look up dependencies for
    // libraries still in the state
    this.queuedConstraintUpdates = _.intersection(
      this.queuedConstraintUpdates,
      knownLibraries
    );
  }

  dropLibrary(library) {
    let queuedCalculations = this.queuedCalculations;
    let state = this.state;
    let libraryState = state[library];
    if (libraryState) {
      // remove from state
      delete state[library];
      let dependencies = libraryState.dependencies;
      if (dependencies) {
        _.forEach(Object.keys(dependencies), dependency => {
          // drop old data for dependency if we have it
          // already as it should not
          // be used in calculations anymore
          this.dropLibrary(dependency);
          // queue dependency for recalculation
          // as a constraint has been dropped
          // but it may still be a dependency
          // of another library still in the tree
          queuedCalculations.push(dependency);
        });
      }
    }
  }

  updateConstraints(library) {
    let state = this.state;
    let cachedDependencies = this.cachedDependencies;
    let libraryState = state[library];
    // check if this library is still in the state.
    // it may already have been dropped in an earlier
    // update, in which case the information we would
    // apply now is invalid anyway
    if (libraryState) {
      let version = libraryState.version;
      let dependencies = cachedDependencies[library][version];
      let queuedCalculations = this.queuedCalculations;
      libraryState.dependencies = dependencies;
      // We don't need to worry about the possibility that there were already
      // dependencies attached to the library. It should
      // never happen as the only way to get into the update
      // queue is from the calculation queue and the only way
      // into the caclulation queue is on initialisation or
      // immediately after being dropped from the state. Thus
      // all these dependency constraints are new and none
      // will be dropped.
      Object.keys(dependencies).forEach(dependency => {
        // drop old data for dependency if we have it
        // already as it should not
        // be used in calculations anymore
        this.dropLibrary(dependency);
        // queue dependency for recalculation
        // as a constraint has been dropped
        // but it may still be a dependency
        // of another library still in the tree
        queuedCalculations.push(dependency);
      });
    }
  }

  maxSatisfying(library) {
    let state = this.state;
    let versions = this.cachedVersions[library];
    let queuedCalculations = this.queuedCalculations;
    let dependencyLibraries = {};
    // first collect all the constraints and the max versions
    // satisfying them, keyed by the parent that adds the constraint
    _.forOwn(state, (libraryState, parent) => {
      let dependencies = libraryState.dependencies;
      if (dependencies) {
        let dependencyLibrary = dependencies[library];
        if (dependencyLibrary) {
          if (!dependencyLibrary.maxSatisfying) {
            let range = dependencyLibrary.range;
            let maxSatisfying = semver.maxSatisfying(versions, range);
            if (maxSatisfying === null) {
              let backtrackedDueTo = dependencyLibrary.backtrackedDueTo;
              let constrainingLibrary = 'root';
              let version = libraryState.version;
              if (version) {
                constrainingLibrary = `${parent}@${version}`;
              }
              if (backtrackedDueTo) {
                throw new Error(
                  `Unable to satisfy backtracked version constraint: ` +
                  `${library}@${range} from ` +
                  `${constrainingLibrary} due to shared ` +
                  `constraint on ${backtrackedDueTo}`
                );
              } else {
                throw new Error(
                  `Unable to satisfy version constraint: ` +
                  `${library}@${range} from ` +
                  `${constrainingLibrary}`
                );
              }
            }
            dependencyLibrary.maxSatisfying = maxSatisfying;
          }
          dependencyLibraries[parent] = dependencyLibrary;
        }
      }
    });
    // next scan the max versions to find the minimum
    let lowestMaxSatisfying = null;
    _.forOwn(dependencyLibraries, (dependencyLibrary, parent) => {
      let maxSatisfying = dependencyLibrary.maxSatisfying;
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
    let constrainingParent = lowestMaxSatisfying.parent;
    let version = lowestMaxSatisfying.version;
    let resolutionFound = true;
    _.forOwn(dependencyLibraries, (dependencyLibrary, parent) => {
      if (parent !== constrainingParent) {
        let range = dependencyLibrary.range;
        if (!semver.satisfies(version, range)) {
          // check if parent is root as root
          // cannot be backtracked
          let constrainingState = state[constrainingParent];
          let constrainedState = state[parent];
          let constrainedStateVersion = constrainedState.version;
          if (!constrainedStateVersion) {
            throw new Error(
              `Unable to satisfy version constraint: ` +
              `${library}@${range} from root due to ` +
              'shared constraint from ' +
              `${constrainingParent}@${constrainingState.version}`
            );
          }

          // constraint cannot be met so add a new constraint
          // to the parent providing the lowest version for this
          // conflicting parent to backtrack to the next lowest version
          constrainingState.dependencies[parent] = {
            range: `<${constrainedStateVersion}`,
            backtrackedDueTo: library
          };
          // drop old data for dependency if we have it
          // already as it should not
          // be used in calculations anymore
          this.dropLibrary(parent);
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

  cacheVersions() {
    let cachedVersions = this.cachedVersions;
    let librariesAlreadyCached = Object.keys(cachedVersions);
    let queuedCalculations = this.queuedCalculations;
    let librariesToCache = _.difference(
      queuedCalculations, librariesAlreadyCached
    );
    return Promise.all(librariesToCache.map(this.getVersions))
    .then(versionsArray => {
      versionsArray.forEach((versions, index) => {
        cachedVersions[librariesToCache[index]] =
          versions.slice(0).sort(semver.rcompare);
      });
    });
  }

  resolveVersions() {
    let queuedCalculations = this.queuedCalculations;
    let nextQueuedCalculations = this.queuedCalculations = [];
    let state = this.state;
    let queuedConstraintUpdates = this.queuedConstraintUpdates;
    queuedCalculations.forEach(library => {
      // don't calculate now if the library was already requeued
      // due to backtracking - it may have been orphaned
      // and anyway tracking the state gets complicated
      if (!_.includes(nextQueuedCalculations, library)) {
        let version = this.maxSatisfying(library);
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

  cacheDependencies() {
    let state = this.state;
    let cachedDependencies = this.cachedDependencies;
    let queuedConstraintUpdates = this.queuedConstraintUpdates;
    let dependenciesToCache = queuedConstraintUpdates.filter(library => {
      let version = state[library].version;
      let versions = cachedDependencies[library];
      if (versions) {
        if (versions[version]) {
          return false;
        }
      }
      return true;
    });
    return Promise.all(dependenciesToCache.map(
      library => {
        return this.getDependencies(
          library,
          state[library].version
        );
      }
    ))
    .then(dependenciesArray => {
      dependenciesArray.forEach((dependencies, index) => {
        let library = dependenciesToCache[index];
        cachedDependencies[library] = cachedDependencies[library] || {};
        cachedDependencies[library][state[library].version] =
          _.mapValues(dependencies, range => {
            return {
              range: range
            };
          });
      });
    });
  }

  refillQueues() {
    let queuedConstraintUpdates = _.uniq(this.queuedConstraintUpdates);
    this.queuedConstraintUpdates = [];
    queuedConstraintUpdates.forEach(library => {
      this.updateConstraints(library);
    });
    // clean up the queued calculations
    // as some of the libraries may no longer
    // even be in dependencies
    this.cleanQueuedCalculations();
  }

  recurse() {
    if (this.queuedCalculations.length) {
      return this.start();
    }
  }

  start() {
    return this.cacheVersions()
    .then(this.resolveVersions.bind(this))
    .then(this.cacheDependencies.bind(this))
    .then(this.refillQueues.bind(this))
    .then(this.recurse.bind(this));
  }

  resolve() {
    return this.start()
    .then(() => {
      let resolution = _.mapValues(this.state, value => value.version);
      delete resolution[this.root];
      return resolution;
    });
  }
}

export default SemverResolver;
