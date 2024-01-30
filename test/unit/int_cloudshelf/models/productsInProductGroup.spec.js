'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const sinon = require('sinon');

const getProductSearchHitsStub = sinon.stub();
const HitsModelMock = function (array) {
    let currIndex = 0;
    return {
        hasNext: () => { return array.length > currIndex },
        next: () => { return array[currIndex++] }
    }
};
const HitModelMock = function (pid) {
    return {
        productID: pid,
        product: {
            ID: pid
        },
        representedProducts: ['pid1', 'pid2']
    }
};
const categoryMock = {
    ID: 'womens-clothing'
};
const PRODUCT_NAMESPACE = 'PRODUCT';
const PRODUCT_GROUP_NAMESPACE = 'PRODUCT_GROUP';

describe('cloudshelf/ProductsInProductGroupModel', function () {
    const ProductsInProductGroupModel = proxyquire('../../../../cartridges/int_cloudshelf/cartridge/models/cloudshelf/productsInProductGroup.js', {
        'dw/catalog/ProductSearchModel': function () {
            return {
                setCategoryID: () => {},
                setRecursiveCategorySearch: () => {},
                search: () => {},
                getProductSearchHits: getProductSearchHitsStub
            }
        },
        '*/cartridge/scripts/helpers/cloudshelfHelper': {
            GLOBAL_ID_NAMESPACES: {
                PRODUCT: PRODUCT_NAMESPACE,
                PRODUCT_GROUP: PRODUCT_GROUP_NAMESPACE
            },
            getGlobalId: (type, id) => {
                return type + '/' + id;
            }
        }
    });

    beforeEach(function() {
        getProductSearchHitsStub.reset();
    });

    it('should create ProductsInProductGroup model with products', function () {
        const hitsMock = new HitsModelMock([
            new HitModelMock('product-1'),
            new HitModelMock('product-2'),
            new HitModelMock('product-3')
        ]);
        getProductSearchHitsStub.returns(hitsMock);
        const result = new ProductsInProductGroupModel(categoryMock);
        assert.equal(result.productGroupId, PRODUCT_GROUP_NAMESPACE + '/womens-clothing');
        assert.deepEqual(
            result.productIds,
            [ PRODUCT_NAMESPACE + '/product-1', PRODUCT_NAMESPACE + '/product-2', PRODUCT_NAMESPACE + '/product-3']
        );
    });

    it('should create ProductsInProductGroup model without products', function () {
        const hitsMock = new HitsModelMock([]);
        getProductSearchHitsStub.returns(hitsMock);
        const result = new ProductsInProductGroupModel(categoryMock);
        assert.equal(result.productGroupId, PRODUCT_GROUP_NAMESPACE + '/womens-clothing');
        assert.deepEqual(result.productIds, []);
    });
});
