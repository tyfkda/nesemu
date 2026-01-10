import {StorageUtil} from '../util/storage_util'
import {ScalerType} from './def'
import {Util} from '../util/util'

const KEY_SETTING = 'setting'

type SettingData = {
  persistCarts: boolean
  pauseOnMenu: boolean
  muteOnInactive: boolean
  volume: number
  scaler: ScalerType
  overscan: boolean
  spriteFlicker: boolean
  maximize: boolean
  clientWidth: number
  clientHeight: number
  emulationSpeed: number
}

function modified(s1: SettingData, s2: SettingData): boolean {
  return s1.pauseOnMenu !== s2.pauseOnMenu ||
    s1.muteOnInactive !== s2.muteOnInactive ||
    s1.volume !== s2.volume ||
    s1.scaler !== s2.scaler ||
    s1.overscan !== s2.overscan ||
    s1.spriteFlicker !== s2.spriteFlicker ||
    s1.maximize !== s2.maximize ||
    s1.clientWidth !== s2.clientWidth ||
    s1.clientHeight !== s2.clientHeight ||
    s1.emulationSpeed !== s2.emulationSpeed
}

export const GlobalSetting = {
  persistCarts: true,
  pauseOnMenu: false,
  muteOnInactive: true,
  volume: 0.5,
  scaler: ScalerType.NEAREST as ScalerType,
  overscan: true,
  spriteFlicker: false,
  maximize: false,
  clientWidth: (256 - 4 * 2) * 2,
  clientHeight: (240 - 8 * 2) * 2,
  emulationSpeed: 1.0,

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
      this.persistCarts = setting.persistCarts === true
      this.pauseOnMenu = setting.pauseOnMenu === true
      this.muteOnInactive = setting.muteOnInactive === true
      this.volume = typeof(setting.volume) === 'number' ? Util.clamp(setting.volume, 0.0, 1.0) : this.volume
      this.scaler = Object.values(ScalerType).indexOf(setting.scaler) >= 0 ? setting.scaler : ScalerType.NEAREST
      this.overscan = setting.overscan != null ? setting.overscan : true
      this.spriteFlicker = setting.spriteFlicker != null ? setting.spriteFlicker : false
      this.maximize = setting.maximize != null ? setting.maximize : false
      this.clientWidth = setting.clientWidth != null ? setting.clientWidth : this.clientWidth
      this.clientHeight = setting.clientHeight != null ? setting.clientHeight : this.clientHeight
      this.emulationSpeed = setting.emulationSpeed != null ? setting.emulationSpeed : this.emulationSpeed

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
      persistCarts: this.persistCarts,
      pauseOnMenu: this.pauseOnMenu,
      muteOnInactive: this.muteOnInactive,
      volume: this.volume,
      scaler: this.scaler,
      overscan: this.overscan,
      spriteFlicker: this.spriteFlicker,
      maximize: this.maximize,
      clientWidth: this.clientWidth,
      clientHeight: this.clientHeight,
      emulationSpeed: this.emulationSpeed,
    }
  },
}
