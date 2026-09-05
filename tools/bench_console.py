"""Small attended bench console; never arms outputs unless explicitly commanded.

Run with the PlatformIO Python (pyserial). Port opening keeps DTR/RTS low.
--final-command stop provides a best-effort stop even after an interrupted run;
only device replies can establish that the stop actually executed.
"""

import argparse
import pathlib
import time

import serial


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port")
    parser.add_argument("--command", action="append", default=[])
    parser.add_argument("--seconds", type=float, default=2.0)
    parser.add_argument("--command-wait", type=float, default=0.7)
    parser.add_argument("--final-command")
    parser.add_argument("--log", type=pathlib.Path)
    parser.add_argument("--hide-telemetry", action="store_true")
    args = parser.parse_args()
    if args.seconds < 0 or args.seconds > 60 or args.command_wait < 0:
        parser.error("Use an attended interval from 0 to 60 seconds.")

    output = None
    if args.log:
        args.log.parent.mkdir(parents=True, exist_ok=True)
        output = args.log.open("x", encoding="utf-8")
    port = serial.Serial(port=None, baudrate=115200, timeout=0.1)
    port.dtr = False
    port.rts = False
    port.port = args.port
    pending = bytearray()

    def read_for(seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            pending.extend(port.read(max(1, min(port.in_waiting, 8192))))
            while b"\n" in pending:
                line, _, remainder = pending.partition(b"\n")
                pending[:] = remainder
                text = line.decode("utf-8", errors="replace").rstrip("\r")
                if output:
                    output.write(text + "\n")
                    output.flush()
                if not (args.hide_telemetry and text.startswith("{")):
                    print(text, flush=True)

    def command(text):
        print(f"> {text}", flush=True)
        port.write((text + "\n").encode("utf-8"))

    try:
        port.open()
        for text in args.command:
            command(text)
            read_for(args.command_wait)
        read_for(args.seconds)
    finally:
        try:
            if port.is_open and args.final_command:
                command(args.final_command)
                read_for(2.0)
        finally:
            port.close()
            if output:
                output.close()


if __name__ == "__main__":
    main()
