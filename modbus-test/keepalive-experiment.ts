// Live experiment: open TCP to the Waveshare/HF gateway with keepalive at 10s,
// send NO Modbus traffic, and time when (if) the gateway FIN-closes us.
// Result tells us whether OS-level TCP keepalive is enough to keep the
// connection alive past the gateway's `tcp_to` setting (currently 30s).
import * as net from 'net';

const HOST = '192.168.1.30';
const PORT = 502;
const KEEPALIVE_MS = 10_000;
const MAX_WAIT_S = 75;       // give it more than 2× the 30s timeout

function ts(start: number): string {
  return `t=${((Date.now() - start) / 1000).toFixed(1)}s`;
}

async function run(): Promise<void> {
  const start = Date.now();
  const sock = new net.Socket();
  sock.setKeepAlive(true, KEEPALIVE_MS);
  sock.setNoDelay(true);

  let resolved = false;
  await new Promise<void>((resolve, reject) => {
    sock.on('connect', () => {
      console.log(`${ts(start)} connected`);
    });
    sock.on('close', (hadError) => {
      console.log(`${ts(start)} CLOSED hadError=${hadError}`);
      if (!resolved) { resolved = true; resolve(); }
    });
    sock.on('end', () => {
      console.log(`${ts(start)} 'end' (peer FIN)`);
    });
    sock.on('error', (e) => {
      console.log(`${ts(start)} error: ${e.message}`);
    });
    sock.on('data', (d) => {
      console.log(`${ts(start)} got ${d.length} bytes (unexpected)`);
    });
    sock.connect(PORT, HOST);

    // Hard timeout in case the gateway never closes us
    setTimeout(() => {
      if (!resolved) {
        console.log(`${ts(start)} STILL ALIVE after ${MAX_WAIT_S}s — keepalive works!`);
        sock.destroy();
        resolved = true;
        resolve();
      }
    }, MAX_WAIT_S * 1000);
  });
}
run().catch((e) => { console.error(e); process.exit(1); });
