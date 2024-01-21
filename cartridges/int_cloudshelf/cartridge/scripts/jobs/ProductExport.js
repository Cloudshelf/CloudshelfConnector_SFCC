"use strict";

/**
 * Job Step Type 
 */

const Status = require("dw/system/Status");
const ProductSearchModel = require("dw/catalog/ProductSearchModel");
var cloudshelfHelper = require("~/cartridge/scripts/helpers/cloudshelfHelper");
var cloudshelfHttpGraphQL = require("~/cartridge/scripts/services/cloudshelfHttpGraphQL");
var cloudshelfGraphQueries = require("~/cartridge/scripts/graphql/cloudshelfGraphqlQueries");
const logger = require("dw/system").Logger.getLogger("Cloudshelf", "Cloudshelf");
let countProcessed = 0;

let products;

let exportObj =[];

exports.beforeStep = function (params) {   
    const cgid = 'root';
    if (!cgid) {
        return new Status(Status.ERROR, 'ERROR', 'CategoryID is not set.');
    }
    /* const ProductSearchModel = require('dw/catalog/ProductSearchModel'); */
    const apiProductSearch = new ProductSearchModel();
    apiProductSearch.setCategoryID(cgid);
    apiProductSearch.setRecursiveCategorySearch(true);
    apiProductSearch.search();
    products = apiProductSearch.getProductSearchHits();
    return products;
};

/**
 * Returns the total number of items that are available.
 *
 * @returns {number}
 */
exports.getTotalCount = function () {
    return true;
};

/**
 * Returns one item or nothing if there are no more items.
 *
 * @returns {?dw.order.Order} - API order
 */
exports.read = function () {
    if (products.hasNext()) {
        return products.next();
    }

    return undefined;
};

exports.write = function () {
    let masterProductQueryVariables =  [];
    let graphqlMutationRequest;
    let requestBody;
    let productInfo;
    let gid;
    cloudshelfHelper.getLogger().info('AfterChunk');
    
    exportObj.forEach(element => {
        if (!element.product.bundle) {
            gid = cloudshelfHelper.getGlobalId(cloudshelfHelper.GLOBAL_ID_NAMESPACES.PRODUCT, element.product.ID);
            productInfo =
            {
                "description": String(element.product.shortDescription || element.product.longDescription || ""),
                "displayName": element.product.name,
                "id": gid,
                "metadata": [
                    {
                        "data": "data",
                        "id": gid,
                        "key": "key"
                    }
                ],
                "productType": "product",
                "tags": [
                    "tags"
                ],
                "vendor": element.product.brand
            }

            masterProductQueryVariables.push(productInfo);
        }
    });
   masterProductQueryVariables

    requestBody = {
        query: cloudshelfGraphQueries.mutation.UpsertProducts,
        variables: {
            input: masterProductQueryVariables
        }
    };
    const service = cloudshelfHttpGraphQL();
    const serviceResult = service.call(requestBody);
    exportObj = [];
    return;
};

/**
 *
 * returns Cybersource capture for orders
 * @param {dw.catalog.ProductSearchHit} productHit
 * @returns {*} - obj Job Status
 */
exports.process = function (productHit) {
    if (productHit) {
        try {
            /* Remove Export Obj */
            exportObj.push({product: productHit.product,  variations: productHit.representedProducts});
          
            /* Transaction.wrap(function  () {
                product.custom.isNew = isNew;
                product.custom.highlights = highlights;
            }); */
        } catch (error) {
            logger.error('processProductExportJob error: {0}', error);
        }
    }
    return new Status(Status.OK);

};
