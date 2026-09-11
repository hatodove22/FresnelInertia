using UnityEngine;

namespace Fresnel.Materials
{
    /// <summary>Output-free rotating/shaking vessel for the standalone sample. Disable this component
    /// and AutoSimulate before attaching your own source to ContainerMaterialActor.</summary>
    [DefaultExecutionOrder(-100)]
    public sealed class ContainerMaterialSample : MonoBehaviour
    {
        public bool Animate = true;
        [Range(0, 55)] public float TiltDegrees = 28;
        public float Speed = .6f;
        [Tooltip("Hold H, or enable this switch, for an offline shaking gesture.")]
        public bool Shake;
        [Range(1, 6)] public float ShakeFrequency = 4.6f;
        [Range(0, .03f)] public float ShakeDistance = .018f;
        ContainerMaterialActor actor;
        Vector3 origin, shakeOffset;
        float phase, shakePhase, envelope, envelopeVelocity;
        void Awake()
        {
            actor = GetComponent<ContainerMaterialActor>(); origin = transform.localPosition;
        }
        void Update()
        {
            if (!Animate || (actor != null && (actor.Paused || actor.IsStale))) return;
            float dt = Mathf.Min(.05f, Time.deltaTime);
            if (dt <= 0) return;
            AdvanceMotion(dt, Shake || Input.GetKey(KeyCode.H));
            transform.localPosition = origin + shakeOffset;
            transform.localRotation = Quaternion.Euler(Mathf.Sin(phase*.73f)*TiltDegrees*.55f,0,Mathf.Sin(phase)*TiltDegrees);
        }
        void AdvanceMotion(float dt, bool held)
        {
            phase += dt * Speed;
            shakePhase = (shakePhase + dt * Mathf.Clamp(ShakeFrequency, 1, 6) * Mathf.PI * 2) % (Mathf.PI * 200);
            // Exact critically damped envelope: release returns smoothly to the original
            // position. AutoSimulate measures this real transform path on its later Update.
            const float response = 20;
            float target = held ? 1 : 0, offset = envelope - target;
            float c = envelopeVelocity + response * offset, decay = Mathf.Exp(-response * dt);
            envelope = target + (offset + c * dt) * decay;
            envelopeVelocity = (envelopeVelocity - response * c * dt) * decay;
            float distance = Mathf.Clamp(ShakeDistance, 0, .03f) * envelope;
            // The upward-biased path keeps the sample above its stationary display plinth.
            shakeOffset = distance * new Vector3(Mathf.Sin(shakePhase), .75f * (1 + Mathf.Sin(shakePhase + .8f)),
                .4f * Mathf.Sin(shakePhase * .83f));
        }
    }
}
