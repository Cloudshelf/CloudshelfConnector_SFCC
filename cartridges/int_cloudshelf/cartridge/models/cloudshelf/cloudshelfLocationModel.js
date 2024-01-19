'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * @constructor
 * @classdesc The ClaudShelf Location model
 * @param {dw.catalog.Store} storeObject - a Store objects
 */
function location(storeObject) {
    if (storeObject) {

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

        this.metadata = cloudshelfHelper.getMetadata(storeObject, 'cloudshelfStoreMetadataMapping');
    }
}

module.exports = location;
