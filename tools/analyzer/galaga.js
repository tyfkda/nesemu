{
    jumpRoutines: [0xc301],
    jumpTable: [
        {address: 0xecba, count: 18},
    ],
    labels: {
        // PPU
        0x2000: '_PPUCTRL',
        0x2001: '_PPUMASK',
        0x2002: '_PPUSTATUS',
        0x2003: '_OAMADDR',
        0x2005: '_PPUSCROLL',
        0x2006: '_PPUADDR',
        0x2007: '_PPUDATA',
        // APU
        0x4014: '_OAMDMA',
        0x4015: '_APUSTATUS',
        0x4016: '_APUPAD1REG',
        0x4017: '_APUFRAMECOUNTER',

        // // work
        // 0x0061: 'HiscoreBuf',

        0xc0c8: 'OnNmi',
        0xc000: 'OnBoot',

        0xc075: 'MainLoop',
        0xc079: 'WaitNmi',
        0xc0ab: 'StartButtonPressed',

        0xc0f5: 'SwapTask?',

        0xc2d2: 'ReadPadData',
        0xc2dc: 'readPadLoop1',
        0xc2e0: 'readPadLoopBits',

        0xc301: 'JmpWithTable',
        0xc1ea: 'TransferBgData',
        0xc1f4: 'transferBgLoop',
        0xc214: 'transferBgChrLoop',

        0xc275: 'SetScrollPosition',

        0xc8a7: 'SwapTask2?',

        0xecba: 'jumpTable1',
    },
}
