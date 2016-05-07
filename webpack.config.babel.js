module.exports = {
  context: __dirname + '/src',
  entry: './main.ts',
  output: {
    path: __dirname + '/public/assets',
    filename: '[name].js',
  },
  module: {
    loaders: [
      { test: /\.js$/, loaders: ['babel-loader'] },
      { test: /\.ts$/, loaders: ['awesome-typescript-loader'] },
    ],
  }
}
