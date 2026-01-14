import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import htmlMinifier from 'vite-plugin-html-minifier'
import { minify } from 'html-minifier-next'

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
    async transform(src: string, id: string): Promise<any> {
      if (htmlComponentFile.test(id)) {
        return {
          code: `export default \`${await minify(src, minifyHTMLConfig)}\``,
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
    emptyOutDir: true,
    rollupOptions: {
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
    htmlMinifier({
      minify: true,
    }),
    htmlMinify(),  // Used for importing 'about.html?inline'
  ],
})
