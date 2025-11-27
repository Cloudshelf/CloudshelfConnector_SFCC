'use strict';

const Cookie = require('dw/web/Cookie');

/**
 * create cookie function
 * @param {string} name - name
 * @param {string} value - value
 * @param {string} path - path
 * @param {number} maxAge - maxAge in seconds
 * @returns {Object} - cookie
 */
function createCookie(name, value, path, maxAge) {
    const newCookie = new Cookie(name, value);
    newCookie.setPath(path);
    if (maxAge) {
        newCookie.setMaxAge(maxAge);
    }

    response.addHttpCookie(newCookie);
    return newCookie;
}

/**
 * update cookie function
 * @param {Object} cookie - cookie
 * @param {string} value - value
 */
function updateCookie(cookie, value) {
    cookie.setValue(value);
    cookie.setPath('/');
    response.addHttpCookie(cookie);
}

/**
 * delete cookie function
 * @param {Object} cookie - cookie
 */
function deleteCookie(cookie) {
    cookie.setMaxAge(0);
    response.addHttpCookie(cookie);
}

module.exports = {
    createCookie: createCookie,
    updateCookie: updateCookie,
    deleteCookie: deleteCookie,
};
