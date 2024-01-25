'use strict';

/**
 * Job Step Type 
 */

const Status = require('dw/system/Status');
const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('~/cartridge/scripts/helpers/cloudshelfHelper');
const jobsUtils = require('~/cartridge/scripts/utils/jobsUtils');
const logger = cloudshelfHelper.getLogger();
const jobStep = 'custom.int_cloudshelf.ProductExport';
let runDate;
let countProcessed = 0;
let countTotalVariations = 0;
let totalCount;
let products;
let jobMode;
let lastRunDate;
let rootCategory;
let categoriesCounter = 0;
let chunkCount = 0;

/**
 * Job's private methods
 */

/**
 * Returns true if upsert product response is successful
 */
function isUpsertProductSuccess(upsertProductResult) {
    return upsertProductResult && upsertProductResult.upsertProducts
            && upsertProductResult.upsertProducts.products && upsertProductResult.upsertProducts.products.length;
}

/**
 * Returns true if upsert variants response is successful
 */
function isUpsertVariantsSuccess(upsertVariantsResult) {
    return upsertVariantsResult && upsertVariantsResult.upsertProductVariants
            && upsertVariantsResult.upsertProductVariants.productVariants
            && upsertVariantsResult.upsertProductVariants.productVariants.length;
}

/**
 * Returns true if upsert product groups response is successful
 */
function isUpsertProductGroupsSuccess(upsertProductGroupsResult) {
    return upsertProductGroupsResult && upsertProductGroupsResult.upsertProductGroups
            && upsertProductGroupsResult.upsertProductGroups.productGroups
            && upsertProductGroupsResult.upsertProductGroups.productGroups.length;
}

/**
 * Returns true if Update Products In Product Group response is successful
 */
function isUpdateProductsInProductGroupResultSuccess(updateProductsInProductGroupResult) {
    return updateProductsInProductGroupResult && updateProductsInProductGroupResult.updateProductsInProductGroup;
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
            ++variationListCount;

            // call API for export in case of threshold length is reached or it is last loop iteration 
            if (variationChunkToExportLength > thresholdLength || index === (variationList.length - 1)) {
                apiCallsCount++;
                let upsertVariantsResult = cloudshelfApi.upsertProductVariants(variationChunkToExport);
                if (isUpsertVariantsSuccess(upsertVariantsResult)) {
                    logger.info(
                        'Upsert Variation API call successful. Variations number exported: {0}, variations lists: {1}',
                        variationChunkToExportLength,
                        variationChunkToExport.length
                    );
                } else {
                    logger.info(
                        'Upsert Variation API call failure. Variations number not exported: {0}, variations lists: {1}',
                        variationChunkToExportLength,
                        variationChunkToExport.length
                    );
                }

                // reset chunk and move to next one
                variationChunkToExport = [];
                variationChunkToExportLength = 0;
            }
        });
    }

    return {
        variationCount: variationCount,
        variationListCount: variationListCount,
        apiCallsCount: apiCallsCount
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
        productsInProductGroup: []
    };
    if (!category.isRoot()) {
        const ProductGroupModel = require('*/cartridge/models/cloudshelf/productGroup');
        const ProductsInProductGroup =  require('*/cartridge/models/cloudshelf/productsInProductGroup');

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
        category.getOnlineSubCategories().toArray().forEach(function (subCategory) {
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
        let dataToExport = exportData.productGroups.slice(processedNumber, (processedNumber + exportPerStep));
        let upsertProductGroupsResult = cloudshelfApi.upsertProductGroups(dataToExport);
        if (isUpsertProductGroupsSuccess(upsertProductGroupsResult)) {
            logger.info('UpsertProductGroups API call successful, Categories number exported: {0}', dataToExport.length);
        } else {
            logger.info('UpsertProductGroups API call failure, Categories number not exported: {0}', dataToExport.length);
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
                productsInProductGroup.productIds.length
            );
        } else {
            logger.info('UpdateProductsInProductGroup API call failure, Category id: {0}',productsInProductGroup.productGroupId);
        }
        
    })

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

    cloudshelfHelper.createDefaultThemeIfNotExist();
    cloudshelfHelper.createDefaultCloudshelfIfNotExist();

    const cgid = 'root';
    if (!cgid) {
        return new Status(Status.ERROR, 'ERROR', 'CategoryID is not set.');
    }
    const apiProductSearch = new ProductSearchModel();
    apiProductSearch.setCategoryID(cgid);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();
    products = apiProductSearch.getProductSearchHits();
    rootCategory = apiProductSearch.getCategory();
    totalCount = apiProductSearch.getCount();
    return products;
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
 * @returns {dw.catalog.ProductSearchHit} - API ProductSearchHit
 */
exports.read = function () {
    if (products.hasNext()) {
        return products.next();
    }

    return undefined;
};

/**
 * Triggers upsert product API call for a chunk
 * Process variations for each product from chunk and triggers API calls for upsert variations
 */
exports.write = function (products) {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const cloudshelfApi = new CloudshelfApiModel();
    let productList = [];
    let variationList = [];
    products.toArray().forEach(product => {
        if (Object.keys(product.product).length) {
            productList.push(product.product);
        }
        if (Object.keys(product.variations).length) {
            variationList.push(product.variations);
        }
    });

    let upsertProductResult = cloudshelfApi.upsertProducts(productList);
    if (isUpsertProductSuccess(upsertProductResult)) {
        logger.info('Result of Chunk Export - Chunk number {0} processed. Products Exported successfully: {1}', ++chunkCount, productList.length);
    } else {
        logger.info('Result of Chunk Export - Chunk number {0} processed. Products Export API call failure: {1}', ++chunkCount, productList.length);
    }
    
    // process chunk variations by sub-chunks
    let chunkVariationsResult = exportChunksVariations(variationList);
    
    countTotalVariations += chunkVariationsResult.variationCount;
    logger.info(
        'Result of Variation Export per jobs chunk:\n' + 
        'Variants Lists Exported: {0},\nNumber of API calls for upsert variations: {1},\n' +
        'Total variations in scope of chunk exported: {2}',
        chunkVariationsResult.variationListCount, chunkVariationsResult.apiCallsCount, chunkVariationsResult.variationCount);

    return;
};

/**
 * Process each product hit individually
 * Returns cloudshelf models for export based on product hit information
 * @param {dw.catalog.ProductSearchHit} productSearchHit
 * @returns {Object} - obj Product + Variaitons
 */
exports.process = function (productSearchHit) {
    if (productSearchHit && !productSearchHit.product.bundle && !productSearchHit.product.productSet && !productSearchHit.product.optionProduct) {
        const ProductModel = require('*/cartridge/models/cloudshelf/cloudshelfProductModel');
        const ProductVariantsModel = require('*/cartridge/models/cloudshelf/cloudshelfProductVariantsModel');
        let deltaDate = (jobMode === 'DELTA') ? lastRunDate : null;
        let product = (jobMode !== 'DELTA' || productSearchHit.product.lastModified > lastRunDate) ? new ProductModel(productSearchHit) : {};
        let variations = new ProductVariantsModel(productSearchHit, deltaDate);
        ++countProcessed;
        return {
            product: product,
            variations: variations
        }
    }
};

/**
 * Triggers categories export to cloudshelf
 */
exports.afterStep = function () {
    logger.info('Product export finished. Total product hits processed: {0}, total variations: {1}', countProcessed, countTotalVariations);
    exportProductGroups();
    jobsUtils.updateLastRunDate(jobStep, runDate);

    return;
}
