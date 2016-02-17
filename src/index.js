'use strict';

let semver = require('semver');
let _ = require('lodash');

let calculateRecursive = (calculation, params) => {
  return new Promise((resolve, reject) => {
    let versionPromises = _.map(params.dependencies, (range, library) => {
      return params.versions(library)
      .then(versions => {
        return {
          library: library,
          range: range,
          versions: versions
        };
      });
    });
    Promise.all(versionPromises)
    .then(libraryVersionsList => {
      let constraintPromises = _.map(libraryVersionsList, libraryVersions => {
        let library = libraryVersions.library;
        let range = libraryVersions.range;
        let versions = libraryVersions.versions;
        return new Promise((resolve, reject) => {
          let maxSatisfying = semver.maxSatisfying(
            versions,
            range
          );
          if (maxSatisfying === null) {
            reject(
              new Error(
                `Unable to satisfy version constraint: ${library}: ${range}`
              )
            );
          } else {
            resolve(maxSatisfying);
          }
        }).then(version => {
          calculation[library] = version;
          if (params.constraints) {
            return params.constraints(library, version);
          }
        }).then(dependencies => {
          if (dependencies) {
            return calculateRecursive(calculation, {
              versions: params.versions,
              constraints: params.constraints,
              dependencies: dependencies
            });
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
  let calculation = {};
  return calculateRecursive(calculation, params);
};
