import ModbusRTU from 'modbus-serial';

// Probe for any heater-related signals: hours counters, capacity DN-style
// registers, and the hydro-unit-type discriminator. We sweep 40035..40065
// (covers documented hour counters + interface meta) and 40213..40222
// (status/setpoints adjacent to anti-bact).
const RANGES: Array<[number, number]> = [
  [40035, 40065],
  [40213, 40225],
];

async function main() {
  const c = new ModbusRTU();
  c.setTimeout(2000);
  await c.connectTCP('192.168.1.30', { port: 502 });
  c.setID(1);
  for (const [lo, hi] of RANGES) {
    console.log(`# Range ${lo}-${hi}`);
    for (let reg = lo; reg <= hi; reg++) {
      try {
        const r = await c.readHoldingRegisters(reg - 40001, 1);
        const raw = r.data[0];
        const signed = raw >= 0x8000 ? raw - 0x10000 : raw;
        const tag = raw === 0 ? '   ' : ' * ';
        console.log(`${tag}${reg}  raw=0x${raw.toString(16).padStart(4, '0').toUpperCase()}  uns=${raw}  sign=${signed}`);
      } catch {
        console.log(`   ${reg}  ERR`);
      }
    }
  }
  c.close(() => 0);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
