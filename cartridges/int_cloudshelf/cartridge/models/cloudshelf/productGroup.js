'use strict';

const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * Returns category image if exist
 * @param {dw.catalog.Category} category - a category objects
 * @returns {Object} object with absolute image url
 * @private
 */
function getImage(category) {
    const dwImage = category.getImage();
    if (!dwImage) {
        return null;
    }

    return {
        preferredImage: true,
        url: dwImage.getAbsURL().toString()
    };
}

/**
 * @constructor
 * @classdesc cloudshelf ProductGroup model
 * @param {dw.catalog.Category} category - a category objects
 */
function ProductGroup(category) {
    if (category) {
        this.id = cloudshelfHelper.getGlobalId(
            cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT_GROUP,
            category.ID
        );
        this.displayName = category.getDisplayName();
        this.metadata = cloudshelfHelper.getMetadata(category, 'cloudshelfCategoryMetadataMapping');

        const image = getImage(category);
        if (image) {
            this.featuredImage = image;
        }
    }
}

module.exports = ProductGroup;
