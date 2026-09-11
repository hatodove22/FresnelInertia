using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace Fresnel.UnityDemo
{
    // Independent, output-free Unity experiment. This is not the device synthesis core.
    public sealed class ContainerDemo : MonoBehaviour
    {
        public const float MaxTilt = 20f;
        public Rigidbody Tray { get; private set; }
        public readonly List<Rigidbody> Contents = new List<Rigidbody>();
        public readonly float[] Contacts = new float[4];
        public Vector2 Tilt { get; private set; }
        public Vector3 CenterOfMass { get; private set; }
        public bool AutoTilt { get; private set; } = true;
        public bool Paused { get; private set; }
        public bool SoundEnabled { get; private set; }
        public int Mode { get; private set; }
        public int CollisionCount { get; private set; }
        public int EscapeCount { get; private set; }
        public float LeftPlaneAngle { get; private set; }
        public float RightPlaneAngle { get; private set; }
        public Camera SceneCamera { get; private set; }
        public Transform SandboxRoot { get; private set; }
        public static readonly Color Teal = new Color(.07f, .43f, .40f);
        public static readonly Color Ink = new Color(.09f, .17f, .18f);
        private Vector2 targetTilt;
        private float clock;
        private bool dragging;
        private readonly SceneDragInput pointer = new SceneDragInput();
        private Vector2 dragOrigin, dragTilt;
        private Transform cogMarker, leftPad, rightPad;
        private readonly Material[] channelMaterials = new Material[4];
        private Material marbleMaterial, grainMaterial;
        private PhysicsMaterial contactPhysics;
        private AudioSource audioSource;
        private AudioClip click;
        private float nextSound;

        void Awake()
        {
            Application.targetFrameRate = 60;
            Time.fixedDeltaTime = 1f / 120f;
            Physics.defaultSolverIterations = 12;
            Physics.defaultSolverVelocityIterations = 4;
            BuildWorld();
            SetContents(0);
            gameObject.AddComponent<StudioApp>().Initialize(this);
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "--smoke-test") >= 0)
                gameObject.AddComponent<DemoSmokeTest>().Initialize(this);
        }

        void Update()
        {
            if (SandboxRoot == null || !SandboxRoot.gameObject.activeSelf || Paused) { pointer.Reset(); return; }
            if (EventSystem.current != null && EventSystem.current.currentSelectedGameObject != null &&
                EventSystem.current.currentSelectedGameObject.GetComponent<TMPro.TMP_InputField>() != null) { pointer.Reset(); return; }
            if (pointer.TryRead(SceneCamera.pixelRect, out Vector2 position, out bool began))
            {
                if (began) { dragOrigin=position;dragTilt=targetTilt;AutoTilt=false; }
                Vector2 delta = position - dragOrigin;
                SetManualTilt(dragTilt + new Vector2(delta.y, -delta.x) * .09f);
            }
            Vector2 keys = new Vector2(
                (Input.GetKey(KeyCode.UpArrow) || Input.GetKey(KeyCode.W) ? 1 : 0) -
                (Input.GetKey(KeyCode.DownArrow) || Input.GetKey(KeyCode.S) ? 1 : 0),
                (Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A) ? 1 : 0) -
                (Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D) ? 1 : 0));
            if (keys.sqrMagnitude > 0) SetManualTilt(targetTilt + keys * (30f * Time.deltaTime));
        }

        void FixedUpdate()
        {
            if (SandboxRoot == null || !SandboxRoot.gameObject.activeSelf || Paused) return;
            clock += Time.fixedDeltaTime;
            if (AutoTilt) targetTilt = new Vector2(Mathf.Sin(clock * .73f) * 13f, Mathf.Sin(clock * .51f + .7f) * 18f);
            Tilt = Vector2.MoveTowards(Tilt, targetTilt, 40f * Time.fixedDeltaTime);
            Tray.MoveRotation(Quaternion.Euler(Tilt.x, 0, Tilt.y));
            foreach (Rigidbody body in Contents)
            {
                // Only a recovery for actual escape; never the normal containment mechanism.
                if (body.position.y < -5f || body.position.sqrMagnitude > 150f)
                {
                    EscapeCount++;
                    body.position = Tray.transform.TransformPoint(new Vector3(0, .65f, 0));
                    body.velocity = Vector3.zero;
                    body.angularVelocity = Vector3.zero;
                }
            }
        }

        void LateUpdate()
        {
            if (SandboxRoot == null || !SandboxRoot.gameObject.activeSelf) return;
            if (!Paused)
            {
                Vector3 weighted = Vector3.zero;
                float mass = 0;
                foreach (Rigidbody body in Contents) { weighted += body.worldCenterOfMass * body.mass; mass += body.mass; }
                CenterOfMass = Tray.transform.InverseTransformPoint(weighted / Mathf.Max(.001f, mass));
                cogMarker.localPosition = new Vector3(CenterOfMass.x, .02f, CenterOfMass.z);
                // Illustrative contact planes use this scene's mass; not calibrated actuator commands.
                float differential = CenterOfMass.x / 2.5f * 16f;
                float common = CenterOfMass.z / 1.8f * 9f;
                LeftPlaneAngle = Mathf.Lerp(LeftPlaneAngle, common + differential, 1 - Mathf.Exp(-6f * Time.deltaTime));
                RightPlaneAngle = Mathf.Lerp(RightPlaneAngle, common - differential, 1 - Mathf.Exp(-6f * Time.deltaTime));
                leftPad.localRotation = Quaternion.Euler(0, 0, LeftPlaneAngle);
                rightPad.localRotation = Quaternion.Euler(0, 0, RightPlaneAngle);
                for (int i = 0; i < 4; i++) Contacts[i] = Mathf.Max(0, Contacts[i] - Time.deltaTime * 2.1f);
            }
            for (int i = 0; i < 4; i++)
            {
                channelMaterials[i].color = Color.Lerp(Teal * .7f, new Color(1f, .55f, .23f), Contacts[i]);
                channelMaterials[i].SetColor("_EmissionColor", new Color(1f, .28f, .05f) * Contacts[i] * .5f);
            }
        }

        public void SetManualTilt(Vector2 value)
        {
            AutoTilt = false;
            targetTilt = new Vector2(Mathf.Clamp(value.x, -MaxTilt, MaxTilt), Mathf.Clamp(value.y, -MaxTilt, MaxTilt));
        }
        public void ToggleAuto() { AutoTilt = !AutoTilt; dragging = false; }
        public void SetVisible(bool visible)
        {
            if (!visible && Paused) TogglePause();
            dragging = false;
            pointer.Reset();
            audioSource.Stop();
            SandboxRoot.gameObject.SetActive(visible);
        }
        public void ToggleSound() { SoundEnabled = !SoundEnabled; if (!SoundEnabled) audioSource.Stop(); }
        public void TogglePause()
        {
            Paused = !Paused;
            pointer.Reset();
            Time.timeScale = Paused ? 0 : 1;
            dragging = false;
            if (Paused) audioSource.Stop();
        }
        public void ResetDemo()
        {
            targetTilt = Tilt = Vector2.zero;
            clock = 0;
            dragging = false;
            Tray.rotation = Quaternion.identity;
            Tray.transform.rotation = Quaternion.identity;
            LeftPlaneAngle = RightPlaneAngle = 0;
            CollisionCount = EscapeCount = 0;
            Array.Clear(Contacts, 0, Contacts.Length);
            audioSource.Stop();
            SetContents(Mode);
            Physics.SyncTransforms();
        }
        public void SetContents(int mode)
        {
            Mode = Mathf.Clamp(mode, 0, 1);
            foreach (Rigidbody body in Contents) { body.gameObject.SetActive(false); Destroy(body.gameObject); }
            Contents.Clear();
            Array.Clear(Contacts, 0, Contacts.Length);
            CollisionCount = 0;
            int count = Mode == 0 ? 1 : 24;
            for (int i = 0; i < count; i++)
            {
                float radius = Mode == 0 ? .38f : .145f + (i % 3) * .017f;
                Vector3 local = Mode == 0 ? new Vector3(0, radius + .025f, 0) :
                    new Vector3((i % 6 - 2.5f) * .42f, radius + .035f, (i / 6 - 1.5f) * .43f);
                GameObject sphere = Primitive("Content " + (i + 1), PrimitiveType.Sphere, null,
                    Tray.transform.TransformPoint(local), Vector3.one * radius * 2,
                    Mode == 0 ? marbleMaterial : grainMaterial, true);
                sphere.GetComponent<Collider>().sharedMaterial = contactPhysics;
                Rigidbody body = sphere.AddComponent<Rigidbody>();
                body.mass = Mode == 0 ? .12f : .006f;
                body.drag = Mode == 0 ? .035f : .14f;
                body.angularDrag = Mode == 0 ? .035f : .2f;
                body.interpolation = RigidbodyInterpolation.Interpolate;
                body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
                body.maxAngularVelocity = 45f;
                sphere.AddComponent<ContentContact>().Owner = this;
                Contents.Add(body);
            }
        }

        public void WallContact(int channel, float speed, Vector3 position)
        {
            if (Paused || speed < .12f) return;
            CollisionCount++;
            float strength = Mathf.Clamp01(speed / 2.2f);
            Contacts[channel] = Mathf.Max(Contacts[channel], .3f + strength * .7f);
            if (SoundEnabled && Time.unscaledTime >= nextSound)
            {
                nextSound = Time.unscaledTime + .035f;
                audioSource.pitch = Mode == 0 ? .8f : 1.5f;
                audioSource.panStereo = Mathf.Clamp(position.x / 3, -1, 1) * .6f;
                audioSource.PlayOneShot(click, Mathf.Min(.35f, strength * .3f));
            }
        }

        void BuildWorld()
        {
            SandboxRoot = new GameObject("Offline PhysX sandbox").transform;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.72f, .78f, .79f);
            RenderSettings.ambientEquatorColor = new Color(.50f, .53f, .50f);
            RenderSettings.ambientGroundColor = new Color(.24f, .25f, .24f);
            RenderSettings.fog = false;
            QualitySettings.antiAliasing = 4;
            QualitySettings.shadowDistance = 35;
            Material dark = MaterialOf(Ink, .35f, .45f);
            Material baseMat = MaterialOf(new Color(.75f, .78f, .74f), .25f, .45f);
            Material ceramic = MaterialOf(new Color(.90f, .87f, .78f), .02f, .35f);
            Material brass = MaterialOf(new Color(.79f, .55f, .28f), .6f, .6f);
            marbleMaterial = MaterialOf(new Color(.12f, .63f, .55f), .4f, .92f);
            marbleMaterial.mainTexture = MarbleTexture();
            grainMaterial = MaterialOf(new Color(.80f, .42f, .17f), .18f, .55f);
            contactPhysics = new PhysicsMaterial("Container contacts") { dynamicFriction = .32f, staticFriction = .32f, bounciness = .37f, bounceCombine = PhysicsMaterialCombine.Maximum };

            SceneCamera = new GameObject("Study Camera", typeof(Camera), typeof(AudioListener)).GetComponent<Camera>();
            SceneCamera.tag = "MainCamera";
            SceneCamera.transform.position = new Vector3(7.5f, 9.5f, -11f);
            SceneCamera.transform.LookAt(new Vector3(0, -.25f, -.35f));
            SceneCamera.orthographic = true;
            SceneCamera.orthographicSize = 4.85f;
            SceneCamera.rect = new Rect(.28f, 0, .72f, 1);
            SceneCamera.clearFlags = CameraClearFlags.SolidColor;
            SceneCamera.backgroundColor = new Color(.89f, .90f, .87f);
            SceneCamera.nearClipPlane = .1f;
            SceneCamera.farClipPlane = 70;
            Light key = new GameObject("Large soft key", typeof(Light)).GetComponent<Light>();
            key.type = LightType.Directional;
            key.transform.rotation = Quaternion.Euler(48, -32, 0);
            key.color = new Color(1, .96f, .86f);
            key.intensity = 1.2f;
            key.shadows = LightShadows.Soft;
            key.shadowStrength = .55f;
            key.shadowBias = .04f;
            Light fill = new GameObject("Cool rim", typeof(Light)).GetComponent<Light>();
            fill.type = LightType.Directional;
            fill.transform.rotation = Quaternion.Euler(30, 140, 0);
            fill.color = new Color(.70f, .84f, 1);
            fill.intensity = .5f;
            Primitive("Backdrop", PrimitiveType.Cube, null, new Vector3(0, -2.15f, 0), new Vector3(200, .1f, 200), MaterialOf(new Color(.83f, .85f, .80f), 0, .2f));
            Primitive("Plinth", PrimitiveType.Cylinder, null, new Vector3(0, -1.9f, 0), new Vector3(8, .2f, 7), ceramic);
            Tray = new GameObject("Tilting container", typeof(Rigidbody)).GetComponent<Rigidbody>();
            Tray.transform.SetParent(SandboxRoot, false);
            Tray.isKinematic = true;
            Tray.interpolation = RigidbodyInterpolation.Interpolate;
            Tray.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            Primitive("Housing", PrimitiveType.Cube, Tray.transform, new Vector3(0, -.19f, 0), new Vector3(5.7f, .26f, 4.3f), dark);
            GameObject floor = Primitive("Inner floor", PrimitiveType.Cube, Tray.transform, new Vector3(0, -.075f, 0), new Vector3(5.4f, .15f, 4), baseMat, true);
            floor.GetComponent<Collider>().sharedMaterial = contactPhysics;
            // Glass is restrained and opaque rims keep the container silhouette readable.
            Material glass = MaterialOf(new Color(.25f, .58f, .55f, .12f), .08f, .8f);
            glass.SetFloat("_Mode", 3);
            glass.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            glass.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            glass.SetInt("_ZWrite", 0);
            glass.EnableKeyword("_ALPHAPREMULTIPLY_ON");
            glass.renderQueue = 3000;
            Vector3[] wallPositions = { new Vector3(-2.75f, .40f, 0), new Vector3(2.75f, .40f, 0), new Vector3(0, .40f, 2.05f), new Vector3(0, .40f, -2.05f) };
            for (int i = 0; i < 4; i++)
            {
                Vector3 size = i < 2 ? new Vector3(.12f, .94f, 4.2f) : new Vector3(5.6f, .94f, .12f);
                GameObject wall = Primitive("Wall " + i, PrimitiveType.Cube, Tray.transform, wallPositions[i], size, glass, true);
                wall.AddComponent<ImpactWall>().Channel = i;
                wall.GetComponent<Collider>().sharedMaterial = contactPhysics;
                Vector3 railSize = new Vector3(size.x, .05f, size.z);
                Primitive("Top rail " + i, PrimitiveType.Cube, Tray.transform, wallPositions[i] + Vector3.up * .49f, railSize, dark);
                channelMaterials[i] = MaterialOf(Teal, .4f, .6f);
                channelMaterials[i].EnableKeyword("_EMISSION");
                Vector3 nodePos = wallPositions[i]; nodePos.y = -.14f;
                nodePos += new Vector3(Mathf.Sign(nodePos.x) * .13f, 0, Mathf.Sign(nodePos.z) * .13f);
                Primitive("Contact light " + i, PrimitiveType.Sphere, Tray.transform, nodePos, Vector3.one * .19f, channelMaterials[i]);
            }
            for (int x = -1; x <= 1; x += 2)
                for (int z = -1; z <= 1; z += 2)
                {
                    Primitive("Corner pillar", PrimitiveType.Cube, Tray.transform, new Vector3(x * 2.75f, .37f, z * 2.05f), new Vector3(.13f, 1.06f, .13f), dark);
                    Primitive("Fastener", PrimitiveType.Cylinder, Tray.transform, new Vector3(x * 2.75f, .923f, z * 2.05f), new Vector3(.09f, .015f, .09f), brass);
                }
            // Quiet ruled surface helps make rolling and direction visible.
            Material rule = MaterialOf(new Color(.58f, .66f, .61f), 0, .2f);
            for (int i = -4; i <= 4; i++)
                Primitive("Floor rule", PrimitiveType.Cube, Tray.transform, new Vector3(i * .55f, .003f, 0), new Vector3(.008f, .003f, 3.9f), rule);
            for (int i = -3; i <= 3; i++)
                Primitive("Floor rule", PrimitiveType.Cube, Tray.transform, new Vector3(0, .004f, i * .55f), new Vector3(5.3f, .003f, .008f), rule);
            cogMarker = Primitive("Center of mass marker", PrimitiveType.Cylinder, Tray.transform, new Vector3(0, .02f, 0), new Vector3(.19f, .006f, .19f), brass).transform;
            leftPad = Pad(-1.3f, dark, brass);
            rightPad = Pad(1.3f, dark, brass);

            audioSource = gameObject.AddComponent<AudioSource>();
            audioSource.playOnAwake = false;
            float[] pcm = new float[4800];
            var random = new System.Random(73);
            for (int i = 0; i < pcm.Length; i++)
            {
                float t = i / 48000f;
                pcm[i] = (Mathf.Sin(t * 2 * Mathf.PI * 820) * .7f + ((float)random.NextDouble() * 2 - 1) * .3f) * Mathf.Exp(-t * 65) * .6f;
            }
            click = AudioClip.Create("Authored contact click", pcm.Length, 1, 48000, false);
            click.SetData(pcm, 0);
        }

        Transform Pad(float x, Material dark, Material brass)
        {
            Primitive("Plane pedestal", PrimitiveType.Cylinder, null, new Vector3(x, -1.68f, -2.7f), new Vector3(.83f, .12f, .83f), dark);
            Transform pivot = new GameObject(x < 0 ? "Left contact plane illustration" : "Right contact plane illustration").transform;
            pivot.SetParent(SandboxRoot, false);
            pivot.position = new Vector3(x, -1.31f, -2.7f);
            Primitive("Contact plane", PrimitiveType.Cube, pivot, Vector3.zero, new Vector3(1.12f, .10f, .72f), brass);
            Primitive("Soft contact", PrimitiveType.Cube, pivot, new Vector3(0, .08f, 0), new Vector3(.95f, .08f, .60f), MaterialOf(new Color(.83f, .46f, .28f), .05f, .32f));
            return pivot;
        }

        static Texture2D MarbleTexture()
        {
            var texture = new Texture2D(256, 128, TextureFormat.RGB24, true);
            var pixels = new Color[256 * 128];
            for (int y = 0; y < 128; y++) for (int x = 0; x < 256; x++)
            {
                float vein = Mathf.Sin(x * .055f + Mathf.Sin(y * .075f) * 2.5f + Mathf.PerlinNoise(x * .026f, y * .026f) * 5f);
                pixels[y * 256 + x] = Color.Lerp(new Color(.12f, .50f, .43f), new Color(.88f, 1f, .94f), Mathf.Pow(Mathf.Abs(vein), 14) * .9f);
            }
            texture.SetPixels(pixels); texture.Apply(); return texture;
        }

        static Material MaterialOf(Color color, float metal, float smooth)
        {
            var material = new Material(Shader.Find("Standard"));
            material.color = color;
            material.SetFloat("_Metallic", metal);
            material.SetFloat("_Glossiness", smooth);
            return material;
        }
        GameObject Primitive(string name, PrimitiveType type, Transform parent, Vector3 position, Vector3 scale, Material material, bool collider = false)
        {
            GameObject obj = GameObject.CreatePrimitive(type);
            obj.name = name;
            obj.transform.SetParent(parent != null ? parent : SandboxRoot, false);
            obj.transform.localPosition = position;
            obj.transform.localScale = scale;
            obj.GetComponent<Renderer>().sharedMaterial = material;
            if (!collider) { Collider c = obj.GetComponent<Collider>(); c.enabled = false; Destroy(c); }
            return obj;
        }

        void OnDestroy() { Time.timeScale = 1; }
    }

    public sealed class ImpactWall : MonoBehaviour { public int Channel; }
    public sealed class ContentContact : MonoBehaviour
    {
        public ContainerDemo Owner;
        void OnCollisionEnter(Collision collision)
        {
            ImpactWall wall = collision.collider.GetComponent<ImpactWall>();
            if (wall != null && collision.contactCount > 0)
                Owner.WallContact(wall.Channel, collision.relativeVelocity.magnitude, collision.GetContact(0).point);
        }
    }
}
