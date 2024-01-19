'use strict';

/**
 * Parse JSON string safely
 * @param {string} jsonString - JSON string for parsing
 * @param {Object} [errorValue] - value is returned on parsing error, by default null
 * @returns {Object} JSON.parse result or defaultValue if parsing ends with error
 */
function parse(jsonString, errorValue) {
    try {
        const result = JSON.parse(jsonString);

        return result;
    } catch (error) {
        return errorValue || null;
    }
}

module.exports = {
    parse: parse
};
