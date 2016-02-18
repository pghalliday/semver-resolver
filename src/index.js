'use strict';

let semver = require('semver');
let _ = require('lodash');

class RecursiveSemver {
  constructor(rootDependencies, getVersions, getDependencies) {
    this.getVersions = getVersions;
    this.getDependencies = getDependencies;
    this.queuedDependencyNames = [];
    this.queuedDependencies = [];
    this.resolution = {};
    this.ranges = {};
    this.cache = {
      versions: {},
      dependencies: {}
    };
    this.queueDependencies('root', rootDependencies);
  }

  queueDependencies(parent, dependencies) {
    _.forOwn(dependencies, (range, library) => {
      this.queueDependency(
        parent,
        library,
        range
      );
    });
  }

  queueDependency(parent, library, range) {
    // record the library and range with the parent
    let ranges = this.ranges[parent] || {};
    this.ranges[parent] = ranges;
    ranges[library] = range;

    // don't queue if the library is already queued
    if (this.queuedDependencyNames.indexOf(library) === -1) {
      // record the name of the library so we can
      // check later if it's already queued
      this.queuedDependencyNames.push(library);
      this.queuedDependencies.push(
        Promise.resolve().then(() => {
          // check the cache first
          if (this.cache.versions[library]) {
            return this.cache.versions[library];
          }
          return this.getVersions(library);
        }).then(versions => {
          // add to the versions cache so we don't look it up again
          versions.sort(semver.rcompare);
          this.cache.versions[library] = versions;
          let version = this.maxSatisfying(library, versions);
          // record the resolution
          this.resolution[library] = version;
          // now look up sub dependencies for the next pass
          if (this.getDependencies) {
            return this.getDependencies(library, version);
          }
          // no getDependencies callback so return empty dependencies
          return {};
        }).then(_dependencies => {
        })
      );
    }
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
      `Unable to satisfy version constraints: ${library}@${ranges}`
    );
  }

  resolve() {
    let currentDependencies = this.queueDependencies;
    this.queuedDependencies = [];
    this.queuedDependencyNames = [];
    console.log(Promise.all);
    return Promise.all(currentDependencies).then(() => {
      return this.resolution;
    });
  }
}

module.exports = RecursiveSemver;
