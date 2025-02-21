// Run:
//   $ npx node nesemu.js --controller controller/pacman.js <rom-file-path>

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

    // ゲームモード
    const TitleIn = 0
    const Title = 2
    const Game = 4
    const EatEnemy = 6
    const PlayerDead = 8
    const GameOver = 10
    const StageClear = 12

    function getGameMode() {
        return bus.read8(0x3f)
    }

    function getScore() {
        return [...Array(6)].reduce((acc, _v, i) => {
            return acc * 10 + bus.read8(0x75 - i)
        }, 0) * 10
    }

    function getPaused() {
        return (bus.read8(0x4a) & 1) !== 0
    }

    function getPlayerLeft() {
        return bus.read8(0x67)
    }

    function getStageNo() {
        return bus.read8(0x68) + 1
    }

    function LOG(...args) {
        console.log(...args)
    }

    let score = 0
    let counter = 0
    let state = Title
    let paused = false

    return {
        // onRender: (pixels) => {
        // },
        onVblank: () => {
            switch (state) {
            case Title:
                if (getGameMode() === Game) {
                    app.setSkipFrame(false)
                    state = Game
                    counter = 0
                    score = 0
                    LOG('Game start')
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

                    const s = getScore()
                    if (s !== score) {
                        score = s
                    }

                    switch (getGameMode()) {
                    case PlayerDead:
                        LOG(`PlayerDead: left=${getPlayerLeft() - 1}`)
                        state = PlayerDead
                        counter = 0
                        break
                    case StageClear:
                        LOG('StageClear')
                        state = StageClear
                        counter = 0
                        break
                    }
                }
                break
            case PlayerDead:
            case StageClear:
                app.setSkipFrame(true)
                switch (getGameMode()) {
                case GameOver:
                    LOG(`GameOver: score=${score}`)
                    state = GameOver
                    counter = 0
                    break
                case Game:
                    if (state === StageClear)
                        LOG(`Start stage: ${getStageNo()}`)
                    state = Game
                    counter = 0
                    app.setSkipFrame(false)
                    break
                }
                break
            case GameOver:
                switch (getGameMode()) {
                case TitleIn:
                    state = Title
                    counter = 0
                    break
                }
                break
            }
        },
    }
}
