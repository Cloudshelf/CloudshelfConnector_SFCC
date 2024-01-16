'use strict';

const GLOBAL_ID_NAMESPACES = {
    PRODUCT: 'salesforceProduct',
    PRODUCT_GROUP: 'salesforceCategory',
    LOCATION: 'salesforceStore'
}

/**
 * Returns cloudshelf logger instance
 * @returns {dw.system.Log} - logger instance
 */
function getLogger() {
    return require('dw/system/Logger').getLogger('cloudshelf', 'cloudshelf');
}

function getGlobalId(namespace, id) {
    return 'gid://external/' + namespace + '/' + id;
}

module.exports = {
    GLOBAL_ID_NAMESPACES: GLOBAL_ID_NAMESPACES,
    getLogger: getLogger,
    getGlobalId: getGlobalId
};