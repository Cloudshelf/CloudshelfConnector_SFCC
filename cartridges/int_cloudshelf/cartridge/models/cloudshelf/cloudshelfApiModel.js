'use strict';

const queries = require('*/cartridge/scripts/graphql/cloudshelfGraphqlQueries');
const cloudshelfHttpGraphQL = require('*/cartridge/scripts/services/cloudshelfHttpGraphQL');

/**
 * Cloudshelf API model
 * @constructor
 */
function cloudshelfApiModel() { }

/**
 * Creates instance of cloudshelf service and calls it
 * @param {Object} requestBody - request body object
 * @returns {Object|null} service response or null in case of error
 * @private
 */
function getServiceResponse(requestBody) {
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const service = cloudshelfHttpGraphQL();
    const serviceResult = service.call(requestBody);

    if (!serviceResult.isOk()) {
        cloudshelfHelper.getLogger().error('Error status code during cloudshelf API request: {0}', serviceResult.errorMessage);
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
    const productId = cloudshelfHelper.getGlobalId(
        cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT,
        product.ID
    );
    const requestBody = {
        query: queries.query.Product,
        variables: {
            id: productId
        }
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
            id: themeId
        }
    };

    return getServiceResponse(requestBody);
}

/**
 * Returns cloudshelf instance data if exist
 * @param {string} cloudshelfId cloudshelf id
 * @return {Object|null} cloudshelf response or null if not found or error
 */
cloudshelfApiModel.prototype.getCloudshelf = function (cloudshelfId) {
    const requestBody = {
        query: queries.query.Cloudshelf,
        variables: {
            id: cloudshelfId
        }
    };

    return getServiceResponse(requestBody);
}

/**
 * Creates or updates if exist theme object on cloudshelf side
 * @param {Object} theme theme object for upserting
 * @return {Object|null} theme data or null if error
 */
cloudshelfApiModel.prototype.upsertTheme = function (theme) {
    const requestBody = {
        query: queries.mutation.UpsertTheme,
        variables: {
            input: theme
        }
    };

    return getServiceResponse(requestBody);
}

/**
 * Creates or updates if exist cloudshelves entities on cloudshelf side
 * @param {Array} cloudshelves array of cloudshelves for upserting
 * @return {Object|null} cloudshelf data or null if error
 */
cloudshelfApiModel.prototype.upsertCloudshelves = function (cloudshelves) {
    const requestBody = {
        query: queries.mutation.UpsertCloudshelves,
        variables: {
            input: cloudshelves
        }
    };

    return getServiceResponse(requestBody);
}

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
                input: locations
            }
        };
        return getServiceResponse(requestBody);
    }
    return;
}

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
                input: products
            }
        };
        return getServiceResponse(requestBody);
    }
    return;
}

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
                inputs: variations
            }
        };
        return getServiceResponse(requestBody);
    }
    return;
}

 /**  Creates or updates if exist product groups on cloudshelf side
 * @param {Array} productGroups array of product groups for upserting
 * @return {Object|null} product groups data or null if error
 */
cloudshelfApiModel.prototype.upsertProductGroups = function (productGroups) {
    const requestBody = {
        query: queries.mutation.UpsertProductGroups,
        variables: {
            input: productGroups
        }
    };
    return getServiceResponse(requestBody);
}

/**
 * Assigns products to product group
 * @param {Object} productsInProductGroup model object
 * @return {Object|null} product groups data or null if error
 */
cloudshelfApiModel.prototype.updateProductsInProductGroup = function (productsInProductGroup) {
    const requestBody = {
        query: queries.mutation.UpdateProductsInProductGroup,
        variables: productsInProductGroup
    };
    return getServiceResponse(requestBody);
}

 /**  Updates order status on cloudshelf side
 * @param {Object} OrderObject model object
 * @return {Object|null} order data or null if error
 */
 cloudshelfApiModel.prototype.upsertOrders = function (OrderObject) {
    const requestBody = {
        query: queries.mutation.upsertOrders,
        variables: {
            input: OrderObject
        }
    };
    return getServiceResponse(requestBody);
}

module.exports = cloudshelfApiModel;
