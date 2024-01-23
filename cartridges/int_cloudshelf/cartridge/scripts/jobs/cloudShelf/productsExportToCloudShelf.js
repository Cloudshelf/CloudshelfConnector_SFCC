'use strict';

/**
 * Job Step Type 
 */

const Status = require('dw/system/Status');
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Transaction = require('dw/system/Transaction');
const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('~/cartridge/scripts/helpers/cloudshelfHelper');
const cloudshelfHttpGraphQL = require('~/cartridge/scripts/services/cloudshelfHttpGraphQL');
const cloudshelfGraphQueries = require('~/cartridge/scripts/graphql/cloudshelfGraphqlQueries');
const logger = cloudshelfHelper.getLogger();
const jobStep = 'custom.int_cloudshelf.ProductExport';
let runDate;
let countProcessed = 0;
let totalCount;
let products;
let jobMode;
let lastRunCustomObj;
let lastRunDate;

exports.beforeStep = function (params) {
    runDate = new Date();
    jobMode = params.jobMode;
    lastRunCustomObj = CustomObjectMgr.getCustomObject('JobsData', jobStep);
    lastRunDate = lastRunCustomObj.custom.lastRun;

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
 * @returns {?dw.order.Order} - API order
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
    let chunkCount = 0;
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

    let ff = cloudshelfApi.upsertProducts(productList);
    logger.info('Result of Chunk Export - Chunk processed. Chunks Exported: {0}', ++chunkCount);
    

    if (variationList.length) {
        variationList.forEach(element => {
            let zzz = cloudshelfApi.upsertProductVariants(element);
            zzz
            logger.info('Result of Variation Export - Variant processed. Variants Exported: {0}', ++variationCount);
        });
    }
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
        let product = new ProductModel(productSearchHit, lastRunDate, jobMode);
        let variations = new ProductVariantsModel(productSearchHit, lastRunDate, jobMode);
        countProcessed++
        logger.info('processProductExportJob : {0}', countProcessed);
        return {
            product: product,
            variations: variations
        }
    }
};

exports.afterStep = function () {//Categories
    /* TODO Categories
    category = apiProductSearch.getCategory(); */
    Transaction.wrap(function () {
        CustomObjectMgr.remove(lastRunCustomObj);
        let object = CustomObjectMgr.createCustomObject('JobsData', jobStep);
        object.custom.lastRun = runDate;
    })

    return undefined;
}
