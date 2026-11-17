'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('cloudshelf/cloudshelfApiModel', function () {
    const queries = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/graphql/cloudshelfGraphqlQueries');

    // Mocking dependencies for the CloudshelfApiModel
    const cloudshelfHttpGraphQLMock = () => ({
        call: (requestBody) => {
            return {
                isOk: () => true,
                getObject: () => ({
                    error: null,
                    data: {}
                }),
                errorMessage: null
            };
        }
    });

    const cloudshelfHelperMock = {
        GLOBAL_ID_NAMESPACES: {
            PRODUCT: 'PRODUCT'
        },
        getGlobalId: (type, id) => type + '/' + id,
        getLogger: () => ({ warn: () => { }, error: () => { } })
    };

    const CloudshelfApiModel = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfApiModel.js', {
        '*/cartridge/scripts/graphql/cloudshelfGraphqlQueries': queries,
        '*/cartridge/scripts/services/cloudshelfHttpGraphQL': cloudshelfHttpGraphQLMock,
        '*/cartridge/scripts/helpers/cloudshelfHelper': cloudshelfHelperMock,
        getProduct: (product) => {
            return product;
        },
        getTheme: (theme) => {
            return theme;
        },
        getCloudshelf: (cloudshelf) => {
            return cloudshelf;
        }

    });

    it('should get product data from Cloudshelf API', function () {
        const productMock = {
            ID: '123'
        };

        const cloudshelfApiModel = new CloudshelfApiModel();
        const result = cloudshelfApiModel.getProduct(productMock);

        assert.isObject(result, 'Expected an object as a response');
        // Add more specific assertions based on your expected response
    });

    it('should get theme data from Cloudshelf API', function () {
        const themeIdMock = 'theme123';

        const cloudshelfApiModel = new CloudshelfApiModel();
        const result = cloudshelfApiModel.getTheme(themeIdMock);

        assert.isObject(result, 'Expected an object as a response');
    });

    it('should get Cloudshelf data from Cloudshelf API', function () {
        const cloudshelfMock = 'cloudshelf';

        const cloudshelfApiModel = new CloudshelfApiModel();
        const result = cloudshelfApiModel.getCloudshelf(cloudshelfMock);

        assert.isObject(result, 'Expected an object as a response');
    });

    it('should handle errors gracefully', function () {
        // Mock a failing service call
        const cloudshelfHttpGraphQLErrorMock = () => ({
            call: () => ({
                isOk: () => false,
                getObject: () => null,
                errorMessage: 'Service error'
            })
        });

        const CloudshelfApiModelWithError = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfApiModel.js', {
            '*/cartridge/scripts/graphql/cloudshelfGraphqlQueries': queries,
            '*/cartridge/scripts/services/cloudshelfHttpGraphQL': cloudshelfHttpGraphQLErrorMock,
            '*/cartridge/scripts/helpers/cloudshelfHelper': cloudshelfHelperMock,
            getProduct: (product) => {
                return product;
            }
        });

        const cloudshelfApiModel = new CloudshelfApiModelWithError();
        const result = cloudshelfApiModel.getProduct({});

        assert.isNull(result, 'Expected null due to service error');
    });
    describe('product group assignments', function () {
        let requestBodies;
        const CapturingApiModel = proxyquire(
            '../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfApiModel.js',
            {
                '*/cartridge/scripts/graphql/cloudshelfGraphqlQueries': queries,
                '*/cartridge/scripts/services/cloudshelfHttpGraphQL': () => ({
                    call: requestBody => {
                        requestBodies.push(requestBody);
                        return { isOk: () => true, getObject: () => ({ error: null, data: {} }) };
                    },
                }),
                '*/cartridge/scripts/helpers/cloudshelfHelper': cloudshelfHelperMock,
            },
        );

        beforeEach(function () {
            requestBodies = [];
        });

        it('should replace the products of a product group', function () {
            new CapturingApiModel().updateProductsInProductGroup('group-1', ['product-1', 'product-2']);

            assert.equal(requestBodies[0].query, queries.mutation.UpdateProductsInProductGroup);
            assert.deepEqual(requestBodies[0].variables, {
                productGroupId: 'group-1',
                productIds: ['product-1', 'product-2'],
            });
        });

        it('should add products to a product group', function () {
            new CapturingApiModel().addProductsToProductGroup('group-1', ['product-3']);

            assert.include(requestBodies[0].query, 'addProductsToProductGroup(');
            assert.deepEqual(requestBodies[0].variables, { productGroupId: 'group-1', productIds: ['product-3'] });
        });
    });
    describe('a request that fails', function () {
        let results;
        let calls;
        let warnings;
        const failure = (error, errorMessage) => ({ isOk: () => false, error: error, errorMessage: errorMessage });
        const success = { isOk: () => true, getObject: () => ({ error: null, data: { ok: true } }) };
        const RetryingApiModel = proxyquire(
            '../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfApiModel.js',
            {
                '*/cartridge/scripts/graphql/cloudshelfGraphqlQueries': queries,
                '*/cartridge/scripts/services/cloudshelfHttpGraphQL': () => ({
                    call: () => {
                        calls++;
                        return results.shift();
                    },
                }),
                '*/cartridge/scripts/helpers/cloudshelfHelper': {
                    getLogger: () => ({ warn: message => warnings.push(message), error: () => {} }),
                },
            },
        );

        beforeEach(function () {
            calls = 0;
            warnings = [];
        });

        it('should be sent once more when it got no answer', function () {
            results = [failure(0, 'SocketException:Connection reset'), success];

            const result = new RetryingApiModel().upsertProducts([{ id: 'product-1' }]);

            assert.deepEqual(result, { ok: true });
            assert.equal(calls, 2);
            assert.lengthOf(warnings, 1);
        });

        it('should be sent once more after a server error', function () {
            results = [failure(502, 'Bad Gateway'), success];

            assert.deepEqual(new RetryingApiModel().upsertProducts([{ id: 'product-1' }]), { ok: true });
            assert.equal(calls, 2);
        });

        it('should not be sent again when Cloudshelf refused it', function () {
            results = [failure(400, 'Bad Request'), success];

            assert.isNull(new RetryingApiModel().upsertProducts([{ id: 'product-1' }]));
            assert.equal(calls, 1);
            assert.lengthOf(warnings, 0);
        });

        it('should give up after the second attempt', function () {
            results = [failure(0, 'SocketException:Connection reset'), failure(0, 'SocketException:Connection reset'), success];

            assert.isNull(new RetryingApiModel().upsertProducts([{ id: 'product-1' }]));
            assert.equal(calls, 2);
        });
    });
});
