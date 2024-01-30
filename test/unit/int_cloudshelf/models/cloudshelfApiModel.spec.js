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
        getLogger: () => ({ warn: () => { } })
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
});
