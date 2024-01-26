'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('CloudshelfModel', function () {
    const CloudshelfModel = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelf.js', {
        'dw/system/Site': {
            getCurrent: () => {
                return {
                    ID: 'RefApp'
                }
            }
        },
        '*/cartridge/scripts/helpers/cloudshelfHelper': {
            GLOBAL_ID_NAMESPACES: {
                CLOUDSHELF: 'CLOUDSHELF'
            },
            getGlobalId: (type, id) => {
                return type + '/' + id;
            }
        }
    });

    it('should create default cloudshelf model', function () {
        const result = new CloudshelfModel();
        assert.equal(result.id, 'CLOUDSHELF/RefApp');
        assert.equal(result.displayName, 'First Cloudshelf');
    });
});
