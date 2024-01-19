'use strict';

/**
 * @module object
 */

/**
 * Deep copies all all object properties from source to target
 *
 * @param {Object} targetObject The target object which should be extended
 * @param {...Object} sourceObject The objects for extension
 * @return {Object} The target object which should be extended
 */
function extend(targetObject, sourceObject) {
    let target = targetObject;
    let source;

    if (!target) {
        return sourceObject;
    }

    for (let i = 1; i < arguments.length; i++) {
        source = arguments[i];
        // eslint-disable-next-line
        for (let prop in source) {
            // recurse for non-API objects
            if (source[prop] && typeof source[prop] === 'object' && !source[prop].class) {
                target[prop] = extend(target[prop], source[prop]);
            } else {
                target[prop] = source[prop];
            }
        }
    }

    return target;
}

/**
 * Access given properties of an object recursively
 *
 * @param {Object} object The object
 * @param {string} propertyString The property string, i.e. 'data.myValue.prop1'
 * @return {Object} The value of the given property or undefined
 * @example
 * let prop1 = require('~/object').resolve(obj, 'data.myValue.prop1')
 */
function resolve(object, propertyString) {
    let result = object;
    let propPath = propertyString.split('.');

    propPath.forEach(function (prop) {
        if (result && Object.hasOwnProperty.call(result, prop)) {
            result = result[prop];
        } else {
            result = undefined;
        }
    });

    return result;
}

/**
 * Returns an array containing all object values
 *
 * @param {Object} object - object
 * @return {Array} array
 */
function values(object) {
    return !object ? [] : Object.keys(object).map(function (key) {
        return object[key];
    });
}

/**
 * A shortcut for native static method "keys" of "Object" class
 *
 * @param {Object} object - object
 * @return {Array} array
 */
function keys(object) {
    return object ? Object.keys(object) : [];
}

/**
 * Convert the given object to a HashMap object
 *
 * @param {Object} object - object
 * @return {dw.util.HashMap} all the data which will be used in mail template.
 */
function toHashMap(object) {
    const HashMap = require('dw/util/HashMap');
    let hashmap = new HashMap();

    // eslint-disable-next-line
    for (let key in object) {
        if (Object.hasOwnProperty.call(object, key)) {
            hashmap.put(key, object[key]);
        }
    }

    return hashmap;
}

/**
 * Convert the given Map to a plain object
 *
 * @param {dw.util.Map} map - HashMap
 * @return {Object} all the data which will be used in mail template.
 */
function fromHashMap(map) {
    let object = {};
    let entrySetItr = map.entrySet().iterator();

    while (entrySetItr.hasNext()) {
        let entry = entrySetItr.next();
        object[entry.key] = entry.value;
    }

    return object;
}

/**
 * @function
 * @description set value in object by path
 * @param {Object} object where to set data
 * @param {string} path to an object attribute
 * @param {Object|string|Array|boolean} value to set
 * @return {boolean} if well set
 */
function setPropertyByPath(object, path, value) {
    if (!object || !path || !value) {
        return false;
    }
    let key = object;

    let pathArray = path.split('.');
    let lastKey = pathArray.pop();

    pathArray.forEach(function (prop) {
        if (!Object.hasOwnProperty.call(key, prop)) {
            key[prop] = {};
        }
        key = key[prop];
    });
    key[lastKey] = value;

    return true;
}

/**
 * @function
 * @description gets value from object by path
 * @param {Object} object with needed data
 * @param {string} path to needed property joined by dot
 * @param {Object} errorResult will be return then error, or null
 * @return {Object|string|Array|boolean} value for searched property
 */
function getPropertyByPath(object, path, errorResult) {
    if (!path || !object) {
        return errorResult !== undefined ? errorResult : null;
    }

    let key = object;
    let splittedPath = path.split('.');

    // eslint-disable-next-line
    for (let i in splittedPath) {
        if (key && Object.hasOwnProperty.call(key, splittedPath[i])) {
            key = key[splittedPath[i]];
        } else {
            key = errorResult !== undefined ? errorResult : null;
        }
    }
    return key;
}

/**
 * @function
 * @description Checks if value is an object
 * @param {*} value - Value of any type to check if it is an object
 * @returns {boolean}
 */
function isObject(value) {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    );
}

/**
 * Creates deep clone of object
 * @param {*} obj -
 * @returns {*}
 */
function deepCopy(obj) {
    if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
        return obj;
    }
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    if (obj instanceof RegExp) {
        return new RegExp(obj);
    }
    if (obj instanceof Array) {
        let copy = [];
        for (let i = 0, len = obj.length; i < len; i++) {
            copy[i] = deepCopy(obj[i]);
        }
        return copy;
    }
    if (obj instanceof Function) {
        return new Function('return ' + obj.toString())();
    }
    if (obj instanceof Object) {
        let copy = {};
        for (let attr in obj) {
            // eslint-disable-next-line no-prototype-builtins
            if (obj.hasOwnProperty(attr)) {
                copy[attr] = deepCopy(obj[attr]);
            }
        }
        return copy;
    }
    throw new Error(`Unable to copy ${obj} of source object.`);
}

module.exports = {
    extend: extend,
    resolve: resolve,
    values: values,
    keys: keys,
    toHashMap: toHashMap,
    fromHashMap: fromHashMap,
    setPropertyByPath: setPropertyByPath,
    getPropertyByPath: getPropertyByPath,
    isObject: isObject,
    deepCopy: deepCopy
};
