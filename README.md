# semver-resolver

[![Build Status](https://travis-ci.org/pghalliday/semver-resolver.svg?branch=master)](https://travis-ci.org/pghalliday/semver-resolver)
[![Coverage Status](https://coveralls.io/repos/github/pghalliday/semver-resolver/badge.svg?branch=master)](https://coveralls.io/github/pghalliday/semver-resolver?branch=master)
[![Dependency Status](https://david-dm.org/pghalliday/semver-resolver.svg)](https://david-dm.org/pghalliday/semver-resolver)
[![devDependency Status](https://david-dm.org/pghalliday/semver-resolver/dev-status.svg)](https://david-dm.org/pghalliday/semver-resolver#info=devDependencies)

Calculate an 'optimal' solution for a dependency tree using semantic versioning

- Uses https://www.npmjs.com/package/semver
- Which implements http://semver.org/

## Usage

Install `semver-resolver`

```
npm install semver-resolver
```

Require the `SemverResolver` class

```javascript
let SemverResolver = require('semver-resolver').SemverResolver;
```

Construct a new `SemverResolver` instance, supplying functions that return promises for available versions of libraries and the version constraints associated with particular versions of libraries along with a top level list of libraries and their version constraints (the dependencies).

```javascript
let resolver = new SemverResolver(
  dependencies: {
    'foo': '^2.4.5',
    'bar': '^1.17.3',
    'mylib': '^2.8.0',
    'another-lib': '^0.17.1'
  },
  getVersions: library => {

    // return a promise for the available versions of the requested library
    ...

  },
  getDependencies: (library, version) => {

    // return a promise for the additional version constraints
    // to be applied for the requested version of the requested library
    ...

  },
  // Optionally supply a `locks` structure returned from a previous call
  // to `#resolve`
  locks: {
    // version of semver-resolver used to generate the locks
    version: '1.0.0',
    // original dependencies used to generate the locks (will be
    // compared to new dependencies to see if they changed)
    dependencies: {
      'foo': '^2.4.5',
      'bar': '^1.17.3',
      'mylib': '^2.8.0'
    },
    // The resolution to lock where appropriate. New dependencies will
    // have to satisfy these versions to minimise change. However,
    // dropped dependencies and their requirements will not be counted.
    // If the dependencies have not changed then the generated resolution
    // will be the same
    resolution: {
      'foo': {
        version: '2.4.8',
        dependencies: {
          'bar': '^1.17.0'
        }
      },
      'bar': {
        version: '1.17.5',
        dependencies: {
          'alib': '^5.2.1',
          'blib': '^3.0.0'
        }
      },
      'mylib': {
        version: '2.8.6',
        dependencies: {}
      },
      'alib': {
        version: '5.2.4',
        dependencies: {}
      },
      'blib': {
        version: '3.0.0',
        dependencies: {}
      }
    }
  }
});
```

`#resolve` returns a promise for the resolved list of dependencies and their versions, or an error if the constraints cannot be resolved.

```javascript
resolver.resolve.then(
  locks => {

    // `locks` will be a structure including the resolution
    // that can also be used in calls to `#resolve` to lock
    // versions of dependencies
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

1. Uncalculated dependencies are queued for calculation
1. Available versions are cached for dependencies that have not been cached yet
1. Max satisfying versions are calculated for queued dependencies
  1. If constraints can't be met due to a version of a dependency fixed in an earlier pass then the version of the conflicting dependency will be backtracked to the next earlier version (by adding a new constraint), dropped from the current state of the calculation and requeued for calculation
  1. Any dependencies of a requeued calculation will also be dropped and requeued
1. Calculated versions are then added to to a queue to update the state with their dependencies
1. Dependencies are cached for the calculated versions that have not yet been cached
1. The new dependencies are queued for recalculation after dropping the previous calculations and their dependencies
  1. Already queued caclulations are filtered to ensure that any orphaned libraries do not get recalculated - the recursive dropping of libraries can result in already queued calculations no longer being valid/required
1. The next pass starts again at step 2

Passes continue until there are no longer any calculations queued

## Limitations

Although an attempt is made to calculate an 'optimal' solution by preferring the maximum satisfying versions according to semantic versioning rules, it is possible that the actual solution could be considered sub-optimal. The following limitations should be considered.

- When backtracking it is assumed that older versions of a library will have older dependencies
  - this means we choose to backtrack the libraries providing the upper constraints
  - if a library has reverted a version of a dependency due to some issue then it may be possible that a newer matching solution could be found by backtracking the library with the lower constraint
  - in such a case, however, it may well be undesirable to backtrack and the algorithm should avoid this
- The definition of optimal may not be clear, particularly if multiple solutions are available
  - The algiorithm does not consider possible alternative solutions and only returns the first it finds
  - the choice of libraries to backtrack is somewhat arbitrary, in that on each pass the first upper constraint found will be backtracked until a solution can be found
  - It may be preferable to backtrack differently (ie. choosing different libraries to backtrack or backtracking in a different order)

If a better solution is known it should be reflected by the user through pinned versions in the root dependencies

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

Use the `push` script to push to git to ensure that the lib folder has been built and committed.

```
npm run push
```

Use the `release` script to make releases to ensure that the correct tag is created

```
npm run release
```
