'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();

const nowDate = new Date();
const yearBackDate = new Date();
yearBackDate.setFullYear(yearBackDate.getFullYear() - 1);
const yearAfterDate = new Date();
yearAfterDate.setFullYear(yearAfterDate.getFullYear() + 1);

const representedProductsMock = [
    { id: 'variant-1', lastModified: yearBackDate },
    { id: 'variant-2', lastModified: yearBackDate },
    { id: 'variant-3', lastModified: yearBackDate }
];

const productSearchHitMock = {
    product: {
        bundle: false,
        productSet: false,
        ID: 'laptop',
        getVariationModel: () => {}
    },
    representedProducts: {
        toArray: () => {
            return representedProductsMock
        }
    }
}

describe('cloudshelf/cloudshelfProductVariantsModel', function () {
    const CloudshelfProductVariantsModel = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/cloudshelfProductVariantsModel.js', {
        '*/cartridge/scripts/helpers/cloudshelfHelper': {
            GLOBAL_ID_NAMESPACES: {
                PRODUCT: 'PRODUCT'
            },
            getGlobalId: (type, id) => {
                return type + '/' + id;
            }
        },
        '*/cartridge/models/cloudshelf/cloudshelfVariationModel': function(variation, variationModel, priceAndStockOnly) {
            return priceAndStockOnly ? { id: variation.id, priceAndStockOnly: true } : { id: variation.id };
        }
    });

    beforeEach(function () {
        representedProductsMock.forEach((product) => {
            product.lastModified = yearBackDate;
        });
    })

    it('should create CloudshelfProductVariantsModel with variations details', function () {
        const result = new CloudshelfProductVariantsModel(productSearchHitMock);
        assert.equal(result.productId, 'PRODUCT/laptop');
        assert.deepEqual(result.variants, [ {id: 'variant-1'}, {id: 'variant-2'}, {id: 'variant-3'} ]);
    });

    it('should send only prices and stock for variants not modified since the threshold date', function () {
        representedProductsMock[2].lastModified = yearAfterDate;
        const result = new CloudshelfProductVariantsModel(productSearchHitMock, nowDate);
        assert.equal(result.productId, 'PRODUCT/laptop');
        assert.deepEqual(result.variants, [
            { id: 'variant-1', priceAndStockOnly: true },
            { id: 'variant-2', priceAndStockOnly: true },
            { id: 'variant-3' }
        ]);
    });

    it('should create empty object if product hit is not provided', function () {
        const result = new CloudshelfProductVariantsModel();
        assert.deepEqual(result, {});
    });

    it('should still send prices and stock when no variant was modified since the threshold date', function () {
        const result = new CloudshelfProductVariantsModel(productSearchHitMock, nowDate);
        assert.equal(result.productId, 'PRODUCT/laptop');
        assert.deepEqual(result.variants, [
            { id: 'variant-1', priceAndStockOnly: true },
            { id: 'variant-2', priceAndStockOnly: true },
            { id: 'variant-3', priceAndStockOnly: true }
        ]);
    });
    
});
