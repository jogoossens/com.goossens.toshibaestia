import Homey from 'homey';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('source-map-support').install();
import { ModbusController } from './modbus/controller';

/**
 * App-level host. Owns a single ModbusController shared across all devices,
 * so multiple heat pumps behind the same gateway share one TCP socket.
 *
 * Devices access it through `this.homey.app.modbus`.
 */
export default class ToshibaEstiaApp extends Homey.App {
  public modbus!: ModbusController;

  async onInit(): Promise<void> {
    const debug = (this.homey.settings.get('debug') as boolean | null) ?? false;
    this.modbus = new ModbusController({
      log: (...args) => this.log('[ModbusController]', ...args),
      error: (...args) => this.error('[ModbusController]', ...args),
    });

    if (debug) this.log('Debug logging enabled');
    this.log(`${this.id} v${this.manifest.version} ready`);

    // Live-toggle debug logging without restart
    this.homey.settings.on('set', (key: string) => {
      if (key === 'debug') {
        const now = this.homey.settings.get('debug') as boolean | null;
        this.log(`Debug logging ${now ? 'enabled' : 'disabled'}`);
      }
    });
  }

  async onUninit(): Promise<void> {
    try {
      await this.modbus.destroy();
    } catch (err) {
      this.error('Error during onUninit', err);
    }
  }
}

module.exports = ToshibaEstiaApp;
