/** StampC5 text/NDJSON transport. Connecting never arms physical output. */
export type ConnectionState = "disconnected" | "connecting" | "connected";
export type TransportKind = "serial" | "usb";

export interface ResolvedContainer {
  span_x_m?: number;
  span_y_m?: number;
  span_z_m?: number;
  fill?: number;
  headspace?: number;
  viscosity?: number;
  particle_count?: number;
  particle_hardness?: number;
  [key: string]: unknown;
}

export interface DeviceSnapshot {
  timestamp_ms: number;
  frame_counter: number;
  preset: string;
  run_mode: string;
  imu?: { valid?: boolean; accel_g?: number[]; gyro_dps?: number[]; [key: string]: unknown };
  mass?: { pos_norm?: number[]; vel_norm_s?: number[]; energy?: number; fill?: number; [key: string]: unknown };
  audio?: { runtime_enabled?: boolean; output_silenced?: boolean; [key: string]: unknown };
  safety?: { imu_stale_safe_stop?: boolean; audio_zero_asserted?: boolean; tilt_disarmed?: boolean; [key: string]: unknown };
  tilt_servo?: { state?: number; fault?: number; devices?: Array<Record<string, unknown>>; [key: string]: unknown };
  last_event?: { type?: string; primary_wall?: string; amplitude?: number; [key: string]: unknown };
  evt_total?: number;
  new_evt?: number;
  actuators?: number[];
  resolved?: {
    family?: string;
    container?: ResolvedContainer;
    model?: { coherent_container_demo?: boolean; device_frame_transform?: boolean; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CommandAck {
  requestId: number;
  result: string;
  session: string;
  frame: number;
  detail: string;
}

export interface HapticLinkState {
  connection: ConnectionState;
  transport: TransportKind | null;
  paired: boolean | null;
  stale: boolean;
  telemetry: DeviceSnapshot | null;
  lastTelemetryAt: number | null;
  pendingCommand: string | null;
  error: string | null;
  lastAck: CommandAck | null;
}

export type ParsedBridgeLine =
  | { kind: "telemetry"; snapshot: DeviceSnapshot }
  | { kind: "tx"; requestId: number; operation: number }
  | { kind: "ack"; ack: CommandAck }
  | { kind: "status"; paired: boolean; session: string | null }
  | { kind: "error"; message: string; requestId?: number }
  | { kind: "diagnostic"; message: string };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse only the existing bridge contract; retain every telemetry field. */
export function parseHapticLinkLine(raw: string): ParsedBridgeLine | null {
  const line = raw.trim();
  if (!line) return null;
  if (line.startsWith("{")) {
    try {
      const value: unknown = JSON.parse(line);
      if (!record(value) || !Number.isFinite(value.timestamp_ms) ||
          !Number.isFinite(value.frame_counter) || typeof value.preset !== "string" ||
          typeof value.run_mode !== "string") {
        return { kind: "diagnostic", message: "Ignored non-telemetry JSON line" };
      }
      for (const [group, fields, length] of [["imu", ["accel_g", "gyro_dps"], 3], ["mass", ["pos_norm", "vel_norm_s"], 2]] as const) {
        const entry = value[group];
        if (entry !== undefined && !record(entry)) return { kind: "diagnostic", message: `Ignored invalid ${group}` };
        for (const field of fields) {
          const vector = record(entry) ? entry[field] : undefined;
          if (vector !== undefined && (!Array.isArray(vector) || vector.length !== length || !vector.every(Number.isFinite))) {
            return { kind: "diagnostic", message: `Ignored invalid ${group}.${field}` };
          }
        }
      }
      if (value.resolved !== undefined) {
        const resolved = value.resolved;
        if (!record(resolved) || (resolved.family !== undefined && typeof resolved.family !== "string")) {
          return { kind: "diagnostic", message: "Ignored invalid resolved config" };
        }
        for (const group of ["container", "model"] as const) {
          if (resolved[group] !== undefined && !record(resolved[group])) return { kind: "diagnostic", message: `Ignored invalid resolved.${group}` };
        }
        if (record(resolved.container)) {
          for (const key of ["span_x_m", "span_y_m", "span_z_m", "fill", "headspace", "viscosity", "particle_count", "particle_hardness"]) {
            if (resolved.container[key] !== undefined && !Number.isFinite(resolved.container[key])) {
              return { kind: "diagnostic", message: `Ignored invalid resolved.container.${key}` };
            }
          }
        }
        if (record(resolved.model)) {
          for (const key of ["coherent_container_demo", "device_frame_transform"]) {
            if (resolved.model[key] !== undefined && typeof resolved.model[key] !== "boolean") {
              return { kind: "diagnostic", message: `Ignored invalid resolved.model.${key}` };
            }
          }
        }
      }
      return { kind: "telemetry", snapshot: value as unknown as DeviceSnapshot };
    } catch {
      return { kind: "diagnostic", message: "Ignored malformed JSON line" };
    }
  }
  const tx = /^haptic_link_tx:\s+request=(\d+)\s+operation=(\d+)$/.exec(line);
  if (tx) return { kind: "tx", requestId: Number(tx[1]), operation: Number(tx[2]) };
  const ack = /^haptic_link_ack:\s+request=(\d+)\s+result=(\S+)\s+session=([0-9A-Fa-f]+)\s+frame=(\d+)\s+detail=(.*)$/.exec(line);
  if (ack) return { kind: "ack", ack: { requestId: Number(ack[1]), result: ack[2], session: ack[3], frame: Number(ack[4]), detail: ack[5] } };
  if (line.startsWith("espnow_bridge:")) {
    const paired = /\bpaired=([01])\b/.exec(line);
    if (paired) return { kind: "status", paired: paired[1] === "1", session: /\bsession=([0-9A-Fa-f]+)/.exec(line)?.[1] ?? null };
  }
  if (/^haptic_link:\s+(?:command rejected|command send failed|timeout|invalid|set syntax)/.test(line)) {
    const request = /\brequest=(\d+)/.exec(line);
    return { kind: "error", message: line, requestId: request ? Number(request[1]) : undefined };
  }
  return { kind: "diagnostic", message: line };
}

export interface HapticLinkTransport {
  readonly kind: TransportKind;
  open(onBytes: (bytes: Uint8Array) => void, onClose: (error?: Error) => void): Promise<void>;
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface HapticLinkOptions {
  commandTimeoutMs?: number;
  staleAfterMs?: number;
  discoveryTimeoutMs?: number;
  discoveryRetryIntervalMs?: number;
  transportFactory?: (kind: "auto" | TransportKind) => Promise<HapticLinkTransport>;
}

export class HapticLinkError extends Error {
  readonly code: "cancelled" | "disconnected" | "timeout" | "rejected" | "transport";
  constructor(code: HapticLinkError["code"], message: string) {
    super(message);
    this.name = "HapticLinkError";
    this.code = code;
  }
}

interface PendingCommand {
  text: string;
  operation: number;
  requestId?: number;
  timer?: ReturnType<typeof setTimeout>;
  deadline?: number;
  resolve: (ack: CommandAck) => void;
  reject: (error: Error) => void;
}

export class HapticLink {
  private readonly options: HapticLinkOptions;
  private view: Omit<HapticLinkState, "stale"> = {
    connection: "disconnected", transport: null, paired: null,
    telemetry: null, lastTelemetryAt: null, pendingCommand: null,
    error: null, lastAck: null
  };
  private readonly listeners = new Set<(state: HapticLinkState) => void>();
  private transport: HapticLinkTransport | null = null;
  private generation = 0;
  private sequence = 0;
  private decoder = new TextDecoder();
  private line = "";
  private discardLine = false;
  private active: PendingCommand | null = null;
  private queue: PendingCommand[] = [];
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(options: HapticLinkOptions = {}) { this.options = options; }

  get state(): HapticLinkState {
    return { ...this.view, stale: this.view.connection !== "connected" ||
      this.view.lastTelemetryAt === null ||
      Date.now() - this.view.lastTelemetryAt > (this.options.staleAfterMs ?? 1000) };
  }

  subscribe(listener: (state: HapticLinkState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private emit() { for (const listener of this.listeners) listener(this.state); }

  async connect(kind: "auto" | TransportKind = "auto"): Promise<void> {
    if (this.view.connection !== "disconnected") throw new Error("Haptic Link is already open or connecting");
    const generation = ++this.generation;
    this.decoder = new TextDecoder(); this.line = ""; this.discardLine = false;
    this.view = { ...this.view, connection: "connecting", transport: null, paired: null, error: null, lastTelemetryAt: null };
    this.emit();
    let transport: HapticLinkTransport | null = null;
    try {
      transport = await (this.options.transportFactory ?? createBrowserTransport)(kind);
      if (generation !== this.generation) throw new HapticLinkError("cancelled", "Connection cancelled");
      this.transport = transport;
      await transport.open(
        bytes => { if (generation === this.generation) this.receive(bytes); },
        error => { if (generation === this.generation) void this.disconnectWithError(error?.message ?? "Device disconnected"); }
      );
      if (generation !== this.generation) throw new HapticLinkError("cancelled", "Connection cancelled");
      // Local bridge observation only. Finish this write before enabling commands.
      // No Live, preset, or output command is sent on connection/reconnection.
      await transport.write(new TextEncoder().encode("status\n"));
      if (generation !== this.generation) throw new HapticLinkError("cancelled", "Connection cancelled");
      this.view.connection = "connected";
      this.view.transport = transport.kind;
      this.ticker = setInterval(() => this.emit(), 250);
      this.emit();
    } catch (error) {
      if (generation === this.generation) await this.disconnectWithError(asError(error).message);
      else await transport?.close().catch(() => undefined);
      throw error;
    }
  }

  async disconnect(): Promise<void> { await this.disconnectWithError(null); }

  private async disconnectWithError(message: string | null): Promise<void> {
    ++this.generation; ++this.sequence;
    const transport = this.transport;
    this.transport = null;
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    const error = new HapticLinkError("disconnected", message ?? "Haptic Link disconnected");
    if (this.active) {
      clearTimeout(this.active.timer);
      this.active.reject(error);
      this.active = null;
    }
    this.cancelQueued(error);
    this.view = { ...this.view, connection: "disconnected", transport: null, paired: null, pendingCommand: null, error: message };
    this.emit();
    await transport?.close().catch(closeError => {
      this.view.error = asError(closeError).message; this.emit();
    });
  }

  async getState(): Promise<CommandAck> {
    const generation = this.generation;
    const sequence = this.sequence;
    const budget = this.options.discoveryTimeoutMs ?? 3500;
    const spacing = this.options.discoveryRetryIntervalMs ?? 150;
    const deadline = Date.now() + (Number.isFinite(budget) ? Math.max(1, budget) : 3500);
    const interval = Number.isFinite(spacing) ? Math.max(1, spacing) : 150;
    const checkCurrent = () => {
      if (this.view.connection !== "connected") throw new HapticLinkError("disconnected", "Haptic Link disconnected");
      if (generation !== this.generation) throw new HapticLinkError("cancelled", "Connection changed during state discovery");
      this.checkSequence(sequence);
    };
    for (;;) {
      checkCurrent();
      try {
        const ack = await this.command("get state", 2, false, deadline);
        checkCurrent();
        return ack; // Telemetry or Hello alone does not complete this request.
      } catch (error) {
        checkCurrent();
        const retryable = error instanceof HapticLinkError && error.code === "rejected" &&
          (/^haptic_link: command rejected; (?:AtomS3 source not discovered|link not paired|prior request pending)$/.test(error.message) ||
           /^(?:not_paired|bad_session): /.test(error.message));
        const remaining = deadline - Date.now();
        if (!retryable || remaining <= 0) throw error;
        await new Promise<void>(resolve => setTimeout(resolve, Math.min(interval, remaining)));
        checkCurrent();
        if (Date.now() >= deadline) throw error;
      }
    }
  }
  setAudio(enabled: boolean): Promise<CommandAck> { return this.command(`audio ${enabled ? "on" : "off"}`, 5); }
  setTilt(enabled: boolean): Promise<CommandAck> { return this.command(`tilt ${enabled ? "on" : "off"}`, 9); }
  clearTiltFault(): Promise<CommandAck> { return this.command("tilt clear", 10); }

  async start(outputs: { audio: boolean; tilt: boolean }): Promise<CommandAck> {
    const sequence = ++this.sequence;
    try {
      await this.command("live", 4);
      this.checkSequence(sequence);
      await this.setAudio(outputs.audio);
      this.checkSequence(sequence);
      const ack = await this.setTilt(outputs.tilt);
      this.checkSequence(sequence);
      return ack;
    } catch (error) {
      // A partly applied Start must not silently leave just one output running.
      // If Stop already superseded us, let that command finish without duplication.
      if (sequence === this.sequence && this.view.connection === "connected") {
        await this.stop().catch(() => undefined);
      }
      throw error;
    }
  }

  stop(): Promise<CommandAck> {
    ++this.sequence;
    this.cancelQueued(new HapticLinkError("cancelled", "Superseded by Stop"));
    return this.command("stop", 3, true);
  }

  async loadPreset(name: string): Promise<CommandAck> {
    if (!/^[A-Za-z0-9_-]{1,63}$/.test(name)) throw new Error("Invalid preset name");
    const stopped = this.stop();
    const sequence = this.sequence;
    await stopped;
    this.checkSequence(sequence);
    const ack = await this.command(`preset load ${name}`, 6);
    this.checkSequence(sequence);
    await this.getState();
    this.checkSequence(sequence);
    return ack;
  }

  setParam(path: string, value: number): Promise<CommandAck> {
    if (!/^[A-Za-z_][A-Za-z0-9_.]{0,46}$/.test(path) || !Number.isFinite(value)) {
      return Promise.reject(new Error("Invalid numeric property"));
    }
    return this.command(`set ${path} ${value}`, 7);
  }

  private checkSequence(sequence: number) {
    if (sequence !== this.sequence) throw new HapticLinkError("cancelled", "Command sequence was cancelled");
  }

  private cancelQueued(error: Error) {
    for (const item of this.queue.splice(0)) {
      clearTimeout(item.timer);
      item.reject(error);
    }
  }

  private command(text: string, operation: number, priority = false, deadline?: number): Promise<CommandAck> {
    if (this.view.connection !== "connected" || !this.transport) {
      return Promise.reject(new HapticLinkError("disconnected", "Connect Haptic Link first"));
    }
    return new Promise((resolve, reject) => {
      const item: PendingCommand = { text, operation, resolve, reject, deadline };
      if (deadline !== undefined) {
        item.timer = setTimeout(() => {
          const index = this.queue.indexOf(item);
          if (index < 0) return;
          this.queue.splice(index, 1);
          item.reject(new HapticLinkError("timeout", "State discovery window expired while queued"));
        }, Math.max(0, deadline - Date.now()));
      }
      if (priority) this.queue.unshift(item); else this.queue.push(item);
      this.pump();
    });
  }

  private pump() {
    if (this.active || !this.transport || this.view.connection !== "connected") return;
    const item = this.queue.shift();
    if (!item) return;
    this.active = item;
    clearTimeout(item.timer);
    const timeout = Math.min(this.options.commandTimeoutMs ?? 2200,
      item.deadline === undefined ? Infinity : item.deadline - Date.now());
    if (timeout <= 0) {
      this.finish(new HapticLinkError("timeout", "State discovery window expired"));
      return;
    }
    this.view.pendingCommand = item.text; this.view.error = null; this.emit();
    item.timer = setTimeout(() => {
      if (this.active === item) this.finish(new HapticLinkError("timeout", `No execution ACK for ${item.text}`));
    }, timeout);
    void this.transport.write(new TextEncoder().encode(`${item.text}\n`)).catch(error => {
      if (this.active === item) this.finish(new HapticLinkError("transport", asError(error).message));
    });
  }

  private finish(error: Error | null, ack?: CommandAck) {
    const item = this.active;
    if (!item) return;
    this.active = null; clearTimeout(item.timer);
    this.view.pendingCommand = null;
    if (error) { this.view.error = error.message; item.reject(error); }
    else if (ack) { this.view.lastAck = ack; item.resolve(ack); }
    this.emit();
    this.pump();
  }

  private receive(bytes: Uint8Array) {
    this.line += this.decoder.decode(bytes, { stream: true });
    let end = this.line.indexOf("\n");
    while (end >= 0) {
      const line = this.line.slice(0, end);
      this.line = this.line.slice(end + 1);
      if (!this.discardLine && line.length <= 16384) this.handleLine(line);
      this.discardLine = false;
      end = this.line.indexOf("\n");
    }
    if (this.line.length > 16384) { this.line = ""; this.discardLine = true; }
  }

  private handleLine(line: string) {
    const parsed = parseHapticLinkLine(line);
    if (!parsed) return;
    if (parsed.kind === "telemetry") {
      this.view.telemetry = parsed.snapshot;
      this.view.lastTelemetryAt = Date.now();
      this.emit();
    } else if (parsed.kind === "status") {
      this.view.paired = parsed.paired; this.emit();
    } else if (parsed.kind === "tx") {
      if (this.active?.requestId === undefined && this.active?.operation === parsed.operation) this.active.requestId = parsed.requestId;
    } else if (parsed.kind === "ack") {
      const ack = parsed.ack;
      if (ack.result === "applied" && !/^0+$/.test(ack.session)) this.view.paired = true;
      if (ack.result === "not_paired" || ack.result === "bad_session") this.view.paired = false;
      if (this.active?.requestId === ack.requestId) {
        this.finish(ack.result === "applied" ? null : new HapticLinkError("rejected", `${ack.result}: ${ack.detail}`), ack);
      } else this.emit();
    } else if (parsed.kind === "error" && this.active &&
               (parsed.requestId === undefined || parsed.requestId === this.active.requestId)) {
      this.finish(new HapticLinkError(parsed.message.includes("timeout") ? "timeout" : "rejected", parsed.message));
    }
  }
}

function asError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)); }

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}
interface UsbEndpoint { endpointNumber: number; direction: "in" | "out"; type: string; packetSize: number }
interface UsbAlternate { alternateSetting: number; interfaceClass: number; endpoints: UsbEndpoint[] }
interface UsbInterface { interfaceNumber: number; alternates: UsbAlternate[] }
interface UsbConfiguration { configurationValue: number; interfaces: UsbInterface[] }
interface UsbDeviceLike {
  configuration: UsbConfiguration | null;
  configurations: UsbConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(value: number): Promise<void>;
  selectAlternateInterface(value: number, alternate: number): Promise<void>;
  transferIn(endpoint: number, length: number): Promise<{ status: string; data?: DataView }>;
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: string; bytesWritten: number }>;
  controlTransferOut(setup: { requestType: "class"; recipient: "interface"; request: number; value: number; index: number }, data?: BufferSource): Promise<{ status: string }>;
}
type LinkNavigator = Navigator & {
  serial?: { requestPort(): Promise<SerialPortLike> };
  usb?: { requestDevice(options: { filters: Array<{ vendorId: number }> }): Promise<UsbDeviceLike> };
};

export function hapticLinkCapabilities(): { serial: boolean; usb: boolean } {
  const nav = globalThis.navigator as LinkNavigator | undefined;
  return { serial: Boolean(nav?.serial), usb: Boolean(nav?.usb) };
}

async function createBrowserTransport(kind: "auto" | TransportKind): Promise<HapticLinkTransport> {
  const nav = globalThis.navigator as LinkNavigator | undefined;
  if ((kind === "auto" || kind === "serial") && nav?.serial) {
    return serialTransport(await nav.serial.requestPort());
  }
  if ((kind === "auto" || kind === "usb") && nav?.usb) {
    return usbTransport(await nav.usb.requestDevice({ filters: [{ vendorId: 0x303a }] }));
  }
  throw new Error(`This browser does not expose ${kind === "auto" ? "Web Serial or WebUSB" : kind === "serial" ? "Web Serial" : "WebUSB"}`);
}

function serialTransport(port: SerialPortLike): HapticLinkTransport {
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let reading: Promise<void> | null = null;
  let closing = false;
  let opened = false;
  return {
    kind: "serial",
    async open(onBytes, onClose) {
      await port.open({ baudRate: 115200 }); opened = true;
      if (!port.readable) throw new Error("Serial port has no readable stream");
      reader = port.readable.getReader();
      const current = reader;
      reading = (async () => {
        try {
          while (!closing) {
            const { value, done } = await current.read();
            if (done) break;
            if (value) onBytes(value);
          }
          if (!closing) onClose();
        } catch (error) { if (!closing) onClose(asError(error)); }
        finally { current.releaseLock(); reader = null; }
      })();
    },
    async write(bytes) {
      if (!port.writable) throw new Error("Serial port has no writable stream");
      const writer = port.writable.getWriter();
      try { await writer.write(bytes); } finally { writer.releaseLock(); }
    },
    async close() {
      closing = true;
      await reader?.cancel().catch(() => undefined);
      await reading;
      if (opened) { opened = false; await port.close(); }
    }
  };
}

function usbTransport(device: UsbDeviceLike): HapticLinkTransport {
  let incoming = 0;
  let outgoing = 0;
  let readLength = 512;
  let reading: Promise<void> | null = null;
  let closing = false;
  let opened = false;
  return {
    kind: "usb",
    async open(onBytes, onClose) {
      await device.open(); opened = true;
      if (!device.configuration) {
        const config = device.configurations[0];
        if (!config) throw new Error("USB device has no configuration");
        await device.selectConfiguration(config.configurationValue);
      }
      const interfaces = device.configuration?.interfaces ?? [];
      const candidates = interfaces.flatMap(iface => iface.alternates.map(alternate => ({ iface, alternate })))
        .filter(({ alternate }) => alternate.interfaceClass === 0x0a &&
          alternate.endpoints.some(ep => ep.type === "bulk" && ep.direction === "in") &&
          alternate.endpoints.some(ep => ep.type === "bulk" && ep.direction === "out"));
      const selected = candidates[0];
      if (!selected) throw new Error("No CDC serial bulk IN/OUT interface was found; arbitrary vendor/JTAG interfaces are not Haptic Link");
      await device.claimInterface(selected.iface.interfaceNumber);
      if (selected.alternate.alternateSetting !== 0) await device.selectAlternateInterface(selected.iface.interfaceNumber, selected.alternate.alternateSetting);
      const inEndpoint = selected.alternate.endpoints.find(ep => ep.type === "bulk" && ep.direction === "in")!;
      incoming = inEndpoint.endpointNumber;
      outgoing = selected.alternate.endpoints.find(ep => ep.type === "bulk" && ep.direction === "out")!.endpointNumber;
      readLength = Math.max(512, inEndpoint.packetSize);
      if (selected.alternate.interfaceClass === 0x0a) {
        const controls = interfaces.filter(iface => iface.alternates.some(alt => alt.interfaceClass === 0x02));
        const control = controls.find(iface => iface.interfaceNumber === selected.iface.interfaceNumber - 1) ??
          (controls.length === 1 ? controls[0] : undefined);
        if (!control) throw new Error("CDC data interface has no communications interface");
        // Interface-recipient control transfers require that interface's claim,
        // independently of the bulk data interface (WebUSB control validation).
        await device.claimInterface(control.interfaceNumber);
        const setup = { requestType: "class" as const, recipient: "interface" as const, index: control.interfaceNumber };
        const coding = await device.controlTransferOut({ ...setup, request: 0x20, value: 0 }, new Uint8Array([0x00, 0xc2, 0x01, 0x00, 0, 0, 8]));
        const state = await device.controlTransferOut({ ...setup, request: 0x22, value: 1 });
        if (coding.status !== "ok" || state.status !== "ok") throw new Error("USB CDC setup failed");
      }
      reading = (async () => {
        try {
          while (!closing) {
            const result = await device.transferIn(incoming, readLength);
            if (result.status !== "ok") throw new Error(`USB read ${result.status}`);
            if (result.data?.byteLength) onBytes(new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength));
          }
        } catch (error) { if (!closing) onClose(asError(error)); }
      })();
    },
    async write(bytes) {
      const result = await device.transferOut(outgoing, new Uint8Array(bytes).buffer);
      if (result.status !== "ok" || result.bytesWritten !== bytes.byteLength) throw new Error("USB command write was incomplete");
    },
    async close() {
      closing = true;
      // Closing first cancels any outstanding transferIn; waiting first hangs.
      if (opened) { opened = false; await device.close(); }
      await reading;
    }
  };
}
