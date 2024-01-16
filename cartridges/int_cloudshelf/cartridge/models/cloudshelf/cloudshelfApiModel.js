'use strict';

const queries = require('*/cartridge/scripts/graphql/cloudshelfGraphqlQueries');
const cloudshelfHttpGraphQL = require('*/cartridge/scripts/services/cloudshelfHttpGraphQL');
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * Cloudshelf API model
 */
function cloudshelfApiModel() {}

/**
 * Returns cloudshelf product for provided SFCC product
 * @param {dw.catalog.Product} product dw product object
 * @return {Object|null} cloudshelf product or null if not found or error
 */
cloudshelfApiModel.prototype.getProduct = function (product) {
    const service = cloudshelfHttpGraphQL();
    const productId = cloudshelfHelper.getGlobalId(
        cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT,
        product.ID
    );
    const serviceResult = service.call({
        query: queries.query.Product,
        variables: {
            id: productId
        }
    });

    if (serviceResult.isOk()) {
        return serviceResult.getObject();
    }

    return null;
};

// TODO
// cloudshelfApiModel.prototype.upsertProducts =
// cloudshelfApiModel.prototype.upsertLocations =
// ...

module.exports = cloudshelfApiModel;
