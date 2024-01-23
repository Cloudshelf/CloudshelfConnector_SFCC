'use strict';

const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Transaction = require('dw/system/Transaction');
const CUSTOM_OBJECT_NAME = 'JobsData';

/**
 * Returns job data custom object
 * @param {string} stepName - job step name
 * @returns {Object} custom object entity
 */
function getCustomeObject(stepName) {
    return CustomObjectMgr.getCustomObject(CUSTOM_OBJECT_NAME, stepName);
}

/**
 * Creates job data custom object
 * @param {string} stepName - job step name
 * @returns {Object} custom object entity
 * @transactional
 */
function createCustomeObject(stepName) {
    return CustomObjectMgr.createCustomObject(CUSTOM_OBJECT_NAME, stepName);
}

/**
 * Return datetime when job step was run successfully last time
 * @param {string} stepName - job step name
 * @returns {Date} date or null if run first time
 */
function getLastRunDate(stepName) {
    const lastRunCustomObj = getCustomeObject(stepName);
    const lastRunDate = lastRunCustomObj ? lastRunCustomObj.custom.lastRun : null;
    return lastRunDate;
}

/**
 * Updates datetime when job step was run successfully last time
 * @param {string} stepName - job step name
 * @param {Date} runDate date object
 */
function updateLastRunDate(stepName, runDate) {
    let co = getCustomeObject(stepName)
    Transaction.wrap(function () {
        if (!co) {
            co = createCustomeObject(stepName)
        }
        co.custom.lastRun = runDate;
    });
}

module.exports = {
    getLastRunDate: getLastRunDate,
    updateLastRunDate: updateLastRunDate
};
