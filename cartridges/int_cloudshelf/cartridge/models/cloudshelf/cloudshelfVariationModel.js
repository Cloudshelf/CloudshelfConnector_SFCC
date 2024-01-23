'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * getImages function
 * @param {Object} variation Product Variation
 * @returns Array of metaimages objects for Cloudshelf UpsertProductVariations request
 */
function getImages(variation) {
    const images = variation.getImages('large');
    const metaimages = [];
    images.toArray().forEach(element => {
        metaimages.push({
            preferredImage: false,
            url: String(element.httpsURL)
        })
    });
    if (metaimages.length) {
        metaimages[0].preferredImage = true;
    }
    return metaimages;
}

/**
 * getVariantAttributes function
 * @param {Object} variation Product Variation
 * @param {Object} variationModel Master Product Variation Model
 * @returns Product Variation Attributes
 */
function getVariantAttributes(variation, variationModel) {
    const variationAttributes = variationModel.getProductVariationAttributes();
    const attributes = [];
    for (let index = 0; index < variationAttributes.length; ++index) {
        let varVal = variationModel.getVariationValue(variation, variationAttributes[index]);

        if (varVal) {
            let variationVal = varVal.displayValue;
            attributes.push({
                key: variationAttributes[index].attributeID,
                value: variationVal
            })
        }
    }
    return attributes;
}

/**
 * @constructor
 * @classdesc The CloudShelf Variation model
 * @param {object} variation Variation
 * @param {dw.catalog.ProductVariationModel} variationModel Variation Model
 */
function variation(variation, variationModel) {
    if (variation) {

        const prices = variation.getPriceModel();

        this.attributes = getVariantAttributes(variation, variationModel);
        this.availableToPurchase = variation.availabilityModel.orderable;
        this.currentPrice = Number(prices.price);
        this.displayName = variation.name;
        this.id = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, variation.ID);
        this.isInStock = variation.availabilityModel.inStock;
        this.metadata = cloudshelfHelper.getMetadata(variation, 'cloudshelfProductMetadataMapping');
        this.metaimages = getImages(variation);
        this.originalPrice = Number(prices.maxPrice);
        this.sku = String(variation.manufacturerSKU || '');
    }
}

module.exports = variation;
