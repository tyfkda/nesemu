import {StorageUtil} from '../util/storage_util'

const KEY_SETTING = 'setting'

export const GlobalSetting = {
  pauseOnMenu: false,
  muteOnInactive: true,
  volume: 0.5,

  loadFromStorage() {
    const setting = StorageUtil.getObject(KEY_SETTING, null)
    if (setting != null) {
      this.pauseOnMenu = setting.pauseOnMenu
      this.muteOnInactive = setting.muteOnInactive
      this.volume = setting.volume
    }
  },

  saveToStorage() {
    const setting = {
      pauseOnMenu: this.pauseOnMenu,
      muteOnInactive: this.muteOnInactive,
      volume: this.volume,
    }
    StorageUtil.putObject(KEY_SETTING, setting)
  },
}
