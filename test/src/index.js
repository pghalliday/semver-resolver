'use strict';

let chai = require('chai');
let chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();

let resolve = require('../../src');

describe('resolve', () => {
  describe('with no callback for constraints', () => {
    before(() => {
      this.dependencies = {
        test1: '^1.2.3',
        test2: '^4.5.6'
      };
    });

    describe('with constraints that can be resolved', () => {
      before(() => {
        this.versions = library => {
          return new Promise((resolve, reject) => {
            switch (library) {
              case 'test1':
                resolve(['1.2.2', '1.2.3', '1.2.4']);
                break;
              case 'test2':
                resolve(['4.5.5', '4.5.6', '4.5.7']);
                break;
              default:
                reject(new Error(`No such library: ${library}`));
            }
          });
        };
      });

      it('should successfully resolve the version constraints', () => {
        return resolve({
          versions: this.versions,
          dependencies: this.dependencies
        }).should.eventually.eql({
          test1: '1.2.4',
          test2: '4.5.7'
        });
      });
    });

    describe('with constraints that cannot be resolved', () => {
      before(() => {
        this.versions = library => {
          return new Promise((resolve, reject) => {
            switch (library) {
              case 'test1':
                resolve(['1.2.2', '1.2.3', '1.2.4']);
                break;
              case 'test2':
                resolve(['4.5.5']);
                break;
              default:
                reject(new Error(`No such library: ${library}`));
            }
          });
        };
      });

      it('should fail with an error', () => {
        return resolve({
          versions: this.versions,
          dependencies: this.dependencies
        }).should.be.rejectedWith(
          'Unable to satisfy version constraint: test2: ^4.5.6'
        );
      });
    });
  });
});
