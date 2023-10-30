import path from "path";
import { Configuration } from "webpack";
const HtmlWebpackPlugin = require('html-webpack-plugin');

const config: Configuration = {
  entry: "./src/index.ts",
  module: {
    rules: [
      {
        test: /\.(ts|js)?$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-typescript"],
          },
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      // Load a custom template (lodash by default)
      template: 'index.html'
    })
  ],
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "main.js",
  },
  devtool: 'source-map'
};
export default config;