'use strict';

const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * Returns product ids that assigned to category
 * @param {dw.catalog.Category} category - a category objects
 * @returns {Array} array of product ids
 * @private
 */
function getProducts(category) {
    const result = [];
    const apiProductSearch = new ProductSearchModel();
    apiProductSearch.setCategoryID(category.ID);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();
    const hits = apiProductSearch.getProductSearchHits();
    while (hits.hasNext()) {
        let hit = hits.next();
        let globalId = cloudshelfHelper.getGlobalId(
            cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT,
            hit.productID
        );
        result.push(globalId);
    }
    return result;
}

/**
 * @constructor
 * @classdesc The ClaudShelf ProductsInProductGroup model
 * @param {dw.catalog.Category} category - a category objects
 */
function ProductsInProductGroup(category) {
    if (category) {
        this.productGroupId = cloudshelfHelper.getGlobalId(
            cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT_GROUP,
            category.ID
        );
        this.productIds = getProducts(category);
    }
}

module.exports = ProductsInProductGroup;
