'use strict';

const base = module.superModule;

/**
 * Returns array with unique elements
 * @param {Array} argument0..argumentN - Arrays whose elements will be returned
 * @returns {Array|undefined}
 */
function uniq() {
    var args = Array.from(arguments);
    if (!args.length) {
        return;
    }
    return Array.from(new Set(Array.prototype.concat.apply([], args)));
}

/**
 * Pushes value to array in case if value does not present in it
 * @param {array} arr - Array to insert value
 * @param {*} value - Value that will be inserted if does not presented in array
 * @returns {array}
 */
function pushIfNotExist(arr, value) {
    if (arr.indexOf(value) === -1) {
        arr.push(value);
    }
    return arr;
}

/**
 * Checks if two arrays are the same
 * @param {array} a - First array
 * @param {array} b - Second array
 * @param {boolean} sorted - Arrays sorting flag
 * @returns {boolean}
 */
function isEqual(a, b, sorted) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    let bb = sorted ? b : b.slice();
    for (let i = 0, l = a.length; i < l; i++) {
        if (sorted) {
            if (a[i] !== bb[i]) return false;
        } else {
            let index = bb.indexOf(a[i]);
            if (index === -1) return false;
            delete(bb[index]);
        }
    }
    return true;
}

module.exports = base || {};
module.exports.uniq = uniq;
module.exports.pushIfNotExist = pushIfNotExist;
module.exports.isEqual = isEqual;
