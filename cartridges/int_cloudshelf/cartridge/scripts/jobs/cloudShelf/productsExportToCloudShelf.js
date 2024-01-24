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
let totalCount;
let products;
let jobMode;
let lastRunDate;
let rootCategory;
let categoriesCounter = 0;
let chunkCount = 0;


/**
 * Triger export of category and products to category assignment to cloudshelf
 * @param {dw.catalog.Category} category - dw category
 */
function exportCategory(category) {
    if (!category.isRoot()) {
        const ProductGroupModel = require('*/cartridge/models/cloudshelf/productGroup');
        const ProductsInProductGroup =  require('*/cartridge/models/cloudshelf/productsInProductGroup');
        const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');

        let cloudshelfApi = new CloudshelfApiModel();
        let productGroup = new ProductGroupModel(category);
        let productsInProductGroup = new ProductsInProductGroup(category);
        cloudshelfApi.upsertProductGroups([productGroup]);
        cloudshelfApi.updateProductsInProductGroup(productsInProductGroup);
        categoriesCounter++;
    }
    if (category.hasOnlineSubCategories()) {
        category.getOnlineSubCategories().toArray().forEach(function (subCategory) {
            exportCategory(subCategory);
        });
    }
}

/**
 * Triggers process of product groups (categories) export
 */
function exportProductGroups() {
    logger.info('Starting Export of Product Groups');
    exportCategory(rootCategory);
    logger.info('Finish Export of Product Groups, total number exported: {0}', categoriesCounter);
}

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
    totalCount = apiProductSearch.getCount();
    apiProductSearch.setCategoryID(cgid);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();
    products = apiProductSearch.getProductSearchHits();
    rootCategory = apiProductSearch.getCategory();
    return products;
};

/**
 * Returns the total number of items that are available.
 *
 * @returns {number}
 */
exports.getTotalCount = function () {
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

exports.write = function (products) {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const cloudshelfApi = new CloudshelfApiModel();
    let variationCount = 0;
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

    cloudshelfApi.upsertProducts(productList);
    logger.info('Result of Chunk Export - Chunk number {0} processed. Products Exported: {1}', ++chunkCount, productList.length);


    if (variationList.length) {
        variationList.forEach(element => {
            cloudshelfApi.upsertProductVariants([element]);
            ++variationCount;
        });
    }
    logger.info('Result of Variation Export - Variant processed. Variants Lists Exported: {0}', variationCount);
    return;
};

/**
 *
 * returns Cloudshelf ProductHit
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

exports.afterStep = function () {
    logger.info('Product export finished. Total product hits processed : {0}', countProcessed);
    exportProductGroups();
    jobsUtils.updateLastRunDate(jobStep, runDate);

    return;
}
