'use strict';

const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
const cloudshelfApi = new CloudshelfApiModel();

const GLOBAL_ID_NAMESPACES = {
    PRODUCT: 'salesforceProduct',
    PRODUCT_GROUP: 'salesforceCategory',
    LOCATION: 'SalesforceLocation',
    CLOUDSHELF: 'SalesforceConnectorGeneratedCloudshelf',
    THEME: 'SalesforceBrand',
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

/**
 * gets value from object by path
 * @param {Object} object with needed data
 * @param {string} path to needed property joined by dot
 * @return {Object|string|Array|boolean} value for searched property
 * @pricate
 */
function getPropertyByPath(object, path) {
    let key = object;
    let splittedPath = path.split('.');

    // eslint-disable-next-line
    for (let i in splittedPath) {
        if (key && Object.hasOwnProperty.call(key, splittedPath[i])) {
            key = key[splittedPath[i]];
        } else {
            key = null;
        }
    }
    return key;
}

/**
 * Returs metadata array for specified dw system object based on provided mapping
 * @param {Object} dwObject with needed data
 * @param {string} configName site preference id with config mapping
 * @return {Array} metadata array
 * @pricate
 */
function getMetadata(dwObject, configName) {
    const Site = require('dw/system/Site');
    const result = [];
    let configMap;

    try {
        configMap = JSON.parse(Site.getCurrent().getCustomPreferenceValue(configName));
    } catch (err) {
        getLogger().warn('cloudshelfHelper.js:getMetadata error: {0}', err.message)
        return result;
    }

    if (!configMap) {
        return result;
    }

    try {
        Object.keys(configMap).forEach(function (key) {
            let data = getPropertyByPath(dwObject, key);
            if (data) {
                result.push({
                    data: String(data),
                    key: configMap[key]
                });
            }
        });
    } catch (err) {
        getLogger().warn('cloudshelfHelper.js:getMetadata error: {0}', err.message)
    }

    return result;
}

module.exports = {
    GLOBAL_ID_NAMESPACES: GLOBAL_ID_NAMESPACES,
    getLogger: getLogger,
    getGlobalId: getGlobalId,
    createDefaultThemeIfNotExist: createDefaultThemeIfNotExist,
    createDefaultCloudshelfIfNotExist: createDefaultCloudshelfIfNotExist,
    getMetadata: getMetadata
};
