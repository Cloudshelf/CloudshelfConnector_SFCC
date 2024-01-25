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
 * Return root price book for a given price book
 * @param {dw.catalog.PriceBook} priceBook - Provided price book
 * @returns {dw.catalog.PriceBook} root price book
 */
function getRootPriceBook(priceBook) {
    var rootPriceBook = priceBook;
    while (rootPriceBook.parentPriceBook) {
        rootPriceBook = rootPriceBook.parentPriceBook;
    }
    return rootPriceBook;
}

/**
 * Get list price for a product
 *
 * @param {dw.catalog.ProductPriceModel} priceModel - Product price model
 * @return {dw.value.Money} - List price
 */
function getListPrice(priceModel) {
    const Money = require('dw/value/Money');
    let price = Money.NOT_AVAILABLE;
    let priceBook;
    let priceBookPrice;

    if (priceModel.price.valueOrNull === null && priceModel.minPrice) {
        return priceModel.minPrice;
    }

    priceBook = getRootPriceBook(priceModel.priceInfo.priceBook);
    priceBookPrice = priceModel.getPriceBookPrice(priceBook.ID);

    if (priceBookPrice.available) {
        return priceBookPrice;
    }

    price = priceModel.price.available ? priceModel.price : priceModel.minPrice;

    return price;
}

/**
 * getPrices function
 * @param {Object} variation Product Variation
 * @returns Object with Product Variation List Price and Sales Price
 */
function getPrices(variation) {
    const priceObj = {};
    const priceModel = variation.priceModel;
    priceObj.listPrice = getListPrice(priceModel);
    priceObj.salesPrice = priceModel.price;
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
