using System;
using System.IO;
using Fresnel.UnityDemo.Link;
using Newtonsoft.Json.Linq;

internal static class Program
{
    static int Main(string[] args)
    {
        try
        {
            var report = ProtocolRegression.Run();
            foreach (string check in report.Checks) Console.WriteLine("PASS " + check);
            Console.WriteLine(report);
            if (args.Length > 0) ExportCanonicalSamples(args[0]);
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
    }

    static void ExportCanonicalSamples(string path)
    {
        var samples = new JArray();
        var gate = new object();
        foreach (string preset in new[] { "liquid_small_box", "granular_single_marble_box", "granular_sand_pile_box", "heartbeat_soft_object" })
        {
            var fixture = new MockHapticTransport { Preset = preset };
            lock (gate) samples.Add(fixture.CreateSnapshot());
            using (var transport = new DemoLoopbackTransport())
            using (var client = new HapticLinkClient())
            {
                // Validate raw transport JSON independently of the production parser's acceptance.
                transport.Received += text =>
                {
                    foreach (string line in text.Split('\n'))
                        if (line.TrimStart().StartsWith("{", StringComparison.Ordinal))
                            lock (gate) samples.Add(JObject.Parse(line));
                };
                client.ConnectAsync(transport, "schema-loopback").GetAwaiter().GetResult();
                client.LoadPresetAsync(preset).GetAwaiter().GetResult();
                client.StartAsync(true, true).GetAwaiter().GetResult();
                client.StopAsync().GetAwaiter().GetResult();
                client.DisconnectAsync().GetAwaiter().GetResult();
            }
        }
        lock (gate)
        {
            File.WriteAllText(path, samples.ToString());
            Console.WriteLine("Exported " + samples.Count + " raw fixture/loopback snapshots for independent schema validation");
        }
    }
}
