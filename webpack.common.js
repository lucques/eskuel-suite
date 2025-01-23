const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    "eskuel-suite": './src/index.tsx'
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              "@babel/preset-env",
              "@babel/preset-react",
              "@babel/preset-typescript",
            ],
          },
        },
      },
      // For local CSS files
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
				test: /\.ttf$/,
				type: 'asset/resource'
			},
      // This rule ensures that .svg files are processed as file assets
      {
        test: /\.svg$/,
        type: 'asset/resource', // or 'file-loader' if you're using file-loader
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
    }),
    new MonacoWebpackPlugin({
      languages: ['sql']
    }),
    // Needed for now to inlcude wasm file
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm'),
          to: 'sql-wasm.wasm',
        },
      ],
    }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.wasm'],
    fallback: { "crypto": false, "fs": false, "path": false }
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
    }
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    library: "eskuelSuite"
  },

  // Dev configuration
  devServer: {
    static: path.join(__dirname, 'public'),
    compress: true,
    port: 3000,
    open: true,
    hot: true,
    historyApiFallback: true,
  },
  devtool: 'source-map',
  // cache: false
};
