'use strict';

let semver = require('semver');
let _ = require('lodash');

let maskLibrary = (libraries, tree, library) => {
  _.pull(libraries, library);
  _.forEach(tree[library], dependency => {
    maskLibrary(libraries, tree, dependency);
  });
};

let libraryVersionToKey = (library, version) => `${library}@${version}`;
let libraryVersionFromKey = libraryVersion => libraryVersion.split('@');

class RecursiveSemver {
  constructor(rootDependencies, getVersions, getDependencies) {
    this.getVersions = getVersions;
    this.getDependencies = getDependencies;
    this.queuedCalculations = [];
    this.queuedConstraintUpdates = [];
    this.resolution = {};
    this.constraints = {};
    this.cachedVersions = {};
    this.cachedDependencies = {};
    this.updateConstraints('root', rootDependencies);
  }

  constraintIsNew(library, range) {
    let isNew = true;
    let constraints = this.constraints;
    _.forOwn(constraints, dependencies => {
      _.forOwn(dependencies, (r, l) => {
        // TODO: this could be improved by checking if the new range
        // is fully contained by an existing range. Maybe this wouldn't
        // be an optimisation though if the check takes longer than the
        // calculation we're trying to avoid
        if (l === library && r === range) {
          isNew = false;
          return isNew;
        }
      });
      return isNew;
    });
    return isNew;
  }

  constraintsToTree() {
    return _.mapKeys(
      _.mapValues(
        this.constraints,
        dependencies => {
          return Object.keys(dependencies);
        }
      ),
      (dependencies, libraryVersion) => {
        return libraryVersionFromKey(libraryVersion)[0];
      }
    );
  }

  getOrphans() {
    let tree = this.constraintsToTree();
    let libraries = Object.keys(tree);
    maskLibrary(libraries, tree, 'root');
    return libraries;
  }

  dropLibrary(library) {
    let queuedCalculations = this.queuedCalculations;
    // remove from calculation queue if already added
    _.pull(queuedCalculations, library);
    let resolution = this.resolution;
    let version = resolution[library];
    if (version) {
      let constraints = this.constraints;
      let libraryVersion = libraryVersionToKey(library, version);
      // remove from resolution
      delete resolution[library];
      let dependencies = constraints[libraryVersion];
      // remove from constraints
      delete constraints[libraryVersion];
      // mark any dependencies for recalculation
      // as a constraint has been dropped
      _.forEach(Object.keys(dependencies), library => {
        let version = resolution[library];
        if (version && !_.includes(queuedCalculations, library)) {
          queuedCalculations.push(library);
        }
      });
    }
  }

  updateConstraints(parent, dependencies) {
    let constraints = this.constraints;
    let queuedCalculations = this.queuedCalculations;
    _.forOwn(dependencies, (range, library) => {
      // TODO: is it faster to dedupe now or to just add everything
      // and dedupe with _.uniq before processing the queue?
      if (!_.includes(queuedCalculations, library)) {
        // TODO: is this check really an optimisation?
        // wouldn't it be quicker just to do the calculation
        // again than to scan the constraints?
        if (this.constraintIsNew(library, range)) {
          // remove the current calculation from
          // the resolution if already calculated
          this.dropLibrary(library);
          // queue dependency for calculation
          queuedCalculations.push(library);
        }
      }
    });
    constraints[parent] = dependencies;
    // clean up any orphans left over from dropping
    // invalidated calculations
    let orphans = this.getOrphans();
    while (orphans.length) {
      orphans.forEach(this.dropLibrary.bind(this));
      orphans = this.getOrphans();
    }
  }

  maxSatisfying(library) {
    let versions = this.cachedVersions[library];
    let validVersion;
    let ranges = [];
    _.forOwn(this.constraints, dependencies => {
      if (dependencies[library]) {
        ranges.push(dependencies[library]);
      }
    });
    _.forEach(versions, version => {
      let valid = true;
      _.forEach(ranges, range => {
        if (!semver.satisfies(version, range)) {
          valid = false;
          return false;
        }
      });
      if (valid) {
        validVersion = version;
        return false;
      }
    });
    if (validVersion) {
      return validVersion;
    }
    // TODO: figure out where the conflict is and see if an earlier version will
    // satisfy the constraints
    throw new Error(
      `Unable to satisfy version constraints: ${library}@${ranges}`
    );
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
    this.queuedCalculations = [];
    let resolution = this.resolution;
    let queuedConstraintUpdates = this.queuedConstraintUpdates;
    queuedCalculations.forEach(library => {
      let version = this.maxSatisfying(library);
      let libraryVersion = libraryVersionToKey(library, version);
      resolution[library] = version;
      if (!_.includes(queuedConstraintUpdates, libraryVersion)) {
        queuedConstraintUpdates.push(libraryVersion);
      }
    });
  }

  cacheDependencies() {
    let cachedDependencies = this.cachedDependencies;
    let dependenciesAlreadyCached = Object.keys(cachedDependencies);
    let queuedConstraintUpdates = this.queuedConstraintUpdates;
    let dependenciesToCache = _.difference(
      queuedConstraintUpdates,
      dependenciesAlreadyCached
    );
    return Promise.all(dependenciesToCache.map(
      libraryVersion => {
        return this.getDependencies.apply(
          this,
          libraryVersionFromKey(libraryVersion)
        );
      }
    ))
    .then(dependenciesArray => {
      dependenciesArray.forEach((dependencies, index) => {
        cachedDependencies[dependenciesToCache[index]] = dependencies;
      });
    });
  }

  refillQueues() {
    let queuedConstraintUpdates = this.queuedConstraintUpdates;
    this.queuedConstraintUpdates = [];
    let cachedDependencies = this.cachedDependencies;
    queuedConstraintUpdates.forEach(libraryVersion => {
      this.updateConstraints(libraryVersion, cachedDependencies[libraryVersion]);
    });
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
    .then(() => this.resolution);
  }
}

module.exports = RecursiveSemver;
