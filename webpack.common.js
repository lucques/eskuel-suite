const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
  entry: {
    "eskuel-suite": './src/index.ts'
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
      template: './public/browser.html',
      filename: 'browser.html',
    }),
    new HtmlWebpackPlugin({
      template: './public/game-console.html',
      filename: 'game-console.html',
    }),
    new HtmlWebpackPlugin({
      template: './public/game-editor.html',
      filename: 'game-editor.html',
    }),
    new MonacoWebpackPlugin({
      languages: ['sql']
    })
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
  externals: {
    'sql.js': {
      commonjs: 'sql.js',
      commonjs2: 'sql.js',
      amd: 'sql.js',
      root: 'initSqlJs',
    },
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
  },
  devtool: 'source-map',
  // cache: false
};