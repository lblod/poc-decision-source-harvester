const path = require('path');

module.exports = {
  entry: './src/index.js',
  devServer: {
    // contentBase: path.join(__dirname, 'dist'),
    port: 9002,
    static:'./dist',
    hot: "only",
  },
  performance: {
    hints: false,
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  },
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
  },
    resolve: {
        fallback: {
            buffer: require.resolve('buffer/'),
        }
    }
};