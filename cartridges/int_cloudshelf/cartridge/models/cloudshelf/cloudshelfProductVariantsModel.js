'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
const VariationModel = require('*/cartridge/models/cloudshelf/cloudshelfVariationModel');
/**
 * @constructor
 * @classdesc The CloudShelf Product model
 * @param {dw.catalog.ProductSearchHit} productSearchHit ProductSearch Hit
 */
function productVariations(productSearchHit) {
    if (productSearchHit) {
        const gid = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, productSearchHit.product.ID);
        const variations = productSearchHit.representedProducts.toArray();
        const variationModel = productSearchHit.product.getVariationModel();
        const variantsArr = []

        variations.forEach(variation => {
            let variant = new VariationModel(variation, variationModel);
            variantsArr.push(variant);
        });
        /* this.productId = variations.length > 1 ? gid : cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, productSearchHit.product.ID + 'M'); */
        this.productId = gid;
        this.variants = variantsArr;
    }
}

module.exports = productVariations;
