using System;
using System.IO;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEngine;

namespace Fresnel.UnityDemo.Editor
{
    public static class DependencySetup
    {
        static AddRequest request;
        static double deadline;
        public static void Install()
        {
            // Keep this optional bootstrap aligned with the project's declared
            // registry dependency instead of silently downgrading its lockfile.
            const string packageName = "com.unity.nuget.newtonsoft-json";
            string manifest = File.ReadAllText(Path.Combine(Application.dataPath, "../Packages/manifest.json"));
            Match dependency = Regex.Match(manifest, "\"" + Regex.Escape(packageName) + "\"\\s*:\\s*\"([^\"]+)\"");
            if (!dependency.Success || !Regex.IsMatch(dependency.Groups[1].Value, @"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$"))
                throw new InvalidOperationException("Declare a registry version of " + packageName + " in Packages/manifest.json first.");
            request = Client.Add(packageName + "@" + dependency.Groups[1].Value);
            deadline = EditorApplication.timeSinceStartup + 180;
            EditorApplication.update += Poll;
        }
        static void Poll()
        {
            if (!request.IsCompleted && EditorApplication.timeSinceStartup < deadline) return;
            EditorApplication.update -= Poll;
            if (request.IsCompleted && request.Status == StatusCode.Success)
            { Debug.Log("FRESNEL_DEPENDENCY_OK " + request.Result.packageId); EditorApplication.Exit(0); }
            else { Debug.LogError(request.Error?.message ?? "Package install timed out"); EditorApplication.Exit(1); }
        }
    }
}
