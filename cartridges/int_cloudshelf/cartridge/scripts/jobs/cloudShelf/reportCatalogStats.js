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

// Counters - matching the export job's deduplication logic
let totalProducts = 0;
let totalVariants = 0;
let totalImages = 0;
let processedHits = 0;

// Track unique IDs globally across all chunks to match export job behavior
let uniqueProductIds = [];
let uniqueVariantIds = [];

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

    // Reset counters and tracking arrays for fresh run
    totalProducts = 0;
    totalVariants = 0;
    totalImages = 0;
    processedHits = 0;
    uniqueProductIds = [];
    uniqueVariantIds = [];

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
 * Process each hit - filter and return data for deduplication in write()
 * Matches the export job's process() function filter logic
 */
exports.process = function (hit) {
    // Apply EXACT same filter as export job
    if (hit && !hit.product.bundle && !hit.product.productSet && !hit.product.optionProduct) {
        // Generate product ID using same logic as cloudshelfProductModel
        const representedProducts = hit.representedProducts.toArray();
        const productId = representedProducts.length > 1
            ? cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, hit.product.ID)
            : cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, hit.product.ID + 'M');

        // Build variant data with IDs and image counts
        const variants = [];
        representedProducts.forEach(function (variation) {
            const variantId = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.VARIANT, variation.ID);
            const images = variation.getImages('large');
            const imageCount = images ? images.toArray().length : 0;

            variants.push({
                id: variantId,
                imageCount: imageCount
            });
        });

        return {
            productId: productId,
            variants: variants
        };
    }

    return null;
};

/**
 * Write chunk - perform deduplication matching the export job's write() function
 * This ensures counts match what is actually exported
 */
exports.write = function (items) {
    const itemsArray = items.toArray();

    itemsArray.forEach(function (item) {
        if (!item) {
            return;
        }

        processedHits++;

        // Deduplicate products - same logic as export job's write()
        if (uniqueProductIds.indexOf(item.productId) === -1) {
            totalProducts++;
            uniqueProductIds.push(item.productId);
        }

        // Deduplicate variants and count images - same logic as export job's write()
        item.variants.forEach(function (variant) {
            if (uniqueVariantIds.indexOf(variant.id) === -1) {
                totalVariants++;
                totalImages += variant.imageCount;
                uniqueVariantIds.push(variant.id);
            }
        });
    });

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
