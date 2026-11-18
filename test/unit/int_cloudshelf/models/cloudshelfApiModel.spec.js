'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('cloudshelf/cloudshelfApiModel', function () {
    const queries = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/graphql/cloudshelfGraphqlQueries');
    const cloudshelfLogHelper = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfLogHelper');

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
        '*/cartridge/scripts/helpers/cloudshelfLogHelper': cloudshelfLogHelper,
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
            '*/cartridge/scripts/helpers/cloudshelfLogHelper': cloudshelfLogHelper,
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
                '*/cartridge/scripts/helpers/cloudshelfLogHelper': cloudshelfLogHelper,
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
        let errors;
        // What SFCC's logger would write: the message with its {n} placeholders filled in
        const written = (message, ...args) => message.replace(/\{(\d+)\}/g, (match, index) => args[index]);
        const failure = (error, errorMessage) => ({
            isOk: () => false,
            status: 'ERROR',
            error: error,
            errorMessage: errorMessage,
        });
        const success = { isOk: () => true, getObject: () => ({ error: null, data: { ok: true } }) };
        const RetryingApiModel = proxyquire(
            '../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfApiModel.js',
            {
                '*/cartridge/scripts/graphql/cloudshelfGraphqlQueries': queries,
                '*/cartridge/scripts/helpers/cloudshelfLogHelper': cloudshelfLogHelper,
                '*/cartridge/scripts/services/cloudshelfHttpGraphQL': () => ({
                    call: () => {
                        calls++;
                        return results.shift();
                    },
                }),
                '*/cartridge/scripts/helpers/cloudshelfHelper': {
                    getLogger: () => ({
                        warn: (...args) => warnings.push(written(...args)),
                        error: (...args) => errors.push(written(...args)),
                    }),
                },
            },
        );

        beforeEach(function () {
            calls = 0;
            warnings = [];
            errors = [];
        });

        it('should be sent once more when it got no answer', function () {
            results = [failure(0, 'SocketException:Connection reset'), success];

            const result = new RetryingApiModel().upsertProducts([{ id: 'product-1' }]);

            assert.deepEqual(result, { ok: true });
            assert.equal(calls, 2);
            assert.lengthOf(warnings, 1);
            assert.isNull(RetryingApiModel.getLastFailure());
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

        it('should log what was being sent, how often and why it failed', function () {
            results = [failure(0, 'SocketException:Connection reset'), failure(0, 'SocketException:Connection reset')];

            new RetryingApiModel().upsertProducts([{ id: 'product-1' }, { id: 'product-2' }]);

            assert.lengthOf(errors, 1);
            assert.include(errors[0], 'failed after 2 attempt(s)');
            assert.include(errors[0], 'UpsertProducts, input: 2 items (product-1 to product-2)');
            assert.include(errors[0], 'Reason: ERROR, SocketException:Connection reset');
            assert.include(warnings[0], 'UpsertProducts, input: 2 items (product-1 to product-2)');
        });

        it('should keep why the last request failed for the job step that made it', function () {
            results = [failure(400, 'Bad Request'), success];
            const cloudshelfApi = new RetryingApiModel();

            cloudshelfApi.upsertProducts([{ id: 'product-1' }]);
            assert.equal(RetryingApiModel.getLastFailure(), 'ERROR, HTTP 400, Bad Request');

            cloudshelfApi.upsertProducts([{ id: 'product-1' }]);
            assert.isNull(RetryingApiModel.getLastFailure());
        });

        it('should cut a long error text short in the log', function () {
            results = [failure(400, new Array(5001).join('x'))];

            new RetryingApiModel().upsertProducts([{ id: 'product-1' }]);

            assert.isBelow(errors[0].length, 1500);
            assert.include(errors[0], '(5000 characters in all)');
        });

        it('should log the error Cloudshelf answered with', function () {
            results = [
                {
                    isOk: () => true,
                    getObject: () => ({ error: true, errorMessage: '{"message":"Not allowed","code":"FORBIDDEN"}' }),
                },
            ];

            assert.isNull(new RetryingApiModel().deleteProducts(['product-1']));

            assert.include(errors[0], 'DeleteProducts, ids: 1 item (product-1)');
            assert.include(errors[0], 'Cloudshelf answered with an error: {"message":"Not allowed","code":"FORBIDDEN"}');
            assert.include(RetryingApiModel.getLastFailure(), 'Not allowed');
        });
    });
});
