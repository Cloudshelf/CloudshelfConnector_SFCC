'use strict';

const Status = require('dw/system/Status');
const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('~/cartridge/scripts/helpers/cloudshelfHelper');
const logger = cloudshelfHelper.getLogger();

/**
 * Safely mark an identifier as seen.
 * @param {Object} map - lookup object
 * @param {string} id - identifier to track
 * @returns {boolean} true when the id was not seen before
 */
function trackUnique(map, id) {
    if (!id) {
        return false;
    }
    if (!Object.prototype.hasOwnProperty.call(map, id)) {
        map[id] = true;
        return true;
    }
    return false;
}

/**
 * Build a recursive product search rooted at the supplied category id.
 * @param {string} categoryId - root category id
 * @returns {{hits: dw.util.Iterator, rootCategory: dw.catalog.Category, totalCount: number}} search data
 */
function buildProductSearch(categoryId) {
    const search = new ProductSearchModel();
    search.setCategoryID(categoryId);
    search.setRecursiveCategorySearch(true);
    search.search();

    return {
        hits: search.getProductSearchHits(),
        rootCategory: search.getCategory(),
        totalCount: search.getCount(),
    };
}

/**
 * Determine if a product search hit should be considered for export.
 * @param {dw.catalog.ProductSearchHit} productSearchHit - product search hit
 * @returns {boolean} true when the product is eligible
 */
function isEligibleProduct(productSearchHit) {
    if (!productSearchHit || !productSearchHit.product) {
        return false;
    }
    const product = productSearchHit.product;
    return !product.bundle && !product.productSet && !product.optionProduct;
}

/**
 * Gather product, variant, and image counts using the existing cartridge models.
 * @param {dw.util.Iterator} productSearchHits - iterator of product search hits
 * @returns {{products: number, variants: number, images: number}} stats object
 */
function collectProductStats(productSearchHits) {
    const ProductModel = require('*/cartridge/models/cloudshelf/cloudshelfProductModel');
    const ProductVariantsModel = require('*/cartridge/models/cloudshelf/cloudshelfProductVariantsModel');

    const seenProducts = Object.create(null);
    const seenVariants = Object.create(null);

    let productsCount = 0;
    let variantsCount = 0;
    let imagesCount = 0;

    while (productSearchHits.hasNext()) {
        const hit = productSearchHits.next();
        if (!isEligibleProduct(hit)) {
            continue;
        }

        const productModel = new ProductModel(hit);
        if (productModel && Object.keys(productModel).length && trackUnique(seenProducts, productModel.id)) {
            productsCount++;
        }

        const variantsModel = new ProductVariantsModel(hit, null);
        if (variantsModel && variantsModel.variants && variantsModel.variants.length) {
            variantsModel.variants.forEach(function (variant) {
                if (trackUnique(seenVariants, variant.id)) {
                    variantsCount++;
                    if (variant.metaimages && variant.metaimages.length) {
                        imagesCount += variant.metaimages.length;
                    }
                }
            });
        }
    }

    return {
        products: productsCount,
        variants: variantsCount,
        images: imagesCount,
    };
}

/**
 * Recursively count online categories that would be exported as product groups.
 * @param {dw.catalog.Category} category - root category
 * @returns {number} count of product groups
 */
function collectProductGroupCount(category) {
    if (!category) {
        return 0;
    }

    const ProductsInProductGroup = require('*/cartridge/models/cloudshelf/productsInProductGroup');

    let count = 0;

    function traverse(currentCategory) {
        if (!currentCategory) {
            return;
        }

        if (!currentCategory.isRoot()) {
            const productsInGroup = new ProductsInProductGroup(currentCategory);
            if (productsInGroup.productIds && productsInGroup.productIds.length) {
                count++;
            }
        }

        if (currentCategory.hasOnlineSubCategories()) {
            const subCategories = currentCategory.getOnlineSubCategories().toArray();
            for (let i = 0; i < subCategories.length; i++) {
                traverse(subCategories[i]);
            }
        }
    }

    traverse(category);
    return count;
}

/**
 * Build the payload consumed by the Cloudshelf reportCatalogStats mutation.
 * @param {Object} stats - computed stats
 * @param {boolean|null} retailerClosed - optional retailer closed flag
 * @returns {Object} mutation payload
 */
function buildPayload(stats, retailerClosed) {
    const payload = {
        knownNumberOfImages: stats.images,
        knownNumberOfProductGroups: stats.productGroups,
        knownNumberOfProductVariants: stats.variants,
        knownNumberOfProducts: stats.products,
    };

    if (retailerClosed !== null && retailerClosed !== undefined) {
        payload.retailerClosed = retailerClosed;
    }

    return payload;
}

/**
 * Convert a job parameter into a boolean when possible.
 * @param {*} value - incoming parameter value
 * @returns {boolean|null} coerced boolean or null when not provided
 */
function resolveBooleanParam(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        return value.toLowerCase() === 'true';
    }

    return Boolean(value);
}

/**
 * Job entry point.
 * @param {Object} params - job parameters
 * @returns {dw.system.Status} job status
 */
module.exports.execute = function (params) {
    const categoryId = params && params.categoryID ? params.categoryID : 'root';
    const hasRetailerClosedParam = params && Object.prototype.hasOwnProperty.call(params, 'retailerClosed');
    const retailerClosed = resolveBooleanParam(hasRetailerClosedParam ? params.retailerClosed : null);

    const searchData = buildProductSearch(categoryId);
    if (!searchData.rootCategory) {
        logger.error('Unable to resolve root category for id {0}', categoryId);
        return new Status(Status.ERROR, 'NO_CATEGORY', 'Root category could not be resolved.');
    }

    logger.info(
        'Starting catalog stats collection for category {0}. Total product hits discovered: {1}',
        categoryId,
        searchData.totalCount,
    );

    const productStats = collectProductStats(searchData.hits);
    const productGroupCount = collectProductGroupCount(searchData.rootCategory);

    const stats = {
        products: productStats.products,
        variants: productStats.variants,
        images: productStats.images,
        productGroups: productGroupCount,
    };

    const payload = buildPayload(stats, retailerClosed);
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const api = new CloudshelfApiModel();
    const response = api.reportCatalogStats(payload);

    if (response) {
        logger.info(
            'Submitted reportCatalogStats mutation with payload: products={0}, variants={1}, images={2}, product groups={3}, retailerClosed={4}',
            payload.knownNumberOfProducts,
            payload.knownNumberOfProductVariants,
            payload.knownNumberOfImages,
            payload.knownNumberOfProductGroups,
            payload.retailerClosed,
        );
    } else {
        logger.error('reportCatalogStats mutation failed or returned no data.');
        return new Status(Status.ERROR, 'REPORT_CATALOG_STATS_FAILED', 'Cloudshelf API did not return a response.');
    }

    return new Status(Status.OK);
};
