'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

describe('cloudshelf/cloudshelfVariationModel', function () {
    const cloudshelfHelperMock = {
        getGlobalId: (namespace, id) => 'gid://external/' + namespace + '/' + id,
        getMetadata: () => [],
        GLOBAL_ID_NAMESPACES: {
            VARIANT: 'VARIANT'
        }
    };

    const variation = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfVariationModel.js', {
        '*/cartridge/scripts/helpers/cloudshelfHelper': cloudshelfHelperMock,
        'dw/value/Money': {
            NOT_AVAILABLE: 'NOT_AVAILABLE'
        }
    });

    const variationModelMock = {
        getProductVariationAttributes: () => [],
        getVariationValue: (variation, attribute) => ({ displayValue: 'Value' })
    };

    const variationMock = {
        name: 'VariationName',
        availabilityModel: {
            orderable: true,
            inStock: true
        },
        ID: 'variationId',
        manufacturerSKU: 'SKU123',
        priceModel: {
            price: 15.99,
            minPrice: 19.99,
            valueOrNull: null,
            priceInfo: {
                priceBook: {
                    parentPriceBook: null
                }
            },
            getPriceBookPrice: () => ({ available: false })
        },
        getImages: () => ({ toArray: () => [{ httpsURL: 'https://example.com/image.jpg' }] })
    };

    it('should create variation model with valid input', function () {
        const result = new variation(variationMock, variationModelMock);

        assert.equal(result.id, 'gid://external/VARIANT/variationId');
        assert.equal(result.displayName, 'VariationName');
        assert.isTrue(result.availableToPurchase);
        assert.equal(result.currentPrice, 15.99);
        assert.equal(result.originalPrice, 19.99);
        assert.isTrue(result.isInStock);
        assert.equal(result.sku, 'SKU123');
        assert.deepEqual(result.attributes, []);
        assert.deepEqual(result.metadata, []);
        assert.deepEqual(result.metaimages, [{
            preferredImage: true,
            url: 'https://example.com/image.jpg'
        }]);
    });

    it('should not create variation model with invalid input', function () {
        const invalidVariationMock = null;
        const result = new variation(invalidVariationMock, variationModelMock);
        assert.deepEqual(result, {});
    });
});
