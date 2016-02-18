'use strict';

let chai = require('chai');
let chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();

let RecursiveSemver = require('../../src');

let repository = {
  test1: {
    '0.1.1': {
    },
    '0.1.2': {
    },
    '0.1.3': {
    },
    '0.1.4': {
    },
    '0.1.5': {
    }
  },
  test2: {
    '0.1.1': {
      test1: '^0.1.1'
    },
    '0.1.2': {
      test1: '^0.1.2'
    },
    '0.1.3': {
      test1: '^0.1.3'
    },
    '0.1.4': {
      test1: '^0.1.4'
    },
    '0.1.5': {
      test1: '^0.1.5'
    }
  },
  test3: {
    '0.1.1': {
      test1: '0.1.1',
      test2: '0.1.1'
    },
    '0.1.2': {
      test1: '0.1.2',
      test2: '0.1.2'
    },
    '0.1.3': {
      test1: '0.1.3',
      test2: '0.1.3'
    },
    '0.1.4': {
      test1: '0.1.4',
      test2: '0.1.4'
    },
    '0.1.5': {
      test1: '0.1.5',
      test2: '0.1.5'
    }
  }
};

let getVersions = library => {
  return Promise.resolve().then(() => {
    if (!repository[library]) {
      throw new Error(`No such library: ${library}`);
    }
    return Object.keys(repository[library]);
  });
};

let getDependencies = (library, version) => {
  return Promise.resolve().then(() => {
    return repository[library][version];
  });
};

describe('RecursiveSemver.prototype.resolve', () => {
  describe('with no callback for dependencies', () => {
    describe('with constraints that can be resolved', () => {
      it('should successfully resolve the version constraints', () => {
        return new RecursiveSemver(
          {
            test1: '^0.1.1',
            test2: '0.1.2'
          },
          getVersions
        ).resolve().should.eventually.eql({
          test1: '0.1.5',
          test2: '0.1.2'
        });
      });
    });

    describe('with constraints that cannot be resolved', () => {
      it('should fail with an error', () => {
        return new RecursiveSemver(
          {
            test1: '^0.1.1',
            test2: '^0.2.0'
          },
          getVersions
        ).resolve().should.be.rejectedWith(
          'Unable to satisfy version constraints: test2@^0.2.0'
        );
      });
    });

    describe('with an unknown library', () => {
      it('should fail with an error', () => {
        return new RecursiveSemver(
          {
            test1: '^0.1.1',
            test9: '^0.1.1'
          },
          getVersions
        ).resolve().should.be.rejectedWith(
          'No such library: test9'
        );
      });
    });
  });

  describe('with a callback for dependencies', () => {
    describe('with resolvable sub constraints', () => {
      it('should successfully resolve the version constraints', () => {
        return new RecursiveSemver(
          {
            test2: '^0.1.1'
          },
          getVersions,
          getDependencies
        ).resolve().should.eventually.eql({
          test1: '0.1.5',
          test2: '0.1.5'
        });
      });
    });

    describe('with overlapping constraints', () => {
      it('should successfully resolve the version constraints', () => {
        return new RecursiveSemver(
          {
            test3: '0.1.3'
          },
          getVersions,
          getDependencies
        ).resolve().should.eventually.eql({
          test1: '0.1.3',
          test2: '0.1.3',
          test3: '0.1.3'
        });
      });
    });
  });
});
