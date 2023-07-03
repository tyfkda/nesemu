NES Emulator
============

NES emulator written in TypeScript.

![nesemu-ss.png](doc/nesemu-ss.png)

## Features

  * Run on a browser
  * Gamepad support
  * Fullscreen
  * Multi-window
  * Famicom Disk System
  * Family BASIC


## How to play

  * Go to https://tyfkda.github.io/nesemu/
  * Drag and drop a rom file (.nes or .zip) onto the page, the game will be started.


## Control

| NES      | Keyboard(1P) | (2P)        |
|----------|--------------|-------------|
| Pad      | Arrow key    | I,J,K,L key |
| A button | X key        | W key       |
| B button | Z key        | Q key       |
| Start    | Enter        | O key       |
| Select   | Space        | P key       |

  * You can also use a gamepad

Shortcut key:

| Key      | Action     |
|----------|------------|
| F1       | Save state |
| F3       | Load state |


## Development

### Requirement

* node.js
* npm

### Set up

```bash
$ npm install
```

### Build (automatically)

```bash
$ npm start
```

* You can see the page in <http://localhost:3000/>
* Files are generated in `public`

### Release

```bash
$ npm run release
```

* Files are generated in `release`


### Reference

  * [Nesdev wiki](https://wiki.nesdev.com/w/index.php/Nesdev_Wiki)
