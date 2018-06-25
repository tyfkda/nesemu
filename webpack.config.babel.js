import path from 'path'
import webpack from 'webpack'

module.exports = {
  context: __dirname + '/src',
  mode: "production",
  entry: {
    lib: ['./lib.ts'],
    main: './main.ts',
  },
  output: {
    path: path.resolve(__dirname, 'public/assets'),
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
    splitChunks: {
      cacheGroups: {
        lib: {
          test: /[\\/]node_modules[\\/]/,
          name: 'lib',
          enforce: true,
          chunks: 'all',
        },
      },
    },
  },
}
