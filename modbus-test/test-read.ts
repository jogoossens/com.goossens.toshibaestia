/* eslint-disable no-console */
/**
 * Standalone smoke test. Runs outside Homey so you can quickly diagnose
 * whether the Waveshare + Toshiba interface path is alive.
 *
 *   npx ts-node modbus-test/test-read.ts [host] [port] [unitId]
 *
 * Defaults: 192.168.1.30 : 502 # 1
 */
import ModbusRTU from 'modbus-serial';
import {
  REGISTERS,
  decodeHydroUnitType,
  decodeBaudRate,
  decodeAlarmCode,
  decodeAlarmUnit,
  NO_SENSOR_VALUE,
} from '../modbus/registers';

const host = process.argv[2] ?? '192.168.1.30';
const port = Number(process.argv[3] ?? 502);
const unitId = Number(process.argv[4] ?? 1);

async function main(): Promise<void> {
  const client = new ModbusRTU();
  client.setTimeout(3000);

  console.log(`Connecting to ${host}:${port} (unit ${unitId})…`);
  await client.connectTCP(host, { port });
  client.setID(unitId);
  console.log('Connected.');

  const numbers = [
    REGISTERS.zone1OnOff.number,
    REGISTERS.hotWaterOnOff.number,
    REGISTERS.alarmStatus.number,
    REGISTERS.alarmCode.number,
    REGISTERS.alarmUnit.number,
    REGISTERS.zone1ControlTemp.number,
    REGISTERS.zone2ControlTemp.number,
    REGISTERS.outdoorTemp.number,
    REGISTERS.dhwTankTemp.number,
    REGISTERS.waterInletTemp.number,
    REGISTERS.waterOutletTemp.number,
    REGISTERS.heaterOutletTemp.number,
    REGISTERS.baudRateCode.number,
    REGISTERS.slaveAddress.number,
    REGISTERS.deviceDefinition.number,
    REGISTERS.softwareVersion.number,
    REGISTERS.hydroUnitType.number,
  ];

  // Read one-by-one — simple and robust; controller in the app coalesces.
  const tempKeys = new Set<string>([
    'zone1ControlTemp', 'zone2ControlTemp', 'outdoorTemp', 'dhwTankTemp',
    'waterInletTemp', 'waterOutletTemp', 'heaterOutletTemp',
  ]);

  for (const n of numbers) {
    const entry = Object.values(REGISTERS).find((r) => r.number === n);
    if (!entry) continue;
    try {
      const { data } = await client.readHoldingRegisters(n - 40001, 1);
      const raw = data[0];
      const signed = raw >= 0x8000 ? raw - 0x10000 : raw;
      let extra = '';
      if (tempKeys.has(entry.key)) {
        extra = raw === NO_SENSOR_VALUE ? '   (no sensor / error)' : `   (${signed} °C assuming x1)`;
      } else if (entry.key === 'baudRateCode') {
        extra = `   (${decodeBaudRate(raw) ?? 'unknown'} bps)`;
      } else if (entry.key === 'hydroUnitType') {
        extra = `   (${decodeHydroUnitType(raw)})`;
      } else if (entry.key === 'alarmCode') {
        extra = `   (${decodeAlarmCode(raw)})`;
      } else if (entry.key === 'alarmUnit') {
        extra = `   (${decodeAlarmUnit(raw)})`;
      }
      console.log(`  ${String(n).padStart(5, '0')} ${entry.key.padEnd(22)} raw=0x${raw.toString(16).padStart(4, '0').toUpperCase()} (${raw})${extra}`);
    } catch (err) {
      console.log(`  ${String(n).padStart(5, '0')} ${entry.key.padEnd(22)} FAILED: ${(err as Error).message}`);
    }
  }

  client.close(() => {
    console.log('Closed.');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
