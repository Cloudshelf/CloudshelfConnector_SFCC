'use strict';

const queries = require('*/cartridge/scripts/graphql/cloudshelfGraphqlQueries');
const cloudshelfHttpGraphQL = require('*/cartridge/scripts/services/cloudshelfHttpGraphQL');
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * Cloudshelf API model
 * @constructor
 */
function cloudshelfApiModel() {}

/**
 * Creates instance of cloudshlef service and calls it
 * @param {Object} requestBody - request body object
 * @returns {Object|null} service response or null in case of error
 * @private
 */
function getServiceResponse(requestBody) {
    const service = cloudshelfHttpGraphQL();
    const serviceResult = service.call(requestBody);

    if (!serviceResult.isOk()) {
        cloudshelfHelper.getLogger().warn('Error during cloudhslef API request: {0}', serviceResult.errorMessage);
        return null;
    }

    const response = serviceResult.getObject();
    if (response && !response.error && response.data) {
        return response.data;
    }

    return null;
}

/**
 * Returns cloudshelf product data for provided SFCC product
 * @param {dw.catalog.Product} product dw product object
 * @return {Object|null} cloudshelf product or null if not found or error
 */
cloudshelfApiModel.prototype.getProduct = function (product) {
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

// TODO
// cloudshelfApiModel.prototype.upsertProducts =
// ...

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
                input: locations.toArray()
            }
        };
        return getServiceResponse(requestBody);
    }
    return;
}

module.exports = cloudshelfApiModel;
