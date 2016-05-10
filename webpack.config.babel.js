module.exports = {
  context: __dirname + '/src',
  entry: './main.ts',
  output: {
    path: __dirname + '/public/assets',
    filename: '[name].js',
  },
  module: {
    loaders: [
      { test: /\.js$/, loader: 'babel-loader' },
      { test: /\.ts$/, loader: 'babel-loader!awesome-typescript-loader' },
    ],
  }
}
