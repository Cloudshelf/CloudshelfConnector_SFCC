'use strict';

const CloudshelfApiModel = require('~/cartridge/models/cloudshelf/cloudshelfApiModel');
const cloudshelfApi = new CloudshelfApiModel();

const GLOBAL_ID_NAMESPACES = {
    PRODUCT: 'salesforceProduct',
    PRODUCT_GROUP: 'salesforceCategory',
    LOCATION: 'salesforceStore',
    CLOUDSHELF: 'salesforceCloudshelf',
    THEME: 'salesforceTheme',
}

/**
 * Returns cloudshelf logger instance
 * @returns {dw.system.Log} - logger instance
 */
function getLogger() {
    return require('dw/system/Logger').getLogger('cloudshelf', 'cloudshelf');
}

/**
 * Returns cloudshelf Global Id value
 * @param {string} namespace - cloudshelf namespace
 * @param {string} id - sfcc entity id
 * @returns {string} - Global Id value
*/
function getGlobalId(namespace, id) {
    return 'gid://external/' + namespace + '/' + id;
}

/**
 * Returns default cloudshelf theme object
 * @returns {Object} - cloudshelf theme object
 * @private
*/
function getDefaultTheme() {
    const ThemeModel = require('*/cartridge/models/cloudshelf/theme');
    return new ThemeModel();
}

/**
 * Check if default site theme exist on cloudshelf side and creates it if it does not exist
 * @returns {Object} theme data from cloudshelf
 */
function createDefaultThemeIfNotExist() {
    const defaultThemeObj = getDefaultTheme();
    let themeData = cloudshelfApi.getTheme(defaultThemeObj.id);

    if (!themeData || !themeData.theme) {
        themeData = cloudshelfApi.upsertTheme(defaultThemeObj);
    }

    return themeData;
}

/**
 * Check if default site cloudshelf entity exist on cloudshelf side and creates it if it does not exist
 * @returns {Object} cloudshelfs data from cloudshelf
 */
function createDefaultCloudshelfIfNotExist() {
    const CloudshelfModel = require('*/cartridge/models/cloudshelf/cloudshelf');

    const defaultThemeObj = getDefaultTheme();
    const defaultCloudshelfObj = new CloudshelfModel({
        theme: defaultThemeObj
    });

    let cloudshelfData = cloudshelfApi.getCloudshelf(defaultCloudshelfObj.id);

    if (!cloudshelfData || !cloudshelfData.cloudshelf) {
        cloudshelfData = cloudshelfApi.upsertCloudshelves([
            defaultCloudshelfObj
        ]);
    }
    
    return cloudshelfData;
}

module.exports = {
    GLOBAL_ID_NAMESPACES: GLOBAL_ID_NAMESPACES,
    getLogger: getLogger,
    getGlobalId: getGlobalId,
    createDefaultThemeIfNotExist: createDefaultThemeIfNotExist,
    createDefaultCloudshelfIfNotExist: createDefaultCloudshelfIfNotExist
};
