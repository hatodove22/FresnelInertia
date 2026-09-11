using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Fresnel.UnityDemo
{
    // Opt-in verification in the real Windows player, including rendered UI captures.
    public sealed class DemoSmokeTest : MonoBehaviour
    {
        private ContainerDemo demo;
        private string directory;
        private readonly List<string> checks = new List<string>();
        private readonly List<string> errors = new List<string>();
        public void Initialize(ContainerDemo owner)
        {
            demo = owner;
            string[] args = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(args, "--evidence-dir");
            directory = index >= 0 && index + 1 < args.Length ? args[index + 1] : Path.Combine(Application.persistentDataPath, "Evidence");
            Directory.CreateDirectory(directory);
            Application.logMessageReceived += OnLog;
            StartCoroutine(Run());
        }
        void OnLog(string message, string stack, LogType type)
        {
            if (type == LogType.Error || type == LogType.Exception || type == LogType.Assert) errors.Add(message);
        }
        void Check(bool condition, string name)
        {
            checks.Add((condition ? "PASS " : "FAIL ") + name);
            if (!condition) errors.Add(name);
        }
        IEnumerator Capture(string name)
        {
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(directory, name + ".png"));
            yield return new WaitForSecondsRealtime(.3f);
        }
        IEnumerator Run()
        {
            yield return new WaitForSecondsRealtime(1);
            var hud = demo.GetComponent<DemoHud>();
            hud.ActivateButton("Auto tilt");
            Check(!demo.AutoTilt, "Auto button switches to manual");
            hud.ActivateButton("Reset");
            demo.SetManualTilt(new Vector2(0, -16));
            yield return new WaitForSeconds(3);
            Check(demo.CenterOfMass.x > 1.4f, "Marble rolls downhill to right");
            Check(demo.CollisionCount > 0, "Actual wall contact produces indicator event");
            Check(demo.LeftPlaneAngle > demo.RightPlaneAngle, "Shared mass drives opposite plane cues");
            yield return Capture("01-marble-right");
            demo.SetManualTilt(new Vector2(0, 16));
            yield return new WaitForSeconds(4);
            Check(demo.CenterOfMass.x < -1.4f, "Marble reverses downhill to left");
            yield return Capture("02-marble-left");
            hud.ActivateButton("Pause");
            Vector3 held = demo.Contents[0].position;
            Vector2 heldTilt = demo.Tilt;
            yield return new WaitForSecondsRealtime(.7f);
            Check(demo.Paused && demo.Contents[0].position == held && demo.Tilt == heldTilt, "Pause freezes physics and tilt");
            yield return Capture("03-paused");
            hud.ActivateButton("Reset");
            Check(demo.Paused && demo.Tilt == Vector2.zero, "Reset while paused stays paused and levels tray");
            hud.ActivateButton("Pause");
            hud.ActivateButton("24 beads");
            Check(demo.Contents.Count == 24 && demo.Mode == 1, "Beads button creates 24 rigid bodies");
            hud.ActivateButton("Auto tilt");
            yield return new WaitForSeconds(8);
            Check(demo.CollisionCount > 0, "Beads produce wall contacts during auto motion");
            Check(demo.EscapeCount == 0, "No contents escaped during handling sequence");
            foreach (Rigidbody body in demo.Contents)
            {
                Vector3 p = demo.Tray.transform.InverseTransformPoint(body.position);
                Check(Mathf.Abs(p.x) < 2.8f && Mathf.Abs(p.z) < 2.1f && p.y > -.05f, "Bead contained " + body.name);
            }
            yield return Capture("04-beads");
            hud.ActivateButton("Sound off");
            Check(demo.SoundEnabled, "Sound button enables contact audio");
            hud.ActivateButton("Sound off");
            Check(!demo.SoundEnabled, "Sound button mutes audio");
            Screen.SetResolution(960, 600, FullScreenMode.Windowed);
            yield return new WaitForSecondsRealtime(.8f);
            yield return Capture("05-compact");
            hud.ActivateButton("One marble");
            hud.ActivateButton("Reset");
            Check(demo.Contents.Count == 1 && demo.Tilt == Vector2.zero, "Return to single marble and reset");
            Finish();
        }
        // Completion is scheduled separately to keep failure reports available even after a coroutine exception.
        void Update()
        {
            if (Time.realtimeSinceStartup < 45) return;
            Finish();
        }
        void Finish()
        {
            enabled = false;
            bool complete = checks.Count >= 33;
            Check(complete, "Verification sequence completed");
            File.WriteAllText(Path.Combine(directory, "verification.txt"), string.Join("\n", checks) + "\nERRORS: " + errors.Count + "\n" + string.Join("\n", errors));
            Application.logMessageReceived -= OnLog;
            Application.Quit(errors.Count == 0 ? 0 : 1);
        }
    }
}
