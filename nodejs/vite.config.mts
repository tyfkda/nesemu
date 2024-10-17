import { defineConfig } from 'vite'
import { VitePluginNode } from 'vite-plugin-node'

export default defineConfig({
  base: './',
  root: './',
  build: {
    minify: true,
    outDir: __dirname,
    rollupOptions: {
      output: {
        entryFileNames: 'nesemu.js',
        assetFileNames: '[name].[ext]',
        globals: {
          fs: 'fs',
          util: 'util',
          '@kmamal/sdl': '@kmamal/sdl',
          commander: 'commander',
          fflate: 'fflate',
          pngjs: 'pngjs',
          md5: 'md5',
        },
      },
    },
  },
  plugins: [
    ...VitePluginNode({
      // adapter({ app, server, req, res, next }) {
      //   app(res, res);
      // },
      adapter() {},
      appPath: './src/main.ts',
    }),
  ],
})
