'use strict';

let chai = require('chai');
let chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();

let calculate = require('../../src');

describe('calculate', () => {
  before(() => {
    this.dependencies = {
      test1: '^1.2.3',
      test2: '^4.5.6'
    };
  });

  describe('with no callback for constraints', () => {
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
        return calculate({
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
        return calculate({
          versions: this.versions,
          dependencies: this.dependencies
        }).should.be.rejectedWith(
          'Unable to satisfy version constraints: test2@^4.5.6'
        );
      });
    });

    describe('with an unknown library', () => {
      before(() => {
        this.versions = library => {
          return new Promise((resolve, reject) => {
            switch (library) {
              case 'test1':
                resolve(['1.2.2', '1.2.3', '1.2.4']);
                break;
              default:
                reject(new Error(`No such library: ${library}`));
            }
          });
        };
      });

      it('should fail with an error', () => {
        return calculate({
          versions: this.versions,
          dependencies: this.dependencies
        }).should.be.rejectedWith(
          'No such library: test2'
        );
      });
    });
  });

  describe('with a callback for constraints', () => {
    before(() => {
      this.constraints = (library, version) => {
        return new Promise((resolve, reject) => {
          switch (library) {
            case 'test1':
              switch (version) {
                case '1.2.3':
                  resolve({
                    test3: '^2.3.4'
                  });
                  break;
                case '1.2.4':
                  resolve({
                    test3: '^2.3.4',
                    test2: '^4.5.5'
                  });
                  break;
                default:
                  reject(new Error(`No such version: ${library}@${version}`));
              }
              break;
            case 'test2':
              switch (version) {
                case '4.5.6':
                  resolve({
                    test4: '^3.4.5'
                  });
                  break;
                case '4.5.5':
                  resolve({
                    test4: '^3.4.5'
                  });
                  break;
                default:
                  reject(new Error(`No such version: ${library}@${version}`));
              }
              break;
            case 'test3':
              resolve({});
              break;
            case 'test4':
              resolve({});
              break;
            default:
              reject(new Error(`No such library: ${library}`));
          }
        });
      };
    });

    describe('with resolvable sub constraints', () => {
      before(() => {
        this.versions = library => {
          return new Promise((resolve, reject) => {
            switch (library) {
              case 'test1':
                resolve(['1.2.3']);
                break;
              case 'test2':
                resolve(['4.5.6']);
                break;
              case 'test3':
                resolve(['2.3.4']);
                break;
              case 'test4':
                resolve(['3.4.5']);
                break;
              default:
                reject(new Error(`No such library: ${library}`));
            }
          });
        };
      });

      it('should successfully resolve the version constraints', () => {
        return calculate({
          versions: this.versions,
          constraints: this.constraints,
          dependencies: this.dependencies
        }).should.eventually.eql({
          test1: '1.2.3',
          test2: '4.5.6',
          test3: '2.3.4',
          test4: '3.4.5'
        });
      });
    });

    describe('with overlapping constraints', () => {
      before(() => {
        this.versions = library => {
          return new Promise((resolve, reject) => {
            switch (library) {
              case 'test1':
                resolve(['1.2.4']);
                break;
              case 'test2':
                resolve(['4.5.5', '4.5.6']);
                break;
              case 'test3':
                resolve(['2.3.4']);
                break;
              case 'test4':
                resolve(['3.4.5']);
                break;
              default:
                reject(new Error(`No such library: ${library}`));
            }
          });
        };
      });

      it('should successfully resolve the version constraints', () => {
        return calculate({
          versions: this.versions,
          constraints: this.constraints,
          dependencies: this.dependencies
        }).should.eventually.eql({
          test1: '1.2.4',
          test2: '4.5.5',
          test3: '2.3.4',
          test4: '3.4.5'
        });
      });
    });
  });
});
