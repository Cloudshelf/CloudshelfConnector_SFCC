'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const cloudshelfLogHelper = require('../../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfLogHelper');

describe('jobs/cloudShelf/productsExportToCloudShelf logging', function () {
    let logged;
    let failProductIds;
    let failVariationProductIds;
    let lastFailure;

    // What SFCC's logger would write: the message with its {n} placeholders filled in
    const logAt =
        level =>
        (message, ...args) =>
            logged.push({ level: level, text: message.replace(/\{(\d+)\}/g, (match, index) => args[index]) });
    const linesAt = level => logged.filter(line => line.level === level).map(line => line.text);

    function CloudshelfApiModelMock() {}
    CloudshelfApiModelMock.prototype.upsertProducts = function (products) {
        if (failProductIds.indexOf(products[0].id) !== -1) {
            lastFailure = 'SERVICE_UNAVAILABLE, TIMEOUT, SocketTimeoutException:Read timed out';
            return null;
        }
        lastFailure = null;
        return { upsertProducts: { products: products } };
    };
    CloudshelfApiModelMock.prototype.upsertProductVariants = function (variations) {
        if (failVariationProductIds.indexOf(variations[0].productId) !== -1) {
            lastFailure = 'ERROR, HTTP 502, Bad Gateway';
            return null;
        }
        lastFailure = null;
        return { upsertProductVariants: { productVariants: [{ id: 'saved' }], userErrors: [] } };
    };
    CloudshelfApiModelMock.getLastFailure = () => lastFailure;

    function IdSet() {
        this.size = 0;
    }
    IdSet.prototype.add = function () {
        this.size++;
        return true;
    };

    /**
     * Loads the job step afresh, with its counters at zero
     * @param {Object} [removal] - what the removal checks return: products and categories summaries
     * @returns {Object} the job step
     */
    function loadStep(removal) {
        const removed = removal || {};
        return proxyquire(
            '../../../../../cartridges/int_cloudshelf/cartridge/scripts/jobs/cloudShelf/productsExportToCloudShelf.js',
            {
                'dw/system/Status': function () {},
                'dw/catalog/ProductSearchModel': function () {
                    this.setCategoryID = () => {};
                    this.setRecursiveCategorySearch = () => {};
                    this.search = () => {};
                    this.getProductSearchHits = () => ({ hasNext: () => false });
                    this.getCategory = () => ({ isRoot: () => true, hasOnlineSubCategories: () => false });
                    this.getCount = () => 6000;
                },
                '~/cartridge/scripts/helpers/cloudshelfHelper': {
                    getLogger: () => ({
                        debug: logAt('debug'),
                        info: logAt('info'),
                        warn: logAt('warn'),
                        error: logAt('error'),
                    }),
                    reportSyncStatus: () => {},
                    createDefaultThemeIfNotExist: () => {},
                    createDefaultCloudshelfIfNotExist: () => {},
                },
                '~/cartridge/scripts/helpers/cloudshelfRemovalHelper': {
                    IdSet: IdSet,
                    getMode: () => 'ON',
                    removeMissing: () => removed.products || { skipped: null, failedCalls: 0 },
                    removeMissingCategories: () =>
                        removed.categories || { skipped: null, emptyingSkipped: null, failedCalls: 0 },
                },
                '~/cartridge/scripts/helpers/cloudshelfLogHelper': cloudshelfLogHelper,
                '~/cartridge/scripts/cloudshelfVersion': '9.8.7',
                '~/cartridge/scripts/utils/jobsUtils': { getLastRunDate: () => null, updateLastRunDate: () => {} },
                '*/cartridge/models/cloudshelf/cloudshelfApiModel': CloudshelfApiModelMock,
                '*/cartridge/models/cloudshelf/productsInProductGroup': {},
                '*/cartridge/models/cloudshelf/cloudshelfProductModel': function (hit) {
                    this.id = hit.product.ID;
                },
                '*/cartridge/models/cloudshelf/cloudshelfProductVariantsModel': function (hit) {
                    this.productId = hit.product.ID;
                    this.variants = [{ id: hit.product.ID + '-variant', displayName: 'A variant' }];
                },
            },
        );
    }

    /**
     * Passes product hits through the step the way SFCC does: process each, then write them as one chunk
     * @param {Object} step - the job step
     * @param {number} from - number of the first product
     * @param {number} count - how many products
     */
    function exportChunk(step, from, count) {
        const processed = [];
        for (let i = from; i < from + count; i++) {
            processed.push(step.process({ product: { ID: 'product-' + i } }));
        }
        step.write({ toArray: () => processed });
    }

    beforeEach(function () {
        logged = [];
        failProductIds = [];
        failVariationProductIds = [];
        lastFailure = null;
    });

    it('should say which version of the cartridge is running when the export starts', function () {
        loadStep().beforeStep({ jobMode: 'FULL' });

        assert.include(linesAt('info')[0], 'Product export starting. Cartridge version: 9.8.7, mode: FULL');
    });

    it('should log progress every 2,500 product hits and nothing else while chunks succeed', function () {
        const step = loadStep();
        step.beforeStep({ jobMode: 'FULL' });
        logged = [];

        for (let chunk = 0; chunk < 30; chunk++) {
            exportChunk(step, chunk * 200 + 1, 200);
        }

        assert.deepEqual(linesAt('info'), [
            'Product export progress. Product hits read: 2600 of 6000, products sent: 2600, variations read: 2600, ' +
                'failed requests: 0, variations rejected by Cloudshelf: 0',
            'Product export progress. Product hits read: 5000 of 6000, products sent: 5000, variations read: 5000, ' +
                'failed requests: 0, variations rejected by Cloudshelf: 0',
        ]);
        assert.lengthOf(linesAt('warn'), 0);
        assert.lengthOf(linesAt('error'), 0);
        assert.isAbove(linesAt('debug').length, 30);
    });

    it('should say which products and variations were not sent, and why', function () {
        const step = loadStep();
        step.beforeStep({ jobMode: 'FULL' });
        failProductIds = ['product-201'];
        failVariationProductIds = ['product-1'];

        exportChunk(step, 1, 200);
        exportChunk(step, 201, 200);

        assert.deepEqual(linesAt('error'), [
            'Variations not sent: 151 variations of 151 products, product-1 to product-151. ' +
                'Reason: ERROR, HTTP 502, Bad Gateway',
            'Products not sent: chunk 2, 200 products, product-201 to product-400. ' +
                'Reason: SERVICE_UNAVAILABLE, TIMEOUT, SocketTimeoutException:Read timed out',
        ]);
    });

    it('should list the problems again under the summary at the end, as a warning', function () {
        const step = loadStep();
        step.beforeStep({ jobMode: 'FULL' });
        failProductIds = ['product-201'];
        exportChunk(step, 1, 200);
        exportChunk(step, 201, 200);
        logged = [];

        step.afterStep(true);

        const recap = linesAt('warn')[linesAt('warn').length - 1].split('\n');
        assert.include(recap[0], 'Product export summary. Cartridge version: 9.8.7, mode: FULL');
        assert.include(recap[0], 'product hits read: 400, products sent: 200');
        assert.include(recap[0], 'variations sent in full: 400');
        assert.include(recap[0], 'failed product API calls: 1');
        assert.equal(recap[1], 'Problems: 1:');
        assert.equal(
            recap[2],
            '1. Products not sent: chunk 2, 200 products, product-201 to product-400. ' +
                'Reason: SERVICE_UNAVAILABLE, TIMEOUT, SocketTimeoutException:Read timed out',
        );
        assert.equal(logged[logged.length - 1].level, 'warn');
    });

    it('should not count variations Cloudshelf never took as sent', function () {
        const step = loadStep();
        step.beforeStep({ jobMode: 'FULL' });
        failVariationProductIds = ['product-1'];
        exportChunk(step, 1, 200);
        logged = [];

        step.afterStep(true);

        assert.include(linesAt('info').join('\n'), 'variations sent in full: 49,');
    });

    it('should keep the recap short when every request fails', function () {
        const step = loadStep();
        step.beforeStep({ jobMode: 'FULL' });
        for (let chunk = 0; chunk < 30; chunk++) {
            failProductIds.push('product-' + (chunk * 200 + 1));
            exportChunk(step, chunk * 200 + 1, 200);
        }
        logged = [];

        step.afterStep(true);

        const recap = linesAt('warn')[linesAt('warn').length - 1].split('\n');
        assert.equal(recap[1], 'Problems: 30. The first 20:');
        assert.lengthOf(recap, 22);
    });

    it('should list what a removal check could not do', function () {
        const step = loadStep({
            products: { skipped: 'more than half of the products would be removed', failedCalls: 0 },
            categories: { skipped: null, emptyingSkipped: null, failedCalls: 2 },
        });
        step.beforeStep({ jobMode: 'FULL' });

        step.afterStep(true);

        const recap = linesAt('warn')[linesAt('warn').length - 1].split('\n');
        assert.deepEqual(recap.slice(1), [
            'Problems: 2:',
            '1. Removal of products and variations skipped: more than half of the products would be removed.',
            '2. Removal of categories: 2 request(s) failed. See the lines above.',
        ]);
    });

    it('should not log a recap when nothing went wrong, or when removal is switched off', function () {
        const step = loadStep({ products: { skipped: 'the removeMissing job parameter is OFF', failedCalls: 0 } });
        step.beforeStep({ jobMode: 'FULL' });
        exportChunk(step, 1, 200);
        logged = [];

        step.afterStep(true);

        assert.lengthOf(linesAt('warn'), 0);
        assert.lengthOf(linesAt('error'), 0);
    });
});
