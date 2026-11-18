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
            address2: 'Unit 4',
            postalCode: '12345',
            city: 'CityName',
            stateCode: 'MA',
            phone: '+1-617-555-0100',
            countryCode: { value: 'US' }
        };

        const result = new location(storeObjectMock);

        assert.deepEqual(JSON.parse(JSON.stringify(result)), {
            id: 'gid://external/LOCATION/storeId',
            displayName: 'StoreName',
            address1: '123 Main St',
            address2: 'Unit 4',
            city: 'CityName',
            provinceCode: 'MA',
            zip: '12345',
            phone: '+1-617-555-0100',
            countryCode: 'US',
            metadata: []
        });
    });

    it('should not send the address as one field, which Cloudshelf no longer accepts', function () {
        const result = new location({ ID: 'storeId', name: 'StoreName', address1: '123 Main St' });

        assert.notProperty(result, 'address');
    });

    it('should clear the parts of the address a store does not have', function () {
        const storeObjectMock = {
            ID: 'storeId',
            name: 'StoreName',
            address1: '123 Main St'
        };

        const result = new location(storeObjectMock);

        assert.equal(result.id, 'gid://external/LOCATION/storeId');
        assert.equal(result.displayName, 'StoreName');
        assert.equal(result.address1, '123 Main St');
        assert.isNull(result.address2);
        assert.isNull(result.city);
        assert.isNull(result.provinceCode);
        assert.isNull(result.zip);
        assert.isNull(result.phone);
        assert.isUndefined(result.countryCode);
        assert.deepEqual(result.metadata, []);
    });
});
