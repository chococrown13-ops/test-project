using System;
using UnityEngine;
using static NaeDosi.Defs;

namespace NaeDosi.Render
{
    /// <summary>
    /// City-builder camera: orbit round a point on the ground; distance, yaw and pitch ease toward their goals
    /// (port of render/camera.ts). Target and goal are in the web's map coordinates (x east, z south).
    /// </summary>
    public sealed class CityCam
    {
        public static readonly float SIZE = N * CELL;
        public readonly Camera cam;
        public double tx = SIZE * 0.3, tz = SIZE * 0.35, dist = 260, yaw = -0.6, pitch = 0.82;
        double gx, gz, gdist, gyaw, gpitch;

        public CityCam(Camera cam)
        {
            this.cam = cam;
            cam.fieldOfView = 42; cam.nearClipPlane = 2; cam.farClipPlane = 6000;
            gx = tx; gz = tz; gdist = dist; gyaw = yaw; gpitch = pitch;
        }

        public void Focus(double x, double z) { gx = x; gz = z; }
        public void Jump(double x, double z, double d, double yw, double p) { tx = gx = x; tz = gz = z; dist = gdist = d; yaw = gyaw = yw; pitch = gpitch = p; }

        public void PanPixels(double dx, double dy, double viewH)
        {
            double k = gdist * 1.1 / viewH, s = Math.Sin(yaw), c = Math.Cos(yaw);
            gx += (-dx * c - dy * s) * k;
            gz += (dx * s - dy * c) * k;
            Clamp();
        }

        public void Zoom(double f) => gdist = Math.Min(SIZE * 0.86, Math.Max(35, gdist * f));
        public void Rotate(double dyaw, double dpitch) { gyaw += dyaw; gpitch = Math.Min(1.45, Math.Max(0.28, gpitch + dpitch)); }
        void Clamp() { gx = Math.Min(SIZE, Math.Max(0, gx)); gz = Math.Min(SIZE, Math.Max(0, gz)); }

        /// <summary>WASD/arrows pan, Q/E turn, R/F zoom (the web's keys).</summary>
        public void Keys(bool up, bool down, bool left, bool right, bool q, bool e, bool zin, bool zout, double dt)
        {
            double sp = gdist * 1.2 * dt, s = Math.Sin(yaw), c = Math.Cos(yaw), fx = 0, fz = 0;
            if (up) { fx -= s; fz -= c; }
            if (down) { fx += s; fz += c; }
            if (left) { fx -= c; fz += s; }
            if (right) { fx += c; fz -= s; }
            if (fx != 0 || fz != 0) { gx += fx * sp; gz += fz * sp; Clamp(); }
            if (q) gyaw += dt * 1.4;
            if (e) gyaw -= dt * 1.4;
            if (zin) Zoom(1 - dt * 1.5);
            if (zout) Zoom(1 + dt * 1.5);
        }

        public void Update(double dt)
        {
            double e = 1 - Math.Exp(-dt * 10);
            tx += (gx - tx) * e; tz += (gz - tz) * e;
            dist += (gdist - dist) * e; yaw += (gyaw - yaw) * e; pitch += (gpitch - pitch) * e;
            double h = Math.Sin(pitch) * dist, r = Math.Cos(pitch) * dist;
            var pos = MeshKit.P(tx + Math.Sin(yaw) * r, h, tz + Math.Cos(yaw) * r);
            cam.transform.position = pos;
            cam.transform.LookAt(MeshKit.P(tx, 0, tz), Vector3.up);
        }

        /// <summary>The ground cell under a screen point (y up from the bottom), or null.</summary>
        public (int x, int y, double wx, double wz)? Pick(Vector2 screen)
        {
            var ray = cam.ScreenPointToRay(screen);
            if (Math.Abs(ray.direction.y) < 1e-6) return null;
            float t = -ray.origin.y / ray.direction.y;
            if (t < 0) return null;
            var p = ray.origin + ray.direction * t;
            double wx = p.x, wz = -p.z;
            int x = (int)Math.Floor(wx / CELL), y = (int)Math.Floor(wz / CELL);
            if (x < 0 || y < 0 || x >= N || y >= N) return null;
            return (x, y, wx, wz);
        }
    }
}
