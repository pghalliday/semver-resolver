# recursive-semver

[![Build Status](https://travis-ci.org/pghalliday/recursive-semver.svg?branch=master)](https://travis-ci.org/pghalliday/recursive-semver)
[![Coverage Status](https://coveralls.io/repos/github/pghalliday/recursive-semver/badge.svg?branch=master)](https://coveralls.io/github/pghalliday/recursive-semver?branch=master)
[![Dependency Status](https://david-dm.org/pghalliday/recursive-semver.svg)](https://david-dm.org/pghalliday/recursive-semver)
[![devDependency Status](https://david-dm.org/pghalliday/recursive-semver/dev-status.svg)](https://david-dm.org/pghalliday/recursive-semver#info=devDependencies)

Calculate versions for a dependency tree of libraries that use semver but do not allow more than one version of a library to be present in the calculation

## Usage

Require the `RecursiveSemver` class

```javascript
let RecursiveSemver = require('recursive-semver');
```

Construct a new `RecursiveSemver` instance, supplying functions that return promises for available versions of libraries and the version constraints associated with particular versions of libraries along with a top level list of libraries and their version constraints (the dependencies).

```javascript
let rs = new RecursiveSemver(
  {
    'foo': '^2.4.5',
    'bar': '^1.17.3',
    'mylib': '^2.8.0',
    'another-lib': '^0.17.1'
  },
  library => {

    // return a promise for the available versions of the requested library
    ...

  },
  (library, version) => {

    // return a promise for the additional version constraints
    // to be applied for the requested version of the requested library
    ...

  }
});
```

`#resolve` returns a promise for the resolved list of dependencies and their versions, or an error if the constraints cannot be resolved.

```javascript
rs.resolve.then(
  resolution => {

    // `resolution` will be a mapping of all the required
    // libraries to the highest versions that satisfy the
    // recursive version constraints
    ...

  },
  error => {

    // an error occurred, most likely because the version
    // constraints cannot be resolved 
    ...

  }
);
```

## Algorithm

The resolver works in passes. In each pass the following occurs:

1. Unfixed dependencies are queued for calculation
1. Available versions are cached for dependencies that have not been cached yet
1. Max satisfying versions are calculated for queued dependencies
  1. If constraints can't be met due to a version of a dependency fixed in an earlier pass then the version of the conflicting dependency will be backtracked to the next earlier version (by adding a new constraint), dropped from the current state of the calculation and requeued for calculation
  1. Any dependencies of a requeued calculation will also be dropped and requeued
1. Calculated versions are then added to to a queue to update the state with their dependencies
1. Dependencies are cached for the calculated versions that have not yet been cached
1. The new constraints from the dependencies are queued for recalculation after dropping the previous calculations and their dependencies
  1. Already queued caclulations are filtered to ensure that any orphaned libraries do not get recalculated - the recursive dropping of libraries can result in already queued calculations no longer being valid/required

Passes continue until there are no longer any calculations queued

## Contributing

Install dependencies

```
npm install
```

Make changes and run lint/tests with

```
npm test
```

Watch for changes and run lint/tests with

```
npm run watch
```
