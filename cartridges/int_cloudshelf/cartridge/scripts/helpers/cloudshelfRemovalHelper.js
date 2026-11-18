'use strict';

/**
 * Removes from Cloudshelf the products and variations a full export no longer
 * found in SFCC.
 *
 * An export only ever adds and updates, so a product taken offline or deleted
 * in SFCC, or a variation dropped from its master, would otherwise stay in
 * Cloudshelf with its last price and stock. After a full export has read the
 * whole catalogue, everything Cloudshelf holds from this connector is compared
 * with what was read, and what was not read is deleted.
 *
 * Categories are handled the same way: a category deleted or taken offline in
 * SFCC is deleted from Cloudshelf, where it is a product group. A category that
 * is still online but has lost all its products is kept and emptied.
 *
 * Only products, variations and categories with this connector's global ids are
 * touched. Anything put into Cloudshelf another way is left alone.
 */

const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

const MODE_ON = 'ON';
const MODE_OFF = 'OFF';
const MODE_NO_LIMIT = 'NO_LIMIT';

const GLOBAL_ID_PREFIX = 'gid://external/';
const PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 100;
// A full export that misses most of the catalogue is far more likely to be a
// search index that was empty or rebuilding than a retailer deleting their range
const MAX_SHARE_OF_PRODUCTS_REMOVED = 0.5;
// The same goes for categories: losing most of them at once points at the export, not at the retailer
const MAX_SHARE_OF_CATEGORIES_REMOVED = 0.5;
const MAX_KEPT_PRODUCTS_LISTED = 20;

// SFCC stops a script whose object holds more than 2,000 properties (quota
// api.jsObjectSize), so the ids of a whole catalogue cannot be the keys of one
// object. An IdSet spreads them over many small objects.
const ID_SET_BUCKETS = 1000;
const ID_SET_MAX_KEYS_PER_OBJECT = 1500;

/**
 * A set of ids that can hold a whole catalogue's worth
 * @constructor
 */
function IdSet() {
    this.buckets = [];
    this.size = 0;
}

/**
 * Returns the bucket an id belongs in
 * @param {string} id - id
 * @returns {number} bucket index
 */
function getBucketIndex(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) % 1000003;
    }
    return hash % ID_SET_BUCKETS;
}

/**
 * @param {string} id - id
 * @returns {boolean} true if the id is in the set
 */
IdSet.prototype.has = function (id) {
    const parts = this.buckets[getBucketIndex(id)];
    if (!parts) {
        return false;
    }
    for (let i = 0; i < parts.length; i++) {
        if (Object.prototype.hasOwnProperty.call(parts[i].ids, id)) {
            return true;
        }
    }
    return false;
};

/**
 * @param {string} id - id
 * @returns {boolean} true if the id was added, false if the set already had it
 */
IdSet.prototype.add = function (id) {
    if (this.has(id)) {
        return false;
    }
    const index = getBucketIndex(id);
    if (!this.buckets[index]) {
        this.buckets[index] = [];
    }
    const parts = this.buckets[index];
    let part = parts[parts.length - 1];
    if (!part || part.count >= ID_SET_MAX_KEYS_PER_OBJECT) {
        part = { ids: {}, count: 0 };
        parts.push(part);
    }
    part.ids[id] = true;
    part.count++;
    this.size++;
    return true;
};

/**
 * Adds an id to a list kept as batches, so that no array grows past a batch
 * @param {Array} batches - array of arrays of ids
 * @param {string} id - id
 */
function addToBatches(batches, id) {
    let batch = batches[batches.length - 1];
    if (!batch || batch.length >= DELETE_BATCH_SIZE) {
        batch = [];
        batches.push(batch);
    }
    batch.push(id);
}

/**
 * Returns the removal mode a job parameter asks for
 * @param {string} parameter - the job step's removeMissing parameter
 * @returns {string} ON (the default), OFF or NO_LIMIT
 */
function getMode(parameter) {
    const value = String(parameter || '').toUpperCase();
    return value === MODE_OFF || value === MODE_NO_LIMIT ? value : MODE_ON;
}

/**
 * Tells whether a global id is one this connector gives entities of a kind
 * @param {string} globalId - global id Cloudshelf holds
 * @param {string} namespace - the connector's namespace for the kind
 * @returns {boolean} true if it is
 */
function isFromConnector(globalId, namespace) {
    return !!globalId && String(globalId).indexOf(GLOBAL_ID_PREFIX + namespace + '/') === 0;
}

/**
 * Reads every product Cloudshelf holds and picks out what the export did not read from SFCC
 * @param {Object} cloudshelfApi - cloudshelf API model
 * @param {Object} known - what the export read: products and variants, each an IdSet of global ids
 * @returns {Object|null} what is missing, or null when Cloudshelf could not be read to the end
 */
function findMissing(cloudshelfApi, known) {
    const namespaces = cloudshelfHelper.GLOBAL_ID_NAMESPACES;
    const result = {
        cloudshelfProducts: 0,
        connectorProducts: 0,
        missingProducts: 0,
        missingVariants: 0,
        keptProducts: 0,
        keptProductIds: [],
        productIdBatches: [],
        variantIdBatches: [],
    };
    let after = null;
    let hasNextPage = true;

    while (hasNextPage) {
        let response = cloudshelfApi.getProducts(PAGE_SIZE, after);
        if (!response || !response.products || !response.products.edges || !response.products.pageInfo) {
            return null;
        }

        response.products.edges.forEach(function (edge) {
            const product = edge.node;
            result.cloudshelfProducts++;
            if (!isFromConnector(product.platformProvidedId, namespaces.PRODUCT)) {
                return;
            }
            result.connectorProducts++;
            const variants = product.productVariants || [];
            if (!known.products.has(product.platformProvidedId)) {
                // Deleting a product deletes its variations. A product's id changes when its variations
                // shrink to one, and the variation is moved to the new product by this export's upsert. If
                // that upsert failed, the variation SFCC still has is still under the old product here.
                // A variation made in Cloudshelf itself has no id from SFCC, and is not a reason to keep it
                const holdsKnownVariant = variants.some(function (variant) {
                    return (
                        isFromConnector(variant.platformProvidedId, namespaces.VARIANT) &&
                        known.variants.has(variant.platformProvidedId)
                    );
                });
                if (!holdsKnownVariant) {
                    result.missingProducts++;
                    addToBatches(result.productIdBatches, product.platformProvidedId);
                    return;
                }
                result.keptProducts++;
                if (result.keptProductIds.length < MAX_KEPT_PRODUCTS_LISTED) {
                    result.keptProductIds.push(product.platformProvidedId);
                }
            }
            variants.forEach(function (variant) {
                if (
                    isFromConnector(variant.platformProvidedId, namespaces.VARIANT) &&
                    !known.variants.has(variant.platformProvidedId)
                ) {
                    result.missingVariants++;
                    addToBatches(result.variantIdBatches, variant.platformProvidedId);
                }
            });
        });

        hasNextPage = response.products.pageInfo.hasNextPage && response.products.edges.length > 0;
        after = response.products.pageInfo.endCursor;
    }

    return result;
}

/**
 * Deletes batches of ids and logs each batch
 * @param {Array} batches - array of arrays of global ids to delete
 * @param {number} total - how many ids there are in all
 * @param {string} kind - what the ids are, for the log
 * @param {Function} deleteBatch - deletes one batch, returns the number Cloudshelf deleted or null when the call failed
 * @param {dw.system.Log} logger - logger
 * @returns {Object} how many were deleted and how many calls failed
 */
function deleteBatches(batches, total, kind, deleteBatch, logger) {
    const result = { deleted: 0, failedCalls: 0 };
    let done = 0;

    batches.forEach(function (batch) {
        logger.info(
            'Removing {0} {1} no longer in SFCC ({2} to {3} of {4}): {5}',
            batch.length,
            kind,
            done + 1,
            done + batch.length,
            total,
            batch.join(', '),
        );
        done += batch.length;

        const deleted = deleteBatch(batch);
        if (deleted === null) {
            result.failedCalls++;
            logger.error(
                'Cloudshelf did not remove these {0} {1}. They are left for the next full export.',
                batch.length,
                kind,
            );
        } else {
            result.deleted += deleted;
            if (deleted !== batch.length) {
                logger.warn('Cloudshelf removed {0} of these {1} {2}', deleted, batch.length, kind);
            }
        }
    });
    return result;
}

/**
 * Removes from Cloudshelf what a full export did not read from SFCC.
 * Only call this after an export that read the whole catalogue: anything it did not read is taken to be gone.
 * @param {Object} cloudshelfApi - cloudshelf API model
 * @param {Object} known - what the export read: products and variants, each an IdSet of global ids
 * @param {string} mode - ON, OFF or NO_LIMIT
 * @returns {Object} summary of what was done
 */
function removeMissing(cloudshelfApi, known, mode) {
    const logger = cloudshelfHelper.getLogger();
    const summary = {
        skipped: null,
        missingProducts: 0,
        missingVariants: 0,
        keptProducts: 0,
        removedProducts: 0,
        removedVariants: 0,
        failedCalls: 0,
    };

    if (mode === MODE_OFF) {
        summary.skipped = 'the removeMissing job parameter is OFF';
        logger.info('Removal check skipped: {0}', summary.skipped);
        return summary;
    }
    if (!known.products.size) {
        // Nothing read is never a reason to empty Cloudshelf
        summary.skipped = 'this export read no products from SFCC';
        logger.warn('Removal check skipped: {0}. Nothing was removed from Cloudshelf.', summary.skipped);
        return summary;
    }

    logger.info(
        'Removal check starting. Read from SFCC by this export: {0} products, {1} variations',
        known.products.size,
        known.variants.size,
    );
    const missing = findMissing(cloudshelfApi, known);
    if (!missing) {
        summary.skipped = 'the products Cloudshelf holds could not be read';
        logger.error('Removal check skipped: {0}. Nothing was removed from Cloudshelf.', summary.skipped);
        return summary;
    }

    summary.missingProducts = missing.missingProducts;
    summary.missingVariants = missing.missingVariants;
    logger.info(
        'Removal check: Cloudshelf holds {0} products, {1} of them from this connector. ' +
            'No longer in SFCC: {2} products, and {3} variations of products that are still in SFCC.',
        missing.cloudshelfProducts,
        missing.connectorProducts,
        summary.missingProducts,
        summary.missingVariants,
    );
    summary.keptProducts = missing.keptProducts;
    if (missing.keptProducts) {
        logger.warn(
            'Kept {0} products that are no longer in SFCC: Cloudshelf still holds variations under them that ' +
                'SFCC now has under another product, and removing the product would remove those variations. ' +
                'This happens when sending the variations failed. A full export that sends them removes ' +
                'these products. First {1}: {2}',
            missing.keptProducts,
            missing.keptProductIds.length,
            missing.keptProductIds.join(', '),
        );
    }

    let productIdBatches = missing.productIdBatches;
    if (mode !== MODE_NO_LIMIT && missing.missingProducts > missing.connectorProducts * MAX_SHARE_OF_PRODUCTS_REMOVED) {
        summary.skipped = 'more than half of the products would be removed';
        logger.error(
            'Product removal skipped: {0} of the {1} products in Cloudshelf were not read from SFCC, so {2}. ' +
                'This usually means the search index was empty or being rebuilt when the export ran. ' +
                'Rebuild the index and run the export again. If the products really are gone, run the full ' +
                'export once with the removeMissing job parameter set to NO_LIMIT.',
            missing.missingProducts,
            missing.connectorProducts,
            summary.skipped,
        );
        productIdBatches = [];
    }

    const products = deleteBatches(
        productIdBatches,
        missing.missingProducts,
        'products',
        function (batch) {
            const response = cloudshelfApi.deleteProducts(batch);
            return response && response.deleteProducts && response.deleteProducts.products
                ? response.deleteProducts.products.length
                : null;
        },
        logger,
    );
    const variants = deleteBatches(
        missing.variantIdBatches,
        missing.missingVariants,
        'variations',
        function (batch) {
            const response = cloudshelfApi.deleteProductVariants(batch);
            return response && response.deleteProductVariants && response.deleteProductVariants.productVariants
                ? response.deleteProductVariants.productVariants.length
                : null;
        },
        logger,
    );

    summary.removedProducts = products.deleted;
    summary.removedVariants = variants.deleted;
    summary.failedCalls = products.failedCalls + variants.failedCalls;
    logger.info(
        'Removal summary. Products removed: {0} of {1} no longer in SFCC, variations removed: {2} of {3}, failed calls: {4}',
        summary.removedProducts,
        summary.missingProducts,
        summary.removedVariants,
        summary.missingVariants,
        summary.failedCalls,
    );
    return summary;
}

/**
 * Reads every product group Cloudshelf holds and picks out the categories the export did not find in SFCC,
 * and the ones it found without products that still hold products in Cloudshelf
 * @param {Object} cloudshelfApi - cloudshelf API model
 * @param {Object} known - what the export found: online and withoutProducts, each an IdSet of category global ids
 * @returns {Object|null} what is out of step, or null when Cloudshelf could not be read to the end
 */
function findMissingCategories(cloudshelfApi, known) {
    const namespace = cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT_GROUP;
    const result = {
        cloudshelfCategories: 0,
        connectorCategories: 0,
        connectorCategoriesWithProducts: 0,
        missingCategories: 0,
        categoryIdBatches: [],
        categoriesToEmpty: 0,
        categoryToEmptyIdBatches: [],
    };
    let after = null;
    let hasNextPage = true;

    while (hasNextPage) {
        let response = cloudshelfApi.getProductGroups(PAGE_SIZE, after);
        if (!response || !response.productGroups || !response.productGroups.edges || !response.productGroups.pageInfo) {
            return null;
        }

        response.productGroups.edges.forEach(function (edge) {
            const productGroup = edge.node;
            result.cloudshelfCategories++;
            if (!isFromConnector(productGroup.platformProvidedId, namespace)) {
                return;
            }
            result.connectorCategories++;
            if (productGroup.productCount > 0) {
                result.connectorCategoriesWithProducts++;
            }
            if (!known.online.has(productGroup.platformProvidedId)) {
                result.missingCategories++;
                addToBatches(result.categoryIdBatches, productGroup.platformProvidedId);
            } else if (productGroup.productCount > 0 && known.withoutProducts.has(productGroup.platformProvidedId)) {
                result.categoriesToEmpty++;
                addToBatches(result.categoryToEmptyIdBatches, productGroup.platformProvidedId);
            }
        });

        hasNextPage = response.productGroups.pageInfo.hasNextPage && response.productGroups.edges.length > 0;
        after = response.productGroups.pageInfo.endCursor;
    }

    return result;
}

/**
 * Empties categories in Cloudshelf, one request each, and logs them
 * @param {Object} cloudshelfApi - cloudshelf API model
 * @param {Array} batches - array of arrays of category global ids
 * @param {dw.system.Log} logger - logger
 * @returns {Object} how many were emptied and how many calls failed
 */
function emptyCategories(cloudshelfApi, batches, logger) {
    const result = { emptied: 0, failedCalls: 0 };
    batches.forEach(function (batch) {
        logger.info(
            'Emptying {0} categories that have no products in SFCC any more: {1}',
            batch.length,
            batch.join(', '),
        );
        batch.forEach(function (categoryId) {
            const response = cloudshelfApi.updateProductsInProductGroup(categoryId, []);
            if (response && response.updateProductsInProductGroup) {
                result.emptied++;
            } else {
                result.failedCalls++;
                logger.error('Cloudshelf did not empty category {0}. It is left for the next full export.', categoryId);
            }
        });
    });
    return result;
}

/**
 * Brings the categories Cloudshelf holds in step with the online categories a full export found in SFCC.
 * A category no longer online in SFCC is removed. Its products stay in Cloudshelf; removing a category also
 * removes the tiles that show it on a Cloudshelf. A category that is still online but has no products any
 * more is kept, and the products Cloudshelf holds for it are cleared.
 * Only call this after an export that walked the whole category tree.
 * @param {Object} cloudshelfApi - cloudshelf API model
 * @param {Object} known - what the export found: online and withoutProducts, each an IdSet of category global ids
 * @param {string} mode - ON, OFF or NO_LIMIT
 * @returns {Object} summary of what was done
 */
function removeMissingCategories(cloudshelfApi, known, mode) {
    const logger = cloudshelfHelper.getLogger();
    const knownCategoryIds = known.online;
    const summary = {
        skipped: null,
        missingCategories: 0,
        removedCategories: 0,
        emptyingSkipped: null,
        categoriesToEmpty: 0,
        emptiedCategories: 0,
        failedCalls: 0,
    };

    if (mode === MODE_OFF) {
        summary.skipped = 'the removeMissing job parameter is OFF';
        logger.info('Category removal check skipped: {0}', summary.skipped);
        return summary;
    }
    if (!knownCategoryIds.size) {
        // Nothing found is never a reason to empty Cloudshelf
        summary.skipped = 'this export found no online categories in SFCC';
        logger.warn('Category removal check skipped: {0}. Nothing was removed from Cloudshelf.', summary.skipped);
        return summary;
    }

    const missing = findMissingCategories(cloudshelfApi, known);
    if (!missing) {
        summary.skipped = 'the categories Cloudshelf holds could not be read';
        logger.error('Category removal check skipped: {0}. Nothing was removed from Cloudshelf.', summary.skipped);
        return summary;
    }

    summary.missingCategories = missing.missingCategories;
    summary.categoriesToEmpty = missing.categoriesToEmpty;
    logger.info(
        'Category removal check: SFCC has {0} online categories. Cloudshelf holds {1} categories, {2} of them ' +
            'from this connector. No longer online in SFCC: {3}. Online in SFCC without products, but still ' +
            'holding products in Cloudshelf: {4}.',
        knownCategoryIds.size,
        missing.cloudshelfCategories,
        missing.connectorCategories,
        summary.missingCategories,
        summary.categoriesToEmpty,
    );

    let categoryIdBatches = missing.categoryIdBatches;
    if (
        mode !== MODE_NO_LIMIT &&
        missing.missingCategories > missing.connectorCategories * MAX_SHARE_OF_CATEGORIES_REMOVED
    ) {
        summary.skipped = 'more than half of the categories would be removed';
        logger.error(
            'Category removal skipped: {0} of the {1} categories in Cloudshelf were not found online in SFCC, so ' +
                '{2}. Check the storefront catalog assigned to the site and run the export again. If the ' +
                'categories really are gone, run the full export once with the removeMissing job parameter set ' +
                'to NO_LIMIT.',
            missing.missingCategories,
            missing.connectorCategories,
            summary.skipped,
        );
        categoryIdBatches = [];
    }

    const categories = deleteBatches(
        categoryIdBatches,
        missing.missingCategories,
        'categories',
        function (batch) {
            const response = cloudshelfApi.deleteProductGroups(batch);
            return response && response.deleteProductGroups && response.deleteProductGroups.productGroups
                ? response.deleteProductGroups.productGroups.length
                : null;
        },
        logger,
    );

    let categoryToEmptyIdBatches = missing.categoryToEmptyIdBatches;
    if (
        mode !== MODE_NO_LIMIT &&
        missing.categoriesToEmpty > missing.connectorCategoriesWithProducts * MAX_SHARE_OF_CATEGORIES_REMOVED
    ) {
        // An empty or half-built search index finds no products in any category
        summary.emptyingSkipped = 'more than half of the categories that hold products would be emptied';
        logger.error(
            'Category emptying skipped: {0} of the {1} categories that hold products in Cloudshelf have none in ' +
                'SFCC, so {2}. This usually means the search index was empty or being rebuilt when the export ' +
                'ran. Rebuild the index and run the export again. If the categories really are empty, run the ' +
                'full export once with the removeMissing job parameter set to NO_LIMIT.',
            missing.categoriesToEmpty,
            missing.connectorCategoriesWithProducts,
            summary.emptyingSkipped,
        );
        categoryToEmptyIdBatches = [];
    }
    const emptied = emptyCategories(cloudshelfApi, categoryToEmptyIdBatches, logger);

    summary.removedCategories = categories.deleted;
    summary.emptiedCategories = emptied.emptied;
    summary.failedCalls = categories.failedCalls + emptied.failedCalls;
    logger.info(
        'Category removal summary. Categories removed: {0} of {1} no longer online in SFCC, categories emptied: ' +
            '{2} of {3} with no products in SFCC any more, failed calls: {4}',
        summary.removedCategories,
        summary.missingCategories,
        summary.emptiedCategories,
        summary.categoriesToEmpty,
        summary.failedCalls,
    );
    return summary;
}

module.exports = {
    MODE_ON: MODE_ON,
    MODE_OFF: MODE_OFF,
    MODE_NO_LIMIT: MODE_NO_LIMIT,
    ID_SET_MAX_KEYS_PER_OBJECT: ID_SET_MAX_KEYS_PER_OBJECT,
    IdSet: IdSet,
    getMode: getMode,
    findMissing: findMissing,
    removeMissing: removeMissing,
    removeMissingCategories: removeMissingCategories,
};
