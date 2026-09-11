using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Fresnel.UnityDemo
{
    /// <summary>One captured scene pointer. Touches beginning over UI never become scene drags;
    /// another finger cannot replace the captured finger or replay a simulated mouse press.</summary>
    public sealed class SceneDragInput
    {
        private const int None = -2, Mouse = -1;
        private int pointer = None;
        private readonly List<RaycastResult> hits = new List<RaycastResult>(16);

        public void Reset() { pointer = None; }

        /// <summary>Returns positions in 1280-width reference pixels, retaining equal swipe response across phone resolutions.
        /// Pass the scene camera's pixelRect. Reset when hiding the scene, pausing, opening an input field or changing source.</summary>
        public bool TryRead(Rect scenePixels, out Vector2 position, out bool began)
        {
            position = Vector2.zero; began = false;
            if (!Application.isFocused) { Reset(); return false; }
            if (Input.touchCount > 0 || pointer >= 0)
            {
                if (pointer == Mouse) Reset();
                if (pointer >= 0)
                {
                    for (int i = 0; i < Input.touchCount; ++i)
                    {
                        Touch touch = Input.GetTouch(i);
                        if (touch.fingerId != pointer) continue;
                        if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled) { Reset(); return false; }
                        position = ReferencePosition(touch.position); return true;
                    }
                    Reset(); // A removed/cancelled touch must not leave a latched drag.
                    return false;
                }
                for (int i = 0; i < Input.touchCount; ++i)
                {
                    Touch touch = Input.GetTouch(i);
                    if (touch.phase != TouchPhase.Began || !scenePixels.Contains(touch.position) || OverUi(touch.position, touch.fingerId)) continue;
                    pointer = touch.fingerId; began = true; position = ReferencePosition(touch.position); return true;
                }
                return false; // Suppress Input's synthetic mouse stream while any touch is present.
            }
            Vector2 mouse = Input.mousePosition;
            if (pointer == Mouse)
            {
                if (!Input.GetMouseButton(0)) { Reset(); return false; }
                position = ReferencePosition(mouse); return true;
            }
            if (!Input.GetMouseButtonDown(0) || !scenePixels.Contains(mouse) || OverUi(mouse, Mouse)) return false;
            pointer = Mouse; began = true; position = ReferencePosition(mouse); return true;
        }

        private static Vector2 ReferencePosition(Vector2 pixels) => pixels * (1280f / Mathf.Max(1, Screen.width));
        private bool OverUi(Vector2 position, int pointerId)
        {
            if (EventSystem.current == null) return false;
            // A fresh raycast also works before the EventSystem's own Update on a new touch frame.
            var pointerData = new PointerEventData(EventSystem.current) { pointerId = pointerId, position = position };
            hits.Clear(); EventSystem.current.RaycastAll(pointerData, hits);
            foreach (var hit in hits) if (hit.module is GraphicRaycaster) return true;
            return false;
        }
    }
}
