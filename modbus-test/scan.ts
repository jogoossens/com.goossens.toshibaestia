import ModbusRTU from 'modbus-serial';

// Scan strategy: hit gaps in/around the documented map and a few extended
// ranges, looking for non-zero, non-error responses. Read 1 register at a
// time so we can pinpoint which addresses respond.
//
// Documented in EEU-006: 40001-40025, 40035-40040, 40041-40042, 40050-40052,
// 40066, 40201-40221.
// Gaps + extensions to probe:
const RANGES: Array<[number, number]> = [
  [40026, 40034],   // gap between sensors and runtime
  [40043, 40049],   // gap between baud/slave and device-def
  [40053, 40065],   // gap between unit-type and 40066
  [40067, 40200],   // big gap — most likely place for energy
  [40222, 40400],   // beyond documented setting-status block
  [40500, 40600],
  [41000, 41100],   // alternate banks some Modbus devices use
  [40600, 40700],   // Toshiba sometimes uses 0x6XX for extended
];

async function main() {
  const c = new ModbusRTU();
  c.setTimeout(2000);
  await c.connectTCP('192.168.1.30', { port: 502 });
  c.setID(1);
  console.log('# documented baseline (sanity check)');
  for (const reg of [40015, 40019, 40036]) {
    try {
      const r = await c.readHoldingRegisters(reg - 40001, 1);
      console.log(`  ${reg} = 0x${r.data[0].toString(16).padStart(4,'0').toUpperCase()} (${r.data[0]})`);
    } catch (e: any) { console.log(`  ${reg} ERR ${e.message || e}`); }
  }
  console.log('');
  console.log('# scanning gaps + extensions');
  let lastReportedExc = '';
  let consecutiveErrs = 0;
  for (const [lo, hi] of RANGES) {
    console.log(`# range ${lo}-${hi}`);
    for (let reg = lo; reg <= hi; reg++) {
      try {
        const r = await c.readHoldingRegisters(reg - 40001, 1);
        const raw = r.data[0];
        const signed = raw >= 0x8000 ? raw - 0x10000 : raw;
        if (raw !== 0) {
          console.log(`  ${reg} = 0x${raw.toString(16).padStart(4,'0').toUpperCase()} (${raw}) signed=${signed}`);
        }
        consecutiveErrs = 0;
      } catch (e: any) {
        const msg = (e.message || String(e)).slice(0, 80);
        // Don't spam — only print when the exception type changes.
        if (msg !== lastReportedExc) {
          console.log(`  ${reg} ERR  ${msg}`);
          lastReportedExc = msg;
        }
        consecutiveErrs++;
        // If we've had >50 consecutive identical errors, skip the rest of the range
        if (consecutiveErrs > 50) {
          console.log(`  (skipping rest of ${lo}-${hi} after 50 identical errors)`);
          break;
        }
      }
    }
  }
  c.close(()=>process.exit(0));
}
main().catch(e => { console.error(e); process.exit(1); });
