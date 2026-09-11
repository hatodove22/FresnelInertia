using UnityEngine;
using UnityEngine.EventSystems;

namespace Fresnel.UnityDemo
{
    public sealed class ShakeHoldButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler
    {
        public StudioApp App;
        int pointer=int.MinValue;
        public void OnPointerDown(PointerEventData e)
        {
            if(pointer!=int.MinValue || !GetComponent<UnityEngine.UI.Button>().interactable)return;
            pointer=e.pointerId;App.SetShakeHeld(true);
        }
        public void OnPointerUp(PointerEventData e){if(e.pointerId==pointer)Release();}
        public void OnPointerExit(PointerEventData e){if(e.pointerId==pointer)Release();}
        void OnDisable(){Release();}
        void OnApplicationFocus(bool focused){if(!focused)Release();}
        void Release(){pointer=int.MinValue;if(App!=null)App.SetShakeHeld(false);}
    }
}
