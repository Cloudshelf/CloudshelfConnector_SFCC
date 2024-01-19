'use strict';

const currentSite = require('dw/system/Site').getCurrent();

/**
 * Returns default cloudshelf theme id value
 * @returns {string} default cloudshelf theme id value
 * @private
 */
function getDefaultThemeId() {
    return currentSite.ID;
}

/**
 * Returns default cloudshelf theme display name value
 * @returns {string} default cloudshelf theme display name value
 * @private
 */
function getDefaultThemeName() {
    return currentSite.name;
}

/**
 * Returns cloudshelf system global id
 * @param {Object} params - params object (optional)
 * @returns {string} cloudshelf system global id
 * @private
 */
function getId(params) {
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const internalId = params.id || getDefaultThemeId();
    return cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.THEME, internalId);
}

/**
 * Theme class that represents a cloudshlef theme
 * @param {Object} params - params object (optional)
 * @property {string} params.id - theme id (optional)
 * @property {string} params.displayName - theme name (optional)
 * @constructor
 */
function Theme(params) {
    if (!params) {
        params = {}
    }

    this.id = getId(params);
    this.displayName = params.displayName || getDefaultThemeName();
}

module.exports = Theme;