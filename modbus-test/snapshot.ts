import ModbusRTU from 'modbus-serial';
import * as fs from 'fs';

const REGS_OF_INTEREST = [
  // documented temps
  40015, 40016, 40017, 40019, 40020, 40022, 40023, 40024, 40025,
  // documented runtimes
  40035, 40036, 40037, 40038, 40039, 40040,
  // documented mode/onoff
  40001, 40002, 40003,
  // newly found undocumented
  40026, 40027, 40028, 40029, 40030, 40031,
  40049,
  40062, 40063,
  40103,
];

async function main() {
  const tag = process.argv[2] || 'snap';
  const c = new ModbusRTU();
  c.setTimeout(3000);
  await c.connectTCP('192.168.1.30', { port: 502 });
  c.setID(1);
  const snap: Record<number, number> = {};
  for (const reg of REGS_OF_INTEREST) {
    try {
      const r = await c.readHoldingRegisters(reg - 40001, 1);
      snap[reg] = r.data[0];
    } catch (e: any) { /* skip */ }
  }
  c.close(()=>0);
  const ts = new Date().toISOString();
  console.log(`[${tag}] ${ts}`);
  for (const reg of REGS_OF_INTEREST) {
    const raw = snap[reg];
    if (raw === undefined) { console.log(`  ${reg} ERR`); continue; }
    const signed = raw >= 0x8000 ? raw - 0x10000 : raw;
    console.log(`  ${reg}  raw=0x${raw.toString(16).padStart(4,'0').toUpperCase()}  uns=${raw}  sign=${signed}`);
  }
  fs.writeFileSync(`/tmp/estia-${tag}.json`, JSON.stringify({ ts, tag, snap }, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
