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
  },
  test4: {
    '0.1.1': {
      test1: '0.1.1'
    },
    '0.1.2': {
      test1: '0.1.2'
    },
    '0.1.3': {
      test1: '0.1.3'
    },
    '0.1.4': {
      test1: '0.1.4'
    },
    '0.1.5': {
      test1: '0.1.5'
    }
  },
  test5: {
    '0.1.1': {
      test4: '0.1.1'
    },
    '0.1.2': {
      test4: '0.1.2'
    },
    '0.1.3': {
      test4: '0.1.3'
    },
    '0.1.4': {
      test3: '0.1.4',
      test4: '0.1.4'
    },
    '0.1.5': {
      test3: '0.1.5',
      test4: '0.1.5'
    }
  },
  test6: {
    '0.1.1': {
      test5: '0.1.1'
    },
    '0.1.2': {
      test5: '0.1.2'
    },
    '0.1.3': {
      test5: '0.1.3'
    },
    '0.1.4': {
      test5: '0.1.4'
    },
    '0.1.5': {
      test5: '0.1.5'
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
  describe('with 1 level of constraints that can be resolved', () => {
    it('should successfully resolve the version constraints', () => {
      return new RecursiveSemver(
        'test0',
        '0.0.0',
        {
          test1: '^0.1.1',
          test2: '0.1.2'
        },
        getVersions,
        getDependencies
      ).resolve().should.eventually.eql({
        test1: '0.1.5',
        test2: '0.1.2'
      });
    });
  });

  describe('with constraints that cannot be resolved', () => {
    it('should fail with an error', () => {
      return new RecursiveSemver(
        'test0',
        '0.0.0',
        {
          test1: '^0.1.1',
          test2: '^0.2.0'
        },
        getVersions,
        getDependencies
      ).resolve().should.be.rejectedWith(
        'Unable to satisfy version constraint: test2@^0.2.0 from test0@0.0.0'
      );
    });
  });

  describe('with an unknown library', () => {
    it('should fail with an error', () => {
      return new RecursiveSemver(
        'test0',
        '0.0.0',
        {
          test1: '^0.1.1',
          test9: '^0.1.1'
        },
        getVersions,
        getDependencies
      ).resolve().should.be.rejectedWith(
        'No such library: test9'
      );
    });
  });

  describe('with easily resolvable sub constraints', () => {
    it('should successfully resolve the version constraints', () => {
      return new RecursiveSemver(
        'test0',
        '0.0.0',
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
        'test0',
        '0.0.0',
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

  describe('with sub constraints that result in recalculations', () => {
    // This should initially select test5@0.1.5, but then correct
    // it to test5@0.1.3, remove the constraints associated with test5@0.1.5
    // and recalculate
    it('should successfully resolve the version constraints', () => {
      return new RecursiveSemver(
        'test0',
        '0.0.0',
        {
          test5: '^0.1.3',
          test6: '0.1.3'
        },
        getVersions,
        getDependencies
      ).resolve().should.eventually.eql({
        test1: '0.1.3',
        test4: '0.1.3',
        test5: '0.1.3',
        test6: '0.1.3'
      });
    });
  });

  describe('with constraints that require backtracking', () => {
    // this is difficult as the first pass allows test2@0.1.5
    // and requires test4@0.1.3. This means the second pass requires test1@^0.1.5
    // and test1@0.1.3 which conflicts. However the root constraint can be
    // satisfied if we backtrack to test2@0.1.3 which would then allow test1@^0.1.3
    it('should successfully resolve the version constraints', () => {
      return new RecursiveSemver(
        'test0',
        '0.0.0',
        {
          test2: '^0.1.3',
          test4: '0.1.3'
        },
        getVersions,
        getDependencies
      ).resolve().should.eventually.eql({
        test1: '0.1.3',
        test2: '0.1.3',
        test4: '0.1.3'
      });
    });
  });
});
