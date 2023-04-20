import {StorageUtil} from '../util/storage_util'

const KEY_SETTING = 'setting'

type SettingData = {
  pauseOnMenu: boolean
  muteOnInactive: boolean
  volume: number
}

function modified(s1: SettingData, s2: SettingData): boolean {
  return s1.pauseOnMenu !== s2.pauseOnMenu ||
    s1.muteOnInactive !== s2.muteOnInactive ||
    s1.volume !== s2.volume
}

export const GlobalSetting = {
  pauseOnMenu: false,
  muteOnInactive: true,
  volume: 0.5,

  savedSetting: {} as SettingData,

  setUp() {
    this._loadFromStorage()
  },

  destroy() {
    if (modified(this, this.savedSetting))
      this._saveToStorage()
  },

  _loadFromStorage() {
    const setting = StorageUtil.getObject(KEY_SETTING, null)
    if (setting != null) {
      this.pauseOnMenu = setting.pauseOnMenu
      this.muteOnInactive = setting.muteOnInactive
      this.volume = setting.volume

      this.savedSetting = setting
    } else {
      this.savedSetting = this._setting()
    }
  },

  _saveToStorage() {
    const setting = this._setting()
    StorageUtil.putObject(KEY_SETTING, setting)
  },

  _setting(): SettingData {
    return {
      pauseOnMenu: this.pauseOnMenu,
      muteOnInactive: this.muteOnInactive,
      volume: this.volume,
    }
  },
}
