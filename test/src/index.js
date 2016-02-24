'use strict';

let fs = require('fs');
let path = require('path');
let chai = require('chai');
let chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();

let SemverResolver = require('../../src');

class Repository {
  constructor(repository) {
    this.repository = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          '..',
          'repositories',
          `${repository}.json`
        )
      )
    );
  }

  getVersions(library) {
    return Promise.resolve().then(() => {
      let versions = this.repository[library];
      if (!versions) {
        throw new Error(`No such library: ${library}`);
      }
      return Object.keys(versions);
    });
  }

  getDependencies(library, version) {
    return Promise.resolve().then(() => {
      return this.repository[library][version];
    });
  }
}

describe('SemverResolver.prototype.resolve', () => {
  describe('with 1 level of constraints that can be resolved', () => {
    beforeEach(() => {
      this.repository = new Repository('one-level-of-constraints');
    });

    it('should successfully resolve the version constraints', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test1: '^0.1.0',
          test2: '0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.eventually.eql({
        test1: '0.1.1',
        test2: '0.1.0'
      });
    });
  });

  describe('with constraints that cannot be resolved', () => {
    beforeEach(() => {
      this.repository = new Repository('one-level-of-constraints');
    });

    it('should fail with an error', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test1: '^0.1.0',
          test2: '^0.2.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.be.rejectedWith(
        'Unable to satisfy version constraint: test2@^0.2.0 from test0@0.0.0'
      );
    });
  });

  describe('with an unknown library', () => {
    beforeEach(() => {
      this.repository = new Repository('one-level-of-constraints');
    });

    it('should fail with an error', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test1: '^0.1.0',
          test9: '^0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.be.rejectedWith(
        'No such library: test9'
      );
    });
  });

  describe('with easily resolvable sub constraints', () => {
    beforeEach(() => {
      this.repository = new Repository('two-levels-of-constraints');
    });

    it('should successfully resolve the version constraints', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test2: '^0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.eventually.eql({
        test1: '0.1.1',
        test2: '0.1.1'
      });
    });
  });

  describe('with overlapping constraints', () => {
    beforeEach(() => {
      this.repository = new Repository('overlapping-constraints');
    });

    it('should successfully resolve the version constraints', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test3: '0.1.1'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.eventually.eql({
        test1: '0.1.1',
        test2: '0.1.1',
        test3: '0.1.1'
      });
    });
  });

  describe('with sub constraints that result in recalculations', () => {
    beforeEach(() => {
      this.repository = new Repository('overriding-constraints');
    });

    // This should initially select test2@0.1.1, but then correct
    // it to test2@0.1.0, remove the constraints associated with test2@0.1.1
    // and recalculate
    it('should successfully resolve the version constraints', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test2: '^0.1.0',
          test4: '0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.eventually.eql({
        test1: '0.1.0',
        test2: '0.1.0',
        test3: '0.1.0',
        test4: '0.1.0'
      });
    });
  });

  describe('with recalculations before dependencies are loaded', () => {
    beforeEach(() => {
      this.repository = new Repository('fast-overriding-constraints');
    });

    // This should initially select test2@0.1.1 and test6@0.1.1, but then
    // correct it to test2@0.1.0 and test6@0.1.0, remove the constraints
    // associated with test2@0.1.1 and test6@0.1.0 and recalculate, the symmetry
    // in the test set up should ensure that at least one gets removed before
    // its dependencies have been loaded
    it('should successfully resolve the version constraints', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test2: '^0.1.0',
          test4: '0.1.0',
          test6: '^0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.eventually.eql({
        test1: '0.1.0',
        test2: '0.1.0',
        test3: '0.1.0',
        test4: '0.1.0',
        test5: '0.1.0',
        test6: '0.1.0',
        test7: '0.1.0'
      });
    });
  });

  describe('with constraints that require backtracking', () => {
    beforeEach(() => {
      this.repository = new Repository('backtracking-constraints');
    });

    // the first pass allows test2@0.1.1
    // and requires test3@0.1.0. This means the second pass requires test1@^0.1.1
    // and test1@0.1.0 which conflicts. However the root constraint can be
    // satisfied if we backtrack to test2@0.1.0 which would then allow test1@^0.1.0
    it('should successfully resolve the version constraints', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test2: '^0.1.0',
          test3: '0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.eventually.eql({
        test1: '0.1.0',
        test2: '0.1.0',
        test3: '0.1.0'
      });
    });
  });

  describe('when requeuing already queued calculations', () => {
    beforeEach(() => {
      this.repository = new Repository('requeuing-queued-calculations');
    });

    // the first pass allows test2@0.1.1
    // and requires test3@0.1.0. This means the second pass requires test1@^0.1.1
    // and test1@0.1.0 which conflicts. However the root constraint can be
    // satisfied if we backtrack to test2@0.1.0 which would then allow test1@^0.1.0
    // in the mean time test4 should be requeued before it has been calculated due to
    // also being a dependency for test2
    it('should successfully resolve the version constraints', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test2: '^0.1.0',
          test3: '0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.eventually.eql({
        test1: '0.1.0',
        test2: '0.1.0',
        test3: '0.1.0',
        test4: '0.1.1'
      });
    });
  });

  describe('with backtracking but still cannot be resolved', () => {
    beforeEach(() => {
      this.repository = new Repository('backtracking-impossible-constraints');
    });

    // the first pass allows test2@0.1.1
    // and requires test3@0.1.0. This means the second pass requires test1@^0.1.1
    // and test1@0.1.0 which conflicts. However the root constraint might be
    // satisfied if we backtrack to test2@0.1.0 but this also requires test1@^0.1.1
    // so the constraints cannot be resolved
    it('should be rejected', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test2: '^0.1.0',
          test3: '0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.be.rejectedWith(
        'Unable to satisfy backtracked version constraint: ' +
        'test2@<0.1.0 from test3@0.1.0 due to shared ' +
        'constraint on test1'
      );
    });
  });

  describe('when the root would need to be backtracked', () => {
    beforeEach(() => {
      this.repository = new Repository('root-requires-backtracking');
    });

    // TODO: the first pass requires test2@0.1.1
    // and requires test3@0.1.0. This means the second pass requires test1@^0.1.1
    // and test1@0.1.0 which conflicts. However the constraints might be
    // satisfied if we backtrack to test0@<0.0.0 but we can't backtrack the root
    it.skip('should be rejected', () => {
      return new SemverResolver(
        'test0',
        '0.0.0',
        {
          test2: '0.1.1',
          test3: '0.1.0'
        },
        this.repository.getVersions.bind(this.repository),
        this.repository.getDependencies.bind(this.repository)
      ).resolve().should.be.rejectedWith(
        'some error'
      );
    });
  });
});
