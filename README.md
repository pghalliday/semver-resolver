# recursive-semver
Library to calculate versions for a dependency tree of libraries that use semver but do not allow more than one version of a library to be present in the calculation

## Usage

Require the `RecursiveSemver` class

```javascript
let RecursiveSemver = require('recursive-semver');
```

Call construct a new `RecursiveSemver` instance, supplying functions that return promises for available versions of libraries and the version constraints associated with particular versions of libraries along with a top level list of libraries and their version constraints (the dependencies).

```javascript
let rs = new RecursiveSemver(library => {

    // return a promise for the available versions of the requested library
    ...

  }, (library, version) => {

    // return a promise for the additional version constraints
    // to be applied for the requested version of the requested library
    ...

  }, {
    'foo': '^2.4.5',
    'bar': '^1.17.3',
    'mylib': '^2.8.0',
    'another-lib': '^0.17.1'
  }
});
```

`#resolve` returns a promise for the resolved list of dependencies and their versions, or an error if the constraints cannot be resolved.

```
rs.resolve.then(resolution => {

  // `resolution` will be a mapping of all the required
  // libraries to the highest versions that satisfy the
  // recursive version constraints
  ...

}, error => {

  // an error occurred, most likely because the version
  // constraints cannot be resolved 
  ...

});
```

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
