// Run:
//   $ npx node nesemu.js --controller controller/gradius.js <rom-file-path>

{
    const bus = app.nes.bus

    const PadValue = {
        A: 1 << 0,
        B: 1 << 1,
        SELECT: 1 << 2,
        START: 1 << 3,
        U: 1 << 4,
        D: 1 << 5,
        L: 1 << 6,
        R: 1 << 7,
    }

    const WIDTH = 256
    const HEIGHT = 240

    // ゲームモード
    const TitleIn = 0
    const Title = 1
    const Demo = 2
    const GameStart = 3
    const Game = 5
    // ゲーム内では登場しない値
    const _GameDead = -1000
    const _GameDead2 = -1001
    const _GameOver = -1002

    // プレイヤーの状態
    const PlayerWait = 0
    const PlayerNormal = 1
    const PlayerDead = 2

    function getGameMode() {
        return bus.read8(0x00)
    }

    function getDisplayEnabled() {
        return bus.read8(0x0d) === 0
    }

    function getPaused() {
        return bus.read8(0x15) !== 0
    }

    function getStageNo() {
        return bus.read8(0x19) + 1
    }

    function getPlayerLeft() {
        const left = bus.read8(0x20)
        return left <= 127 ? left : left - 256
    }

    function getScore() {
        return [...Array(4)].reduce((acc, _v, i) => {
            const x = bus.read8(0x07e7 - i)
            return acc * 100 + (x >> 4) * 10 + (x & 0x0f)
        }, 0) * 10
    }

    function getCapsuleNo() {
        return bus.read8(0x42)
    }

    function getPlayerState() {
        return bus.read8(0x0100)
    }

    function setFullPowerUp() {
        bus.write8(0x040, 2)  // Speed
        bus.write8(0x041, 1)  // Missle
        bus.write8(0x044, 1)  // Shot: Laser
        bus.write8(0x045, 2)  // Option: 2
        bus.write8(0x046, 5)  // Barrier
    }

    function getPlayerPosition() {
        return [bus.read8(0x0360), bus.read8(0x0320)]
    }

    function getOptionCount() {
        return bus.read8(0x45)
    }

    function getOptionPosition(i) {
        // i = (i * 12 + bus.read8(0x0160) - 11 + 0x18) % 0x18
        // i = (bus.read8(0x0160) - 22 + 0x18) % 0x18
        i = ((i + 1) * -11 + bus.read8(0x0160) + 0x18) % 0x18
        return [bus.read8(0x07a0 + i), bus.read8(0x07c0 + i)]
    }

    function LOG(...args) {
        console.log(...args)
    }

    function rect(pixels, x, y, w, h, color) {
        const r = (color >> 16) & 0xff
        const g = (color >>  8) & 0xff
        const b =  color        & 0xff
        for (let i = 0; i <= w; ++i) {
            const j1 = (y * WIDTH + (x + i)) * 4
            pixels[j1    ] = r
            pixels[j1 + 1] = g
            pixels[j1 + 2] = b
            const j2 = ((y + h) * WIDTH + (x + i)) * 4
            pixels[j2    ] = r
            pixels[j2 + 1] = g
            pixels[j2 + 2] = b
        }
        for (let i = 1; i < h; ++i) {
            const j1 = ((y + i) * WIDTH + x) * 4
            pixels[j1    ] = r
            pixels[j1 + 1] = g
            pixels[j1 + 2] = b
            const j2 = ((y + i) * WIDTH + (x + w)) * 4
            pixels[j2    ] = r
            pixels[j2 + 1] = g
            pixels[j2 + 2] = b
        }
    }

    let score = 0
    let playerLeft = 0
    let capsuleNo = 0
    let stage = 0
    let counter = 0
    let state = Title
    let paused = false

    return {
        onRender: (pixels) => {
            const [x, y] = getPlayerPosition()
            rect(pixels, x - 8, y, 24 - 1, 16 - 1, 0xffff00)

            const optionCount = getOptionCount()
            for (let i = 0; i < optionCount; ++i) {
                const [x, y] = getOptionPosition(i)
                rect(pixels, x - 8, y + 4, 16 - 1, 8 - 1, 0x00ffff)
            }
        },
        onVblank: () => {
            switch (state) {
            case Title:
                if (getGameMode() === Game && getDisplayEnabled()) {
                    app.setSkipFrame(false)
                    state = Game
                    counter = 0
                    score = 0
                    playerLeft = getPlayerLeft()
                    stage = getStageNo()
                    setFullPowerUp()
                    LOG('Game start')
LOG(`playerLeft=${playerLeft}`)
                    break
                }
                app.setSkipFrame(true)
                app.additionalPad |= (counter & 1) === 0 ? PadValue.START : 0
                ++counter
                break
            case Game:
                {
                    const pausedNow = getPaused()
                    if (pausedNow !== paused) {
                        paused = pausedNow
                        LOG(paused ? 'paused' : 'resumed')
                    }

                    {
                        const s = getScore()
                        if (s !== score) {
                            score = s
                            // LOG(`score=${score}`)
                        }
                    }

                    {
                        const s = getStageNo()
                        if (s !== stage) {
                            stage = s
                            LOG(`stage=${stage}`)
                        }
                    }

                    const c = getCapsuleNo()
                    if (c !== capsuleNo) {
                        capsuleNo = c
                        // LOG(`capsuleNo=${capsuleNo}`)
                    }

                    if (getPlayerState() === PlayerDead) {
                        LOG(`PlayerDead: score=${score}, left=${playerLeft}`)
                        state = _GameDead
                        counter = 0
                        break
                    }
                }
                break
            case _GameDead:
            case _GameDead2:
                {
                    const left = getPlayerLeft()
                    if (state === _GameDead && left !== playerLeft) {
                        playerLeft = left
                        if (playerLeft < 0) {
                            LOG(`GameOver: score=${score}`)
                            state = _GameOver
                            counter = 0
                            break
                        }
                        state = _GameDead2
                    }
                    if (getPlayerState() === PlayerNormal && getDisplayEnabled()) {
                        state = Game
                        counter = 0
                        LOG('restart')
                        app.setSkipFrame(false)
                        playerLeft = left
                        break
                    }
                    app.setSkipFrame(true)
                }
                break
            case _GameOver:
                app.setSkipFrame(true)
                if (getGameMode() === TitleIn) {
                    state = Title
                    counter = 0
                    break
                }
                break
            }
        },
    }
}
