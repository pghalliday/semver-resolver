'use strict';

let semver = require('semver');
let _ = require('lodash');

class RecursiveSemver {
  constructor(rootDependencies, getVersions, getDependencies) {
    this.getVersions = getVersions;
    this.getDependencies = getDependencies;
    this.queuedDependencies = {};
    this.resolution = {};
    this.ranges = {};
    this.cache = {
      versions: {},
      dependencies: {}
    };
    this.queueDependencies('root', rootDependencies);
  }

  queueDependencies(parent, dependencies) {
    this.queuedDependencies[parent] = dependencies;
  }

  startDependency(library) {
    return Promise.resolve().then(() => {
      // check the cache first
      if (this.cache.versions[library]) {
        return this.cache.versions[library];
      }
      return this.getVersions(library).then(versions => {
        // shallow copy and sort the versions descending so they can be scanned
        let sortedVersions = versions.sort(semver.rcompare);
        // add to the versions cache so we don't look it up again
        this.cache.versions[library] = sortedVersions;
        return sortedVersions;
      });
    }).then(versions => {
      let version = this.maxSatisfying(library, versions);
      // record in the resolution
      // TODO: check if we have a changing resolution that will require a recalculation
      this.resolution[library] = version;
      // now look up sub dependencies for the next pass
      let libraryVersion = `${library}@${version}`;
      if (this.getDependencies) {
        return this.getDependencies(library, version).then(dependencies => {
          return [
            libraryVersion,
            dependencies
          ];
        });
      }
      // no getDependencies callback so return empty dependencies
      return [
        libraryVersion,
        {}
      ];
    }).then(libraryVersionAndDependencies => {
      // add the dependencies to the queue for the next pass
      this.queueDependencies(
        libraryVersionAndDependencies[0],
        libraryVersionAndDependencies[1]
      );
    });
  }

  startDependencies() {
    let currentDependencies = this.queuedDependencies;
    this.queuedDependencies = [];
    let libraries = [];
    _.forOwn(currentDependencies, (dependencies, parent) => {
      _.forOwn(dependencies, (range, library) => {
        // record the library and range with the parent
        let ranges = this.ranges[parent] || {};
        this.ranges[parent] = ranges;
        ranges[library] = range;
        // add to libraries array
        libraries.push(library);
      });
    });
    libraries = _.uniq(libraries);
    return Promise.all(
      _.map(libraries, library => {
        return this.startDependency(library);
      })
    ).then(() => {
      // keep recursing until there no longer any queued dependencies
      if (Object.keys(this.queuedDependencies).length) {
        return this.startDependencies();
      }
    });
  }

  maxSatisfying(library, versions) {
    let validVersion;
    let ranges = [];
    _.forOwn(this.ranges, value => {
      if (value[library]) {
        ranges.push(value[library]);
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
    throw new Error(
      // TODO: figure out where the conflict is and see if an earlier version will
      // satisfy the constraints
      `Unable to satisfy version constraints: ${library}@${ranges}`
    );
  }

  resolve() {
    return this.startDependencies().then(() => {
      return this.resolution;
    });
  }
}

module.exports = RecursiveSemver;
