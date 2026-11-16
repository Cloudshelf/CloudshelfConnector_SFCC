'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

const record = (ats, perpetual) => ({
    perpetual: !!perpetual,
    ATS: { available: true, value: ats },
});

const inventoryList = (id, records) => ({
    ID: id,
    getRecord: product => records[product.ID] || null,
});

describe('cloudshelf/cloudshelfStockHelper', function () {
    let token;
    let siteInventoryList;
    let stores;
    let closedStoreQuery;

    const helper = proxyquire(
        '../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfStockHelper',
        {
            '*/cartridge/scripts/helpers/cloudshelfHelper': {
                GLOBAL_ID_NAMESPACES: { VARIANT: 'salesforceVariant', LOCATION: 'SalesforceLocation' },
                getGlobalId: (namespace, id) => 'gid://external/' + namespace + '/' + id,
            },
            'dw/system/Site': {
                getCurrent: () => ({ getCustomPreferenceValue: () => token }),
            },
            'dw/catalog/ProductMgr': {
                getProduct: id => (id === 'shirt-m' ? { ID: 'shirt-m' } : null),
            },
            'dw/catalog/ProductInventoryMgr': {
                getInventoryList: () => siteInventoryList,
            },
            'dw/object/SystemObjectMgr': {
                querySystemObjects: () => {
                    let index = 0;
                    return {
                        hasNext: () => index < stores.length,
                        next: () => stores[index++],
                        close: () => {
                            closedStoreQuery = true;
                        },
                    };
                },
            },
        },
    );

    beforeEach(function () {
        token = 'secret';
        siteInventoryList = inventoryList('site-list', { 'shirt-m': record(12.0) });
        stores = [
            { ID: 'store1', name: 'High Street', inventoryList: inventoryList('s1', { 'shirt-m': record(3) }) },
            { ID: 'store2', name: 'No stock list', inventoryList: null },
        ];
        closedStoreQuery = false;
    });

    describe('checkAccess', function () {
        it('should refuse every request while no token is set', function () {
            token = null;
            const result = helper.checkAccess('Bearer secret');
            assert.isFalse(result.allowed);
            assert.equal(result.statusCode, 404);
        });

        it('should refuse a request with no Authorization header', function () {
            const result = helper.checkAccess(null);
            assert.isFalse(result.allowed);
            assert.equal(result.statusCode, 401);
        });

        it('should refuse a request with another token', function () {
            const result = helper.checkAccess('Bearer other');
            assert.isFalse(result.allowed);
            assert.equal(result.statusCode, 401);
        });

        it('should allow a request with the token', function () {
            assert.isTrue(helper.checkAccess('Bearer secret').allowed);
        });
    });

    describe('getIdFromGlobalId', function () {
        it('should return the id inside a global id of the namespace', function () {
            assert.equal(
                helper.getIdFromGlobalId('gid://external/salesforceVariant/shirt-m', 'salesforceVariant'),
                'shirt-m',
            );
        });

        it('should return a plain id as it is', function () {
            assert.equal(helper.getIdFromGlobalId('shirt-m', 'salesforceVariant'), 'shirt-m');
        });

        it('should return null for another namespace or no id', function () {
            assert.isNull(helper.getIdFromGlobalId('gid://external/salesforceProduct/shirt', 'salesforceVariant'));
            assert.isNull(helper.getIdFromGlobalId('gid://external/salesforceVariant/', 'salesforceVariant'));
            assert.isNull(helper.getIdFromGlobalId(undefined, 'salesforceVariant'));
        });
    });

    describe('getNumberAvailable', function () {
        it('should return a whole number that is never negative', function () {
            assert.equal(helper.getNumberAvailable(record(4.9)), 4);
            assert.equal(helper.getNumberAvailable(record(-2)), 0);
        });

        it('should return none without a record or an available quantity', function () {
            assert.equal(helper.getNumberAvailable(null), 0);
            assert.equal(helper.getNumberAvailable({ perpetual: false, ATS: { available: false, value: 5 } }), 0);
        });

        it('should return the perpetual number for a perpetual record', function () {
            assert.equal(helper.getNumberAvailable(record(0, true)), helper.PERPETUAL_NUMBER_AVAILABLE);
        });
    });

    describe('getStockLevels', function () {
        it('should answer with the site stock and each Cloudshelf store that has an inventory list', function () {
            const result = helper.getStockLevels({
                variant: 'gid://external/salesforceVariant/shirt-m',
                product: 'gid://external/salesforceProduct/shirt',
            });

            assert.isTrue(result.found);
            assert.deepEqual(result.payload, {
                dataType: 'StockLevels',
                dataTypeVersion: 1,
                responseFor: {
                    variantId: 'gid://external/salesforceVariant/shirt-m',
                    productId: 'gid://external/salesforceProduct/shirt',
                    locationId: null,
                },
                response: {
                    totalNumberAvailable: 12,
                    location: null,
                    locations: [
                        {
                            id: 'gid://external/SalesforceInventoryList/site-list',
                            displayName: 'Online',
                            fulfillsOnlineOrders: true,
                            numberAvailable: 12,
                        },
                        {
                            id: 'gid://external/SalesforceLocation/store1',
                            displayName: 'High Street',
                            fulfillsOnlineOrders: false,
                            numberAvailable: 3,
                        },
                    ],
                },
            });
            assert.isTrue(closedStoreQuery);
        });

        it('should name the store the display is in as the location', function () {
            const result = helper.getStockLevels({
                variant: 'gid://external/salesforceVariant/shirt-m',
                location: 'gid://external/SalesforceLocation/store1',
            });

            assert.equal(result.payload.responseFor.locationId, 'gid://external/SalesforceLocation/store1');
            assert.deepEqual(result.payload.response.location, {
                id: 'gid://external/SalesforceLocation/store1',
                displayName: 'High Street',
                fulfillsOnlineOrders: false,
                numberAvailable: 3,
            });
        });

        it('should leave the location empty for a store without an inventory list', function () {
            const result = helper.getStockLevels({
                variant: 'gid://external/salesforceVariant/shirt-m',
                location: 'gid://external/SalesforceLocation/store2',
            });

            assert.isNull(result.payload.response.location);
            assert.lengthOf(result.payload.response.locations, 2);
        });

        it('should answer with stores only when the site has no inventory list', function () {
            siteInventoryList = null;
            const result = helper.getStockLevels({ variant: 'gid://external/salesforceVariant/shirt-m' });

            assert.equal(result.payload.response.totalNumberAvailable, 0);
            assert.lengthOf(result.payload.response.locations, 1);
        });

        it('should answer a variant the site does not have with none available', function () {
            const result = helper.getStockLevels({ variant: 'gid://external/salesforceVariant/unknown' });

            assert.isFalse(result.found);
            assert.deepEqual(result.payload.response, { totalNumberAvailable: 0, location: null, locations: [] });
        });
    });
});
