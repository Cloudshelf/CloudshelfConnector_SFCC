"use strict";

/**
 * Job Step Type 
 */

const Status = require("dw/system/Status");
const ProductSearchModel = require("dw/catalog/ProductSearchModel");
const cloudshelfHelper = require("~/cartridge/scripts/helpers/cloudshelfHelper");
const cloudshelfHttpGraphQL = require("~/cartridge/scripts/services/cloudshelfHttpGraphQL");
const cloudshelfGraphQueries = require("~/cartridge/scripts/graphql/cloudshelfGraphqlQueries");
const logger = cloudshelfHelper.getLogger();

let countProcessed = 0;
let products;

exports.beforeStep = function (params) {
    const cgid = 'root';
    if (!cgid) {
        return new Status(Status.ERROR, 'ERROR', 'CategoryID is not set.');
    }
    const apiProductSearch = new ProductSearchModel();
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
    return true;
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
    products.toArray().forEach(product => {
        if (Object.keys(product.product).length) {
            productList.push(product.product);
            logger.info('Result of Variation Export - Variant processed. Variants Exported + {0}', ++variationCount);
            cloudshelfApi.upsertProductVariants(product.variations);
        }
    });
    logger.info('Result of Chunk Export - Chunk processed. Chunks Exported + {0}', ++chunkCount);
    cloudshelfApi.upsertProducts(productList);
    return;
};

/**
 *
 * returns Cloudshelf ProductHit
 * @param {dw.catalog.ProductSearchHit} productSearchHit
 * @returns {*} - obj Job Status
 */
exports.process = function (productSearchHit) {
    if (productSearchHit) {
        const ProductModel = require('*/cartridge/models/cloudshelf/cloudshelfProductModel');
        const ProductVariantsModel = require('*/cartridge/models/cloudshelf/cloudshelfProductVariantsModel');
        let product = new ProductModel(productSearchHit);
        let variations = new ProductVariantsModel(productSearchHit);
        countProcessed++
        logger.info('processProductExportJob : {0}', countProcessed);
        return {
            product: product,
            variations: variations
        }

    }
};
