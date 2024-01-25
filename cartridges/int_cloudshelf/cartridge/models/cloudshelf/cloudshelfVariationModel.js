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
 * getPrices function
 * @param {Object} variation Product Variation
 * @returns Object with Product Variation List Price and Sales Price
 */
function getPrices(variation) {
    const priceObj = {}
    const priceFactory = require('*/cartridge/scripts/factories/price');
    const prices = priceFactory.getPrice(variation);
    priceObj.listPrice = typeof prices.list === "object" && prices.list !== null && prices.list.hasOwnProperty('value') ? prices.list.value : variation.priceModel.price;
    priceObj.salesPrice = typeof prices.sales === "object" && prices.sales !== null && prices.sales.hasOwnProperty('value') ? prices.sales.value : variation.priceModel.price;
    return priceObj
}

/**
 * @constructor
 * @classdesc The CloudShelf Variation model
 * @param {object} variation Variation
 * @param {dw.catalog.ProductVariationModel} variationModel Variation Model
 */
function variation(variation, variationModel) {
    if (variation) {
        const prices = getPrices(variation);

        this.attributes = getVariantAttributes(variation, variationModel);
        this.availableToPurchase = variation.availabilityModel.orderable;
        this.currentPrice = Number(prices.salesPrice);
        this.displayName = variation.name;
        this.id = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.VARIANT, variation.ID);
        this.isInStock = variation.availabilityModel.inStock;
        this.metadata = cloudshelfHelper.getMetadata(variation, 'cloudshelfProductMetadataMapping');
        this.metaimages = getImages(variation);
        this.originalPrice = Number(prices.listPrice);
        this.sku = String(variation.manufacturerSKU || '');
    }
}

module.exports = variation;
