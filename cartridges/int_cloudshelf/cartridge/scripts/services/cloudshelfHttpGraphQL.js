'use strict';

const Site = require('dw/system/Site');
const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');

const serviceName = 'cloudshelf.http.graphql';

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

/**
 * Returns an object with the service's callback functions implemented
 * @returns {Object} service config object
 */
function getCloudshelfGraphQLServiceConfig() {
    return {
        createRequest: function (service, requestData) {
            service.addHeader('Authorization', 'Token ' + getAPIKey());
            service.addHeader('Content-Type', 'application/json');

            return JSON.stringify(requestData);
        },
        parseResponse: function (svc, httpClient) {
            let serviceResponse;

            try {
                serviceResponse = JSON.parse(httpClient.getText());
            } catch (error) {
                return {
                    error: true,
                    errorMessage: error.message
                };
            }

            if (!serviceResponse || !serviceResponse.data) {
                let responseErrors = serviceResponse.errors || [];
                let errorMessage = ''

                if (responseErrors.length) {
                    let errorObject = {
                        message: responseErrors[0].message,
                        code: responseErrors[0].extensions && responseErrors[0].extensions.code,
                        tracing: responseErrors[0].extensions && responseErrors[0].extensions.tracing
                    };
                    errorMessage = JSON.stringify(errorObject)
                }

                return {
                    error: true,
                    errorMessage: errorMessage
                };
            }

            return {
                error: false,
                data: serviceResponse.data
            };
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    };
}

module.exports = function () {
    return LocalServiceRegistry.createService(serviceName, getCloudshelfGraphQLServiceConfig());
};
