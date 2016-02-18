'use strict';

let semver = require('semver');
let _ = require('lodash');

let maxSatisfying = (library, versions, constraints) => {
  let validVersion;
  let ranges = [];
  _.forOwn(constraints, value => {
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
};

let calculateRecursive = (cache, constraints, calculation, params) => {
  return new Promise((resolve, reject) => {
    let versionPromises = _.map(Object.keys(params.dependencies), library => {
      if (cache.versions[library]) {
        return {
          library: library,
          versions: cache.versions[library]
        };
      }
      return params.versions(library)
      .then(versions => {
        versions.sort(semver.rcompare);
        cache.versions[library] = versions;
        return {
          library: library,
          versions: versions
        };
      });
    });
    Promise.all(versionPromises)
    .then(libraryVersionsList => {
      let constraintPromises = _.map(libraryVersionsList, libraryVersions => {
        let library = libraryVersions.library;
        let versions = libraryVersions.versions;
        return new Promise(resolve => {
          let version = maxSatisfying(
            library,
            versions,
            constraints
          );
          if (calculation[library]) {
            // TODO: remove old version from constraints and recalculate where necessary
            // TODO: I think i need to implement a queue in order to do the recalculation
            // TODO: queues with promises are non trivial
            // TODO: use generators?
            let oldLibraryVersion = `${library}@${calculation[library]}`;
            dropConstraints(
              oldLibraryVersion,
              constraints,
              calculation
            );
          }
          let libraryVersion = `${library}@${version}`;
          constraints[libraryVersion] = {};
          calculation[library] = version;
          if (cache.constraints[libraryVersion]) {
            resolve([
              version,
              cache.constraints[libraryVersion]
            ]);
          } else {
            resolve([
              version
            ]);
          }
        }).then(versionDependencies => {
          let version = versionDependencies[0];
          let dependencies = versionDependencies[1];
          if (dependencies) {
            return versionDependencies;
          }
          if (params.constraints) {
            return new Promise((resolve, reject) => {
              params.constraints(library, version)
              .then(dependencies => {
                resolve([
                  version,
                  dependencies
                ]);
              }, reject);
            });
          }
        }).then(versionDependencies => {
          if (versionDependencies) {
            let version = versionDependencies[0];
            let dependencies = versionDependencies[1];
            let libraryVersion = `${library}@${version}`;
            cache.constraints[libraryVersion] = dependencies;
            if (constraints[libraryVersion]) {
              constraints[libraryVersion] = dependencies;
              return calculateRecursive(cache, constraints, calculation, {
                versions: params.versions,
                constraints: params.constraints,
                dependencies: dependencies
              });
            }
          }
        });
      });
      return Promise.all(constraintPromises);
    }).then(() => {
      resolve(calculation);
    }, reject);
  });
};

module.exports = params => {
  let constraints = {
    root: params.dependencies
  };
  let cache = {
    versions: {},
    constraints: {}
  };
  let calculation = {};
  return calculateRecursive(cache, constraints, calculation, params);
};
