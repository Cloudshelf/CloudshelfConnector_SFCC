'use strict';

/**
 * Job Step Type
 */

const Status = require('dw/system/Status');
const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('~/cartridge/scripts/helpers/cloudshelfHelper');
const cloudshelfRemovalHelper = require('~/cartridge/scripts/helpers/cloudshelfRemovalHelper');
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
let countVariantsFull = 0;
let countVariantsPriceAndStockOnly = 0;
let countVariantApiCalls = 0;
let countVariantApiCallsFailed = 0;
let countVariantsRejected = 0;
// What a full export read from SFCC, so that what Cloudshelf holds beyond it can be removed
let removeMissingMode;
let knownProductIds = new cloudshelfRemovalHelper.IdSet();
let knownVariantIds = new cloudshelfRemovalHelper.IdSet();

/**
 * Job's private methods
 */

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
 * Returns true if Update Products In Product Group response is successful
 */
function isUpdateProductsInProductGroupResultSuccess(updateProductsInProductGroupResult) {
    return updateProductsInProductGroupResult && updateProductsInProductGroupResult.updateProductsInProductGroup;
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

    if (variationList.length) {
        variationList.forEach((element, index) => {
            // increase counts
            variationChunkToExport.push(element);
            variationCount += element.variants.length;
            variationChunkToExportLength += element.variants.length;
            element.variants.forEach(variant => {
                // A variation built for price and stock only has no display name
                if (variant.displayName === undefined) {
                    countVariantsPriceAndStockOnly++;
                } else {
                    countVariantsFull++;
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
                    logger.warn(
                        'Cloudshelf rejected {0} variation(s) in an upsert of products {1} to {2}: {3}',
                        userErrors.length,
                        variationChunkToExport[0].productId,
                        variationChunkToExport[variationChunkToExport.length - 1].productId,
                        JSON.stringify(userErrors),
                    );
                }
                if (isUpsertVariantsSuccess(upsertVariantsResult)) {
                    logger.info(
                        'Upsert Variation API call successful. Variations number exported: {0}, variations lists: {1}',
                        variationChunkToExportLength,
                        variationChunkToExport.length,
                    );
                } else {
                    countVariantApiCallsFailed++;
                    logger.error(
                        'Upsert Variation API call failure. Variations number not exported: {0}, variations lists: {1}, products {2} to {3}',
                        variationChunkToExportLength,
                        variationChunkToExport.length,
                        variationChunkToExport[0].productId,
                        variationChunkToExport[variationChunkToExport.length - 1].productId,
                    );
                }

                // reset chunk and move to next one
                variationChunkToExport = [];
                variationChunkToExportLength = 0;
            }
        });
    } else {
        logger.info('No variants to update, skipping upsertProductVariants API call');
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
        const ProductGroupModel = require('*/cartridge/models/cloudshelf/productGroup');
        const ProductsInProductGroup = require('*/cartridge/models/cloudshelf/productsInProductGroup');

        let productGroup = new ProductGroupModel(category);
        let productsInProductGroup = new ProductsInProductGroup(category);

        // skip categories without products
        if ((jobMode !== 'DELTA' || category.lastModified > lastRunDate) && productsInProductGroup.productIds.length) {
            result.productGroups.push(productGroup);
            result.productsInProductGroup.push(productsInProductGroup);
            categoriesCounter++;
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
            logger.info(
                'UpsertProductGroups API call failure, Categories number not exported: {0}',
                dataToExport.length,
            );
        }
        processedNumber += exportPerStep;
    }

    // update product to group assignments
    exportData.productsInProductGroup.forEach(function (productsInProductGroup) {
        let updateProductsInProductGroupResult = cloudshelfApi.updateProductsInProductGroup(productsInProductGroup);
        if (isUpdateProductsInProductGroupResultSuccess(updateProductsInProductGroupResult)) {
            logger.info(
                'UpdateProductsInProductGroup API call successful, Category id: {0}, products assigned: {1}',
                productsInProductGroup.productGroupId,
                productsInProductGroup.productIds.length,
            );
        } else {
            logger.info(
                'UpdateProductsInProductGroup API call failure, Category id: {0}',
                productsInProductGroup.productGroupId,
            );
        }
    });

    logger.info('Finish Export of Product Groups, total number processed: {0}', categoriesCounter);
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
        'Product export starting. Mode: {0}, previous run: {1}, remove what is no longer in SFCC: {2}',
        jobMode,
        lastRunDate ? lastRunDate.toISOString() : 'none',
        jobMode === 'FULL' ? removeMissingMode : 'full exports only',
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

    if (productList.length) {
        let upsertProductResult = cloudshelfApi.upsertProducts(productList);
        if (isUpsertProductSuccess(upsertProductResult)) {
            countProductsSent += productList.length;
            logger.info(
                'Result of Chunk Export - Chunk number {0} processed. Products Exported successfully: {1}',
                ++chunkCount,
                productList.length,
            );
        } else {
            logger.error(
                'Result of Chunk Export - Chunk number {0} processed. Products Export API call failure: {1}',
                ++chunkCount,
                productList.length,
            );
        }
    } else {
        logger.info('No products to update, skipping upsertProducts API call');
    }

    // process chunk variations by sub-chunks
    let chunkVariationsResult = exportChunksVariations(variationList);

    countTotalVariations += chunkVariationsResult.variationCount;
    logger.info(
        'Result of Variation Export per jobs chunk:\n' +
            'Variants Lists Exported: {0},\nNumber of API calls for upsert variations: {1},\n' +
            'Total variations in scope of chunk exported: {2}',
        chunkVariationsResult.variationListCount,
        chunkVariationsResult.apiCallsCount,
        chunkVariationsResult.variationCount,
    );

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
    const readWholeCatalogue = success === true;
    logger.info(
        'Product export finished. Total product hits processed: {0}, total variations: {1}',
        countProcessed,
        countTotalVariations,
    );
    logger.info(
        'Product export summary. Mode: {0}, previous run: {1}, products sent: {2}, ' +
            'variations sent in full: {3}, variations sent with price and stock only: {4}, ' +
            'variation API calls: {5}, failed variation API calls: {6}, variations rejected by Cloudshelf: {7}',
        jobMode,
        lastRunDate ? lastRunDate.toISOString() : 'none',
        countProductsSent,
        countVariantsFull,
        countVariantsPriceAndStockOnly,
        countVariantApiCalls,
        countVariantApiCallsFailed,
        countVariantsRejected,
    );

    if (!readWholeCatalogue) {
        // What was not read is not known to be gone, and the changes this run missed must not be skipped next time
        logger.error(
            'Product export stopped on an error after {0} product hits, before reading the whole catalogue. ' +
                'See the error in the job log. Nothing is removed from Cloudshelf, and the next delta export ' +
                'starts from the previous run again.',
            countProcessed,
        );
        cloudshelfHelper.reportSyncStatus(
            'FAILED',
            'The product export stopped on an error after ' +
                countProcessed +
                ' products. See the job log in Salesforce Business Manager.',
        );
    } else if (jobMode === 'FULL') {
        const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
        cloudshelfRemovalHelper.removeMissing(
            new CloudshelfApiModel(),
            { products: knownProductIds, variants: knownVariantIds },
            removeMissingMode,
        );
    }

    if (readWholeCatalogue) {
        const problems = countVariantApiCallsFailed + countVariantsRejected;
        cloudshelfHelper.reportSyncStatus(
            'PROCESS_PRODUCT_GROUPS',
            problems
                ? countVariantsRejected +
                      ' variations were rejected by Cloudshelf and ' +
                      countVariantApiCallsFailed +
                      ' requests failed during the product export. See the custom-cloudshelf log in Salesforce.'
                : undefined,
        );
    }

    exportProductGroups();

    cloudshelfHelper.createDefaultThemeIfNotExist();
    cloudshelfHelper.createDefaultCloudshelfIfNotExist();

    if (readWholeCatalogue) {
        jobsUtils.updateLastRunDate(jobStep, runDate);
    }

    return;
};
