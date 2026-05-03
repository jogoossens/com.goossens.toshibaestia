import ModbusRTU from 'modbus-serial';

const REGS = [
  // documented temps
  40015, 40017, 40019, 40020, 40022, 40023, 40024,
  // documented runtime hours (these tick slowly)
  40035, 40036, 40037, 40038, 40039, 40040,
  // documented mode/onoff
  40001, 40002, 40003,
  // newly found undocumented
  40026, 40027, 40028, 40029, 40030, 40031,
  40049,
  40062, 40063,
  40103,
];

async function snap(c: ModbusRTU): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  for (const reg of REGS) {
    try {
      const r = await c.readHoldingRegisters(reg - 40001, 1);
      out[reg] = r.data[0];
    } catch {}
  }
  return out;
}

async function main() {
  const c = new ModbusRTU();
  c.setTimeout(3000);
  await c.connectTCP('192.168.1.30', { port: 502 });
  c.setID(1);

  const samples: { t: string; data: Record<number, number> }[] = [];
  for (let i = 0; i < 12; i++) {  // 12 × 25s = 5 min
    const data = await snap(c);
    const t = new Date().toISOString().slice(11, 19);
    samples.push({ t, data });
    process.stdout.write(`[${t}] sampled\n`);
    if (i < 11) await new Promise(r => setTimeout(r, 25_000));
  }
  c.close(()=>0);

  // Print compact table: register | values over time | min..max range
  console.log('\n# Tracked over 5 minutes:');
  console.log('reg     ' + samples.map(s => s.t.slice(3)).join('  ') + '   range');
  for (const reg of REGS) {
    const vals = samples.map(s => {
      const v = s.data[reg];
      if (v === undefined) return 'ERR';
      const sg = v >= 0x8000 ? v - 0x10000 : v;
      return String(sg).padStart(5);
    });
    const nums = vals.filter(v => v !== 'ERR').map(Number);
    const range = nums.length ? `${Math.min(...nums)}..${Math.max(...nums)}` : '-';
    const moved = nums.length ? Math.max(...nums) - Math.min(...nums) : 0;
    const flag = moved > 0 ? '★' : ' ';
    console.log(`${flag} ${reg}  ${vals.join('  ')}   ${range}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
