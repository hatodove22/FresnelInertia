package com.fresnel.hapticusb;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** Native Android USB-host transport for Espressif CDC ACM. No USB data transfers run on the activity thread.
 * It carries bytes only: Haptic Link, execution acknowledgements and output intent belong to C#.
 */
public final class UsbHostBridge {
    public interface Listener {
        void onOpened();
        void onData(String base64);
        void onWritten(long id);
        void onFault(String message);
        void onClosed();
        void onDevicesChanged();
    }
    private final Context context;
    private final UsbManager manager;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService commands = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Fresnel USB commands"); thread.setDaemon(true); return thread;
    });
    private final Object gate = new Object();
    private final AtomicInteger writes = new AtomicInteger();
    private final String permissionAction = "com.fresnel.hapticusb.PERMISSION." + UUID.randomUUID();
    private volatile boolean open, closed;
    private boolean registered;
    private String deviceName;
    private UsbDeviceConnection connection;
    private Ports ports;
    private PendingIntent permissionIntent;

    public UsbHostBridge(Activity activity, Listener listener) {
        this.context = activity.getApplicationContext();
        this.manager = (UsbManager)context.getSystemService(Context.USB_SERVICE);
        this.listener = listener;
    }

    /** Device paths are stable for the current attachment only; reconnect always requires explicit selection. */
    public static String[] getDevices(Activity activity) {
        UsbManager manager = (UsbManager)activity.getSystemService(Context.USB_SERVICE);
        ArrayList<String> names = new ArrayList<>();
        if (manager != null) for (UsbDevice device : manager.getDeviceList().values()) {
            if (device.getVendorId() == 0x303a && findPorts(device, null) != null) names.add(device.getDeviceName());
        }
        Collections.sort(names);
        return names.toArray(new String[0]);
    }

    public void open(String endpoint) {
        synchronized (gate) {
            if (closed || deviceName != null) throw new IllegalStateException("USB session already used");
            deviceName = endpoint;
        }
        main.post(() -> {
            if (closed) return;
            try {
                if (manager == null) throw new IllegalStateException("This Android device has no USB host manager");
                UsbDevice device = manager.getDeviceList().get(endpoint);
                if (device == null) throw new IllegalStateException("Selected USB device is no longer attached");
                if (device.getVendorId() != 0x303a || findPorts(device, null) == null)
                    throw new IllegalStateException("Select an Espressif CDC serial device; vendor/JTAG endpoints are unsupported");
                IntentFilter filter = new IntentFilter(permissionAction);
                filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
                filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
                // Keep compilation compatible with Unity's installed API 30 SDK while using API 33's required receiver flags.
                if (Build.VERSION.SDK_INT >= 33) {
                    Context.class.getMethod("registerReceiver", BroadcastReceiver.class, IntentFilter.class, int.class)
                        .invoke(context, receiver, filter, 4 /* Context.RECEIVER_NOT_EXPORTED */);
                } else context.registerReceiver(receiver, filter);
                registered = true;
                if (manager.hasPermission(device)) scheduleOpen(device);
                else {
                    Intent intent = new Intent(permissionAction).setPackage(context.getPackageName());
                    permissionIntent = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE);
                    manager.requestPermission(device, permissionIntent);
                    main.postDelayed(permissionTimeout, 30000);
                }
            } catch (Exception error) { fail("USB open: " + message(error)); }
        });
    }

    private final Runnable permissionTimeout = () -> { if (!closed && !open) fail("USB permission timed out; connect again to request access"); };
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context ignored, Intent intent) {
            if (closed) return;
            String action = intent.getAction();
            if (permissionAction.equals(action)) {
                main.removeCallbacks(permissionTimeout);
                UsbDevice selected = manager.getDeviceList().get(deviceName);
                // Check authoritative permission state too; an immutable PendingIntent may omit fill-in extras.
                if (selected != null && manager.hasPermission(selected)) scheduleOpen(selected);
                else fail("USB access was denied or the selected device detached");
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                UsbDevice detached = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (detached != null && detached.getDeviceName().equals(deviceName)) fail("USB device detached; output state is unknown");
                listener.onDevicesChanged();
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) listener.onDevicesChanged();
        }
    };

    private void scheduleOpen(UsbDevice device) {
        try { commands.execute(() -> configure(device)); }
        catch (RejectedExecutionException ignored) { /* Close cancelled pending permission. */ }
    }

    private void configure(UsbDevice device) {
        UsbDeviceConnection candidate = null;
        Ports selected = null;
        try {
            if (closed || open) return;
            candidate = manager.openDevice(device);
            if (candidate == null) throw new IllegalStateException("USB device could not be opened");
            selected = findPorts(device, candidate.getRawDescriptors());
            if (selected == null) throw new IllegalStateException("CDC communications/data endpoint pair missing");
            if (!candidate.claimInterface(selected.control, true) || !candidate.claimInterface(selected.data, true))
                throw new IllegalStateException("Could not claim CDC interfaces");
            if (selected.data.getAlternateSetting() != 0 && !candidate.setInterface(selected.data))
                throw new IllegalStateException("Could not select CDC alternate setting");
            byte[] coding = { 0x00, (byte)0xc2, 0x01, 0x00, 0, 0, 8 }; // 115200 baud, one stop bit, no parity, eight data bits.
            if (candidate.controlTransfer(0x21, 0x20, 0, selected.control.getId(), coding, coding.length, 500) != coding.length ||
                candidate.controlTransfer(0x21, 0x22, 1, selected.control.getId(), null, 0, 500) < 0)
                throw new IllegalStateException("CDC line coding/control setup failed");
            synchronized (gate) {
                if (closed) { release(candidate, selected); return; }
                connection = candidate; ports = selected; open = true;
            }
            listener.onOpened();
            final UsbDeviceConnection active = candidate;
            final Ports activePorts = selected;
            Thread reader = new Thread(() -> read(active, activePorts), "Fresnel USB receive");
            reader.setDaemon(true); reader.start();
        } catch (Exception error) {
            release(candidate, selected);
            if (!closed) fail("USB setup: " + message(error));
        }
    }

    private void read(UsbDeviceConnection active, Ports selected) {
        byte[] bytes = new byte[Math.min(4096, Math.max(512, selected.input.getMaxPacketSize()))];
        try {
            while (!closed && open) {
                long start = SystemClock.elapsedRealtime();
                int length = active.bulkTransfer(selected.input, bytes, bytes.length, 200);
                if (closed || !open) return;
                if (length > 0) listener.onData(Base64.encodeToString(bytes, 0, length, Base64.NO_WRAP));
                else {
                    if (!manager.getDeviceList().containsKey(deviceName)) { fail("USB device detached; output state is unknown"); return; }
                    // bulkTransfer returns -1 for an ordinary read timeout too. Stale source detection remains in Haptic Link.
                    if (SystemClock.elapsedRealtime() - start < 10) SystemClock.sleep(10);
                }
            }
        } catch (Exception error) { if (!closed) fail("USB receive: " + message(error)); }
    }

    public void write(long id, String text) {
        if (text == null || text.getBytes(StandardCharsets.UTF_8).length > 4096) throw new IllegalArgumentException("USB write exceeds 4096 bytes");
        if (!open || closed) throw new IllegalStateException("USB is closed");
        if (writes.incrementAndGet() > 32) { writes.decrementAndGet(); throw new IllegalStateException("USB write queue is full"); }
        try { commands.execute(() -> {
            try {
                UsbDeviceConnection active; Ports selected;
                synchronized (gate) { active = connection; selected = ports; }
                if (closed || !open || active == null) return;
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                int offset = 0;
                long deadline = SystemClock.elapsedRealtime() + 1000;
                while (offset < bytes.length) {
                    if (closed || SystemClock.elapsedRealtime() >= deadline) throw new IllegalStateException("USB write timed out");
                    int count = active.bulkTransfer(selected.output, bytes, offset, bytes.length - offset, 250);
                    if (count <= 0) throw new IllegalStateException("USB command write was incomplete");
                    offset += count;
                }
                if (!closed) listener.onWritten(id);
            } catch (Exception error) { if (!closed) fail("USB write: " + message(error)); }
            finally { writes.decrementAndGet(); }
        }); } catch (RejectedExecutionException error) { writes.decrementAndGet(); throw new IllegalStateException("USB is closing"); }
    }

    public void close() {
        UsbDeviceConnection active; Ports selected;
        synchronized (gate) {
            if (closed) return;
            closed = true; open = false;
            active = connection; selected = ports; connection = null; ports = null;
        }
        main.post(() -> {
            main.removeCallbacks(permissionTimeout);
            if (permissionIntent != null) { permissionIntent.cancel(); permissionIntent = null; }
            if (registered) { try { context.unregisterReceiver(receiver); } catch (IllegalArgumentException ignored) { } registered = false; }
        });
        commands.shutdownNow();
        Thread cleanup = new Thread(() -> {
            release(active, selected);
            // A setup worker may still own its unpublished candidate connection. It releases that candidate when closed is observed.
            try {
                if (commands.awaitTermination(1200, TimeUnit.MILLISECONDS)) listener.onClosed();
                else listener.onFault("USB cleanup did not finish within its deadline");
            } catch (InterruptedException error) { Thread.currentThread().interrupt(); listener.onFault("USB cleanup was interrupted"); }
        }, "Fresnel USB close");
        cleanup.setDaemon(true); cleanup.start();
    }

    private void fail(String reason) {
        if (closed) return;
        listener.onFault(reason);
        close();
    }
    private static String message(Exception error) { return error.getMessage() != null ? error.getMessage() : error.getClass().getSimpleName(); }
    private static void release(UsbDeviceConnection active, Ports selected) {
        if (active == null) return;
        try {
            if (selected != null) { active.releaseInterface(selected.data); active.releaseInterface(selected.control); }
        } catch (Exception ignored) { }
        finally { active.close(); }
    }

    private static final class Ports { UsbInterface control, data; UsbEndpoint input, output; }
    private static Ports findPorts(UsbDevice device, byte[] descriptors) {
        for (int i = 0; i < device.getInterfaceCount(); ++i) {
            UsbInterface data = device.getInterface(i);
            if (data.getInterfaceClass() != UsbConstants.USB_CLASS_CDC_DATA) continue;
            Ports pair = new Ports(); pair.data = data;
            for (int j = 0; j < data.getEndpointCount(); ++j) {
                UsbEndpoint endpoint = data.getEndpoint(j);
                if (endpoint.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK) continue;
                if (endpoint.getDirection() == UsbConstants.USB_DIR_IN) pair.input = endpoint; else pair.output = endpoint;
            }
            if (pair.input == null || pair.output == null) continue;
            int unionControl = -1;
            if (descriptors != null) for (int pos = 0; pos + 2 <= descriptors.length;) {
                int length = descriptors[pos] & 0xff;
                if (length < 2 || pos + length > descriptors.length) break;
                if (length >= 5 && (descriptors[pos + 1] & 0xff) == 0x24 && (descriptors[pos + 2] & 0xff) == 6)
                    for (int slave = pos + 4; slave < pos + length; ++slave)
                        if ((descriptors[slave] & 0xff) == data.getId()) unionControl = descriptors[pos + 3] & 0xff;
                pos += length;
            }
            UsbInterface sole = null; int controls = 0;
            for (int j = 0; j < device.getInterfaceCount(); ++j) {
                UsbInterface control = device.getInterface(j);
                if (control.getInterfaceClass() != UsbConstants.USB_CLASS_COMM) continue;
                sole = control; ++controls;
                if (control.getId() == (unionControl >= 0 ? unionControl : data.getId() - 1)) pair.control = control;
            }
            if (pair.control == null && unionControl < 0 && controls == 1) pair.control = sole;
            if (pair.control != null) return pair;
        }
        return null;
    }
}
