for node.js
===========

### Requirement

  * Node.js < 9 ([node-ffi does not build with NodeJS 9.x on Linux · Issue #451 · node-ffi/node-ffi](https://github.com/node-ffi/node-ffi/issues/451))
  * Python 2 ([Support for Python 3 · Issue #1337 · nodejs/node-gyp](https://github.com/nodejs/node-gyp/issues/1337))
  * SDL2


### Set up

  1. Set up Node.js < 9, and Python 2.x
  2. Install SDL2

, then

```bash
$ npm install
```

### Build

```bash
$ npm run build
```

nesemu.js is generated.

### Execution

```bash
$ npm run exec -- <.nes or .zip>
```

or

```bash
$ node nesemu.js <.nes or .zip>
```


## Control

  * Escape key: Quit app.
