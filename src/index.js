'use strict';

let semver = require('semver');
let _ = require('lodash');

module.exports = params => {
  return new Promise((resolve, reject) => {
    let promises = _.map(params.dependencies, (range, library) => {
      return params.versions(library)
      .then(versions => {
        return {
          library: library,
          range: range,
          versions: versions
        };
      });
    });
    Promise.all(promises)
    .then(libraryVersionsList => {
      let calculation = {};
      let error = null;
      _.forEach(libraryVersionsList, libraryVersions => {
        let library = libraryVersions.library;
        let range = libraryVersions.range;
        let versions = libraryVersions.versions;
        let maxSatisfying = semver.maxSatisfying(
          versions,
          range
        );
        if (maxSatisfying === null) {
          error = new Error(
            `Unable to satisfy version constraint: ${library}: ${range}`
          );
          return false;
        }
        calculation[library] = maxSatisfying;
      });
      if (error === null) {
        resolve(calculation);
      } else {
        reject(error);
      }
    }, reject);
  });
};
