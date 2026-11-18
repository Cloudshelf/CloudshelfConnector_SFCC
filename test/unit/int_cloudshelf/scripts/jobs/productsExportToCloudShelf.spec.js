'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const cloudshelfLogHelper = require('../../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfLogHelper');

describe('jobs/cloudShelf/productsExportToCloudShelf logging', function () {
    let logged;
    let failProductIds;
    let failVariationProductIds;
    let lastFailure;
    let categories;
    let assignResults;
    let assignCalls;
    let failCategoryUpsert;
    let reportedStatuses;
    let lastRunDateUpdates;
    let notes;
    let previousRun;
    let categoriesLastModified;
    let categoryExportThrows;
    let noApiKey;
    let searches;

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
    CloudshelfApiModelMock.prototype.upsertProductGroups = function (productGroups) {
        if (categoryExportThrows) {
            throw new Error('Limit for quota was exceeded');
        }
        if (failCategoryUpsert) {
            lastFailure = 'ERROR, HTTP 502, Bad Gateway';
            return null;
        }
        return { upsertProductGroups: { productGroups: productGroups } };
    };
    CloudshelfApiModelMock.getLastFailure = () => lastFailure;

    function ProductsInProductGroupMock(category) {
        this.productGroupId = 'category-' + category.ID;
        this.productCount = 6000;
    }
    // What Cloudshelf did with each attempt to send a category's products, in order. Unlisted attempts succeed.
    ProductsInProductGroupMock.assign = function (api, productsInProductGroup) {
        assignCalls.push(productsInProductGroup.productGroupId);
        const result = assignResults.shift() || { batches: 2, failedBatches: 0 };
        lastFailure = result.failedBatches
            ? 'SERVICE_UNAVAILABLE, TIMEOUT, SocketTimeoutException:Read timed out'
            : null;
        return result;
    };

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
                'dw/system/Site': { getCurrent: () => ({ getID: () => 'RefArch' }) },
                'dw/catalog/ProductSearchModel': function () {
                    searches++;
                    this.setCategoryID = () => {};
                    this.setRecursiveCategorySearch = () => {};
                    this.search = () => {};
                    this.getProductSearchHits = () => ({ hasNext: () => false });
                    this.getCategory = () => ({
                        isRoot: () => true,
                        hasOnlineSubCategories: () => categories.length > 0,
                        getOnlineSubCategories: () => ({
                            toArray: () =>
                                categories.map(id => ({
                                    ID: id,
                                    lastModified: categoriesLastModified,
                                    isRoot: () => false,
                                    hasOnlineSubCategories: () => false,
                                })),
                        }),
                    });
                    this.getCount = () => 6000;
                },
                '~/cartridge/scripts/helpers/cloudshelfHelper': {
                    getLogger: () => ({
                        debug: logAt('debug'),
                        info: logAt('info'),
                        warn: logAt('warn'),
                        error: logAt('error'),
                    }),
                    GLOBAL_ID_NAMESPACES: { PRODUCT_GROUP: 'salesforceCategory' },
                    getGlobalId: (namespace, id) => 'gid://external/' + namespace + '/' + id,
                    isSiteWithoutApiKey: () => noApiKey,
                    reportSyncStatus: (stage, message) => {
                        reportedStatuses.push({ stage: stage, message: message });
                    },
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
                '~/cartridge/scripts/utils/jobsUtils': {
                    getLastRunDate: () => previousRun,
                    updateLastRunDate: (step, date) => {
                        lastRunDateUpdates.push(date);
                    },
                    // The real notes are job data objects in SFCC, which outlive a run
                    hasNote: name => notes.indexOf(name) !== -1,
                    setNote: name => {
                        if (notes.indexOf(name) === -1) {
                            notes.push(name);
                        }
                    },
                    clearNote: name => {
                        notes = notes.filter(note => note !== name);
                    },
                },
                '*/cartridge/models/cloudshelf/cloudshelfApiModel': CloudshelfApiModelMock,
                '*/cartridge/models/cloudshelf/productsInProductGroup': ProductsInProductGroupMock,
                '*/cartridge/models/cloudshelf/productGroup': function (category) {
                    this.id = 'category-' + category.ID;
                },
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
        categories = [];
        assignResults = [];
        assignCalls = [];
        failCategoryUpsert = false;
        reportedStatuses = [];
        lastRunDateUpdates = [];
        notes = [];
        previousRun = null;
        // Changed since the previous run, so a delta export sends them too
        categoriesLastModified = new Date();
        categoryExportThrows = false;
        noApiKey = false;
        searches = 0;
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

    describe('a category whose products Cloudshelf did not take in full', function () {
        beforeEach(function () {
            categories = ['mens', 'womens'];
        });

        it('should be sent once more, and count as sent when that works', function () {
            assignResults = [{ batches: 2, failedBatches: 1 }];
            const step = loadStep();
            step.beforeStep({ jobMode: 'DELTA' });

            step.afterStep(true);

            assert.deepEqual(assignCalls, ['category-mens', 'category-mens', 'category-womens']);
            assert.include(linesAt('warn')[0], 'sending the category once more. Category id: category-mens');
            assert.lengthOf(linesAt('error'), 0);
            assert.lengthOf(lastRunDateUpdates, 1);
            // Nothing went wrong in the end, so no error is reported with the stage
            assert.deepEqual(reportedStatuses[reportedStatuses.length - 1], {
                stage: 'PROCESS_PRODUCT_GROUPS',
                message: undefined,
            });
        });

        it('should be reported to Cloudshelf when sending it again fails too', function () {
            assignResults = [
                { batches: 2, failedBatches: 1 },
                { batches: 2, failedBatches: 1 },
            ];
            const step = loadStep();
            step.beforeStep({ jobMode: 'DELTA' });

            step.afterStep(true);

            const last = reportedStatuses[reportedStatuses.length - 1];
            assert.equal(last.stage, 'PROCESS_PRODUCT_GROUPS');
            assert.include(
                last.message,
                '0 categories were not sent and 1 categories were left without all of their products',
            );
            assert.include(linesAt('error')[0], 'Product assignments not fully sent, Category id: category-mens');
        });

        it('should make the next export send every category again, changed or not', function () {
            assignResults = [
                { batches: 2, failedBatches: 1 },
                { batches: 2, failedBatches: 1 },
            ];
            const failed = loadStep();
            failed.beforeStep({ jobMode: 'FULL' });
            failed.afterStep(true);

            assert.deepEqual(notes, ['custom.int_cloudshelf.ProductExport:resendCategories:RefArch']);
            assert.include(linesAt('error').join('\n'), 'The next export, full or delta, sends every category again');
            // The run still counts as the previous run: the note, not the date, brings the categories back
            assert.lengthOf(lastRunDateUpdates, 1);

            // Nothing has changed in SFCC since, so a delta export would leave both categories alone
            previousRun = new Date();
            categoriesLastModified = new Date(previousRun.getTime() - 60000);
            assignCalls = [];
            logged = [];
            const next = loadStep();
            next.beforeStep({ jobMode: 'DELTA' });
            next.afterStep(true);

            assert.deepEqual(assignCalls, ['category-mens', 'category-womens']);
            assert.include(linesAt('warn')[0], 'this export sends every category again');
            assert.deepEqual(notes, []);
            assert.lengthOf(linesAt('error'), 0);
        });

        it('should keep bringing the categories back, and report it, until an export sends them all', function () {
            notes = ['custom.int_cloudshelf.ProductExport:resendCategories:RefArch'];
            previousRun = new Date();
            categoriesLastModified = new Date(previousRun.getTime() - 60000);
            assignResults = [
                { batches: 2, failedBatches: 1 },
                { batches: 2, failedBatches: 1 },
            ];
            const step = loadStep();
            step.beforeStep({ jobMode: 'DELTA' });

            step.afterStep(true);

            assert.deepEqual(notes, ['custom.int_cloudshelf.ProductExport:resendCategories:RefArch']);
            assert.include(
                reportedStatuses[reportedStatuses.length - 1].message,
                '1 categories were left without all of their products',
            );
        });

        it('should leave unchanged categories alone on a delta export when nothing was left behind', function () {
            previousRun = new Date();
            categoriesLastModified = new Date(previousRun.getTime() - 60000);
            const step = loadStep();
            step.beforeStep({ jobMode: 'DELTA' });

            step.afterStep(true);

            assert.deepEqual(assignCalls, []);
        });

        it('should make the next export send every category again when the category export stopped on an error', function () {
            categoryExportThrows = true;
            const step = loadStep();
            step.beforeStep({ jobMode: 'FULL' });

            assert.throws(() => step.afterStep(true), 'Limit for quota was exceeded');

            assert.deepEqual(notes, ['custom.int_cloudshelf.ProductExport:resendCategories:RefArch']);
        });

        it('should keep the errors of the product export in what is reported', function () {
            assignResults = [
                { batches: 2, failedBatches: 1 },
                { batches: 2, failedBatches: 1 },
            ];
            const step = loadStep();
            step.beforeStep({ jobMode: 'FULL' });
            failProductIds = ['product-1'];
            exportChunk(step, 1, 200);

            step.afterStep(true);

            const last = reportedStatuses[reportedStatuses.length - 1];
            assert.include(last.message, '1 requests failed during the product export.');
            assert.include(last.message, '1 categories were left without all of their products');
        });

        it('should treat categories Cloudshelf did not take at all the same way', function () {
            failCategoryUpsert = true;
            const step = loadStep();
            step.beforeStep({ jobMode: 'FULL' });

            step.afterStep(true);

            assert.include(reportedStatuses[reportedStatuses.length - 1].message, '2 categories were not sent');
            assert.lengthOf(notes, 1);
        });
    });

    it('should move the previous run date on when every category was sent', function () {
        categories = ['mens'];
        const step = loadStep();
        step.beforeStep({ jobMode: 'FULL' });

        step.afterStep(true);

        assert.lengthOf(lastRunDateUpdates, 1);
        assert.lengthOf(linesAt('error'), 0);
    });

    it('should read nothing and send nothing for a site without an API key', function () {
        noApiKey = true;
        categories = ['mens'];
        const step = loadStep();

        step.beforeStep({ jobMode: 'FULL' });

        assert.equal(step.getTotalCount(), 0);
        assert.isUndefined(step.read());
        step.afterStep(true);
        assert.equal(searches, 0);
        assert.lengthOf(logged, 0);
        assert.lengthOf(reportedStatuses, 0);
        assert.lengthOf(assignCalls, 0);
        assert.lengthOf(lastRunDateUpdates, 0);
        assert.lengthOf(notes, 0);
    });
});
