import ModbusRTU from 'modbus-serial';
async function main() {
  const c = new ModbusRTU();
  c.setTimeout(2000);
  await c.connectTCP('192.168.1.30', { port: 502 });
  c.setID(1);
  for (const reg of [40011, 40020, 40039, 40040, 40002]) {
    const r = await c.readHoldingRegisters(reg - 40001, 1);
    console.log(`${reg} = ${r.data[0]}`);
  }
  c.close(()=>0);
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
