import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { minify } from 'html-minifier'

const htmlComponentFile = /\.html\?inline$/ // can have a prefix to html file names such as /\.component\.html\?inline$/

const minifyHTMLConfig = {
  collapseInlineTagWhitespace: true,
  collapseWhitespace: true,
  minifyCSS: true,
  minifyJS: true,
  removeAttributeQuotes: true,
  removeComments: true,
  removeEmptyAttributes: true,
  removeOptionalTags: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  sortAttributes: true,
  sortClassName: true,
}

function htmlMinify() {
  return {
    name: 'html-minify',
    transform(src: string, id: string): any {
      if (htmlComponentFile.test(id)) {
        return {
          code: `export default \`${minify(src, minifyHTMLConfig)}\``,
          map: null,
        }
      }
    },
  }
}

export default defineConfig({
  base: './',
  root: 'src',
  build: {
    outDir: resolve(__dirname, 'release'),
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/index.html'),
        noise_channel_worker: resolve(__dirname, 'src/noise_channel_worker.ts'),
        dmc_channel_worker: resolve(__dirname, 'src/dmc_channel_worker.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    assetsInlineLimit: 8192,
  },
  worker: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [
    htmlMinify(),
  ],
})
