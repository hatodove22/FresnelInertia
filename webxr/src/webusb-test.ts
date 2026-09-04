import "./webusb-test.css";

type UsbDirection = "in" | "out";
type UsbEndpointType = "bulk" | "interrupt" | "isochronous";

interface ProbeUsbEndpoint {
  endpointNumber: number;
  direction: UsbDirection;
  type: UsbEndpointType;
  packetSize: number;
}

interface ProbeUsbAlternateInterface {
  alternateSetting: number;
  interfaceClass: number;
  interfaceSubclass: number;
  interfaceProtocol: number;
  interfaceName?: string;
  endpoints: ProbeUsbEndpoint[];
}

interface ProbeUsbInterface {
  interfaceNumber: number;
  claimed: boolean;
  alternates: ProbeUsbAlternateInterface[];
}

interface ProbeUsbConfiguration {
  configurationValue: number;
  configurationName?: string;
  interfaces: ProbeUsbInterface[];
}

interface ProbeUsbDevice {
  opened: boolean;
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
  deviceClass: number;
  deviceSubclass: number;
  deviceProtocol: number;
  usbVersionMajor: number;
  usbVersionMinor: number;
  usbVersionSubminor: number;
  configuration: ProbeUsbConfiguration | null;
  configurations: ProbeUsbConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface?(interfaceNumber: number, alternateSetting: number): Promise<void>;
  transferIn(endpointNumber: number, length: number): Promise<{ data?: DataView; status: string }>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<{ bytesWritten: number; status: string }>;
  controlTransferOut(setup: ProbeUsbControlTransfer, data?: BufferSource): Promise<{ bytesWritten: number; status: string }>;
}

interface ProbeUsbControlTransfer {
  requestType: "standard" | "class" | "vendor";
  recipient: "device" | "interface" | "endpoint" | "other";
  request: number;
  value: number;
  index: number;
}

interface ProbeUsb {
  requestDevice(options: { filters: Array<{ vendorId?: number; productId?: number }> }): Promise<ProbeUsbDevice>;
  getDevices(): Promise<ProbeUsbDevice[]>;
}

interface ProbeSerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

interface ProbeSerial {
  requestPort(): Promise<ProbeSerialPort>;
}

type ProbeNavigator = Navigator & {
  usb?: ProbeUsb;
  serial?: ProbeSerial;
  xr?: unknown;
};

const nav = navigator as ProbeNavigator;

const secureStatus = mustElement<HTMLElement>("secure-status");
const xrStatus = mustElement<HTMLElement>("xr-status");
const usbStatus = mustElement<HTMLElement>("usb-status");
const serialStatus = mustElement<HTMLElement>("serial-status");
const vendorIdInput = mustElement<HTMLInputElement>("vendor-id-input");
const productIdInput = mustElement<HTMLInputElement>("product-id-input");
const refreshButton = mustElement<HTMLButtonElement>("refresh-button");
const usbConnectButton = mustElement<HTMLButtonElement>("usb-connect-button");
const usbConnectAnyButton = mustElement<HTMLButtonElement>("usb-connect-any-button");
const usbCloseButton = mustElement<HTMLButtonElement>("usb-close-button");
const deviceSummary = mustElement<HTMLPreElement>("device-summary");
const interfaceSelect = mustElement<HTMLSelectElement>("interface-select");
const claimButton = mustElement<HTMLButtonElement>("claim-button");
const inEndpointInput = mustElement<HTMLInputElement>("in-endpoint-input");
const outEndpointInput = mustElement<HTMLInputElement>("out-endpoint-input");
const readLengthInput = mustElement<HTMLInputElement>("read-length-input");
const cdcInterfaceInput = mustElement<HTMLInputElement>("cdc-interface-input");
const appendNewlineCheckbox = mustElement<HTMLInputElement>("append-newline-checkbox");
const cdcLineStateButton = mustElement<HTMLButtonElement>("cdc-line-state-button");
const usbReadOnceButton = mustElement<HTMLButtonElement>("usb-read-once-button");
const usbReadLoopButton = mustElement<HTMLButtonElement>("usb-read-loop-button");
const usbPayloadInput = mustElement<HTMLTextAreaElement>("usb-payload-input");
const usbSendButton = mustElement<HTMLButtonElement>("usb-send-button");
const serialConnectButton = mustElement<HTMLButtonElement>("serial-connect-button");
const serialCloseButton = mustElement<HTMLButtonElement>("serial-close-button");
const serialSendButton = mustElement<HTMLButtonElement>("serial-send-button");
const baudInput = mustElement<HTMLInputElement>("baud-input");
const serialNewlineCheckbox = mustElement<HTMLInputElement>("serial-newline-checkbox");
const serialPayloadInput = mustElement<HTMLTextAreaElement>("serial-payload-input");
const clearLogButton = mustElement<HTMLButtonElement>("clear-log-button");
const logElement = mustElement<HTMLPreElement>("log");

let usbDevice: ProbeUsbDevice | null = null;
let claimedInterfaceNumber: number | null = null;
let usbReadLoopActive = false;
let serialPort: ProbeSerialPort | null = null;
let serialReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let serialReadLoopActive = false;

refreshCapabilities();
void listGrantedUsbDevices();

refreshButton.addEventListener("click", () => {
  refreshCapabilities();
  void listGrantedUsbDevices();
});
usbConnectButton.addEventListener("click", () => {
  void connectUsb(false);
});
usbConnectAnyButton.addEventListener("click", () => {
  void connectUsb(true);
});
usbCloseButton.addEventListener("click", () => {
  void closeUsb();
});
claimButton.addEventListener("click", () => {
  void claimSelectedInterface();
});
cdcLineStateButton.addEventListener("click", () => {
  void setCdcLineState();
});
usbReadOnceButton.addEventListener("click", () => {
  void readUsbOnce();
});
usbReadLoopButton.addEventListener("click", () => {
  toggleUsbReadLoop();
});
usbSendButton.addEventListener("click", () => {
  void sendUsbPayload();
});
serialConnectButton.addEventListener("click", () => {
  void connectSerial();
});
serialCloseButton.addEventListener("click", () => {
  void closeSerial();
});
serialSendButton.addEventListener("click", () => {
  void sendSerialPayload();
});
clearLogButton.addEventListener("click", () => {
  logElement.textContent = "";
});

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

function refreshCapabilities() {
  setBadge(secureStatus, window.isSecureContext);
  setBadge(xrStatus, Boolean(nav.xr));
  setBadge(usbStatus, Boolean(nav.usb));
  setBadge(serialStatus, Boolean(nav.serial));
  serialConnectButton.disabled = !nav.serial;
  usbConnectButton.disabled = !nav.usb;
  usbConnectAnyButton.disabled = !nav.usb;

  log(`capabilities secure=${window.isSecureContext} xr=${Boolean(nav.xr)} usb=${Boolean(nav.usb)} serial=${Boolean(nav.serial)}`);
}

function setBadge(element: HTMLElement, ok: boolean) {
  element.textContent = ok ? "available" : "missing";
  element.classList.toggle("ok", ok);
  element.classList.toggle("warn", !ok);
}

async function listGrantedUsbDevices() {
  if (!nav.usb) {
    return;
  }
  try {
    const devices = await nav.usb.getDevices();
    if (devices.length > 0) {
      log(`previously granted USB devices: ${devices.map(deviceLabel).join(", ")}`);
    }
  } catch (error) {
    logError("getDevices failed", error);
  }
}

async function connectUsb(showAllDevices: boolean) {
  if (!nav.usb) {
    log("WebUSB is not exposed by this browser.");
    return;
  }

  try {
    const filters = showAllDevices ? [] : readUsbFilters();
    usbDevice = await nav.usb.requestDevice({ filters });
    log(`selected USB device ${deviceLabel(usbDevice)}`);
    await openUsbDevice(usbDevice);
  } catch (error) {
    logError("USB connect failed", error);
  }
}

function readUsbFilters() {
  const vendorId = parseHexOrDecimal(vendorIdInput.value);
  const productId = parseHexOrDecimal(productIdInput.value);
  if (vendorId === null) {
    return [{ vendorId: 0x303a }];
  }
  if (productId === null) {
    return [{ vendorId }];
  }
  return [{ vendorId, productId }];
}

async function openUsbDevice(device: ProbeUsbDevice) {
  await device.open();
  if (!device.configuration) {
    const firstConfiguration = device.configurations[0];
    if (!firstConfiguration) {
      throw new Error("Device has no USB configurations.");
    }
    await device.selectConfiguration(firstConfiguration.configurationValue);
  }
  renderDeviceSummary(device);
  populateInterfaceOptions(device);
  usbCloseButton.disabled = false;
  claimButton.disabled = interfaceSelect.options.length === 0;
  interfaceSelect.disabled = interfaceSelect.options.length === 0;
}

async function closeUsb() {
  usbReadLoopActive = false;
  if (!usbDevice) {
    return;
  }
  try {
    if (claimedInterfaceNumber !== null && usbDevice.opened) {
      await usbDevice.releaseInterface(claimedInterfaceNumber);
    }
    if (usbDevice.opened) {
      await usbDevice.close();
    }
    log("USB device closed.");
  } catch (error) {
    logError("USB close failed", error);
  } finally {
    usbDevice = null;
    claimedInterfaceNumber = null;
    renderDisconnectedUsb();
  }
}

function renderDisconnectedUsb() {
  deviceSummary.textContent = "No device selected.";
  interfaceSelect.replaceChildren();
  interfaceSelect.disabled = true;
  claimButton.disabled = true;
  usbCloseButton.disabled = true;
  cdcLineStateButton.disabled = true;
  usbReadOnceButton.disabled = true;
  usbReadLoopButton.disabled = true;
  usbSendButton.disabled = true;
  usbReadLoopButton.textContent = "Read Loop";
}

function renderDeviceSummary(device: ProbeUsbDevice) {
  const lines: string[] = [];
  lines.push(`${deviceLabel(device)}`);
  lines.push(`USB ${device.usbVersionMajor}.${device.usbVersionMinor}.${device.usbVersionSubminor}`);
  lines.push(`device class=${hexByte(device.deviceClass)} subclass=${hexByte(device.deviceSubclass)} protocol=${hexByte(device.deviceProtocol)}`);
  lines.push("");
  for (const config of device.configurations) {
    lines.push(`configuration ${config.configurationValue}${config.configurationName ? ` ${config.configurationName}` : ""}`);
    for (const iface of config.interfaces) {
      for (const alternate of iface.alternates) {
        const endpoints = alternate.endpoints
          .map((endpoint) => `${endpoint.direction}${endpoint.endpointNumber}:${endpoint.type}/${endpoint.packetSize}`)
          .join(", ");
        lines.push(
          `  iface ${iface.interfaceNumber} alt ${alternate.alternateSetting} class=${hexByte(alternate.interfaceClass)} subclass=${hexByte(alternate.interfaceSubclass)} protocol=${hexByte(alternate.interfaceProtocol)} endpoints=[${endpoints || "none"}]`
        );
      }
    }
  }
  deviceSummary.textContent = lines.join("\n");
}

function populateInterfaceOptions(device: ProbeUsbDevice) {
  interfaceSelect.replaceChildren();
  const config = device.configuration ?? device.configurations[0];
  if (!config) {
    return;
  }

  for (const iface of config.interfaces) {
    for (const alternate of iface.alternates) {
      const endpointSummary = alternate.endpoints
        .map((endpoint) => `${endpoint.direction}${endpoint.endpointNumber}:${endpoint.type}`)
        .join(" ");
      const option = document.createElement("option");
      option.value = `${iface.interfaceNumber}:${alternate.alternateSetting}`;
      option.textContent =
        `iface ${iface.interfaceNumber} alt ${alternate.alternateSetting} class ${hexByte(alternate.interfaceClass)} ${endpointSummary}`;
      interfaceSelect.appendChild(option);
    }
  }

  const preferredIndex = Array.from(interfaceSelect.options).findIndex((option) => {
    const [, alternate] = findSelectedInterface(device, option.value) ?? [];
    return alternate?.endpoints.some((endpoint) => endpoint.type === "bulk") ?? false;
  });
  if (preferredIndex >= 0) {
    interfaceSelect.selectedIndex = preferredIndex;
  }
}

async function claimSelectedInterface() {
  if (!usbDevice) {
    return;
  }
  const selected = findSelectedInterface(usbDevice, interfaceSelect.value);
  if (!selected) {
    log("No interface selected.");
    return;
  }

  const [iface, alternate] = selected;
  try {
    if (claimedInterfaceNumber !== null && claimedInterfaceNumber !== iface.interfaceNumber) {
      await usbDevice.releaseInterface(claimedInterfaceNumber);
    }
    await usbDevice.claimInterface(iface.interfaceNumber);
    if (usbDevice.selectAlternateInterface && alternate.alternateSetting !== 0) {
      await usbDevice.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
    }
    claimedInterfaceNumber = iface.interfaceNumber;
    cdcInterfaceInput.value = String(iface.interfaceNumber);

    const inEndpoint = pickEndpoint(alternate, "in");
    const outEndpoint = pickEndpoint(alternate, "out");
    if (inEndpoint) {
      inEndpointInput.value = String(inEndpoint.endpointNumber);
    }
    if (outEndpoint) {
      outEndpointInput.value = String(outEndpoint.endpointNumber);
    }

    cdcLineStateButton.disabled = false;
    usbReadOnceButton.disabled = !inEndpoint;
    usbReadLoopButton.disabled = !inEndpoint;
    usbSendButton.disabled = !outEndpoint;
    log(`claimed interface ${iface.interfaceNumber}, in=${inEndpoint?.endpointNumber ?? "-"} out=${outEndpoint?.endpointNumber ?? "-"}`);
  } catch (error) {
    logError("claimInterface failed", error);
  }
}

function findSelectedInterface(
  device: ProbeUsbDevice,
  value: string
): [ProbeUsbInterface, ProbeUsbAlternateInterface] | null {
  const [interfaceText, alternateText] = value.split(":");
  const interfaceNumber = Number.parseInt(interfaceText, 10);
  const alternateSetting = Number.parseInt(alternateText, 10);
  const config = device.configuration ?? device.configurations[0];
  const iface = config?.interfaces.find((candidate) => candidate.interfaceNumber === interfaceNumber);
  const alternate = iface?.alternates.find((candidate) => candidate.alternateSetting === alternateSetting);
  return iface && alternate ? [iface, alternate] : null;
}

function pickEndpoint(alternate: ProbeUsbAlternateInterface, direction: UsbDirection) {
  return (
    alternate.endpoints.find((endpoint) => endpoint.direction === direction && endpoint.type === "bulk") ??
    alternate.endpoints.find((endpoint) => endpoint.direction === direction)
  );
}

async function setCdcLineState() {
  if (!usbDevice) {
    return;
  }
  try {
    const interfaceNumber = readInteger(cdcInterfaceInput.value, claimedInterfaceNumber ?? 0);
    const result = await usbDevice.controlTransferOut({
      requestType: "class",
      recipient: "interface",
      request: 0x22,
      value: 0x03,
      index: interfaceNumber
    });
    log(`CDC DTR/RTS set on interface ${interfaceNumber}: ${result.status}`);
  } catch (error) {
    logError("CDC line-state request failed", error);
  }
}

async function readUsbOnce() {
  if (!usbDevice) {
    return;
  }
  try {
    const endpoint = readInteger(inEndpointInput.value, 0);
    const length = readInteger(readLengthInput.value, 64);
    if (endpoint <= 0) {
      log("IN endpoint is not set.");
      return;
    }
    const result = await usbDevice.transferIn(endpoint, length);
    logTransfer("USB IN", result.status, result.data);
  } catch (error) {
    logError("USB read failed", error);
  }
}

function toggleUsbReadLoop() {
  if (usbReadLoopActive) {
    usbReadLoopActive = false;
    usbReadLoopButton.textContent = "Read Loop";
    log("USB read loop stopping.");
    return;
  }
  usbReadLoopActive = true;
  usbReadLoopButton.textContent = "Stop Read";
  void usbReadLoop();
}

async function usbReadLoop() {
  while (usbReadLoopActive && usbDevice) {
    await readUsbOnce();
    await wait(20);
  }
  usbReadLoopActive = false;
  usbReadLoopButton.textContent = "Read Loop";
}

async function sendUsbPayload() {
  if (!usbDevice) {
    return;
  }
  try {
    const endpoint = readInteger(outEndpointInput.value, 0);
    if (endpoint <= 0) {
      log("OUT endpoint is not set.");
      return;
    }
    const text = appendNewlineCheckbox.checked ? `${usbPayloadInput.value}\n` : usbPayloadInput.value;
    const bytes = new TextEncoder().encode(text);
    const result = await usbDevice.transferOut(endpoint, bytes);
    log(`USB OUT ep${endpoint}: ${result.status}, ${result.bytesWritten} bytes`);
  } catch (error) {
    logError("USB send failed", error);
  }
}

async function connectSerial() {
  if (!nav.serial) {
    log("Native Web Serial is not exposed by this browser.");
    return;
  }
  try {
    serialPort = await nav.serial.requestPort();
    await serialPort.open({ baudRate: readInteger(baudInput.value, 115200) });
    serialConnectButton.disabled = true;
    serialCloseButton.disabled = false;
    serialSendButton.disabled = false;
    log("native serial port opened.");
    serialReadLoopActive = true;
    void serialReadLoop();
  } catch (error) {
    logError("native serial connect failed", error);
  }
}

async function closeSerial() {
  serialReadLoopActive = false;
  try {
    await serialReader?.cancel();
    if (serialPort) {
      await serialPort.close();
    }
    log("native serial port closed.");
  } catch (error) {
    logError("native serial close failed", error);
  } finally {
    serialPort = null;
    serialConnectButton.disabled = !nav.serial;
    serialCloseButton.disabled = true;
    serialSendButton.disabled = true;
  }
}

async function serialReadLoop() {
  if (!serialPort?.readable) {
    return;
  }
  const reader = serialPort.readable.getReader();
  serialReader = reader;
  try {
    while (serialReadLoopActive) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        logBytes("Serial IN", value);
      }
    }
  } catch (error) {
    if (serialReadLoopActive) {
      logError("native serial read failed", error);
    }
  } finally {
    reader.releaseLock();
    if (serialReader === reader) {
      serialReader = null;
    }
  }
}

async function sendSerialPayload() {
  if (!serialPort?.writable) {
    return;
  }
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  try {
    writer = serialPort.writable.getWriter();
    const text = serialNewlineCheckbox.checked ? `${serialPayloadInput.value}\n` : serialPayloadInput.value;
    await writer.write(new TextEncoder().encode(text));
    log(`Serial OUT ${text.length} chars`);
  } catch (error) {
    logError("native serial send failed", error);
  } finally {
    writer?.releaseLock();
  }
}

function logTransfer(prefix: string, status: string, data?: DataView) {
  if (!data) {
    log(`${prefix}: ${status}, no data`);
    return;
  }
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  logBytes(`${prefix}: ${status}`, bytes);
}

function logBytes(prefix: string, bytes: Uint8Array) {
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  log(`${prefix}: ${bytes.length} bytes\n  hex: ${hex}\n  text: ${JSON.stringify(text)}`);
}

function log(message: string) {
  const time = new Date().toISOString().slice(11, 23);
  logElement.textContent += `[${time}] ${message}\n`;
  logElement.scrollTop = logElement.scrollHeight;
}

function logError(context: string, error: unknown) {
  log(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}

function deviceLabel(device: ProbeUsbDevice) {
  const name = [device.manufacturerName, device.productName].filter(Boolean).join(" ") || "USB device";
  return `${name} vid=${hexWord(device.vendorId)} pid=${hexWord(device.productId)} serial=${device.serialNumber ?? "-"}`;
}

function parseHexOrDecimal(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number.parseInt(trimmed, trimmed.toLowerCase().startsWith("0x") ? 16 : 10);
  return Number.isFinite(value) ? value : null;
}

function readInteger(text: string, fallback: number) {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : fallback;
}

function hexByte(value: number) {
  return `0x${value.toString(16).padStart(2, "0")}`;
}

function hexWord(value: number) {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
