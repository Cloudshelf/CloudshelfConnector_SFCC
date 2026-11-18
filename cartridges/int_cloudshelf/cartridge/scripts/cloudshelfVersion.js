'use strict';

/**
 * The version of this cartridge.
 *
 * It is sent to Cloudshelf with every request, as the User-Agent, and written to the job logs, so that
 * Cloudshelf support can tell which version a retailer runs. Change it with every release, together with
 * "version" in package.json; a spec checks that the two match.
 */
module.exports = '1.2.0';
