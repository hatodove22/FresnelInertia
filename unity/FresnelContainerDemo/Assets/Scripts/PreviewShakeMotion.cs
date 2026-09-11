using System;
using UnityEngine;

namespace Fresnel.UnityDemo
{
    // An explicit offline gesture. Position and acceleration are derivatives of
    // the same bounded path; this is never a device position estimate.
    public sealed class PreviewShakeMotion
    {
        public Vector3 Position { get; private set; }
        public Vector3 Acceleration { get; private set; }
        public float Strength => envelope;
        public float Frequency = 4.6f;
        public Vector3 Amplitude = new Vector3(.013f,.018f,.007f);
        float envelope, envelopeVelocity;
        double phase, currentFrequency, frequencyVelocity;
        bool hasFrequency;
        Vector3 dragPosition, dragVelocity;
        public void Reset()
        { envelope=envelopeVelocity=0;phase=currentFrequency=frequencyVelocity=0;hasFrequency=false;Position=Acceleration=dragPosition=dragVelocity=Vector3.zero; }
        public void Step(float dt, bool held, Vector3 dragTarget)
        {
            if(dt<=0 || float.IsNaN(dt) || float.IsInfinity(dt))return;
            const float response=24;
            float target=held?1:0, offset=envelope-target;
            float c=envelopeVelocity+response*offset, decay=Mathf.Exp(-response*dt);
            envelope=target+(offset+c*dt)*decay;
            envelopeVelocity=(envelopeVelocity-response*c*dt)*decay;
            float eAcceleration=-2*response*envelopeVelocity-response*response*(envelope-target);
            // Frequency changes are themselves a smooth motion. Integrate the exact
            // critically damped frequency over this interval, then include dω/dt in
            // the path's second derivative instead of silently jumping velocity.
            double frequencyTarget=float.IsNaN(Frequency)||float.IsInfinity(Frequency)?4.6:Mathf.Clamp(Frequency,1,6);
            if(!hasFrequency){currentFrequency=frequencyTarget;hasFrequency=true;}
            const double frequencyResponse=24;
            double frequencyOffset=currentFrequency-frequencyTarget, fc=frequencyVelocity+frequencyResponse*frequencyOffset;
            double fd=Math.Exp(-frequencyResponse*dt);
            phase+=2*Math.PI*(frequencyTarget*dt+frequencyOffset*(1-fd)/frequencyResponse+
                fc*(1-(1+frequencyResponse*dt)*fd)/(frequencyResponse*frequencyResponse));
            currentFrequency=frequencyTarget+(frequencyOffset+fc*dt)*fd;
            frequencyVelocity=(frequencyVelocity-frequencyResponse*fc*dt)*fd;
            float w=(float)(2*Math.PI*currentFrequency), angularAcceleration=(float)(2*Math.PI*frequencyVelocity);
            Vector3 sine=new Vector3((float)Math.Sin(phase),(float)Math.Sin(phase+.8),(float)Math.Sin(phase*.83));
            Vector3 cosine=new Vector3((float)Math.Cos(phase),(float)Math.Cos(phase+.8),(float)Math.Cos(phase*.83));
            Vector3 wave=new Vector3(Amplitude.x*sine.x,Amplitude.y*(1+sine.y),Amplitude.z*sine.z);
            Vector3 velocity=new Vector3(Amplitude.x*w*cosine.x,Amplitude.y*w*cosine.y,Amplitude.z*w*.83f*cosine.z);
            Vector3 acceleration=new Vector3(Amplitude.x*(-w*w*sine.x+angularAcceleration*cosine.x),
                Amplitude.y*(-w*w*sine.y+angularAcceleration*cosine.y),
                Amplitude.z*(-w*w*.83f*.83f*sine.z+angularAcceleration*.83f*cosine.z));
            // Critically damped hand translation, with exact constant-target steps.
            const float handResponse=32;
            Vector3 delta=dragPosition-dragTarget, d=dragVelocity+handResponse*delta;
            float handDecay=Mathf.Exp(-handResponse*dt);
            dragPosition=dragTarget+(delta+d*dt)*handDecay;
            dragVelocity=(dragVelocity-handResponse*d*dt)*handDecay;
            Vector3 dragAcceleration=-2*handResponse*dragVelocity-handResponse*handResponse*(dragPosition-dragTarget);
            Position=envelope*wave+dragPosition;
            Acceleration=Vector3.ClampMagnitude(envelope*acceleration+2*envelopeVelocity*velocity+eAcceleration*wave+dragAcceleration,80);
        }
    }
}
