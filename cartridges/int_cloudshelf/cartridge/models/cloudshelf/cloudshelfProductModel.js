'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * @constructor
 * @classdesc The CloudShelf Product model
 * @param {dw.catalog.ProductSearchHit} productSearchHit ProductSearch Hit
 */
function product(productSearchHit, lastRunDate, jobMode) {
    if (productSearchHit && !productSearchHit.product.bundle && !productSearchHit.product.productSet && !productSearchHit.product.optionProduct) {
        if (jobMode === 'DELTA' && productSearchHit.product.lastModified < lastRunDate) {
            return false;
        }
        const gid = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, productSearchHit.product.ID);

        this.description = String(productSearchHit.product.shortDescription || productSearchHit.product.longDescription || '');
        this.displayName = productSearchHit.product.name;
        this.id = productSearchHit.representedProducts.length > 1 ? gid : cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, productSearchHit.product.ID + 'M');
        this.metadata = cloudshelfHelper.getMetadata(productSearchHit.product, 'cloudshelfProductMetadataMapping');
        this.productType = productSearchHit.product.primaryCategory != null ? productSearchHit.product.primaryCategory.displayName : productSearchHit.product.allCategoryAssignments[0].category.displayName;
        if ('cloudshelfTags' in productSearchHit.product.custom && productSearchHit.product.custom.cloudshelfTags) {
            this.tags = productSearchHit.product.custom.cloudshelfTags;
        }        
        this.vendor = productSearchHit.product.brand;
    }
}

module.exports = product;
