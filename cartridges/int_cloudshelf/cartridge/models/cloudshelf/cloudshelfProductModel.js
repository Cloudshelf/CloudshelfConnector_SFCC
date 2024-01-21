'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * @constructor
 * @classdesc The ClaudShelf Product model
 * @param {dw.catalog.ProductSearchHit} productSearchHit ProductSearch Hit
 */
function product(productSearchHit) {
    if (productSearchHit) {
        const gid = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, productSearchHit.product.ID);
        this.description =  String(productSearchHit.product.shortDescription || productSearchHit.product.longDescription || "");
        this.displayName = productSearchHit.product.name;
        this.id = gid;
        this.metadata.data = 'cloudshelfHelper.getMetadata(dwObject, configName).data'; // TODO Metadata 
        this.metadata.id = gid;
        this.metadata.key = 'cloudshelfHelper.getMetadata(dwObject, configName).key'; // TODO Metadata
        
        productInfo = 
            {
                "description": String(element.product.shortDescription || element.product.longDescription || ""),
                "displayName": element.product.name,
                "id": gid,
                "metadata": [
                    {
                        "data": "data",
                        "id": gid,
                        "key": "key"
                    }
                ],
                "productType": "product",
                "tags": [
                    "tags"
                ],
                "vendor": element.product.brand
            }

        this.id = cloudshelfHelper.getGlobalId(
            cloudshelfHelper.GLOBAL_ID_NAMESPACES.LOCATION,
            storeObject.ID
        );
        this.displayName = storeObject.name;
        this.address = storeObject.address1;

        if (storeObject.postalCode) {
            this.address += ',' + storeObject.postalCode;
        }

        if (storeObject.city) {
            this.address += ',' + storeObject.city;
        }

        if (storeObject.countryCode) {
            this.countryCode = storeObject.countryCode.value;
        }
    }
}

module.exports = location;
