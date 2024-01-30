'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('cloudshelf/cloudshelfLocationModel', function () {
    const cloudshelfHelperMock = {
        getGlobalId: (namespace, id) => 'gid://external/' + namespace + '/' + id,
        getMetadata: () => [],
        GLOBAL_ID_NAMESPACES: {
            LOCATION: 'LOCATION'
        }
    };

    const location = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfLocationModel.js', {
        '*/cartridge/scripts/helpers/cloudshelfHelper': cloudshelfHelperMock,
    });

    it('should create location model', function () {
        const storeObjectMock = {
            ID: 'storeId',
            name: 'StoreName',
            address1: '123 Main St',
            postalCode: '12345',
            city: 'CityName',
            countryCode: { value: 'US' }
        };

        const result = new location(storeObjectMock);

        assert.equal(result.id, 'gid://external/LOCATION/storeId');
        assert.equal(result.displayName, 'StoreName');
        assert.equal(result.address, '123 Main St,12345,CityName');
        assert.equal(result.countryCode, 'US');
        assert.deepEqual(result.metadata, []);
    });

    it('should create location model without optional properties', function () {
        const storeObjectMock = {
            ID: 'storeId',
            name: 'StoreName',
            address1: '123 Main St'
        };

        const result = new location(storeObjectMock);

        assert.equal(result.id, 'gid://external/LOCATION/storeId');
        assert.equal(result.displayName, 'StoreName');
        assert.equal(result.address, '123 Main St');
        assert.isUndefined(result.countryCode);
        assert.deepEqual(result.metadata, []);
    });
});
