'use strict';

/**
 * Short descriptions of Cloudshelf API requests and answers for the log files.
 *
 * SFCC stops writing to a log file once it reaches 10 MB in a day. A request for a chunk of products is
 * around 150 KB, so logging requests and answers in full fills a log within one export of a large
 * catalogue, and every later line, errors included, is lost. These descriptions say what was sent and what
 * came back in one line instead.
 *
 * Nothing here may throw: a log line must never stop a request.
 */

const MAX_VALUE_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 300;
const MAX_PROBLEMS_LISTED = 20;

/**
 * Cuts a text to a maximum length, saying how long it was. Blank space around it is dropped: the error text
 * of a response ends with a line break, which would leave an empty line in the log.
 * @param {*} text - value to cut
 * @param {number} maxLength - characters to keep
 * @returns {string} the text, cut when it was longer
 */
function shorten(text, maxLength) {
    const value = text === null || text === undefined ? '' : String(text).trim();
    if (value.length <= maxLength) {
        return value;
    }
    return value.substring(0, maxLength) + '... (' + value.length + ' characters in all)';
}

/**
 * Writes a count the way SFCC's logger writes the numbers it is given: 21,055
 * @param {number} count - whole number
 * @returns {string} the number with thousands separators
 */
function formatCount(count) {
    return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Returns the name of the GraphQL operation in a query text
 * @param {string} query - GraphQL query or mutation text
 * @returns {string} operation name
 */
function getOperationName(query) {
    const match = /(?:query|mutation)\s+(\w+)/.exec(query || '');
    return match ? match[1] : 'unnamed request';
}

/**
 * Returns the id of one item sent to Cloudshelf
 * @param {*} item - a global id, or an input object with an id
 * @returns {string|null} id, or null when the item has none
 */
function getItemId(item) {
    if (item === null || item === undefined) {
        return null;
    }
    if (typeof item !== 'object') {
        return String(item);
    }
    return item.id || item.productId || null;
}

/**
 * Describes one variable of a request
 * @param {string} name - variable name
 * @param {*} value - variable value
 * @returns {string|null} description, or null when there is nothing to say
 */
function describeVariable(name, value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (Array.isArray(value)) {
        let text = name + ': ' + value.length + (value.length === 1 ? ' item' : ' items');
        const firstId = value.length ? getItemId(value[0]) : null;
        const lastId = value.length > 1 ? getItemId(value[value.length - 1]) : null;
        if (firstId && lastId) {
            text += ' (' + firstId + ' to ' + lastId + ')';
        } else if (firstId) {
            text += ' (' + firstId + ')';
        }
        return text;
    }
    if (typeof value === 'object') {
        const id = getItemId(value);
        return name + ': 1 item' + (id ? ' (' + id + ')' : '');
    }
    return name + ': ' + shorten(value, MAX_VALUE_LENGTH);
}

/**
 * Describes a request in one line: the operation, how many items it carries and their first and last id
 * @param {Object} requestBody - GraphQL request with query and variables
 * @returns {string} description
 */
function describeRequest(requestBody) {
    let operationName = 'unnamed request';
    try {
        operationName = getOperationName(requestBody && requestBody.query);
        const variables = (requestBody && requestBody.variables) || {};
        const parts = [operationName];
        Object.keys(variables).forEach(function (name) {
            const part = describeVariable(name, variables[name]);
            if (part) {
                parts.push(part);
            }
        });
        return parts.join(', ');
    } catch (err) {
        return operationName;
    }
}

/**
 * Describes one field of the data Cloudshelf answered with
 * @param {string} name - field name
 * @param {*} value - field value
 * @returns {Object} text, and whether Cloudshelf reported user errors in it
 */
function describeDataField(name, value) {
    if (value === null || typeof value !== 'object') {
        return { text: name + ': ' + shorten(value, MAX_VALUE_LENGTH), hasUserErrors: false };
    }
    if (Array.isArray(value)) {
        return { text: name + ': ' + value.length, hasUserErrors: false };
    }

    const parts = [];
    let hasUserErrors = false;
    Object.keys(value).forEach(function (key) {
        const inner = value[key];
        if (Array.isArray(inner)) {
            let text = key + ' ' + inner.length;
            if (key === 'userErrors' && inner.length) {
                hasUserErrors = true;
                text +=
                    ' (first: ' +
                    shorten((inner[0] && (inner[0].message || inner[0].code)) || '', MAX_MESSAGE_LENGTH) +
                    ')';
            }
            parts.push(text);
        } else if (inner === null || typeof inner !== 'object') {
            parts.push(key + ' ' + shorten(inner, MAX_VALUE_LENGTH));
        }
    });
    return { text: name + ': ' + (parts.length ? parts.join(', ') : 'answered'), hasUserErrors: hasUserErrors };
}

/**
 * Describes Cloudshelf's answer in one line: how many items each operation returned, how many it rejected
 * and the first error
 * @param {Object} response - parsed GraphQL response
 * @returns {Object} text, and hasProblem: true when the answer carries an error, a rejection or no data
 */
function describeResponse(response) {
    try {
        if (!response || typeof response !== 'object') {
            return { text: 'no readable answer', hasProblem: true };
        }

        const parts = [];
        let hasProblem = false;
        const errors = response.errors || [];
        if (errors.length) {
            hasProblem = true;
            const first = errors[0] || {};
            const extensions = first.extensions || {};
            let text = 'errors: ' + errors.length + ', first: ' + shorten(first.message, MAX_MESSAGE_LENGTH);
            if (extensions.code) {
                text += ', code ' + extensions.code;
            }
            if (extensions.tracing) {
                text += ', tracing ' + shorten(JSON.stringify(extensions.tracing), MAX_MESSAGE_LENGTH);
            }
            parts.push(text);
        }

        if (response.data && typeof response.data === 'object') {
            Object.keys(response.data).forEach(function (name) {
                const field = describeDataField(name, response.data[name]);
                hasProblem = hasProblem || field.hasUserErrors;
                parts.push(field.text);
            });
        } else {
            hasProblem = true;
            parts.push('no data');
        }

        return { text: parts.join('; '), hasProblem: hasProblem };
    } catch (err) {
        return { text: 'answer could not be described', hasProblem: true };
    }
}

/**
 * The problems of one job step, for a recap at the end of its log. It counts every problem and keeps the
 * text of the first ones, so that a run where every request fails cannot fill the log with the recap.
 * @param {number} [limit] - how many problems to keep the text of
 * @constructor
 */
function ProblemList(limit) {
    this.limit = limit || MAX_PROBLEMS_LISTED;
    this.total = 0;
    this.entries = [];
}

/**
 * Records a problem
 * @param {string} text - what went wrong, with what and why
 */
ProblemList.prototype.add = function (text) {
    this.total++;
    if (this.entries.length < this.limit) {
        this.entries.push(text);
    }
};

/**
 * Returns the recap: a heading with the number of problems, then the first ones, one per line
 * @param {string} heading - what the problems belong to, for example a summary of the run
 * @returns {string} recap
 */
ProblemList.prototype.describe = function (heading) {
    const lines = [heading];
    lines.push(
        this.total > this.entries.length
            ? 'Problems: ' + formatCount(this.total) + '. The first ' + this.entries.length + ':'
            : 'Problems: ' + this.total + ':',
    );
    this.entries.forEach(function (entry, index) {
        lines.push(index + 1 + '. ' + entry);
    });
    return lines.join('\n');
};

module.exports = {
    shorten: shorten,
    formatCount: formatCount,
    getOperationName: getOperationName,
    describeRequest: describeRequest,
    describeResponse: describeResponse,
    ProblemList: ProblemList,
    MAX_PROBLEMS_LISTED: MAX_PROBLEMS_LISTED,
};
