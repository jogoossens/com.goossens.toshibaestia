import ModbusRTU from 'modbus-serial';
const HOST = '192.168.1.30', PORT = 502, UNIT = 1, INTERVAL_MS = 15_000;
const REGS = [40012, 40015, 40019, 40022, 40023, 40050, 40052].map(n => n - 40001);

async function pollOnce(seq: number) {
  const c = new ModbusRTU();
  c.setTimeout(3000);
  const t0 = Date.now();
  try {
    await c.connectTCP(HOST, { port: PORT });
    c.setID(UNIT);
    for (const a of REGS) {
      await c.readHoldingRegisters(a, 1);
    }
    const dt = Date.now() - t0;
    console.log(`${new Date().toISOString()} #${seq} OK  ${dt}ms`);
  } catch (e: any) {
    const dt = Date.now() - t0;
    console.log(`${new Date().toISOString()} #${seq} ERR ${dt}ms  ${e.message || e}`);
  } finally {
    try { c.close(() => undefined); } catch {}
  }
}

let seq = 0;
const tick = () => pollOnce(++seq);
tick();
setInterval(tick, INTERVAL_MS);
