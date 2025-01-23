const { merge } = require('webpack-merge');
const commonConfig = require('./webpack.common.js');

const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');


module.exports = merge(commonConfig, {
  mode: 'production',
  plugins: [
    new CleanWebpackPlugin(),
    new WebpackManifestPlugin({
      fileName: 'asset-manifest.json',
      publicPath: '/',
    }),
  ],
});
