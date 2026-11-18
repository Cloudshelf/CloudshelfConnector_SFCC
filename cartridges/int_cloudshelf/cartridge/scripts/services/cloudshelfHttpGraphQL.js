'use strict';

const Site = require('dw/system/Site');
const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const Logger = require('dw/system/Logger').getLogger('cloudshelf', 'graphql');

const serviceName = 'cloudshelf.http.graphql';
const USER_AGENT = 'Cloudshelf-Salesforce-Connector/v' + require('*/cartridge/scripts/cloudshelfVersion');

/**
 * Returns Cloudshelf API key value
 * @returns {string} api key value
 * @throws {Error} If API key is not found
 * @private
 */
function getAPIKey() {
    const apiKey = Site.getCurrent().getCustomPreferenceValue('cloudshelfAPIKey');
    if (!apiKey) {
        throw new Error('Cloudshelf API key site preference value is empty');
    }
    return apiKey;
}

// How much of a request or an answer is written to the log in full when a call goes wrong
const MAX_BODY_LOGGED = 2000;

/**
 * Returns an object with the service's callback functions implemented
 * @returns {Object} service config object
 */
function getCloudshelfGraphQLServiceConfig() {
    const cloudshelfLogHelper = require('*/cartridge/scripts/helpers/cloudshelfLogHelper');
    // What this one call sent and got back. A new config is made for every call, so these belong to it alone.
    let requestData;
    let requestText;
    let answerText;
    let answer;

    /**
     * Parses Cloudshelf's answer once, for both parseResponse and the communication log
     * @param {string} text - response body
     * @returns {Object} parsed: the response object, or parseError: why it could not be parsed
     */
    function readAnswer(text) {
        if (!answer || answerText !== text) {
            answerText = text;
            try {
                answer = { parsed: JSON.parse(text) };
            } catch (error) {
                answer = { parseError: error.message };
            }
        }
        return answer;
    }

    return {
        createRequest: function (service, data) {
            service.addHeader('Authorization', 'Token ' + getAPIKey());
            service.addHeader('Content-Type', 'application/json');
            // Cloudshelf records the User-Agent of every request, which is how it knows the cartridge version
            service.addHeader('User-Agent', USER_AGENT);

            requestData = data;
            requestText = JSON.stringify(data);
            return requestText;
        },
        parseResponse: function (svc, httpClient) {
            const text = httpClient.getText();
            const read = readAnswer(text);

            if (read.parseError) {
                Logger.error(
                    'GraphQL Response Parse Error: {0}. Request: {1}. Response: {2}',
                    read.parseError,
                    cloudshelfLogHelper.describeRequest(requestData),
                    cloudshelfLogHelper.shorten(text, MAX_BODY_LOGGED),
                );
                return {
                    error: true,
                    errorMessage: read.parseError,
                };
            }

            const serviceResponse = read.parsed;
            // Only at debug level. A response can be 100 KB, and SFCC stops writing to a log file once it
            // reaches 10 MB in a day, so at info level one export of a large catalogue filled the log and
            // every later line, errors included, was lost.
            if (Logger.isDebugEnabled()) {
                Logger.debug('GraphQL Response: {0}', JSON.stringify(serviceResponse));
            }

            if (!serviceResponse || !serviceResponse.data) {
                let responseErrors = (serviceResponse && serviceResponse.errors) || [];
                let errorMessage = '';

                if (responseErrors.length) {
                    let errorObject = {
                        message: responseErrors[0].message,
                        code: responseErrors[0].extensions && responseErrors[0].extensions.code,
                        tracing: responseErrors[0].extensions && responseErrors[0].extensions.tracing,
                    };
                    errorMessage = JSON.stringify(errorObject);
                }

                return {
                    error: true,
                    errorMessage: errorMessage,
                };
            }

            return {
                error: false,
                data: serviceResponse.data,
            };
        },
        /**
         * The communication log's line for a request: what was sent, not the request itself.
         * SFCC writes the service communication log on production too once this is implemented.
         */
        getRequestLogMessage: function () {
            return (
                cloudshelfLogHelper.describeRequest(requestData) +
                ' (' +
                (requestText ? requestText.length : 0) +
                ' characters)'
            );
        },
        /**
         * The communication log's line for an answer: the HTTP status and what Cloudshelf saved or rejected.
         * The answer and the request are added, cut short, only when something went wrong.
         */
        getResponseLogMessage: function (httpClient) {
            let statusCode = 0;
            let text = '';
            try {
                statusCode = httpClient.statusCode;
                text = httpClient.text || httpClient.errorText || '';
            } catch (error) {
                return 'The answer could not be read for the log: ' + error.message;
            }

            const read = readAnswer(text);
            const described = read.parseError
                ? { text: 'not JSON (' + read.parseError + ')', hasProblem: true }
                : cloudshelfLogHelper.describeResponse(read.parsed);
            let message = 'HTTP ' + statusCode + ', ' + text.length + ' characters. ' + described.text;

            if (described.hasProblem || statusCode !== 200) {
                message +=
                    '\nAnswer: ' +
                    cloudshelfLogHelper.shorten(text, MAX_BODY_LOGGED) +
                    '\nRequest: ' +
                    cloudshelfLogHelper.shorten(requestText, MAX_BODY_LOGGED);
            }
            return message;
        },
        filterLogMessage: function (msg) {
            return msg;
        },
    };
}

module.exports = function () {
    return LocalServiceRegistry.createService(serviceName, getCloudshelfGraphQLServiceConfig());
};
