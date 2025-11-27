'use strict';

const currentSite = require('dw/system/Site').getCurrent();

/**
 * Returns default cloudshelf id value
 * @returns {string} default cloudshelf id value
 * @private
 */
function getDefaultCloudshelfId() {
    return currentSite.ID;
}

/**
 * Returns default cloudshelf display name value
 * @returns {string} default cloudshelf display name value
 * @private
 */
function getDefaultCloudshelfName() {
    return 'First Cloudshelf';
}

/**
 * Returns cloudshelf system global id
 * @param {Object} params - params object (optional)
 * @returns {string} cloudshelf system global id
 * @private
 */
function getId(params) {
    const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
    const internalId = params.id || getDefaultCloudshelfId();
    return cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.CLOUDSHELF, internalId);
}

/**
 * Cloudshelf class that represents an cloudshlelf entity on Cloudshelf side
 * @param {Object} params - params object
 * @property {string} params.theme - theme object
 * @property {string} params.id - cloudshlelf id (optional)
 * @property {string} params.displayName - cloudshlelf name (optional)
 * @property {string} params.homeFrameCallToAction - homeFrameCallToAction value (optional)
 * @constructor
 */
function Cloudshelf(params) {
    if (!params) {
        params = {};
    }

    if (params.theme) {
        this.themeId = params.theme.id;
    }

    this.id = getId(params);
    this.displayName = params.displayName || getDefaultCloudshelfName();
    this.randomContent = true;
    this.homeFrameCallToAction = params.homeFrameCallToAction || 'Touch to discover and buy';
}

module.exports = Cloudshelf;
