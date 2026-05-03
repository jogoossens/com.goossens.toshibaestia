/** Minimal logger shape accepted by the controller. Matches Homey's this.log/this.error. */
export interface ModbusLogger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Connection parameters for a single heat-pump device. */
export interface ModbusEndpoint {
  host: string;
  port: number;
  unitId: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
}

/** Controller request dispatched against an endpoint. */
export interface ModbusReadRequest {
  endpoint: ModbusEndpoint;
  address: number;
  quantity: number;
}

/** Raw holding register snapshot returned by a read. */
export type RegisterSnapshot = Record<number, number>;
