'use strict';

/**
 * Live stock for one variant, in the payload Cloudshelf displays ask a stock
 * endpoint for (https://documentation.cloudshelf.ai/getting-started/real-time-stock-levels).
 *
 * A display asks when a shopper opens a product. It is told what the site's
 * own inventory list holds, as a location that fulfils online orders, and what
 * each Cloudshelf store's inventory list holds, as a location that does not.
 */

const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');

const TOKEN_PREFERENCE = 'cloudshelfStockLevelsToken';
const GLOBAL_ID_PREFIX = 'gid://external/';
// The site's own inventory list is not a store, so it is named by its list
const ONLINE_LOCATION_NAMESPACE = 'SalesforceInventoryList';
const ONLINE_LOCATION_NAME = 'Online';
// A perpetual record never runs out, and the payload has to carry a number
const PERPETUAL_NUMBER_AVAILABLE = 9999;

/**
 * Returns the SFCC id inside a Cloudshelf global id
 * @param {string} globalId - global id, or a plain SFCC id
 * @param {string} namespace - namespace the global id has to be in
 * @returns {string|null} SFCC id, or null when there is none or it is another namespace's
 */
function getIdFromGlobalId(globalId, namespace) {
    if (!globalId) {
        return null;
    }
    const value = String(globalId);
    if (value.indexOf('gid://') !== 0) {
        return value;
    }
    const prefix = GLOBAL_ID_PREFIX + namespace + '/';
    return value.indexOf(prefix) === 0 && value.length > prefix.length ? value.substring(prefix.length) : null;
}

/**
 * Decides whether a request may read stock levels.
 * Live stock is off until a token is set in the Cloudshelf site preferences,
 * and a request has to carry that token.
 * @param {string} authorizationHeader - the request's Authorization header
 * @returns {Object} allowed flag, and the status code and reason when it is not
 */
function checkAccess(authorizationHeader) {
    const Site = require('dw/system/Site');
    const token = Site.getCurrent().getCustomPreferenceValue(TOKEN_PREFERENCE);

    if (!token) {
        return {
            allowed: false,
            statusCode: 404,
            reason: 'live stock is not enabled: the Stock Levels Token site preference is empty',
        };
    }
    if (!authorizationHeader) {
        return { allowed: false, statusCode: 401, reason: 'the request has no Authorization header' };
    }
    if (String(authorizationHeader) !== 'Bearer ' + token) {
        return {
            allowed: false,
            statusCode: 401,
            reason: 'the Authorization header does not match the Stock Levels Token site preference',
        };
    }
    return { allowed: true };
}

/**
 * Returns how many of a product an inventory list has to sell
 * @param {dw.catalog.ProductInventoryRecord} record - the product's record in the list, or null
 * @param {dw.catalog.ProductInventoryList} [inventoryList] - the list the record was looked up in
 * @returns {number} whole number available, never negative
 */
function getNumberAvailable(record, inventoryList) {
    if (!record) {
        // SFCC takes a product without a record as in stock when its list is set to in stock by default,
        // and the export sends it as in stock. No quantity exists, so it is reported like perpetual stock.
        return inventoryList && inventoryList.defaultInStockFlag ? PERPETUAL_NUMBER_AVAILABLE : 0;
    }
    if (record.perpetual) {
        return PERPETUAL_NUMBER_AVAILABLE;
    }
    const ats = record.ATS;
    if (!ats || !ats.available) {
        return 0;
    }
    return Math.max(0, Math.floor(ats.value));
}

/**
 * Returns the site's own stock of a product as a location
 * @param {dw.catalog.Product} product - product
 * @returns {Object|null} location, or null when the site has no inventory list
 */
function getOnlineLocation(product) {
    const ProductInventoryMgr = require('dw/catalog/ProductInventoryMgr');
    const inventoryList = ProductInventoryMgr.getInventoryList();

    if (!inventoryList) {
        return null;
    }
    return {
        id: cloudshelfHelper.getGlobalId(ONLINE_LOCATION_NAMESPACE, inventoryList.ID),
        displayName: ONLINE_LOCATION_NAME,
        fulfillsOnlineOrders: true,
        numberAvailable: getNumberAvailable(inventoryList.getRecord(product), inventoryList),
    };
}

/**
 * Returns the stock of a product at each Cloudshelf store that has an inventory list
 * @param {dw.catalog.Product} product - product
 * @returns {Array} locations
 */
function getStoreLocations(product) {
    const SystemObjectMgr = require('dw/object/SystemObjectMgr');
    const locations = [];
    const stores = SystemObjectMgr.querySystemObjects('Store', 'custom.isCloudshelf = {0}', 'ID asc', true);

    try {
        while (stores.hasNext()) {
            let store = stores.next();
            let inventoryList = store.inventoryList;
            if (inventoryList) {
                locations.push({
                    id: cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.LOCATION, store.ID),
                    displayName: store.name || store.ID,
                    fulfillsOnlineOrders: false,
                    numberAvailable: getNumberAvailable(inventoryList.getRecord(product), inventoryList),
                });
            }
        }
    } finally {
        stores.close();
    }
    return locations;
}

/**
 * Builds the stock levels payload for one variant
 * @param {Object} query - the request's variant, product and location, as Cloudshelf global ids
 * @returns {Object} found flag and the payload; a variant SFCC does not have is answered with none available
 */
function getStockLevels(query) {
    const ProductMgr = require('dw/catalog/ProductMgr');
    const payload = {
        dataType: 'StockLevels',
        dataTypeVersion: 1,
        responseFor: {
            variantId: query.variant,
            productId: query.product || null,
            locationId: query.location || null,
        },
        response: {
            totalNumberAvailable: 0,
            location: null,
            locations: [],
        },
    };

    const variantId = getIdFromGlobalId(query.variant, cloudshelfHelper.GLOBAL_ID_NAMESPACES.VARIANT);
    const product = variantId ? ProductMgr.getProduct(variantId) : null;
    if (!product) {
        return { found: false, payload: payload };
    }

    const onlineLocation = getOnlineLocation(product);
    const storeLocations = getStoreLocations(product);

    if (onlineLocation) {
        payload.response.totalNumberAvailable = onlineLocation.numberAvailable;
        payload.response.locations.push(onlineLocation);
    }
    payload.response.locations = payload.response.locations.concat(storeLocations);

    if (query.location) {
        // Only a store can be the location a display is standing in
        let matches = storeLocations.filter(function (location) {
            return location.id === query.location;
        });
        payload.response.location = matches.length ? matches[0] : null;
    }

    return { found: true, payload: payload };
}

module.exports = {
    PERPETUAL_NUMBER_AVAILABLE: PERPETUAL_NUMBER_AVAILABLE,
    checkAccess: checkAccess,
    getIdFromGlobalId: getIdFromGlobalId,
    getNumberAvailable: getNumberAvailable,
    getStockLevels: getStockLevels,
};
