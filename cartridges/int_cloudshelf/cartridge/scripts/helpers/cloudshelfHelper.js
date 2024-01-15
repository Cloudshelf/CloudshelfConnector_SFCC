'use strict';

/**
 * Returns cloudshelf logger instance
 * @returns {dw.system.Log} - logger instance
 */
function getLogger() {
    return require('dw/system/Logger').getLogger('cloudshelf', 'cloudshelf');
}

module.exports = {
    getLogger: getLogger
};