'use strict';

/**
 * Job Step Type
 */

const Status = require('dw/system/Status');
const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('~/cartridge/scripts/helpers/cloudshelfHelper');
const cloudshelfRemovalHelper = require('~/cartridge/scripts/helpers/cloudshelfRemovalHelper');
const cloudshelfLogHelper = require('~/cartridge/scripts/helpers/cloudshelfLogHelper');
const cartridgeVersion = require('~/cartridge/scripts/cloudshelfVersion');
const jobsUtils = require('~/cartridge/scripts/utils/jobsUtils');
const logger = cloudshelfHelper.getLogger();
const jobStep = 'custom.int_cloudshelf.ProductExport';
let runDate;
let countProcessed = 0;
let countTotalVariations = 0;
let totalCount;
let productSearchHits;
let jobMode;
let lastRunDate;
let rootCategory;
let categoriesCounter = 0;
let chunkCount = 0;
// Totals for the summary logged at the end of the step
let countProductsSent = 0;
let countProductApiCallsFailed = 0;
let countVariantsFull = 0;
let countVariantsPriceAndStockOnly = 0;
let countVariantApiCalls = 0;
let countVariantApiCallsFailed = 0;
let countVariantsRejected = 0;
// A progress line is logged each time this many more product hits have been read. Lines for every chunk
// are at debug level: at info level they were three quarters of the log of a large catalogue.
const PROGRESS_EVERY = 2500;
let nextProgressAt = PROGRESS_EVERY;
// What went wrong in this step, listed again at the end of its log
let problems = new cloudshelfLogHelper.ProblemList();
// What a full export read from SFCC, so that what Cloudshelf holds beyond it can be removed
let removeMissingMode;
let knownProductIds = new cloudshelfRemovalHelper.IdSet();
let knownVariantIds = new cloudshelfRemovalHelper.IdSet();
// Every online category the export found, with or without products, and the ones it found without any
let knownCategoryIds = new cloudshelfRemovalHelper.IdSet();
let categoryIdsWithoutProducts = new cloudshelfRemovalHelper.IdSet();

/**
 * Job's private methods
 */

/**
 * Logs a problem as an error and keeps it for the recap at the end of the step
 * @param {string} text - what went wrong, with what and why
 */
function reportProblem(text) {
    problems.add(text);
    logger.error('{0}', text);
}

/**
 * Keeps what a removal check could not do for the recap. The removal helper has already logged the detail.
 * @param {string} what - which removal check
 * @param {Object} removalSummary - summary the removal helper returned
 */
function noteRemovalProblems(what, removalSummary) {
    if (!removalSummary) {
        return;
    }
    if (removalSummary.failedCalls) {
        problems.add(what + ': ' + removalSummary.failedCalls + ' request(s) failed. See the lines above.');
    }
    // Being switched off is a setting, not a problem
    [removalSummary.skipped, removalSummary.emptyingSkipped].forEach(function (reason) {
        if (reason && reason.indexOf('job parameter is OFF') === -1) {
            problems.add(what + ' skipped: ' + reason + '.');
        }
    });
}

/**
 * Logs every problem of the step once more in one block, under the summary of the run, so that the end of
 * the log is enough to see what went wrong. It is a warning, which SFCC writes whatever the log settings
 * are; the summary on its own is an info line, which SFCC only writes when info logging is switched on.
 * @param {string} summary - summary of the run
 */
function logProblemRecap(summary) {
    if (problems.total) {
        logger.warn('{0}', problems.describe(summary));
    }
}

/**
 * Says why the last request to Cloudshelf failed
 * @returns {string} reason
 */
function getLastFailure() {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    return CloudshelfApiModel.getLastFailure() || 'Cloudshelf answered without saving anything';
}

/**
 * Returns true if upsert product response is successful
 */
function isUpsertProductSuccess(upsertProductResult) {
    return (
        upsertProductResult &&
        upsertProductResult.upsertProducts &&
        upsertProductResult.upsertProducts.products &&
        upsertProductResult.upsertProducts.products.length
    );
}

/**
 * Returns true if upsert variants response is successful
 */
function isUpsertVariantsSuccess(upsertVariantsResult) {
    return (
        upsertVariantsResult &&
        upsertVariantsResult.upsertProductVariants &&
        upsertVariantsResult.upsertProductVariants.productVariants &&
        upsertVariantsResult.upsertProductVariants.productVariants.length
    );
}

/**
 * Returns true if upsert product groups response is successful
 */
function isUpsertProductGroupsSuccess(upsertProductGroupsResult) {
    return (
        upsertProductGroupsResult &&
        upsertProductGroupsResult.upsertProductGroups &&
        upsertProductGroupsResult.upsertProductGroups.productGroups &&
        upsertProductGroupsResult.upsertProductGroups.productGroups.length
    );
}

/**
 * Returns the user errors Cloudshelf answered an upsert variants call with
 * @param {Object} upsertVariantsResult - upsert variants response
 * @returns {Array} user errors, empty when there are none
 */
function getUpsertVariantsUserErrors(upsertVariantsResult) {
    return (
        (upsertVariantsResult &&
            upsertVariantsResult.upsertProductVariants &&
            upsertVariantsResult.upsertProductVariants.userErrors) ||
        []
    );
}

/**
 * Export variation lists by chunks
 * @param {Array} variationList upsert variations models
 * @return {Object} result object with process details
 */
function exportChunksVariations(variationList) {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const cloudshelfApi = new CloudshelfApiModel();
    const thresholdLength = 150;

    let variationListCount = 0;
    let variationCount = 0;
    let variationChunkToExportLength = 0;
    let apiCallsCount = 0;
    let variationChunkToExport = [];
    // Counted as sent only once Cloudshelf has taken the call they are in
    let chunkVariantsFull = 0;
    let chunkVariantsPriceAndStockOnly = 0;

    if (variationList.length) {
        variationList.forEach((element, index) => {
            // increase counts
            variationChunkToExport.push(element);
            variationCount += element.variants.length;
            variationChunkToExportLength += element.variants.length;
            element.variants.forEach(variant => {
                // A variation built for price and stock only has no display name
                if (variant.displayName === undefined) {
                    chunkVariantsPriceAndStockOnly++;
                } else {
                    chunkVariantsFull++;
                }
            });
            ++variationListCount;

            // call API for export in case of threshold length is reached or it is last loop iteration
            if (variationChunkToExportLength > thresholdLength || index === variationList.length - 1) {
                apiCallsCount++;
                countVariantApiCalls++;
                let upsertVariantsResult = cloudshelfApi.upsertProductVariants(variationChunkToExport);
                let userErrors = getUpsertVariantsUserErrors(upsertVariantsResult);
                if (userErrors.length) {
                    // Cloudshelf saved the rest of the call and left these variants as they were
                    countVariantsRejected += userErrors.length;
                    const rejection =
                        'Cloudshelf rejected ' +
                        userErrors.length +
                        ' variation(s) in an upsert of products ' +
                        variationChunkToExport[0].productId +
                        ' to ' +
                        variationChunkToExport[variationChunkToExport.length - 1].productId +
                        ': ' +
                        cloudshelfLogHelper.shorten(JSON.stringify(userErrors), 2000);
                    problems.add(rejection);
                    logger.warn('{0}', rejection);
                }
                if (isUpsertVariantsSuccess(upsertVariantsResult)) {
                    countVariantsFull += chunkVariantsFull;
                    countVariantsPriceAndStockOnly += chunkVariantsPriceAndStockOnly;
                    logger.debug(
                        'Upsert Variation API call successful. Variations number exported: {0}, variations lists: {1}',
                        variationChunkToExportLength,
                        variationChunkToExport.length,
                    );
                } else {
                    countVariantApiCallsFailed++;
                    reportProblem(
                        'Variations not sent: ' +
                            variationChunkToExportLength +
                            ' variations of ' +
                            variationChunkToExport.length +
                            ' products, ' +
                            variationChunkToExport[0].productId +
                            ' to ' +
                            variationChunkToExport[variationChunkToExport.length - 1].productId +
                            '. Reason: ' +
                            getLastFailure(),
                    );
                }

                // reset chunk and move to next one
                variationChunkToExport = [];
                variationChunkToExportLength = 0;
                chunkVariantsFull = 0;
                chunkVariantsPriceAndStockOnly = 0;
            }
        });
    } else {
        logger.debug('No variants to update, skipping upsertProductVariants API call');
    }

    return {
        variationCount: variationCount,
        variationListCount: variationListCount,
        apiCallsCount: apiCallsCount,
    };
}

/**
 * Gathers data for exporting product groups (categories)
 * @param {dw.catalog.Category} category - dw root category starting from which data should be built
 * @returns {Object} object with productGroups and productsInProductGroup data for export
 */
function getExportCategoriesData(category) {
    let result = {
        productGroups: [],
        productsInProductGroup: [],
    };
    if (!category.isRoot()) {
        const categoryGlobalId = cloudshelfHelper.getGlobalId(
            cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT_GROUP,
            category.ID,
        );
        knownCategoryIds.add(categoryGlobalId);
        const ProductGroupModel = require('*/cartridge/models/cloudshelf/productGroup');
        const ProductsInProductGroup = require('*/cartridge/models/cloudshelf/productsInProductGroup');

        // A delta export leaves a category that has not changed alone, without reading its products
        if (jobMode !== 'DELTA' || category.lastModified > lastRunDate) {
            let productsInProductGroup = new ProductsInProductGroup(category);

            // skip categories without products
            if (productsInProductGroup.productCount) {
                result.productGroups.push(new ProductGroupModel(category));
                result.productsInProductGroup.push(productsInProductGroup);
                categoriesCounter++;
            } else {
                // If Cloudshelf still holds products for it, a full export clears them
                categoryIdsWithoutProducts.add(categoryGlobalId);
            }
        }
    }
    if (category.hasOnlineSubCategories()) {
        category
            .getOnlineSubCategories()
            .toArray()
            .forEach(function (subCategory) {
                let subResult = getExportCategoriesData(subCategory);
                result.productGroups = result.productGroups.concat(subResult.productGroups);
                result.productsInProductGroup = result.productsInProductGroup.concat(subResult.productsInProductGroup);
            });
    }
    return result;
}

/**
 * Triggers process of product groups (categories) export
 */
function exportProductGroups() {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    let exportPerStep = 100;
    let processedNumber = 0;
    let cloudshelfApi = new CloudshelfApiModel();
    logger.info('Starting Export of Product Groups');

    let exportData = getExportCategoriesData(rootCategory);

    // export product groups
    while (exportData.productGroups.length > processedNumber) {
        let dataToExport = exportData.productGroups.slice(processedNumber, processedNumber + exportPerStep);
        let upsertProductGroupsResult = cloudshelfApi.upsertProductGroups(dataToExport);
        if (isUpsertProductGroupsSuccess(upsertProductGroupsResult)) {
            logger.info(
                'UpsertProductGroups API call successful, Categories number exported: {0}',
                dataToExport.length,
            );
        } else {
            reportProblem(
                'Categories not sent: ' +
                    dataToExport.length +
                    ' categories, ' +
                    dataToExport[0].id +
                    ' to ' +
                    dataToExport[dataToExport.length - 1].id +
                    '. Reason: ' +
                    getLastFailure(),
            );
        }
        processedNumber += exportPerStep;
    }

    // update product to group assignments
    const ProductsInProductGroup = require('*/cartridge/models/cloudshelf/productsInProductGroup');
    let categoriesNotUpdated = 0;
    exportData.productsInProductGroup.forEach(function (productsInProductGroup) {
        let assigned = ProductsInProductGroup.assign(cloudshelfApi, productsInProductGroup);
        if (!assigned.failedBatches) {
            logger.info(
                'Product assignments sent, Category id: {0}, products assigned: {1}, batches: {2}',
                productsInProductGroup.productGroupId,
                productsInProductGroup.productCount,
                assigned.batches,
            );
        } else {
            categoriesNotUpdated++;
            reportProblem(
                'Product assignments not fully sent, Category id: ' +
                    productsInProductGroup.productGroupId +
                    ', products: ' +
                    productsInProductGroup.productCount +
                    ', failed batches: ' +
                    assigned.failedBatches +
                    ' of ' +
                    assigned.batches +
                    '. Reason of the last failure: ' +
                    getLastFailure(),
            );
        }
    });

    logger.info(
        'Finish Export of Product Groups, total number processed: {0}, product assignments not fully sent: {1}',
        categoriesCounter,
        categoriesNotUpdated,
    );
}

/**
 * Job's callbacks
 */

/**
 * Search for all site products
 */
exports.beforeStep = function (params) {
    runDate = new Date();
    jobMode = params.jobMode;
    lastRunDate = jobsUtils.getLastRunDate(jobStep);
    removeMissingMode = cloudshelfRemovalHelper.getMode(params.removeMissing);
    logger.info(
        'Product export starting. Cartridge version: {3}, mode: {0}, previous run: {1}, ' +
            'remove what is no longer in SFCC: {2}',
        jobMode,
        lastRunDate ? lastRunDate.toISOString() : 'none',
        jobMode === 'FULL' ? removeMissingMode : 'full exports only',
        cartridgeVersion,
    );
    // A new sync starts with a clean slate of errors in the Cloudshelf Manager
    cloudshelfHelper.reportSyncStatus('REQUEST_PRODUCTS', '');

    const cgid = 'root';
    if (!cgid) {
        return new Status(Status.ERROR, 'ERROR', 'CategoryID is not set.');
    }
    const apiProductSearch = new ProductSearchModel();
    apiProductSearch.setCategoryID(cgid);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();
    productSearchHits = apiProductSearch.getProductSearchHits();
    rootCategory = apiProductSearch.getCategory();
    totalCount = apiProductSearch.getCount();
    return productSearchHits;
};

/**
 * Returns the total number of items that are available.
 *
 * @returns {number}
 */
exports.getTotalCount = function () {
    logger.info('Total hits found {0}', totalCount);
    return totalCount;
};

/**
 * Returns one item or nothing if there are no more items.
 *
 * @returns {dw.catalog.ProductSearchHit|void} - API ProductSearchHit
 */
exports.read = function () {
    if (productSearchHits.hasNext()) {
        return productSearchHits.next();
    }

    return undefined;
};

/**
 * Triggers upsert product API call for a chunk
 * Process variations for each product from chunk and triggers API calls for upsert variations
 * @param {dw.util.List} products - list of product objects returned by process callback
 */
exports.write = function (products) {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const cloudshelfApi = new CloudshelfApiModel();
    let productList = [];
    let variationList = [];
    let uniqueIds = [];
    let uniqueVariantIds = [];
    products.toArray().forEach(product => {
        if (Object.keys(product.productModel).length && uniqueIds.indexOf(product.productModel.id) === -1) {
            productList.push(product.productModel);
        }

        if (
            Object.keys(product.productVariantsModel).length &&
            uniqueIds.indexOf(product.productVariantsModel.productId) === -1
        ) {
            product.productVariantsModel.variants = product.productVariantsModel.variants.filter(variant => {
                return uniqueVariantIds.indexOf(variant.id) === -1;
            });

            variationList.push(product.productVariantsModel);

            product.productVariantsModel.variants.forEach(variant => {
                uniqueVariantIds.push(variant.id);
            });
        }

        uniqueIds.push(product.productModel.id || product.productVariantsModel.productId);
    });

    if (jobMode === 'FULL') {
        // Kept whether or not Cloudshelf takes the upserts below: a product SFCC still has is never removed
        productList.forEach(product => {
            knownProductIds.add(product.id);
        });
        variationList.forEach(variations => {
            variations.variants.forEach(variant => {
                knownVariantIds.add(variant.id);
            });
        });
    }

    ++chunkCount;
    if (productList.length) {
        let upsertProductResult = cloudshelfApi.upsertProducts(productList);
        if (isUpsertProductSuccess(upsertProductResult)) {
            countProductsSent += productList.length;
            logger.debug(
                'Result of Chunk Export - Chunk number {0} processed. Products Exported successfully: {1}',
                chunkCount,
                productList.length,
            );
        } else {
            countProductApiCallsFailed++;
            reportProblem(
                'Products not sent: chunk ' +
                    chunkCount +
                    ', ' +
                    productList.length +
                    ' products, ' +
                    productList[0].id +
                    ' to ' +
                    productList[productList.length - 1].id +
                    '. Reason: ' +
                    getLastFailure(),
            );
        }
    } else {
        logger.debug('No products to update, skipping upsertProducts API call');
    }

    // process chunk variations by sub-chunks
    let chunkVariationsResult = exportChunksVariations(variationList);

    countTotalVariations += chunkVariationsResult.variationCount;
    logger.debug(
        'Result of Variation Export per jobs chunk:\n' +
            'Variants Lists Exported: {0},\nNumber of API calls for upsert variations: {1},\n' +
            'Total variations in scope of chunk exported: {2}',
        chunkVariationsResult.variationListCount,
        chunkVariationsResult.apiCallsCount,
        chunkVariationsResult.variationCount,
    );

    if (countProcessed >= nextProgressAt) {
        logger.info(
            'Product export progress. Product hits read: {0} of {1}, products sent: {2}, variations read: {3}, ' +
                'failed requests: {4}, variations rejected by Cloudshelf: {5}',
            countProcessed,
            totalCount,
            countProductsSent,
            countTotalVariations,
            countProductApiCallsFailed + countVariantApiCallsFailed,
            countVariantsRejected,
        );
        while (nextProgressAt <= countProcessed) {
            nextProgressAt += PROGRESS_EVERY;
        }
    }

    return;
};

/**
 * Process each product hit individually
 * Returns cloudshelf models for export based on product hit information
 * @param {dw.catalog.ProductSearchHit} productSearchHit
 * @returns {Object} - obj Product + Variaitons
 */
exports.process = function (productSearchHit) {
    if (
        productSearchHit &&
        !productSearchHit.product.bundle &&
        !productSearchHit.product.productSet &&
        !productSearchHit.product.optionProduct
    ) {
        const ProductModel = require('*/cartridge/models/cloudshelf/cloudshelfProductModel');
        const ProductVariantsModel = require('*/cartridge/models/cloudshelf/cloudshelfProductVariantsModel');
        let deltaDate = jobMode === 'DELTA' ? lastRunDate : null;
        let product =
            jobMode !== 'DELTA' || productSearchHit.product.lastModified > lastRunDate
                ? new ProductModel(productSearchHit)
                : {};
        let variations = new ProductVariantsModel(productSearchHit, deltaDate);
        ++countProcessed;
        return {
            productModel: product,
            productVariantsModel: variations,
        };
    }
};

/**
 * Removes from cloudshelf what a full export no longer found in SFCC
 * Triggers categories export to cloudshelf
 * Creates default theme and cloudshelf if not exist
 * @param {boolean} success - false when the step stopped on an error before reading every product.
 *     SFCC still calls afterStep in that case.
 */
exports.afterStep = function (success) {
    // Declared once for the whole function: SFCC's script engine does not scope const to a block, and a second
    // declaration further down stops the script compiling, which makes the job invalid
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const readWholeCatalogue = success === true;
    logger.info(
        'Product export finished. Total product hits processed: {0}, total variations: {1}',
        countProcessed,
        countTotalVariations,
    );
    const formatCount = cloudshelfLogHelper.formatCount;
    const summary =
        'Product export summary. Cartridge version: ' +
        cartridgeVersion +
        ', mode: ' +
        jobMode +
        ', previous run: ' +
        (lastRunDate ? lastRunDate.toISOString() : 'none') +
        ', product hits read: ' +
        formatCount(countProcessed) +
        ', products sent: ' +
        formatCount(countProductsSent) +
        ', variations sent in full: ' +
        formatCount(countVariantsFull) +
        ', variations sent with price and stock only: ' +
        formatCount(countVariantsPriceAndStockOnly) +
        ', variation API calls: ' +
        formatCount(countVariantApiCalls) +
        ', failed variation API calls: ' +
        formatCount(countVariantApiCallsFailed) +
        ', variations rejected by Cloudshelf: ' +
        formatCount(countVariantsRejected) +
        ', failed product API calls: ' +
        formatCount(countProductApiCallsFailed);
    logger.info('{0}', summary);

    if (!readWholeCatalogue) {
        // What was not read is not known to be gone, and the changes this run missed must not be skipped next time
        reportProblem(
            'Product export stopped on an error after ' +
                countProcessed +
                ' product hits, before reading the whole catalogue. See the error in the job log. Nothing is ' +
                'removed from Cloudshelf, and the next delta export starts from the previous run again.',
        );
        cloudshelfHelper.reportSyncStatus(
            'FAILED',
            'The product export stopped on an error after ' +
                countProcessed +
                ' products. See the job log in Salesforce Business Manager.',
        );
    } else if (jobMode === 'FULL') {
        noteRemovalProblems(
            'Removal of products and variations',
            cloudshelfRemovalHelper.removeMissing(
                new CloudshelfApiModel(),
                { products: knownProductIds, variants: knownVariantIds },
                removeMissingMode,
            ),
        );
    }

    if (readWholeCatalogue) {
        const failedCalls = countVariantApiCallsFailed + countProductApiCallsFailed;
        cloudshelfHelper.reportSyncStatus(
            'PROCESS_PRODUCT_GROUPS',
            failedCalls + countVariantsRejected
                ? countVariantsRejected +
                      ' variations were rejected by Cloudshelf and ' +
                      failedCalls +
                      ' requests failed during the product export. See the custom-cloudshelf log in Salesforce.'
                : undefined,
        );
    }

    try {
        exportProductGroups();

        if (readWholeCatalogue && jobMode === 'FULL') {
            noteRemovalProblems(
                'Removal of categories',
                cloudshelfRemovalHelper.removeMissingCategories(
                    new CloudshelfApiModel(),
                    { online: knownCategoryIds, withoutProducts: categoryIdsWithoutProducts },
                    removeMissingMode,
                ),
            );
        }

        cloudshelfHelper.createDefaultThemeIfNotExist();
        cloudshelfHelper.createDefaultCloudshelfIfNotExist();
    } catch (err) {
        // The job stops here, so the catalog stats step that would end the sync in Cloudshelf never runs
        reportProblem('Category export stopped on an error: ' + (err.message || err));
        logProblemRecap(summary);
        cloudshelfHelper.reportSyncStatus(
            'FAILED',
            'The category export stopped on an error. See the job log in Salesforce Business Manager.',
        );
        throw err;
    }

    if (readWholeCatalogue) {
        jobsUtils.updateLastRunDate(jobStep, runDate);
    }

    logProblemRecap(summary);

    return;
};
