/**
 * Toshiba Estia Modbus register map.
 *
 * Source: BMS-IFMB0UEW-E User Manual (EEU-006, 31/05/2021), section 3.2.
 * Addresses use the Modbus documentation convention (40001 = holding register 0).
 * Convert to on-the-wire address with `startAddress = registerNumber - 40001`.
 */

/** A single holding-register definition. */
export interface ToshibaRegister {
  /** Human register number as printed in the manual, e.g. 40019. */
  readonly number: number;
  /** Short key used inside the app. */
  readonly key: string;
  /** Writable? */
  readonly writable: boolean;
  /** Value interpretation. */
  readonly kind: 'temperature' | 'boolean' | 'enum' | 'uint' | 'signed' | 'hours';
  /** Free-text description (English, from the manual). */
  readonly description: string;
}

/** Sentinel value meaning "no sensor / sensor error" for temperature registers. */
export const NO_SENSOR_VALUE = 0x8000;

/**
 * Holding registers we care about for Phase 1 (read-only).
 * Phase 2 will flip `writable: true` and add setpoint/mode registers.
 */
export const REGISTERS = {
  // Writable control registers
  zone1OnOff:          { number: 40001, key: 'zone1OnOff',          writable: true,  kind: 'boolean',     description: 'Zone1/2 ON/OFF' },
  hotWaterOnOff:       { number: 40002, key: 'hotWaterOnOff',       writable: true,  kind: 'boolean',     description: 'DHW ON/OFF' },
  operationMode:       { number: 40003, key: 'operationMode',       writable: true,  kind: 'enum',        description: 'Zone 1/2 mode (1=heat, 2=cool)' },
  zone1SetpointTemp:   { number: 40004, key: 'zone1SetpointTemp',   writable: true,  kind: 'temperature', description: 'Zone 1 temperature setpoint' },
  zone2SetpointTemp:   { number: 40005, key: 'zone2SetpointTemp',   writable: true,  kind: 'temperature', description: 'Zone 2 temperature setpoint' },
  dhwSetpointTemp:     { number: 40006, key: 'dhwSetpointTemp',     writable: true,  kind: 'temperature', description: 'DHW temperature setpoint' },
  autoTempOnOff:       { number: 40007, key: 'autoTempOnOff',       writable: true,  kind: 'boolean',     description: 'Auto-temp (weather compensation) on/off' },
  nightSetbackOnOff:   { number: 40008, key: 'nightSetbackOnOff',   writable: true,  kind: 'boolean',     description: 'Night setback on/off' },
  hotWaterBoostOnOff:  { number: 40009, key: 'hotWaterBoostOnOff',  writable: true,  kind: 'boolean',     description: 'DHW boost on/off' },
  frostProtectionOnOff:{ number: 40010, key: 'frostProtectionOnOff',writable: true,  kind: 'boolean',     description: 'Frost protection on/off' },
  antibacteriaOnOff:   { number: 40011, key: 'antibacteriaOnOff',   writable: true,  kind: 'boolean',     description: 'Anti-bacteria on/off' },

  // Runtime hour counters (lifetime, x1 hour). All R32 1/2 Series ✓ per EEU-006.
  // Used by the energy estimator: kWh ≈ hours × rated input power per mode.
  dhwCompressorHours:    { number: 40035, key: 'dhwCompressorHours',    writable: false, kind: 'hours', description: 'DHW mode compressor ON integrated time (hours)' },
  heatingCompressorHours:{ number: 40036, key: 'heatingCompressorHours',writable: false, kind: 'hours', description: 'Heating mode compressor ON integrated time (hours)' },
  coolingCompressorHours:{ number: 40037, key: 'coolingCompressorHours',writable: false, kind: 'hours', description: 'Cooling mode compressor ON integrated time (hours)' },
  waterPumpHours:        { number: 40038, key: 'waterPumpHours',        writable: false, kind: 'hours', description: 'Hydro unit water pump operation integrated time (hours)' },
  immersionHeaterHours:  { number: 40039, key: 'immersionHeaterHours',  writable: false, kind: 'hours', description: 'DHW cylinder (immersion) heater ON integrated time (hours)' },
  backupHeaterHours:     { number: 40040, key: 'backupHeaterHours',     writable: false, kind: 'hours', description: 'Hydro unit backup heater ON integrated time (hours)' },

  // Alarm + read-only status
  alarmStatus:         { number: 40012, key: 'alarmStatus',         writable: false, kind: 'boolean',     description: 'Alarm active flag' },
  alarmCode:           { number: 40013, key: 'alarmCode',           writable: false, kind: 'uint',        description: 'Alarm code (see manual section 6)' },
  alarmUnit:           { number: 40014, key: 'alarmUnit',           writable: false, kind: 'uint',        description: 'Alarm origin (0x00 I/F, 0x60 RC, 0x7x Hydro)' },

  // Live temperatures
  zone1ControlTemp:    { number: 40015, key: 'zone1ControlTemp',    writable: false, kind: 'temperature', description: 'Zone 1 control (room) temperature' },
  zone2ControlTemp:    { number: 40016, key: 'zone2ControlTemp',    writable: false, kind: 'temperature', description: 'Zone 2 control (room) temperature' },
  dhwControlTemp:      { number: 40017, key: 'dhwControlTemp',      writable: false, kind: 'temperature', description: 'DHW control temperature' },
  outdoorTemp:         { number: 40019, key: 'outdoorTemp',         writable: false, kind: 'temperature', description: 'Outdoor air temperature (TO)' },
  dhwTankTemp:         { number: 40020, key: 'dhwTankTemp',         writable: false, kind: 'temperature', description: 'DHW cylinder water temperature (TTW)' },
  waterInletTemp:      { number: 40022, key: 'waterInletTemp',      writable: false, kind: 'temperature', description: 'Water inlet temperature (TWI)' },
  waterOutletTemp:     { number: 40023, key: 'waterOutletTemp',     writable: false, kind: 'temperature', description: 'Water outlet temperature (TWO)' },
  heaterOutletTemp:    { number: 40024, key: 'heaterOutletTemp',    writable: false, kind: 'temperature', description: 'Water heater outlet temperature (THO)' },

  // Zone device connection status
  zone1DeviceConnected:{ number: 40201, key: 'zone1DeviceConnected',writable: false, kind: 'boolean',     description: 'Zone 1 device connected' },
  zone2DeviceConnected:{ number: 40202, key: 'zone2DeviceConnected',writable: false, kind: 'boolean',     description: 'Zone 2 device connected' },
  dhwDeviceConnected:  { number: 40203, key: 'dhwDeviceConnected',  writable: false, kind: 'boolean',     description: 'DHW device connected' },

  // Setpoint range limits (read-only; static per install)
  zoneCoolMax:         { number: 40204, key: 'zoneCoolMax',         writable: false, kind: 'temperature', description: 'Zone 1/2 cooling upper limit' },
  zoneCoolMin:         { number: 40205, key: 'zoneCoolMin',         writable: false, kind: 'temperature', description: 'Zone 1/2 cooling lower limit' },
  zone1HeatMax:        { number: 40206, key: 'zone1HeatMax',        writable: false, kind: 'temperature', description: 'Zone 1 heating upper limit' },
  zone1HeatMin:        { number: 40207, key: 'zone1HeatMin',        writable: false, kind: 'temperature', description: 'Zone 1 heating lower limit' },
  zone2HeatMax:        { number: 40208, key: 'zone2HeatMax',        writable: false, kind: 'temperature', description: 'Zone 2 heating upper limit' },
  zone2HeatMin:        { number: 40209, key: 'zone2HeatMin',        writable: false, kind: 'temperature', description: 'Zone 2 heating lower limit' },
  dhwMax:              { number: 40210, key: 'dhwMax',              writable: false, kind: 'temperature', description: 'DHW upper limit' },
  dhwMin:              { number: 40211, key: 'dhwMin',              writable: false, kind: 'temperature', description: 'DHW lower limit' },

  // Related feature setpoints (read-only info)
  frostSetpoint:       { number: 40212, key: 'frostSetpoint',       writable: false, kind: 'temperature', description: 'Frost protection setpoint' },
  hotWaterBoostSetpoint:{number: 40213, key: 'hotWaterBoostSetpoint',writable: false,kind: 'temperature', description: 'DHW boost setpoint' },
  antibacteriaSetpoint:{ number: 40214, key: 'antibacteriaSetpoint',writable: false, kind: 'temperature', description: 'Anti-bacteria setpoint' },
  operationPermit:     { number: 40215, key: 'operationPermit',     writable: false, kind: 'enum',        description: '0=all prohibit, 1=cool only, 2=heat only, 3=heat+cool' },

  // Interface meta
  baudRateCode:        { number: 40041, key: 'baudRateCode',        writable: false, kind: 'enum',        description: 'Modbus baud rate (0=2400, 1=4800, 2=9600, 3=19200)' },
  slaveAddress:        { number: 40042, key: 'slaveAddress',        writable: false, kind: 'uint',        description: 'Modbus slave address (1-63)' },
  deviceDefinition:    { number: 40050, key: 'deviceDefinition',    writable: false, kind: 'uint',        description: 'Device definition (always 0x2C00)' },
  softwareVersion:     { number: 40051, key: 'softwareVersion',     writable: false, kind: 'uint',        description: 'Firmware version' },
  hydroUnitType:       { number: 40052, key: 'hydroUnitType',       writable: false, kind: 'uint',        description: 'Hydro unit type (0x0004=4S, 0x0005=5S, 0x0101=R32 1S)' },
} as const satisfies Record<string, ToshibaRegister>;

export type RegisterKey = keyof typeof REGISTERS;

/** Translate register number to on-the-wire holding-register address. */
export function addressOf(reg: ToshibaRegister): number {
  return reg.number - 40001;
}

/** Baud code decoder (register 40041). */
export function decodeBaudRate(code: number): number | null {
  return ({ 0: 2400, 1: 4800, 2: 9600, 3: 19200 } as Record<number, number>)[code] ?? null;
}

/** Hydro unit series decoder (register 40052). */
export function decodeHydroUnitType(code: number): string {
  switch (code) {
    case 0x0004: return 'R410A 4 Series (WM)';
    case 0x0005: return 'R410A 5 Series (WM)';
    case 0x0101: return 'R32 1/2 Series (WM/AIO)';
    default:     return `Unknown (0x${code.toString(16).padStart(4, '0').toUpperCase()})`;
  }
}

/** Alarm unit origin decoder (register 40014). */
export function decodeAlarmUnit(code: number): string {
  if (code === 0x00) return 'Interface';
  if (code === 0x60) return 'Remote controller';
  if ((code & 0xF0) === 0x70) return `Hydro unit ${code & 0x0F}`;
  return `Unknown (0x${code.toString(16).padStart(2, '0').toUpperCase()})`;
}

/**
 * Human-readable alarm label for the hex code in register 40013.
 * Covers the full list from manual section 6. Falls back to raw hex for unknown codes.
 */
export function decodeAlarmCode(code: number): string {
  // Special non-physical values
  if (code === -1) return 'Communication error';
  if (code === -3) return 'Paused';
  if (code === -4) return 'Initialization';
  if (code === 0x0000) return 'No fault';
  if (code === 0xFFFF) return 'Interface ↔ hydro unit communication error';

  const map: Record<number, string> = {
    0x0001: 'A01 — Pump or flow quantity error',
    0x0002: 'A02 — Temperature increase error (heating)',
    0x0003: 'A03 — Temperature increase error (hot water)',
    0x0004: 'A04 — Antifreeze operation (1)',
    0x0005: 'A05 — Piping antifreeze operation',
    0x0007: 'A07 — Pressure switch operation',
    0x0008: 'A08 — Low pressure sensor error',
    0x0009: 'A09 — Overheat protection',
    0x000A: 'A10 — Antifreeze operation (2)',
    0x000B: 'A11 — Release protection',
    0x000C: 'A12 — Heating / hot water heater',
    0x000D: 'A13 — Pump error (low voltage)',
    0x000E: 'A14 — Pump error (other)',
    0x000F: 'A15 — Pump error (zone 2)',
    0x0041: 'E01 — No comms between hydro and RC',
    0x0042: 'E02 — RC signal transmission defect',
    0x0043: 'E03 — Regular comms error hydro ↔ RC',
    0x0044: 'E04 — Regular comms error hydro ↔ outdoor',
    0x0048: 'E08 — Duplicate hydro unit address',
    0x0049: 'E09 — Multiple RC base units',
    0x004E: 'E14 — Comms error hydro ↔ 0-10V I/F',
    0x0052: 'E18 — Comms error master ↔ slave hydro',
    0x0063: 'F03 — TC sensor error',
    0x0064: 'F04 — TD sensor error',
    0x0066: 'F06 — TE sensor error',
    0x0067: 'F07 — TL sensor error',
    0x0068: 'F08 — TO sensor error',
    0x006A: 'F10 — TWI sensor error',
    0x006B: 'F11 — TWO sensor error',
    0x006C: 'F12 — TS sensor error',
    0x006D: 'F13 — TH sensor error',
    0x006E: 'F14 — TTW sensor error',
    0x006F: 'F15 — TE/TS sensors error',
    0x0071: 'F17 — TFI sensor error',
    0x0072: 'F18 — THO sensor error',
    0x0073: 'F19 — THO disconnection',
    0x0074: 'F20 — TFI sensor error',
    0x0077: 'F23 — Low pressure sensor error',
    0x0078: 'F24 — PD sensor error',
    0x007D: 'F29 — EEROM error',
    0x007E: 'F30 — Extended IC error',
    0x007F: 'F31 — EEPROM error',
    0x0160: 'F32 — Flow sensor error',
    0x0161: 'F33 — Flow quantity error',
    0x0081: 'H01 — Compressor',
    0x0082: 'H02 — Compressor lock',
    0x0083: 'H03 — Current detection circuit defect',
    0x0084: 'H04 — Case thermostat operation',
    0x00C2: 'L02 — Combination',
    0x00C3: 'L03 — Duplicate main hydro unit',
    0x00C7: 'L07 — Communication error',
    0x00C8: 'L08 — Hydro unit group / address unset',
    0x00C9: 'L09 — Communication error',
    0x00CA: 'L10 — Unset service PCB jumper',
    0x00CF: 'L15 — Combination error',
    0x00D0: 'L16 — Setting error',
    0x00D6: 'L22 — 0-10V setting error',
    0x00DD: 'L29 — Outdoor PCB MCU comms error',
    0x00E3: 'P03 — Outlet temperature error',
    0x00E4: 'P04 — High pressure switch',
    0x00E5: 'P05 — Power supply voltage error',
    0x00E7: 'P07 — Heat-sink overheat',
    0x00EF: 'P15 — Gas leak',
    0x00F3: 'P19 — 4-way valve inversion error',
    0x00F4: 'P20 — High pressure protection',
    0x00F6: 'P22 — Outdoor fan system',
    0x00FA: 'P26 — Compressor driver short circuit',
    0x00FD: 'P29 — Compressor rotor position error',
    0x00FF: 'P31 — Slave hydro unit error',
  };

  return map[code] ?? `Unknown (0x${(code & 0xFFFF).toString(16).padStart(4, '0').toUpperCase()})`;
}
