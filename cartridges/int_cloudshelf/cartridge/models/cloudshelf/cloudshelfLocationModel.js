'use strict';
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

/**
 * Returns a store attribute as Cloudshelf takes it
 * @param {*} value - store attribute value
 * @returns {string|null} the value, or null when the store has none, which clears it in Cloudshelf
 */
function textOrNull(value) {
    return value ? String(value) : null;
}

/**
 * @constructor
 * @classdesc The ClaudShelf Location model
 * @param {dw.catalog.Store} storeObject - a Store objects
 */
function location(storeObject) {
    if (storeObject) {
        this.id = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.LOCATION, storeObject.ID);
        this.displayName = storeObject.name;

        // Cloudshelf takes each part of the address as its own field
        this.address1 = textOrNull(storeObject.address1);
        this.address2 = textOrNull(storeObject.address2);
        this.city = textOrNull(storeObject.city);
        this.provinceCode = textOrNull(storeObject.stateCode);
        this.zip = textOrNull(storeObject.postalCode);
        this.phone = textOrNull(storeObject.phone);

        if (storeObject.countryCode && storeObject.countryCode.value) {
            this.countryCode = storeObject.countryCode.value;
        }

        this.metadata = cloudshelfHelper.getMetadata(storeObject, 'cloudshelfStoreMetadataMapping');
    }
}

module.exports = location;
