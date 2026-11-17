'use strict';

const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

// SFCC stops a script whose array holds more than 20,000 items (quota api.jsArraySize). A category's products
// include those of its subcategories, so a category near the top of a large catalogue has more than that.
// They are kept, and sent to Cloudshelf, as batches. A batch is one request, and SFCC also limits a string to
// 1,000,000 characters, so a batch stays well below both. A category that fits in one batch is replaced in a
// single request, as it always was.
const PRODUCTS_PER_BATCH = 5000;

/**
 * Searches for the products assigned to a category or to its subcategories
 * @param {dw.catalog.Category} category - a category object
 * @returns {dw.util.Iterator} product search hits
 * @private
 */
function searchProducts(category) {
    const apiProductSearch = new ProductSearchModel();
    apiProductSearch.setCategoryID(category.ID);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();
    return apiProductSearch.getProductSearchHits();
}

/**
 * Returns the ids of the products assigned to a category, in batches
 * @param {dw.catalog.Category} category - a category object
 * @returns {Object} batches, an array of arrays of cloudshelf global product ids, and count, how many ids there are
 * @private
 */
function getProducts(category) {
    const batches = [];
    let count = 0;
    const hits = searchProducts(category);
    while (hits.hasNext()) {
        let hit = hits.next();
        let globalId = cloudshelfHelper.getGlobalId(
            cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT,
            hit.representedProducts.length > 1 ? hit.productID : hit.product.ID + 'M',
        );
        let batch = batches[batches.length - 1];
        if (!batch || batch.length >= PRODUCTS_PER_BATCH) {
            batch = [];
            batches.push(batch);
        }
        batch.push(globalId);
        count++;
    }
    return { batches: batches, count: count };
}

/**
 * @constructor
 * Cloudshelf ProductsInProductGroup model
 * object should be used for assigning products to product group cloudshelf api request
 * @param {dw.catalog.Category} category - a category object
 */
function ProductsInProductGroup(category) {
    if (category) {
        const products = getProducts(category);
        this.productGroupId = cloudshelfHelper.getGlobalId(
            cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT_GROUP,
            category.ID,
        );
        this.productIdBatches = products.batches;
        this.productCount = products.count;
    }
}

/**
 * Tells whether a category has products, without collecting them
 * @param {dw.catalog.Category} category - a category object
 * @returns {boolean} true if the category or one of its subcategories has a product
 */
ProductsInProductGroup.hasProducts = function (category) {
    return !!category && searchProducts(category).hasNext();
};

/**
 * Sends one batch of a category's products to Cloudshelf
 * @param {Object} cloudshelfApi - cloudshelf API model
 * @param {string} productGroupId - global id of the product group
 * @param {Array} productIds - global ids of the products in the batch
 * @param {boolean} replace - true to replace the products Cloudshelf holds for the category, false to add to them
 * @returns {boolean} true if Cloudshelf accepted the batch
 * @private
 */
function sendBatch(cloudshelfApi, productGroupId, productIds, replace) {
    const response = replace
        ? cloudshelfApi.updateProductsInProductGroup(productGroupId, productIds)
        : cloudshelfApi.addProductsToProductGroup(productGroupId, productIds);
    return !!response && !!(replace ? response.updateProductsInProductGroup : response.addProductsToProductGroup);
}

/**
 * Sends a category's products to Cloudshelf, a batch at a time.
 * The first batch replaces the products Cloudshelf holds for the category and the rest are added to it.
 * @param {Object} cloudshelfApi - cloudshelf API model
 * @param {ProductsInProductGroup} productsInProductGroup - the category's products
 * @returns {Object} batches, how many batches there were, and failedBatches, how many Cloudshelf did not accept
 */
ProductsInProductGroup.assign = function (cloudshelfApi, productsInProductGroup) {
    const result = { batches: 0, failedBatches: 0 };
    productsInProductGroup.productIdBatches.forEach(function (productIds, index) {
        const replace = index === 0;
        // A batch that was refused is sent once more. Sending one that did arrive again changes nothing.
        const accepted =
            sendBatch(cloudshelfApi, productsInProductGroup.productGroupId, productIds, replace) ||
            sendBatch(cloudshelfApi, productsInProductGroup.productGroupId, productIds, replace);
        result.batches++;
        if (!accepted) {
            result.failedBatches++;
        }
    });
    return result;
};

ProductsInProductGroup.PRODUCTS_PER_BATCH = PRODUCTS_PER_BATCH;

module.exports = ProductsInProductGroup;
