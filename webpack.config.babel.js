var webpack = require('webpack')

module.exports = {
  context: __dirname + '/src',
  entry: {
    main: './main.ts',
    lib: './lib.ts',
  },
  output: {
    path: __dirname + '/public/assets',
    filename: '[name].js',
  },
  plugins: [
    new webpack.optimize.CommonsChunkPlugin({ name: ['main', 'lib'], minChunks: Infinity }),
  ],
  resolve: {
    extensions: ['.ts', '.js', '.tsx', '.jsx', '']
  },
  module: {
    loaders: [
      { test: /\.ts$/, exclude: /node_modules/, loader: 'babel-loader!awesome-typescript-loader' },
    ],
  }
}
