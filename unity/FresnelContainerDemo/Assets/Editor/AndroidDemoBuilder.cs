using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.Android;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.Rendering;

namespace Fresnel.UnityDemo.Editor
{
    public static class AndroidDemoBuilder
    {
        public static void BuildBatch()
        {
            try { Build(); EditorApplication.Exit(0); }
            catch (Exception error) { Debug.LogException(error); EditorApplication.Exit(1); }
        }

        [MenuItem("Fresnel/Build Android demo APK")]
        public static void Build()
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                throw new InvalidOperationException("Select Android first, or launch with -buildTarget Android. Build-Android.ps1 does this before scripts compile.");
            ConfigureToolchain();
            DemoBuilder.Prepare();
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, "com.fresnel.inertia.containerdemo");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetApiCompatibilityLevel(NamedBuildTarget.Android, ApiCompatibilityLevel.NET_Standard);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            if (Environment.GetEnvironmentVariable("FRESNEL_ANDROID_ARMV7") == "1")
                PlayerSettings.Android.targetArchitectures |= AndroidArchitecture.ARMv7;
            // Unity 6.3 supports Android 7.1+. Use the target platform from its bundled SDK.
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel25;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.Android.useCustomKeystore = false;
            PlayerSettings.Android.minifyDebug = false; // Keep the Java listener and reflection-backed Android compatibility path.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.Android.renderOutsideSafeArea = false;
            EditorUserBuildSettings.buildAppBundle = false;
            EditorUserBuildSettings.exportAsGoogleAndroidProject = false;
            AssetDatabase.SaveAssets();
            const string path = "Builds/Android/FresnelContainerDemo.apk";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray(),
                locationPathName = path,
                target = BuildTarget.Android,
                options = BuildOptions.Development
            });
            if (report.summary.result != BuildResult.Succeeded) throw new InvalidOperationException("Android build failed: " + report.summary.result);
            Debug.Log("FRESNEL_ANDROID_BUILD_OK " + report.summary.totalSize + " bytes; " + PlayerSettings.Android.targetArchitectures + "; APK: " + Path.GetFullPath(path));
        }

        private static void ConfigureToolchain()
        {
            string module = Environment.GetEnvironmentVariable("FRESNEL_ANDROID_TOOLS");
            bool embedded = string.IsNullOrEmpty(module);
            if (embedded) module = Path.Combine(EditorApplication.applicationContentsPath, "PlaybackEngines", "AndroidPlayer");
            if (!Compatible(module)) throw new InvalidOperationException(
                "Unity 6.3 Android build requires its bundled OpenJDK 17, NDK r27 and SDK platform 35 or newer. " +
                "Install Android Build Support with SDK/NDK and OpenJDK for this Editor, or set FRESNEL_ANDROID_TOOLS " +
                "to an explicitly compatible AndroidPlayer directory. Checked: " + module);
            // Empty paths select 'Installed with Unity'. Clear preferences inherited from the Unity 2022 build.
#if UNITY_ANDROID
            AndroidExternalToolsSettings.jdkRootPath = embedded ? string.Empty : Path.Combine(module, "OpenJDK");
            AndroidExternalToolsSettings.ndkRootPath = embedded ? string.Empty : Path.Combine(module, "NDK");
            AndroidExternalToolsSettings.sdkRootPath = embedded ? string.Empty : Path.Combine(module, "SDK");
            AndroidExternalToolsSettings.gradlePath = string.Empty;
#endif
            Debug.Log("FRESNEL_ANDROID_TOOLCHAIN " + module);
        }

        private static bool Compatible(string module)
        {
            if (string.IsNullOrEmpty(module)) return false;
            string jdk = Path.Combine(module, "OpenJDK", "release"), ndk = Path.Combine(module, "NDK", "source.properties");
            string platforms = Path.Combine(module, "SDK", "platforms");
            return File.Exists(jdk) && Regex.IsMatch(File.ReadAllText(jdk), @"(?m)^JAVA_VERSION=""17\.") &&
                File.Exists(ndk) && Regex.IsMatch(File.ReadAllText(ndk), @"(?m)^\s*Pkg\.Revision\s*=\s*27\.") &&
                Directory.Exists(platforms) && Directory.EnumerateDirectories(platforms, "android-*").Any(platform => {
                    int api;
                    return int.TryParse(Path.GetFileName(platform).Substring("android-".Length), out api) &&
                        api >= 35 && File.Exists(Path.Combine(platform, "android.jar"));
                });
        }
    }
}
