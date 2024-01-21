'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * @constructor
 * @classdesc The CloudShelf Variation model
 * @param {object} variation Variation
 */
function variation(variation, variationModel) {
    if (variation) {
        /* Variation Attributes */
        const variationAttributes = variationModel.getProductVariationAttributes();
        const attributes = [];
        for (let index = 0; index < variationAttributes.length; ++index) {
            let varVal = variationModel.getVariationValue(variation, variationAttributes[index]);

            if (varVal) {
                let variationVal = varVal.displayValue;
                attributes.push({
                    "key": variationAttributes[index].attributeID,
                    "value": variationVal
                })
            }
        }

        /* Images */
        const images = variation.getImages('large');
        const metaimages = [];
        images.toArray().forEach(element => {
            metaimages.push({
                "preferredImage": false,
                "url": String(element.httpsURL)
            })
        });
        if (metaimages.length) {
            metaimages[0].preferredImage = true;
        }

        const prices = variation.getPriceModel();

        this.attributes = attributes;
        this.availableToPurchase = variation.available;
        this.currentPrice = Number(prices.price);
        this.displayName = variation.name;
        this.id = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, variation.ID);
        this.isInStock = true; //TODO check method
        this.metadata = {};
        this.metadata.data = 'cloudshelfHelper.getMetadata(dwObject, configName).data'; // TODO Metadata 
        this.metadata.key = 'cloudshelfHelper.getMetadata(dwObject, configName).key'; // TODO Metadata
        this.metaimages = metaimages;
        this.originalPrice = Number(prices.maxPrice);
        this.sku = variation.ID;
    }
}

module.exports = variation;
