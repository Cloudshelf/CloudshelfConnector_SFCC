'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * @constructor
 * @classdesc The CloudShelf Product model
 * @param {dw.catalog.ProductSearchHit} productSearchHit ProductSearch Hit
 */
function product(productSearchHit) {
    if (productSearchHit && !productSearchHit.product.bundle && !productSearchHit.product.productSet) {
        const gid = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, productSearchHit.product.ID);

        this.description = String(productSearchHit.product.shortDescription || productSearchHit.product.longDescription || "");
        this.displayName = productSearchHit.product.name;
        this.id = gid;
        this.metadata = cloudshelfHelper.getMetadata(productSearchHit.product, 'cloudshelfProductMetadataMapping');
        this.metadata.id = gid;
        this.productType = productSearchHit.product.primaryCategory != null ? productSearchHit.product.primaryCategory.displayName : 'No Category'; //TODO Which productType if no Primary Category 
        this.tags = 'tags';
        this.vendor = productSearchHit.product.brand;
    }
}

module.exports = product;
