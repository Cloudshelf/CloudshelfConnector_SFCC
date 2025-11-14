'use strict';

const Status = require('dw/system/Status');
const ProductSearchModel = require('dw/catalog/ProductSearchModel');
const cloudshelfHelper = require('~/cartridge/scripts/helpers/cloudshelfHelper');
const logger = cloudshelfHelper.getLogger();

// Module-level variables to track state across chunk iterations
let productSearchHits;
let rootCategory;
let totalCount;
let categoryID;
let retailerClosed;

// Direct counters - ProductSearchModel returns unique masters, so we just count
let totalProducts = 0;
let totalVariants = 0;
let totalImages = 0;
let processedHits = 0;

/**
 * Count product groups (categories) that would be exported
 */
function countProductGroups(category) {
    if (!category) {
        return 0;
    }

    const ProductsInProductGroup = require('*/cartridge/models/cloudshelf/productsInProductGroup');
    let count = 0;

    function traverse(cat) {
        if (!cat) {
            return;
        }

        if (!cat.isRoot()) {
            const productsInGroup = new ProductsInProductGroup(cat);
            if (productsInGroup.productIds && productsInGroup.productIds.length) {
                count++;
            }
        }

        if (cat.hasOnlineSubCategories()) {
            const subCategories = cat.getOnlineSubCategories().toArray();
            for (let i = 0; i < subCategories.length; i++) {
                traverse(subCategories[i]);
            }
        }
    }

    traverse(category);
    return count;
}

/**
 * Initialize the product search before processing chunks
 */
exports.beforeStep = function (params) {
    categoryID = params && params.categoryID ? params.categoryID : 'root';
    retailerClosed = params && params.retailerClosed !== undefined ? params.retailerClosed : null;

    const apiProductSearch = new ProductSearchModel();
    apiProductSearch.setCategoryID(categoryID);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();

    productSearchHits = apiProductSearch.getProductSearchHits();
    rootCategory = apiProductSearch.getCategory();
    totalCount = apiProductSearch.getCount();

    logger.info('Starting catalog stats collection for category {0}. Total product hits: {1}', categoryID, totalCount);

    return productSearchHits;
};

/**
 * Return total number of hits
 */
exports.getTotalCount = function () {
    return totalCount;
};

/**
 * Read next product hit (framework manages iteration)
 */
exports.read = function () {
    if (productSearchHits.hasNext()) {
        return productSearchHits.next();
    }
    return undefined;
};

/**
 * Process each hit - filter and count directly
 * ProductSearchModel returns unique masters, so we just count without tracking IDs
 */
exports.process = function (hit) {
    // Apply EXACT same filter as export job
    if (hit && !hit.product.bundle && !hit.product.productSet && !hit.product.optionProduct) {
        // Count this product (search returns unique masters)
        totalProducts++;

        // Count variants and images
        const representedProducts = hit.representedProducts.toArray();

        representedProducts.forEach(function (variation) {
            // Count this variant
            totalVariants++;

            // Count images using same logic as VariationModel.getImages
            const images = variation.getImages('large');
            if (images) {
                totalImages += images.toArray().length;
            }
        });

        // Return dummy object just to signal success
        return { processed: true };
    }

    return null;
};

/**
 * Write chunk - just count processed items (all counting happens in process())
 */
exports.write = function (items) {
    const itemsArray = items.toArray();

    // Just count how many items were processed
    for (let i = 0; i < itemsArray.length; i++) {
        if (itemsArray[i]) {
            processedHits++;
        }
    }

    return;
};

/**
 * After all chunks processed - count product groups and report stats to Cloudshelf
 */
exports.afterStep = function () {
    const productGroupCount = countProductGroups(rootCategory);

    logger.info('=== CATALOG STATS SUMMARY ===');
    logger.info('Total search hits: {0}', totalCount);
    logger.info('Processed hits (after filtering): {0}', processedHits);
    logger.info('Total products: {0}', totalProducts);
    logger.info('Total variants: {0}', totalVariants);
    logger.info('Total images: {0}', totalImages);
    logger.info('Product groups: {0}', productGroupCount);
    logger.info('============================');

    // Submit stats to Cloudshelf
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const api = new CloudshelfApiModel();
    const payload = {
        knownNumberOfProducts: totalProducts,
        knownNumberOfProductVariants: totalVariants,
        knownNumberOfImages: totalImages,
        knownNumberOfProductGroups: productGroupCount
    };

    if (retailerClosed !== null) {
        payload.retailerClosed = retailerClosed;
    }

    const result = api.reportCatalogStats(payload);

    if (result) {
        logger.info('Successfully reported catalog stats to Cloudshelf');
        return new Status(Status.OK, 'STATS_REPORTED', 'Catalog stats collected and reported successfully.');
    } else {
        logger.error('Failed to report catalog stats to Cloudshelf');
        return new Status(Status.ERROR, 'STATS_REPORT_FAILED', 'Failed to report catalog stats to Cloudshelf.');
    }
};
