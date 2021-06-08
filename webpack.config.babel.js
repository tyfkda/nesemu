import path from 'path'

module.exports = {
  mode: 'production',
  entry: {
    _lib: './src/_lib.ts',
    noise_channel_worker: './src/noise_channel_worker.ts',
    main: './src/main.ts',
  },
  output: {
    path: path.resolve(__dirname, 'public/assets'),
    filename: '[name].js',
    sourceMapFilename: '[name].map',
  },
  resolve: {
    extensions: ['.ts', '.js', '.png', '.svg', '.html'],
  },
  module: {
    rules: [
      {test: /\.ts$/, include: /src/, exclude: /node_modules/, use: {loader: 'ts-loader'}},
      {test: /\.png$/, include: /src/, exclude: /node_modules/, use: {loader: 'url-loader', options: {limit: 8192}}},
      {test: /\.svg$/, include: /src/, exclude: /node_modules/, type: 'asset/inline'},
      {test: /\.html$/, include: /src/, exclude: /node_modules/, use: {loader: 'html-loader', options: {minimize: true}}},
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
