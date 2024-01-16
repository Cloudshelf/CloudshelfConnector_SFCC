/**
 * Generates cloudshelfGraphqlQueries.js file with graphql queries based on graphql types in cartridges/int_cloudshelf/cartridge/scripts/graphql/
 */

const dir = 'cartridges/int_cloudshelf/cartridge/scripts/graphql/'
const resultFile = dir + 'cloudshelfGraphqlQueries.js';
const tabStr = '    ';

const fs = require('fs');
const os = require('os');
const path = require('path');
let resultStr;

function parseSubDir(dirname, subdirName) {
    fs.readdirSync(path.join(process.cwd(), dirname + subdirName))
        .filter(name => name.indexOf('.graphql') !== -1)
        .forEach((filename) => {
            let content = fs.readFileSync(dirname + subdirName + '/' + filename, 'utf-8');
            let contentReplaced = content.replace(/\n|\r/g, ' ');
            resultStr += `${tabStr}${tabStr}${filename.replace('.graphql', '')}: '${contentReplaced}'`;
            resultStr += `,${os.EOL}`;
        });
}

function parseDir(dirname, resultFile) {
    resultStr = `module.exports = {${os.EOL}${tabStr}query: {${os.EOL}`;
    parseSubDir(dirname, 'queries');
    resultStr += `${tabStr}},${os.EOL}${tabStr}mutation: {${os.EOL}`;
    parseSubDir(dirname, 'mutations');
    resultStr += `${tabStr}}${os.EOL}};${os.EOL}`;
    fs.writeFileSync(resultFile, resultStr);
}

try {
    parseDir(dir, resultFile);
    console.log(`JS file ${resultFile} has been created`);
    process.exit(0);
} catch (err) {
    console.log(err);
    process.exit(1);
}
