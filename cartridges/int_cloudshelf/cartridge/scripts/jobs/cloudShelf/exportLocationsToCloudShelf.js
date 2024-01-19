'use strict';
const SystemObjectMgr = require('dw/object/SystemObjectMgr');
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
const logger = cloudshelfHelper.getLogger();

let stores;

exports.beforeStep = function (parameters) {
    if (parameters.isDisable) {
        logger.info('Job is disabled');
        return;
    }
    const type = 'Store';
    const sortString = 'creationDate desc';
    const queryString = 'custom.isCloudshelf = {0}';
    const isExport = true;
    stores = SystemObjectMgr.querySystemObjects(type, queryString, sortString, isExport);
    logger.info('Total stores for export found {0}', stores.getCount());
};

exports.getTotalCount = function () {
    if (stores) {
        return stores.getCount();
    }
    return;
};

exports.read = function () {
    if (stores && stores.hasNext()) {
        return stores.next();
    }
    return;
};

exports.process = function (store) {
    const LocationModel =  require('*/cartridge/models/cloudshelf/cloudshelfLocationModel');
    let location = new LocationModel(store);
    return location;
}

exports.write = function (locations) {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const cloudshelfApi = new CloudshelfApiModel();
    cloudshelfApi.upsertLocations(locations);
    logger.info('Result of Locations Export - Chunk processed. Stores Exported + {0}', locations.length);

    return;
};

exports.afterChunk = function () {
    return;
};

exports.afterStep = function () {
    return;
};