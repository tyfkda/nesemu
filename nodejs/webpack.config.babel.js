module.exports = {
  target: 'node',
  mode: "production",
  entry: {
    nesemu: './src/main.ts',
  },
  output: {
    path: __dirname,
    filename: '[name].js',
    sourceMapFilename: '[name].map',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {test: /\.ts$/, include: /src/, exclude: /node_modules/, use: {loader: 'ts-loader'}},
    ],
  },
  optimization: {
  },
}
