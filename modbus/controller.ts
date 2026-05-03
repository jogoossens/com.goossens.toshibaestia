import ModbusRTU from 'modbus-serial';
import type { ModbusEndpoint, ModbusLogger, RegisterSnapshot } from './types';

/**
 * Shared Modbus-TCP controller.
 *
 * One TCP connection per `host:port`, shared across all devices that point at the
 * same gateway (a single Waveshare can fan out to up to 63 slaves on the RS-485
 * bus). Requests are serialized per endpoint because RS-485 is half-duplex and
 * the gateway's polling cache does not help with concurrent frames.
 */

interface PooledClient {
  client: ModbusRTU;
  host: string;
  port: number;
  /** Promise chain used to serialize requests. */
  queue: Promise<unknown>;
  connecting: Promise<void> | null;
  /** Set to true when the underlying socket emits 'close' or 'error'. Forces
   *  reconnect on the next request. The library's own `isOpen` flag does not
   *  flip when the remote (e.g. Waveshare gateway after its idle timeout)
   *  silently FIN-closes the socket — it only flips when WE call close(). */
  dead: boolean;
}

export class ModbusController {
  private readonly clients = new Map<string, PooledClient>();

  constructor(private readonly logger: ModbusLogger) {}

  private key(host: string, port: number): string {
    return `${host}:${port}`;
  }

  private async getClient(host: string, port: number, timeoutMs: number): Promise<PooledClient> {
    const k = this.key(host, port);
    let pooled = this.clients.get(k);
    if (!pooled) {
      pooled = {
        client: new ModbusRTU(),
        host,
        port,
        queue: Promise.resolve(),
        connecting: null,
        dead: true,
      };
      pooled.client.setTimeout(timeoutMs);
      this.clients.set(k, pooled);
    }
    // Reuse existing connection if alive (both our liveness flag AND the lib's).
    if (!pooled.dead && pooled.client.isOpen) {
      pooled.client.setTimeout(timeoutMs);
      return pooled;
    }
    // If the socket was marked dead, make sure the library state agrees before reconnecting.
    if (pooled.client.isOpen) {
      try {
        await new Promise<void>((resolve) => pooled!.client.close(() => resolve()));
      } catch { /* ignore */ }
    }
    // Coalesce parallel connect attempts
    if (!pooled.connecting) {
      pooled.connecting = this.connect(pooled, timeoutMs).finally(() => {
        if (pooled) pooled.connecting = null;
      });
    }
    await pooled.connecting;
    return pooled;
  }

  private async connect(pooled: PooledClient, timeoutMs: number): Promise<void> {
    try {
      await pooled.client.connectTCP(pooled.host, { port: pooled.port });
      pooled.client.setTimeout(timeoutMs);
      pooled.dead = false;
      this.attachSocketWatchers(pooled);
      this.logger.log(`[modbus] connected to ${pooled.host}:${pooled.port}`);
    } catch (err) {
      pooled.dead = true;
      this.logger.error(`[modbus] connect failed ${pooled.host}:${pooled.port}`, err);
      throw err;
    }
  }

  /** Tune the socket and watch for death events.
   *
   *  - **TCP keepalive** (20 s) is a *liveness probe*, not an idle-prevention.
   *    We confirmed by experiment that the Waveshare/HF-LPB gateway counts
   *    only application-layer Modbus frames toward its `tcp_to` timer; empty
   *    TCP keepalive segments don't reset it. Keepalive still earns its keep
   *    by detecting network-level drops (gateway power loss, router reboot,
   *    WiFi blip) within ~20 s — the OS emits `close`/`error` proactively
   *    instead of us discovering it on the next poll's request timeout.
   *  - **No-delay** disables Nagle so small Modbus frames go on the wire
   *    immediately instead of being batched.
   *  - **Close/error/end listeners** mark the pooled client dead so the next
   *    request reconnects. modbus-serial's own `isOpen` flag does NOT flip
   *    when the remote silently FIN-closes — it only flips when WE call close().
   */
  private attachSocketWatchers(pooled: PooledClient): void {
    // modbus-serial exposes the underlying net.Socket via internal `_port._client`.
    // The shape isn't part of the public API but is stable across recent versions.
    interface RawSocket extends NodeJS.EventEmitter {
      setKeepAlive?: (enable: boolean, initialDelayMs?: number) => void;
      setNoDelay?:   (noDelay: boolean) => void;
    }
    const port = (pooled.client as unknown as { _port?: { _client?: RawSocket } })._port;
    const sock = port?._client;
    if (!sock || typeof sock.on !== 'function') return;
    try { sock.setKeepAlive?.(true, 20_000); } catch { /* ignore */ }
    try { sock.setNoDelay?.(true); } catch { /* ignore */ }
    const markDead = (label: string) => () => {
      if (!pooled.dead) {
        pooled.dead = true;
        this.logger.log(`[modbus] socket ${label} ${pooled.host}:${pooled.port}; will reconnect`);
      }
    };
    sock.on('close', markDead('close'));
    sock.on('error', markDead('error'));
    sock.on('end',   markDead('end'));
  }

  /**
   * Read a contiguous block of holding registers.
   * Requests against the same endpoint are serialized.
   */
  public async readHoldingRegisters(
    endpoint: ModbusEndpoint,
    startAddress: number,
    quantity: number,
  ): Promise<number[]> {
    const pooled = await this.getClient(endpoint.host, endpoint.port, endpoint.timeoutMs);
    // Chain on the endpoint queue to serialize
    const run = async (): Promise<number[]> => {
      try {
        pooled.client.setID(endpoint.unitId);
        pooled.client.setTimeout(endpoint.timeoutMs);
        const result = await pooled.client.readHoldingRegisters(startAddress, quantity);
        return Array.from(result.data);
      } catch (err) {
        // Any I/O error implies the socket may be dead — force reconnect on next call.
        pooled.dead = true;
        throw err;
      }
    };
    // Attach to the queue, but make sure queue failures don't poison future requests
    const next = pooled.queue.then(run, run);
    pooled.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Read an arbitrary set of register numbers (doc-style, 40001-based) by coalescing
   * them into contiguous blocks. Returns a map keyed by register number.
   */
  public async readRegisters(
    endpoint: ModbusEndpoint,
    registerNumbers: number[],
  ): Promise<RegisterSnapshot> {
    if (registerNumbers.length === 0) return {};
    const addresses = [...new Set(registerNumbers)].sort((a, b) => a - b);
    const blocks = this.coalesce(addresses);
    const snapshot: RegisterSnapshot = {};
    for (const [startNumber, count] of blocks) {
      const startAddress = startNumber - 40001;
      const values = await this.readHoldingRegisters(endpoint, startAddress, count);
      for (let i = 0; i < count; i += 1) {
        snapshot[startNumber + i] = values[i];
      }
    }
    return snapshot;
  }

  /**
   * Coalesce a sorted list of register numbers into [start, count] blocks,
   * allowing small gaps (< gapLimit) to avoid chatty round-trips.
   */
  private coalesce(sorted: number[], gapLimit = 4, maxBlock = 50): Array<[number, number]> {
    const blocks: Array<[number, number]> = [];
    let start = sorted[0];
    let end = start;
    for (let i = 1; i < sorted.length; i += 1) {
      const n = sorted[i];
      if (n - end <= gapLimit && (n - start + 1) <= maxBlock) {
        end = n;
      } else {
        blocks.push([start, end - start + 1]);
        start = n;
        end = n;
      }
    }
    blocks.push([start, end - start + 1]);
    return blocks;
  }

  /** Write a single holding register (Modbus FC06). Used later for setpoints/modes. */
  public async writeRegister(
    endpoint: ModbusEndpoint,
    registerNumber: number,
    value: number,
  ): Promise<void> {
    const pooled = await this.getClient(endpoint.host, endpoint.port, endpoint.timeoutMs);
    const startAddress = registerNumber - 40001;
    const run = async (): Promise<void> => {
      try {
        pooled.client.setID(endpoint.unitId);
        pooled.client.setTimeout(endpoint.timeoutMs);
        await pooled.client.writeRegister(startAddress, value);
      } catch (err) {
        pooled.dead = true;
        throw err;
      }
    };
    const next = pooled.queue.then(run, run);
    pooled.queue = next.catch(() => undefined);
    return next;
  }

  /** Close all pooled connections. Called from app.onUninit. */
  public async destroy(): Promise<void> {
    for (const pooled of this.clients.values()) {
      try {
        if (pooled.client.isOpen) {
          await new Promise<void>((resolve) => pooled.client.close(() => resolve()));
        }
      } catch (err) {
        this.logger.error('[modbus] close failed', err);
      }
    }
    this.clients.clear();
  }

  /** Drop a single pooled connection (e.g. after settings change). */
  public async disconnect(host: string, port: number): Promise<void> {
    const k = this.key(host, port);
    const pooled = this.clients.get(k);
    if (!pooled) return;
    try {
      if (pooled.client.isOpen) {
        await new Promise<void>((resolve) => pooled.client.close(() => resolve()));
      }
    } catch (err) {
      this.logger.error(`[modbus] disconnect failed ${k}`, err);
    }
    this.clients.delete(k);
  }
}
