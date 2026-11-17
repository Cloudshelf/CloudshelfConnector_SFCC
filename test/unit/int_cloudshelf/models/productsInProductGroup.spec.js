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

    const hitsFor = function (count) {
        const hits = [];
        for (let i = 1; i <= count; i++) {
            hits.push(new HitModelMock('product-' + i));
        }
        return new HitsModelMock(hits);
    };

    it('should create ProductsInProductGroup model with products', function () {
        getProductSearchHitsStub.returns(hitsFor(3));
        const result = new ProductsInProductGroupModel(categoryMock);
        assert.equal(result.productGroupId, PRODUCT_GROUP_NAMESPACE + '/womens-clothing');
        assert.equal(result.productCount, 3);
        assert.deepEqual(result.productIdBatches, [
            [PRODUCT_NAMESPACE + '/product-1', PRODUCT_NAMESPACE + '/product-2', PRODUCT_NAMESPACE + '/product-3'],
        ]);
    });

    it('should create ProductsInProductGroup model without products', function () {
        getProductSearchHitsStub.returns(hitsFor(0));
        const result = new ProductsInProductGroupModel(categoryMock);
        assert.equal(result.productGroupId, PRODUCT_GROUP_NAMESPACE + '/womens-clothing');
        assert.equal(result.productCount, 0);
        assert.deepEqual(result.productIdBatches, []);
    });

    it('should never hold more products in one array than SFCC allows', function () {
        // SFCC stops a script whose array holds more than 20,000 items
        getProductSearchHitsStub.returns(hitsFor(20362));
        const result = new ProductsInProductGroupModel(categoryMock);
        const batchSize = ProductsInProductGroupModel.PRODUCTS_PER_BATCH;

        assert.equal(result.productCount, 20362);
        assert.equal(result.productIdBatches.length, Math.ceil(20362 / batchSize));
        result.productIdBatches.forEach(function (batch) {
            assert.isAtMost(batch.length, batchSize);
        });
        assert.equal(result.productIdBatches[0][0], PRODUCT_NAMESPACE + '/product-1');
        const lastBatch = result.productIdBatches[result.productIdBatches.length - 1];
        assert.equal(lastBatch[lastBatch.length - 1], PRODUCT_NAMESPACE + '/product-20362');
    });

    describe('hasProducts', function () {
        it('should tell whether a category has products', function () {
            getProductSearchHitsStub.returns(hitsFor(2));
            assert.isTrue(ProductsInProductGroupModel.hasProducts(categoryMock));

            getProductSearchHitsStub.returns(hitsFor(0));
            assert.isFalse(ProductsInProductGroupModel.hasProducts(categoryMock));
        });
    });

    describe('assign', function () {
        let calls;
        let refuse;
        const api = {
            updateProductsInProductGroup: function (productGroupId, productIds) {
                calls.push({ call: 'update', productGroupId: productGroupId, productIds: productIds });
                return refuse.update-- > 0 ? null : { updateProductsInProductGroup: true };
            },
            addProductsToProductGroup: function (productGroupId, productIds) {
                calls.push({ call: 'add', productGroupId: productGroupId, productIds: productIds });
                return refuse.add-- > 0 ? null : { addProductsToProductGroup: true };
            },
        };
        const modelOf = function (count) {
            getProductSearchHitsStub.returns(hitsFor(count));
            return new ProductsInProductGroupModel(categoryMock);
        };

        beforeEach(function () {
            calls = [];
            // How many times each call is refused before Cloudshelf accepts it
            refuse = { update: 0, add: 0 };
        });

        it('should replace the products of a category that fits in one request', function () {
            const result = ProductsInProductGroupModel.assign(api, modelOf(3));

            assert.deepEqual(result, { batches: 1, failedBatches: 0 });
            assert.deepEqual(
                calls.map(c => c.call),
                ['update'],
            );
            assert.equal(calls[0].productGroupId, PRODUCT_GROUP_NAMESPACE + '/womens-clothing');
            assert.lengthOf(calls[0].productIds, 3);
        });

        it('should replace with the first batch and add the rest', function () {
            const batchSize = ProductsInProductGroupModel.PRODUCTS_PER_BATCH;
            const model = modelOf(batchSize * 2 + 5);

            const result = ProductsInProductGroupModel.assign(api, model);

            assert.deepEqual(result, { batches: 3, failedBatches: 0 });
            assert.deepEqual(
                calls.map(c => c.call),
                ['update', 'add', 'add'],
            );
            assert.deepEqual(
                calls.map(c => c.productIds.length),
                [batchSize, batchSize, 5],
            );
            // Every product is sent once, in order
            const sent = calls.reduce((ids, c) => ids.concat(c.productIds), []);
            assert.equal(sent[0], PRODUCT_NAMESPACE + '/product-1');
            assert.equal(sent[sent.length - 1], PRODUCT_NAMESPACE + '/product-' + (batchSize * 2 + 5));
            assert.equal(sent.filter((id, index) => sent.indexOf(id) !== index).length, 0);
        });

        it('should send a refused batch once more', function () {
            const batchSize = ProductsInProductGroupModel.PRODUCTS_PER_BATCH;
            refuse.add = 1;

            const result = ProductsInProductGroupModel.assign(api, modelOf(batchSize + 1));

            assert.deepEqual(result, { batches: 2, failedBatches: 0 });
            assert.deepEqual(
                calls.map(c => c.call),
                ['update', 'add', 'add'],
            );
            assert.deepEqual(calls[1].productIds, calls[2].productIds);
        });

        it('should count the batches Cloudshelf did not accept and send the rest', function () {
            const batchSize = ProductsInProductGroupModel.PRODUCTS_PER_BATCH;
            refuse.update = 2;

            const result = ProductsInProductGroupModel.assign(api, modelOf(batchSize + 1));

            assert.deepEqual(result, { batches: 2, failedBatches: 1 });
            assert.deepEqual(
                calls.map(c => c.call),
                ['update', 'update', 'add'],
            );
        });
    });
});
