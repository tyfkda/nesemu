import path from 'path'
import webpack from 'webpack'

module.exports = {
  context: __dirname + '/src',
  target: 'node',
  mode: "production",
  entry: {
    nesemu: './main.ts',
  },
  output: {
    path: __dirname,
    filename: '[name].js',
    sourceMapFilename: '[name].map',
  },
  resolve: {
    extensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  module: {
    rules: [
      { test: /\.ts$/, exclude: /node_modules/, use: { loader: 'ts-loader' } },
    ],
  },
  optimization: {
  },
}
