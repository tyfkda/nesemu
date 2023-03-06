import path from 'path'

module.exports = {
  mode: 'production',
  entry: {
    main: './src/main.ts',
    noise_channel_worker: './src/noise_channel_worker.ts',
    dc_remove_worker: './src/dc_remove_worker.ts',
  },
  output: {
    path: path.resolve(__dirname, 'public/assets'),
    filename: '[name].js',
    sourceMapFilename: '[name].map',
  },
  resolve: {
    extensions: ['.ts', '.js', '.html'],
  },
  module: {
    rules: [
      {test: /\.ts$/, include: /src/, exclude: /node_modules/, use: {loader: 'ts-loader'}},
      {test: /\.html$/, include: /src/, exclude: /node_modules/, use: {loader: 'html-loader', options: {minimize: true}}},
      {test: /\.(png|svg)$/, include: /src/, exclude: /node_modules/, type: 'asset/inline'},
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
