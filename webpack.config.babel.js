module.exports = {
  context: __dirname + '/src',
  entry: './main.js',
  output: {
    path: __dirname + '/public/assets',
    filename: '[name].js',
  },
  module: {
    loaders: [
      { test: /\.js$/, loaders: ['babel-loader'] },
    ],
  }
}
