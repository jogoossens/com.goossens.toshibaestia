import ModbusRTU from 'modbus-serial';

const RANGES: Array<[number, number]> = [
  [40067, 40200],
  [40222, 40400],
];

async function main() {
  const c = new ModbusRTU();
  c.setTimeout(1500);
  await c.connectTCP('192.168.1.30', { port: 502 });
  c.setID(1);
  for (const [lo, hi] of RANGES) {
    let okCount = 0, errCount = 0;
    const responses: Array<[number, number]> = [];
    for (let reg = lo; reg <= hi; reg++) {
      try {
        const r = await c.readHoldingRegisters(reg - 40001, 1);
        responses.push([reg, r.data[0]]);
        okCount++;
      } catch {
        errCount++;
      }
    }
    console.log(`# ${lo}-${hi}: ${okCount} ok, ${errCount} err`);
    for (const [reg, raw] of responses) {
      const signed = raw >= 0x8000 ? raw - 0x10000 : raw;
      const flag = raw === 0 ? ' ' : '*';
      console.log(`  ${flag} ${reg} 0x${raw.toString(16).padStart(4, '0').toUpperCase()} = ${signed}`);
    }
  }
  c.close(() => 0);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
