'use strict';

let semver = require('semver');
let _ = require('lodash');

let depth = 0;
let maskLibrary = (libraries, tree, library) => {
  depth++;
  console.log('%d: before:', depth);
  console.log(libraries);
  console.log('%d: tree:', depth);
  console.log(tree);
  console.log('%d: library:', depth);
  console.log(library);
  _.pull(libraries, library);
  _.forEach(tree[library], dependency => {
    maskLibrary(libraries, tree, dependency);
  });
  console.log('%d: after:', depth);
  console.log(libraries);
  depth--;
};

class RecursiveSemver {
  constructor(rootDependencies, getVersions, getDependencies) {
    this.getVersions = getVersions;
    this.getDependencies = getDependencies;
    this.queuedDependencies = {};
    this.queuedRecalculations = [];
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

  rangesToTree() {
    return _.mapKeys(
      _.mapValues(
        this.ranges,
        dependencies => {
          return Object.keys(dependencies);
        }
      ),
      (value, key) => {
        return key.split('@')[0];
      }
    );
  }

  getOrphans() {
    let tree = this.rangesToTree();
    let libraries = Object.keys(this.resolution);
    maskLibrary(libraries, tree, 'root');
    return libraries;
  }

  dropVersion(library, version) {
    let libraryVersion = `${library}@${version}`;
    // delete this version from resolution and ranges
    delete this.resolution[library];
    let dependencies = this.ranges[libraryVersion];
    delete this.ranges[libraryVersion];
    // mark dependencies as needing recalculating
    this.queuedRecalculations.push.apply(
      this.queuedRecalculations,
      Object.keys(dependencies)
    );
    // now remove any orphaned dependencies
    let orphans = this.getOrphans();
    _.forEach(orphans, orphan => {
      // drop if not already dropped
      if (this.resolution[orphan]) {
        this.dropVersion(orphan, this.resolution[orphan]);
      }
    });
    // and drop the recalculations for orphaned dependencies
    _.pullAll(this.queuedRecalculations, orphans);
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
      // check if we have a changing resolution that will require a recalculation
      let currentVersion = this.resolution[library];
      console.log('library: ' + library);
      console.log('currentVersion: ' + currentVersion);
      console.log('version: ' + version);
      if (currentVersion && currentVersion !== version) {
        this.dropVersion(library, currentVersion);
      }
      // record in the resolution
      this.resolution[library] = version;
      // now look up sub dependencies for the next pass
      let libraryVersion = `${library}@${version}`;
      if (this.getDependencies) {
        // check the cache first
        if (this.cache.dependencies[libraryVersion]) {
          return [
            libraryVersion,
            this.cache.dependencies[libraryVersion]
          ];
        }
        return this.getDependencies(library, version).then(dependencies => {
          // add to the dependencies cache
          this.cache.dependencies[libraryVersion] = dependencies;
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
    let libraries = this.queuedRecalculations;
    this.queuedRecalculations = [];
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
      // or libraries to recalculate dependencies for
      if (
        Object.keys(this.queuedDependencies).length ||
        this.queuedRecalculations.length
      ) {
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
    // TODO: figure out where the conflict is and see if an earlier version will
    // satisfy the constraints
    throw new Error(
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
