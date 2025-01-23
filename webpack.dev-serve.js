const { merge } = require('webpack-merge');
const commonConfig = require('./webpack.dev-common.js');

module.exports = merge(commonConfig, {

});
