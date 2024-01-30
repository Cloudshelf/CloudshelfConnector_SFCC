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
        '*/cartridge/models/cloudshelf/cloudshelfVariationModel': function(variation) {
            return {
                id: variation.id
            }
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

    it('should handle threshold date for variations and filter variants', function () {
        representedProductsMock[2].lastModified = yearAfterDate;
        const result = new CloudshelfProductVariantsModel(productSearchHitMock, nowDate);
        assert.equal(result.productId, 'PRODUCT/laptop');
        assert.deepEqual(result.variants, [ {id: 'variant-3'}]);
    });

    it('should create empty object if product hit is not provided', function () {
        const result = new CloudshelfProductVariantsModel();
        assert.deepEqual(result, {});
    });

    it('should create empty object if there is no variants', function () {
        const result = new CloudshelfProductVariantsModel(productSearchHitMock, nowDate);
        assert.deepEqual(result, {});
    });
    
});
