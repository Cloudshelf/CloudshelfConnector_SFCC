'use strict';

const assert = require('chai').assert;
const proxyquire = require('proxyquire').noCallThru().noPreserveCache();
const cloudshelfLogHelper = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/helpers/cloudshelfLogHelper');
const cartridgeVersion = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/cloudshelfVersion');
const queries = require('../../../../cartridges/int_cloudshelf/cartridge/scripts/graphql/cloudshelfGraphqlQueries');

describe('cloudshelf/cloudshelfHttpGraphQL', function () {
    let errors;
    const createService = proxyquire(
        '../../../../cartridges/int_cloudshelf/cartridge/scripts/services/cloudshelfHttpGraphQL.js',
        {
            'dw/system/Site': { getCurrent: () => ({ getCustomPreferenceValue: () => 'an-api-key' }) },
            // The real registry returns a service; the callbacks are what is under test here
            'dw/svc/LocalServiceRegistry': { createService: (name, config) => config },
            'dw/system/Logger': {
                getLogger: () => ({
                    isDebugEnabled: () => false,
                    debug: () => {},
                    error: (message, ...args) =>
                        errors.push(message.replace(/\{(\d+)\}/g, (match, index) => args[index])),
                }),
            },
            '*/cartridge/scripts/helpers/cloudshelfLogHelper': cloudshelfLogHelper,
            '*/cartridge/scripts/cloudshelfVersion': cartridgeVersion,
        },
    );
    let headers;
    const service = {
        addHeader: (name, value) => {
            headers[name] = value;
        },
    };

    function manyProducts(count) {
        const products = [];
        for (let i = 1; i <= count; i++) {
            products.push({ id: 'gid://external/salesforceProduct/' + i, description: new Array(801).join('x') });
        }
        return products;
    }

    beforeEach(function () {
        errors = [];
        headers = {};
    });

    it('should tell Cloudshelf which version of the cartridge sent the request', function () {
        createService().createRequest(service, { query: queries.query.Products, variables: { first: 250 } });

        assert.match(headers['User-Agent'], /^Cloudshelf-Salesforce-Connector\/v\d+\.\d+\.\d+$/);
        assert.equal(headers['User-Agent'], 'Cloudshelf-Salesforce-Connector/v' + cartridgeVersion);
    });

    it('should carry the version the package is released as', function () {
        assert.equal(cartridgeVersion, require('../../../../package.json').version);
    });

    it('should send the request in full', function () {
        const callbacks = createService();
        const requestBody = { query: queries.mutation.UpsertProducts, variables: { input: manyProducts(2) } };

        assert.deepEqual(JSON.parse(callbacks.createRequest(service, requestBody)), requestBody);
    });

    it('should describe a large request in one short line of the communication log', function () {
        const callbacks = createService();
        const text = callbacks.createRequest(service, {
            query: queries.mutation.UpsertProducts,
            variables: { input: manyProducts(170) },
        });

        const logged = callbacks.getRequestLogMessage(text);

        assert.isAbove(text.length, 100000);
        assert.equal(
            logged,
            'UpsertProducts, input: 170 items (gid://external/salesforceProduct/1 to ' +
                'gid://external/salesforceProduct/170) (' +
                text.length +
                ' characters)',
        );
    });

    it('should describe an answer in one short line of the communication log', function () {
        const callbacks = createService();
        callbacks.createRequest(service, {
            query: queries.mutation.UpsertProducts,
            variables: { input: manyProducts(170) },
        });
        const answer = JSON.stringify({ data: { upsertProducts: { products: manyProducts(170), userErrors: [] } } });

        const logged = callbacks.getResponseLogMessage({ statusCode: 200, text: answer });

        assert.equal(logged, 'HTTP 200, ' + answer.length + ' characters. upsertProducts: products 170, userErrors 0');
    });

    it('should add the answer and the request, cut short, when Cloudshelf rejected something', function () {
        const callbacks = createService();
        callbacks.createRequest(service, {
            query: queries.mutation.UpsertProducts,
            variables: { input: manyProducts(170) },
        });
        const answer = JSON.stringify({
            data: { upsertProducts: { products: [], userErrors: [{ code: 'INVALID', message: 'No display name' }] } },
        });

        const logged = callbacks.getResponseLogMessage({ statusCode: 200, text: answer });

        assert.include(logged, 'userErrors 1 (first: No display name)');
        assert.include(logged, '\nAnswer: ' + answer);
        assert.include(logged, '\nRequest: {"query":"mutation UpsertProducts');
        assert.isBelow(logged.length, 3000);
    });

    it('should add the error text when Cloudshelf refused the request', function () {
        const callbacks = createService();
        callbacks.createRequest(service, { query: queries.query.Products, variables: { first: 250 } });

        const logged = callbacks.getResponseLogMessage({
            statusCode: 400,
            text: null,
            errorText: '{"errors":[{"message":"Cannot query field"}]}',
        });

        assert.include(logged, 'HTTP 400, 45 characters. errors: 1, first: Cannot query field; no data');
        assert.include(logged, '\nAnswer: {"errors":[{"message":"Cannot query field"}]}');
        assert.include(logged, '\nRequest: {"query":"query Products');
    });

    it('should say so when the answer is not JSON', function () {
        const callbacks = createService();
        callbacks.createRequest(service, { query: queries.query.Products, variables: { first: 250 } });

        const logged = callbacks.getResponseLogMessage({
            statusCode: 502,
            text: null,
            errorText: '<html>Bad Gateway</html>',
        });

        assert.include(logged, 'HTTP 502, 24 characters. not JSON');
        assert.include(logged, '\nAnswer: <html>Bad Gateway</html>');
    });

    it('should give the data of an answer to the caller', function () {
        const callbacks = createService();
        callbacks.createRequest(service, { query: queries.query.Products, variables: { first: 250 } });

        const result = callbacks.parseResponse(service, { getText: () => '{"data":{"products":{"edges":[]}}}' });

        assert.deepEqual(result, { error: false, data: { products: { edges: [] } } });
    });

    it('should give the first error of an answer without data to the caller', function () {
        const callbacks = createService();
        callbacks.createRequest(service, { query: queries.query.Products, variables: { first: 250 } });

        const result = callbacks.parseResponse(service, {
            getText: () => '{"errors":[{"message":"Not allowed","extensions":{"code":"FORBIDDEN"}}],"data":null}',
        });

        assert.isTrue(result.error);
        assert.deepEqual(JSON.parse(result.errorMessage), { message: 'Not allowed', code: 'FORBIDDEN' });
    });

    it('should log an answer it cannot parse cut short, with what was sent', function () {
        const callbacks = createService();
        callbacks.createRequest(service, { query: queries.query.Products, variables: { first: 250 } });

        const result = callbacks.parseResponse(service, { getText: () => '<html>' + new Array(50001).join('x') });

        assert.isTrue(result.error);
        assert.lengthOf(errors, 1);
        assert.include(errors[0], 'Request: Products, first: 250');
        assert.isBelow(errors[0].length, 2500);
    });
});
