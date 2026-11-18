'use strict';
const SystemObjectMgr = require('dw/object/SystemObjectMgr');
const cloudshelfHelper = require('*/cartridge/scripts/helpers/cloudshelfHelper');
const logger = cloudshelfHelper.getLogger();

let stores;
let countRead = 0;
let countSaved = 0;
let countRejected = 0;
let countFailedCalls = 0;

exports.beforeStep = function (parameters) {
    countRead = 0;
    countSaved = 0;
    countRejected = 0;
    countFailedCalls = 0;
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
    const LocationModel = require('*/cartridge/models/cloudshelf/cloudshelfLocationModel');
    let location = new LocationModel(store);
    return location;
};

exports.write = function (locations) {
    const CloudshelfApiModel = require('*/cartridge/models/cloudshelf/cloudshelfApiModel');
    const cloudshelfApi = new CloudshelfApiModel();
    const locationList = locations.toArray();
    countRead += locationList.length;

    const result = cloudshelfApi.upsertLocations(locationList);
    if (!result || !result.upsertLocations) {
        // The reason is in the error logged by the API call just above
        countFailedCalls++;
        logger.error(
            'Store export: Cloudshelf did not accept a request with {0} stores ({1}). None of them were saved.',
            locationList.length,
            locationList
                .map(function (location) {
                    return location.id;
                })
                .join(', '),
        );
        return;
    }

    const saved = (result.upsertLocations.locations || []).length;
    const userErrors = result.upsertLocations.userErrors || [];
    countSaved += saved;
    logger.info('Store export: Cloudshelf saved {0} of the {1} stores in this request', saved, locationList.length);
    if (userErrors.length) {
        // Cloudshelf saves the stores it can and answers with a reason for each one it cannot
        countRejected += locationList.length - saved;
        logger.warn(
            'Store export: Cloudshelf rejected {0} stores in a request for {1}. A new store needs a name, ' +
                'a country and a first address line. Reasons: {2}',
            locationList.length - saved,
            locationList
                .map(function (location) {
                    return location.id;
                })
                .join(', '),
            JSON.stringify(userErrors),
        );
    }

    return;
};

exports.afterChunk = function () {
    return;
};

exports.afterStep = function () {
    if (stores) {
        logger.info(
            'Store export summary. Stores read: {0}, saved by Cloudshelf: {1}, rejected by Cloudshelf: {2}, failed requests: {3}',
            countRead,
            countSaved,
            countRejected,
            countFailedCalls,
        );
    }
    return;
};
