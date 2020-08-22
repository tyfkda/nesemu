import path from 'path'
import webpack from 'webpack'

module.exports = {
  mode: 'production',
  entry: {
    lib: ['./src/lib.ts'],
    main: './src/main.ts',
  },
  output: {
    path: path.resolve(__dirname, 'public/assets'),
    filename: '[name].js',
    sourceMapFilename: '[name].map',
  },
  resolve: {
    extensions: ['.ts', '.js', '.svg'],
  },
  module: {
    rules: [
      {test: /\.ts$/, include: /src/, exclude: /node_modules/, use: {loader: 'ts-loader'}},
      {test: /\.svg$/, include: /src/, exclude: /node_modules/, use: {loader: 'svg-inline-loader'}},
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
