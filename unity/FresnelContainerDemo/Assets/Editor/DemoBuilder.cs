using System;
using System.IO;
using TMPro;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Fresnel.UnityDemo.Editor
{
    public static class DemoBuilder
    {
        private static double resourceDeadline;
        // Run without -quit: the resource importer needs later Editor update ticks.
        public static void BuildBatch()
        {
            if (ResourcesCurrent())
            { CompleteBatch(); return; }
            resourceDeadline = EditorApplication.timeSinceStartup + 120;
            EditorApplication.update += AwaitResources;
            TMP_PackageResourceImporter.ImportResources(true, false, false);
        }
        private static void AwaitResources()
        {
            if (EditorApplication.timeSinceStartup > resourceDeadline)
            { EditorApplication.update -= AwaitResources; Debug.LogError("TMP resource import timed out"); EditorApplication.Exit(1); return; }
            if (EditorApplication.isUpdating || EditorApplication.isCompiling) return;
            if (!ResourcesCurrent()) return;
            EditorApplication.update -= AwaitResources;
            CompleteBatch();
        }
        private static bool ResourcesCurrent()
        {
            // uGUI 2 / Unity 6 changed TMP vertex packing. The 2022 shaders still
            // compile but smear glyphs; font existence alone cannot validate them.
            var settings = AssetDatabase.LoadAssetAtPath<TMP_Settings>("Assets/TextMesh Pro/Resources/TMP Settings.asset");
            if (settings == null) return false;
            var version = new SerializedObject(settings).FindProperty("assetVersion");
            return version != null && version.stringValue == "2" &&
                AssetDatabase.LoadAssetAtPath<TMP_FontAsset>("Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset") != null;
        }
        private static void CompleteBatch()
        {
            try { Build(); EditorApplication.Exit(0); }
            catch (Exception error) { Debug.LogException(error); EditorApplication.Exit(1); }
        }
        [MenuItem("Fresnel/Prepare demo scene")]
        public static void Prepare()
        {
            AssetDatabase.Refresh();
            if (AssetDatabase.LoadAssetAtPath<TMP_FontAsset>("Assets/TextMesh Pro/Resources/Fonts & Materials/LiberationSans SDF.asset") == null)
                throw new InvalidOperationException("TMP essentials were not imported");
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            new GameObject("Fresnel Container Demo", typeof(ContainerDemo));
            Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(), "Assets/Scenes/ContainerStudy.unity");
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/Scenes/ContainerStudy.unity", true) };
            PlayerSettings.companyName = "Fresnel Inertia";
            PlayerSettings.productName = "Fresnel - A little inertia";
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 800;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.resizableWindow = true;
            PlayerSettings.runInBackground = true;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.enableFrameTimingStats = true;
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Standalone, ScriptingImplementation.Mono2x);
            QualitySettings.SetQualityLevel(5, true);
            // Runtime procedural materials still need their shader shipped in the player.
            var graphics = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset")[0]);
            var shaders = graphics.FindProperty("m_AlwaysIncludedShaders");
            Shader standard = Shader.Find("Standard");
            bool present = false;
            for (int i = 0; i < shaders.arraySize; i++) if (shaders.GetArrayElementAtIndex(i).objectReferenceValue == standard) present = true;
            if (!present) { shaders.InsertArrayElementAtIndex(shaders.arraySize); shaders.GetArrayElementAtIndex(shaders.arraySize - 1).objectReferenceValue = standard; graphics.ApplyModifiedProperties(); }
            AssetDatabase.SaveAssets();
            Debug.Log("FRESNEL_PREPARE_OK");
        }

        [MenuItem("Fresnel/Build Windows demo")]
        public static void Build()
        {
            Prepare();
            const string target = "Builds/Windows/FresnelContainerDemo.exe";
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            BuildReport report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { "Assets/Scenes/ContainerStudy.unity" },
                locationPathName = target,
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None
            });
            if (report.summary.result != BuildResult.Succeeded) throw new Exception("Build failed: " + report.summary.result);
            Debug.Log("FRESNEL_BUILD_OK " + report.summary.totalSize + " bytes");
        }
    }
}
