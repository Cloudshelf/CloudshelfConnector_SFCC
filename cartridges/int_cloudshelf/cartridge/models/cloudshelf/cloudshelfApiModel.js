'use strict';

const queries = require('*/cartridge/scripts/graphql/cloudshelfGraphqlQueries');
const cloudshelfHttpGraphQL = require('*/cartridge/scripts/services/cloudshelfHttpGraphQL');

/**
 * Cloudshelf API model
 * @constructor
 */
function cloudshelfApiModel() {}

/**
 * Tells whether a failed call got no answer from Cloudshelf, or a server error, rather than a refusal.
 * A dropped connection or a timeout is worth sending again; a request Cloudshelf refused (HTTP 4xx) would
 * only be refused again.
 * @param {dw.svc.Result} serviceResult - result of a failed service call
 * @returns {boolean} true if the call is worth sending once more
 * @private
 */
function isWorthSendingAgain(serviceResult) {
    const httpStatus = Number(serviceResult.error) || 0;
    return httpStatus < 400 || httpStatus >= 500;
}

/**
 * Creates instance of cloudshelf service and calls it
 * @param {Object} requestBody - request body object
 * @returns {Object|null} service response or null in case of error
 * @private
 */
function getServiceResponse(requestBody) {
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    let serviceResult = cloudshelfHttpGraphQL().call(requestBody);

    if (!serviceResult.isOk() && isWorthSendingAgain(serviceResult)) {
        // Every request this cartridge makes can be repeated: they read, upsert, replace or delete by id
        cloudshelfHelper
            .getLogger()
            .warn('Cloudshelf API request got no answer ({0}). Sending it once more.', serviceResult.errorMessage);
        serviceResult = cloudshelfHttpGraphQL().call(requestBody);
    }

    if (!serviceResult.isOk()) {
        cloudshelfHelper
            .getLogger()
            .error('Error status code during cloudshelf API request: {0}', serviceResult.errorMessage);
        return null;
    }

    const response = serviceResult.getObject();
    if (response && !response.error && response.data) {
        return response.data;
    } else if (response && response.errorMessage) {
        cloudshelfHelper.getLogger().error('Error response during cloudshelf API request: {0}', response.errorMessage);
    }

    return null;
}

/**
 * Returns cloudshelf product data for provided SFCC product
 * @param {dw.catalog.Product} product dw product object
 * @return {Object|null} cloudshelf product or null if not found or error
 */
cloudshelfApiModel.prototype.getProduct = function (product) {
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const productId = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, product.ID);
    const requestBody = {
        query: queries.query.Product,
        variables: {
            id: productId,
        },
    };

    return getServiceResponse(requestBody);
};

/**
 * Returns cloudshelf theme data if exist
 * @param {string} themeId theme id
 * @return {Object|null} theme response or null if not found or error
 */
cloudshelfApiModel.prototype.getTheme = function (themeId) {
    const requestBody = {
        query: queries.query.Theme,
        variables: {
            id: themeId,
        },
    };

    return getServiceResponse(requestBody);
};

/**
 * Returns cloudshelf instance data if exist
 * @param {string} cloudshelfId cloudshelf id
 * @return {Object|null} cloudshelf response or null if not found or error
 */
cloudshelfApiModel.prototype.getCloudshelf = function (cloudshelfId) {
    const requestBody = {
        query: queries.query.Cloudshelf,
        variables: {
            id: cloudshelfId,
        },
    };

    return getServiceResponse(requestBody);
};

/**
 * Creates or updates if exist theme object on cloudshelf side
 * @param {Object} theme theme object for upserting
 * @return {Object|null} theme data or null if error
 */
cloudshelfApiModel.prototype.upsertTheme = function (theme) {
    const requestBody = {
        query: queries.mutation.UpsertTheme,
        variables: {
            input: theme,
        },
    };

    return getServiceResponse(requestBody);
};

/**
 * Creates or updates if exist cloudshelves entities on cloudshelf side
 * @param {Array} cloudshelves array of cloudshelves for upserting
 * @return {Object|null} cloudshelf data or null if error
 */
cloudshelfApiModel.prototype.upsertCloudshelves = function (cloudshelves) {
    const requestBody = {
        query: queries.mutation.UpsertCloudshelves,
        variables: {
            input: cloudshelves,
        },
    };

    return getServiceResponse(requestBody);
};

/**
 * Creates or updates if exist locations entities on cloudshelf side
 * @param {Array} locations array of locations for upserting
 * @return {Object|null} cloudshelf data or null if error
 */
cloudshelfApiModel.prototype.upsertLocations = function (locations) {
    if (locations) {
        const requestBody = {
            query: queries.mutation.UpsertLocations,
            variables: {
                input: locations,
            },
        };
        return getServiceResponse(requestBody);
    }
    return;
};

/**
 * Creates or updates if exist master product entities on cloudshelf side
 * @param {Array} products array of master products for upserting
 * @return {Object|null} cloudshelf data or null if error
 */
cloudshelfApiModel.prototype.upsertProducts = function (products) {
    if (products) {
        const requestBody = {
            query: queries.mutation.UpsertProducts,
            variables: {
                input: products,
            },
        };
        return getServiceResponse(requestBody);
    }
    return;
};

/**
 * Creates or updates if exist variation product entities on cloudshelf side
 * @param {Array} variations array of  variation products for upserting
 * @return {Object|null} cloudshelf data or null if error
 */
cloudshelfApiModel.prototype.upsertProductVariants = function (variations) {
    if (variations) {
        const requestBody = {
            query: queries.mutation.UpsertProductVariants,
            variables: {
                inputs: variations,
            },
        };
        return getServiceResponse(requestBody);
    }
    return;
};

/**  Creates or updates if exist product groups on cloudshelf side
 * @param {Array} productGroups array of product groups for upserting
 * @return {Object|null} product groups data or null if error
 */
cloudshelfApiModel.prototype.upsertProductGroups = function (productGroups) {
    const requestBody = {
        query: queries.mutation.UpsertProductGroups,
        variables: {
            input: productGroups,
        },
    };
    return getServiceResponse(requestBody);
};

/**
 * Sets the products of a product group, replacing the ones Cloudshelf holds for it
 * @param {string} productGroupId global id of the product group
 * @param {Array} productIds global ids of the products
 * @return {Object|null} mutation response or null if error
 */
cloudshelfApiModel.prototype.updateProductsInProductGroup = function (productGroupId, productIds) {
    const requestBody = {
        query: queries.mutation.UpdateProductsInProductGroup,
        variables: {
            productGroupId: productGroupId,
            productIds: productIds,
        },
    };
    return getServiceResponse(requestBody);
};

/**
 * Adds products to a product group, keeping the ones Cloudshelf holds for it
 * @param {string} productGroupId global id of the product group
 * @param {Array} productIds global ids of the products
 * @return {Object|null} mutation response or null if error
 */
cloudshelfApiModel.prototype.addProductsToProductGroup = function (productGroupId, productIds) {
    const requestBody = {
        query: queries.mutation.AddProductsToProductGroup,
        variables: {
            productGroupId: productGroupId,
            productIds: productIds,
        },
    };
    return getServiceResponse(requestBody);
};

/**  Updates order status on cloudshelf side
 * @param {Object} OrderObject model object
 * @return {Object|null} order data or null if error
 */
cloudshelfApiModel.prototype.upsertOrders = function (OrderObject) {
    const requestBody = {
        query: queries.mutation.upsertOrders,
        variables: {
            input: OrderObject,
        },
    };
    return getServiceResponse(requestBody);
};

/**
 * Returns one page of the products Cloudshelf holds, with their variants, in a stable order
 * @param {number} first - page size
 * @param {string} after - cursor of the last product of the previous page, or null for the first page
 * @return {Object|null} products page or null if error
 */
cloudshelfApiModel.prototype.getProducts = function (first, after) {
    const requestBody = {
        query: queries.query.Products,
        variables: {
            first: first,
            after: after || null,
        },
    };
    return getServiceResponse(requestBody);
};

/**
 * Deletes products, and their variants, on cloudshelf side
 * @param {Array} ids global ids of the products
 * @return {Object|null} deleted products data or null if error
 */
cloudshelfApiModel.prototype.deleteProducts = function (ids) {
    const requestBody = {
        query: queries.mutation.DeleteProducts,
        variables: {
            ids: ids,
        },
    };
    return getServiceResponse(requestBody);
};

/**
 * Deletes product variants on cloudshelf side
 * @param {Array} ids global ids of the variants
 * @return {Object|null} deleted variants data or null if error
 */
cloudshelfApiModel.prototype.deleteProductVariants = function (ids) {
    const requestBody = {
        query: queries.mutation.DeleteProductVariants,
        variables: {
            ids: ids,
        },
    };
    return getServiceResponse(requestBody);
};

/**
 * Tells Cloudshelf how this organisation's sync is going, so the Cloudshelf Manager can show it.
 * @param {string} syncStage - REQUEST_PRODUCTS, PROCESS_PRODUCT_GROUPS, DONE or FAILED
 * @param {Array} [syncErrors] - errors to show for the sync; replaces the ones Cloudshelf holds.
 *     Leave it out to keep them, pass an empty array to clear them.
 * @return {Object|null} mutation response or null if error
 */
cloudshelfApiModel.prototype.reportSyncStatus = function (syncStage, syncErrors) {
    const variables = { syncStage: syncStage };
    if (syncErrors) {
        variables.syncErrors = syncErrors;
    }
    const requestBody = {
        query: queries.mutation.ReportSyncStatus,
        variables: variables,
    };
    return getServiceResponse(requestBody);
};

/**
 * Submit catalog statistics to Cloudshelf.
 * @param {Object} statsPayload - payload containing catalog counts
 * @return {Object|null} mutation response or null if error
 */
cloudshelfApiModel.prototype.reportCatalogStats = function (statsPayload) {
    const requestBody = {
        query: queries.mutation.ReportCatalogStats,
        variables: statsPayload || {},
    };
    return getServiceResponse(requestBody);
};

module.exports = cloudshelfApiModel;
