using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using UnityEngine;
using Fresnel.UnityDemo.Link;
using Fresnel.UnityDemo.Presentation;
using Fresnel.UnityDemo.Profiles;

namespace Fresnel.UnityDemo.Editor
{
    public static class StudioRegression
    {
        public static void Run()
        {
            string path = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../output/unity/studio-regression.txt"));
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var text = new StringBuilder("Unity Studio software regression (mock data; no hardware)\n");
            try
            {
                var protocol = ProtocolRegression.Run();
                foreach (string check in protocol.Checks) text.AppendLine("PASS Link: " + check);
                var presentation = PresentationRegression.Run();
                foreach (string check in presentation) text.AppendLine("PASS Presentation: " + check);
                int profiles = ProfileRegression.Run();
                text.AppendLine($"PASS Profiles: {profiles} assertions");
                var gesture = RunPreviewMotion();
                foreach (string check in gesture) text.AppendLine("PASS Gesture: " + check);
                text.AppendLine($"TOTAL PASS: {protocol.Passed + presentation.Count + profiles + gesture.Count}");
                File.WriteAllText(path, text.ToString());
                Debug.Log(text.ToString());
            }
            catch (Exception ex)
            {
                text.AppendLine("FAIL: " + ex);
                File.WriteAllText(path, text.ToString());
                Debug.LogError(text.ToString());
                throw;
            }
        }

        /// <summary>Pure path mathematics; also runnable in the isolated managed harness.</summary>
        public static List<string> RunPreviewMotion()
        {
            var passed = new List<string>();
            Action<bool, string> check = (condition, name) => {
                if (!condition) throw new InvalidOperationException("Preview gesture regression failed: " + name);
                passed.Add(name);
            };
            const float dt = 1f / 480;
            foreach (int hz in new[] { 3, 5 })
            {
                var motion = new PreviewShakeMotion { Frequency = hz };
                Vector3 older = motion.Position, previous = older, previousAcceleration = Vector3.zero;
                float maxError = 0, peakAcceleration = 0;
                bool bounded = true;
                for (int i = 1; i <= 960; i++)
                {
                    motion.Step(dt, i <= 480, Vector3.zero);
                    // Skip the one finite-difference window straddling the held/released
                    // control edge, where the commanded envelope acceleration changes.
                    if (i > 2 && (i < 480 || i > 483))
                    {
                        Vector3 derivative = (motion.Position - 2 * previous + older) / (dt * dt);
                        maxError = Mathf.Max(maxError, (derivative - previousAcceleration).magnitude);
                    }
                    bounded &= Mathf.Abs(motion.Position.x) <= motion.Amplitude.x + 1e-6f &&
                        motion.Position.y >= -1e-6f && motion.Position.y <= 2 * motion.Amplitude.y + 1e-6f &&
                        Mathf.Abs(motion.Position.z) <= motion.Amplitude.z + 1e-6f && motion.Strength >= 0 && motion.Strength <= 1.00001f;
                    peakAcceleration = Mathf.Max(peakAcceleration, motion.Acceleration.magnitude);
                    older = previous; previous = motion.Position; previousAcceleration = motion.Acceleration;
                }
                check(maxError < .12f, hz + " Hz position second derivative agrees with acceleration during attack, shake and release");
                check(bounded && peakAcceleration > 5 && peakAcceleration < 80, hz + " Hz default gesture stays spatially bounded with finite metric acceleration");
                check(motion.Position.magnitude < 1e-6f && motion.Acceleration.magnitude < .0001f,
                    hz + " Hz release returns the visible vessel and excitation to rest");
            }

            var changing = new PreviewShakeMotion { Frequency = 3 };
            Vector3 oldPosition = Vector3.zero, position = Vector3.zero, acceleration = Vector3.zero;
            float frequencyError = 0;
            for (int i = 1; i <= 600; i++)
            {
                if (i == 240) changing.Frequency = 5;
                changing.Step(dt, true, Vector3.zero);
                if (i > 3)
                    frequencyError = Mathf.Max(frequencyError, ((changing.Position - 2 * position + oldPosition) / (dt * dt) - acceleration).magnitude);
                oldPosition = position; position = changing.Position; acceleration = changing.Acceleration;
            }
            check(frequencyError < .15f, "Live 3-to-5 Hz change includes angular frequency acceleration and has no velocity discontinuity");

            var hand = new PreviewShakeMotion();
            oldPosition = position = acceleration = Vector3.zero;
            float handError = 0;
            for (int i = 1; i <= 720; i++)
            {
                hand.Step(dt, false, i <= 240 ? new Vector3(.012f, .008f, -.004f) : Vector3.zero);
                if (i > 3 && (i < 240 || i > 243))
                    handError = Mathf.Max(handError, ((hand.Position - 2 * position + oldPosition) / (dt * dt) - acceleration).magnitude);
                oldPosition = position; position = hand.Position; acceleration = hand.Acceleration;
            }
            check(handError < .08f && hand.Position.magnitude < 1e-6f, "Drag attack and return acceleration are derivatives of the same visible hand path");

            var frozen = new PreviewShakeMotion(); var reference = new PreviewShakeMotion();
            for (int i = 0; i < 30; i++) { frozen.Step(.01f, true, Vector3.zero); reference.Step(.01f, true, Vector3.zero); }
            Vector3 heldPosition = frozen.Position, heldAcceleration = frozen.Acceleration; float heldStrength = frozen.Strength;
            foreach (float rejected in new[] { 0f, -.1f, float.NaN, float.PositiveInfinity })
                frozen.Step(rejected, false, Vector3.one);
            check(frozen.Position == heldPosition && frozen.Acceleration == heldAcceleration && frozen.Strength == heldStrength,
                "Stopped or invalid source intervals leave all published gesture state unchanged");
            frozen.Step(.01f, true, Vector3.zero); reference.Step(.01f, true, Vector3.zero);
            check(frozen.Position == reference.Position && frozen.Acceleration == reference.Acceleration,
                "Paused gesture does not advance hidden phase, envelope or hand history");
            frozen.Frequency = reference.Frequency = 3;
            frozen.Step(.24f, true, Vector3.zero);
            for (int i = 0; i < 24; i++) reference.Step(.01f, true, Vector3.zero);
            check((frozen.Position - reference.Position).magnitude < .00001f && (frozen.Acceleration - reference.Acceleration).magnitude < .005f,
                "A 240 ms source interval advances the exact path instead of replaying old acceleration");
            frozen.Reset();
            check(frozen.Position == Vector3.zero && frozen.Acceleration == Vector3.zero && frozen.Strength == 0,
                "Explicit gesture reset discards pose, acceleration, phase and envelope");
            return passed;
        }
    }
}
