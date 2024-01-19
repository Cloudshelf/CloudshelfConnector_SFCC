/* eslint-disable complexity */
'use strict';
const base = module.superModule;

const PriceBookMgr = require('dw/catalog/PriceBookMgr');
const collections = require('*/cartridge/scripts/util/collections');
const { plansConstants: { urlParamNames }, refinementsConstants: { canBeSoldWith } } = require('*/cartridge/config/constants');

/**
 * Set search configuration values
 *
 * @param {dw.catalog.ProductSearchModel} apiProductSearch - API search instance
 * @param {Object} params - Provided HTTP query parameters
 * @return {dw.catalog.ProductSearchModel} - API search instance
 * @param {Object} httpParameterMap - Query params
 */
function setupSearch(apiProductSearch, params, httpParameterMap) {
    const CatalogMgr = require('dw/catalog/CatalogMgr');
    const searchModelHelper = require('*/cartridge/scripts/search/search');

    const sortingRule = params.srule ? CatalogMgr.getSortingRule(params.srule) : null;
    let selectedCategory = CatalogMgr.getCategory(params.cgid);
    selectedCategory = selectedCategory && selectedCategory.online ? selectedCategory : null;

    searchModelHelper.setProductProperties(apiProductSearch, params, selectedCategory, sortingRule, httpParameterMap);

    if (params.preferences) {
        searchModelHelper.addRefinementValues(apiProductSearch, params.preferences);
    }
    let canBeSoldWithIsSet = false;
    Object.values(urlParamNames).forEach(value => {
        if (value in params && parseInt(params[value], 10)) {
            const preference = {};
            preference[canBeSoldWith.attributeID] = value;
            searchModelHelper.addRefinementValues(apiProductSearch, preference);
            canBeSoldWithIsSet = true;
            return;
        }
    });
    if (params.cgid && !canBeSoldWithIsSet) {
        const Site = require('dw/system/Site');
        const currentSite = Site.getCurrent();
        if (params.cgid === currentSite.getCustomPreferenceValue('devicesCategoryID')) {
            const values = currentSite.getCustomPreferenceValue('refinementValuesCanBeSoldWithForDevicesCategory');
            for (let item of values) {
                let value = item.value;
                const preference = {};
                preference[canBeSoldWith.attributeID] = value;
                searchModelHelper.addRefinementValues(apiProductSearch, preference);
                canBeSoldWithIsSet = true;
            }
        }
    }

    return apiProductSearch;
}

/**
 * Set Folder search configuration values
 *
 * @param {Object} params - Provided HTTP query parameters
 * @return {Object} - content search instance
 */
function setupSearchFolders(params) {
    const ContentSearchModel = require('dw/content/ContentSearchModel');
    const SearchFolders = require('*/cartridge/models/search/searchFolders');
    const apiContentSearchModel = new ContentSearchModel();

    apiContentSearchModel.setRecursiveFolderSearch(false);

    if (params.fdid) {
        apiContentSearchModel.setFolderID(params.fdid);
    }

    if (params.cid) {
        apiContentSearchModel.setContentID(params.cid);
    }

    apiContentSearchModel.search();
    const searchFolders = new SearchFolders(apiContentSearchModel);

    return searchFolders;
}

/**
 * performs a search
 *
 * @param {Object} req - Provided HTTP query parameters
 * @param {Object} res - Provided HTTP query parameters
 * @return {Object} - an object with relevant search information
 * @param {Object} httpParameterMap - Query params
 */
function search(req, res) {
    const CatalogMgr = require('dw/catalog/CatalogMgr');
    const URLUtils = require('dw/web/URLUtils');
    const ProductSearchModel = require('dw/catalog/ProductSearchModel');

    const pageMetaHelper = require('*/cartridge/scripts/helpers/pageMetaHelper');
    const ProductSearch = require('*/cartridge/models/search/productSearch');
    const reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
    const schemaHelper = require('*/cartridge/scripts/helpers/structuredDataHelper');

    let apiProductSearch = new ProductSearchModel();
    let categoryTemplate = '';
    const maxSlots = 4;
    let productSearch;
    let reportingURLs;

    const searchRedirect = req.querystring.q ? apiProductSearch.getSearchRedirect(req.querystring.q) : null;

    if (searchRedirect) {
        return { searchRedirect: searchRedirect.getLocation() };
    }

    apiProductSearch = setupSearch(apiProductSearch, req.querystring, req.httpParameterMap);
    const { priceBooksIsChanged, originalPriceBooks } = getOriginalAndSetAlternativePriceBooks(apiProductSearch);
    let result;
    try {
        apiProductSearch.search();

        if (!apiProductSearch.personalizedSort) {
            base.applyCache(res);
        }
        categoryTemplate = base.getCategoryTemplate(apiProductSearch);
        productSearch = new ProductSearch(
            apiProductSearch,
            req.querystring,
            req.querystring.srule,
            CatalogMgr.getSortingOptions(),
            CatalogMgr.getSiteCatalog().getRoot()
        );

        pageMetaHelper.setPageMetaTags(req.pageMetaData, productSearch);

        const canonicalUrl = URLUtils.url('Search-Show', 'cgid', req.querystring.cgid);
        let refineurl = URLUtils.url('Search-Refinebar');
        const allowedParams = ['q', 'cgid', 'pmin', 'pmax', 'srule', 'pmid'];
        Array.prototype.push.apply(allowedParams, Object.values(urlParamNames));
        let isRefinedSearch = false;

        Object.keys(req.querystring).forEach(function (element) {
            if (allowedParams.indexOf(element) > -1) {
                refineurl.append(element, req.querystring[element]);
            }

            if (['pmin', 'pmax'].indexOf(element) > -1) {
                isRefinedSearch = true;
            }

            if (element === 'preferences') {
                let i = 1;
                isRefinedSearch = true;
                Object.keys(req.querystring[element])
                    .filter(preference => preference !== canBeSoldWith.attributeID)
                    .forEach(function (preference) {
                        refineurl.append('prefn' + i, preference);
                        refineurl.append('prefv' + i, req.querystring[element][preference]);
                        i++;
                    });
            }
        });

        if (productSearch.searchKeywords !== null && !isRefinedSearch) {
            reportingURLs = reportingUrlsHelper.getProductSearchReportingURLs(productSearch);
        }

        result = {
            productSearch: productSearch,
            maxSlots: maxSlots,
            reportingURLs: reportingURLs,
            refineurl: refineurl,
            canonicalUrl: canonicalUrl,
            apiProductSearch: apiProductSearch
        };

        if (productSearch.isCategorySearch && !productSearch.isRefinedCategorySearch && categoryTemplate && apiProductSearch.category.parent.ID === 'root') {
            pageMetaHelper.setPageMetaData(req.pageMetaData, productSearch.category);
            result.category = apiProductSearch.category;
            result.categoryTemplate = categoryTemplate;
        }

        if (!categoryTemplate || categoryTemplate === 'rendering/category/categoryproducthits') {
            result.schemaData = schemaHelper.getListingPageSchema(productSearch.productIds);
        }
    } catch (error) {
        priceBooksIsChanged && restoreOriginalPriceBooks(originalPriceBooks);
        throw error;
    }
    priceBooksIsChanged && restoreOriginalPriceBooks(originalPriceBooks);

    return result;
}

/**
 * Sets price books as applicable when canBeSoldWith refinement has value, returns array of original price books
 * and state whether price books have been changed
 * @param {dw.catalog.ProductSearchModel} apiProductSearch - API search instance
 * @returns {object}
 */
function getOriginalAndSetAlternativePriceBooks(apiProductSearch) {
    const canBeSoldWithValues = apiProductSearch.getRefinementValues(canBeSoldWith.attributeID);
    let originalPriceBooks;
    if (canBeSoldWithValues.length) {
        // get current price books
        // eslint-disable-next-line no-unused-vars
        originalPriceBooks = PriceBookMgr.getApplicablePriceBooks().toArray();
        // get store price book collection
        const storePriceBooks = collections.map(canBeSoldWithValues, function (item) {
            return PriceBookMgr.getPriceBook(`att-mxn-device-${item}`);
        });
        // use store price books
        PriceBookMgr.setApplicablePriceBooks(storePriceBooks);
    }

    return {
        priceBooksIsChanged: !!canBeSoldWithValues.length,
        originalPriceBooks
    };
}

/**
 * Restores price books to original state
 * @param {array<dw.catalog.PriceBook>} originalPriceBooks - Array of original price books
 * @returns {void}
 */
function restoreOriginalPriceBooks(originalPriceBooks) {
    // return price books to original state
    PriceBookMgr.setApplicablePriceBooks(originalPriceBooks);
}

base.setupSearch = setupSearch;
base.setupSearchFolders = setupSearchFolders;
base.search = search;

module.exports = base;
module.exports.getOriginalAndSetAlternativePriceBooks = getOriginalAndSetAlternativePriceBooks;
module.exports.restoreOriginalPriceBooks = restoreOriginalPriceBooks;
