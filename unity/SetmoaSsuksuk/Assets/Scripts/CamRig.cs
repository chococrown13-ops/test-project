using Unity.Cinemachine;
using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// Drives the board's Cinemachine camera: a slow orbit of the board behind the title, then it
    /// settles (damped, never a cut) to the playing view, high over our side looking across the board.
    /// Shake comes from Cinemachine Impulse on the same camera, not from moving this transform.
    /// </summary>
    [RequireComponent(typeof(CinemachineCamera))]
    public class CamRig : MonoBehaviour
    {
        public GameLoop loop;
        public Vector3 playPos = new Vector3(0f, 15.2f, -14.6f);
        public Vector3 playLook = new Vector3(0f, 0f, -3.1f);
        public float orbitDegPerSec = 5f, orbitRadius = 15f, orbitHeight = 7.5f;
        public float settle = 0.9f;
        float angle = -100f;

        void LateUpdate()
        {
            float dt = Time.unscaledDeltaTime;
            Vector3 pos, look;
            if (loop == null || loop.State == RunState.Ready)
            {
                angle += orbitDegPerSec * dt;
                float a = angle * Mathf.Deg2Rad;
                pos = new Vector3(Mathf.Cos(a) * orbitRadius, orbitHeight, Mathf.Sin(a) * orbitRadius);
                look = new Vector3(0, 0.6f, 0);
                transform.SetPositionAndRotation(pos, Quaternion.LookRotation(look - pos));
                return;
            }
            pos = playPos; look = playLook;
            float k = 1f - Mathf.Exp(-dt * 3f / settle);
            transform.position = Vector3.Lerp(transform.position, pos, k);
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(look - pos), k);
        }
    }
}
