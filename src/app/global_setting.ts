import {StorageUtil} from '../util/storage_util'

const KEY_SETTING = 'setting'

export class GlobalSetting {
  public static pauseOnMenu = false
  public static muteOnInactive = true
  public static volume = 0.5

  public static loadFromStorage() {
    const setting = StorageUtil.getObject(KEY_SETTING, null)
    if (setting != null) {
      this.pauseOnMenu = setting.pauseOnMenu
      this.muteOnInactive = setting.muteOnInactive
      this.volume = setting.volume
    }
  }

  public static saveToStorage() {
    const setting = {
      pauseOnMenu: this.pauseOnMenu,
      muteOnInactive: this.muteOnInactive,
      volume: this.volume,
    }
    StorageUtil.putObject(KEY_SETTING, setting)
  }
}
