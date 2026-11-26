using System;
using System.IO;
using System.Runtime.InteropServices;
using UnityEngine;

namespace NaeDosi.Ui
{
    /// <summary>
    /// Handing a city file to the player and taking one from them: in the browser through a download and a file
    /// picker (Plugins/WebGL/FileIo.jslib), elsewhere through a folder beside the saves.
    /// </summary>
    public sealed class FileIo : MonoBehaviour
    {
        static FileIo inst;
        static Action<string> pending;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void FileIoDownload(string name, string text);
        [DllImport("__Internal")] static extern void FileIoPick(string target, string method);
#endif

        static void Ensure() { if (inst == null) { inst = new GameObject("FileIo").AddComponent<FileIo>(); DontDestroyOnLoad(inst.gameObject); } }

        public static string Folder { get { var d = Path.Combine(Application.persistentDataPath, "cities"); Directory.CreateDirectory(d); return d; } }

        public static void Export(string name, string text)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            FileIoDownload(name, text);
#else
            File.WriteAllText(Path.Combine(Folder, name), text);
#endif
        }

        /// <summary>Ask for a .city file; the callback gets its text.</summary>
        public static void Open(Action<string> done)
        {
            Ensure();
            pending = done;
#if UNITY_WEBGL && !UNITY_EDITOR
            FileIoPick(inst.gameObject.name, nameof(OnPicked));
#else
            // Outside the browser: the newest .city file in the cities folder.
            var files = new DirectoryInfo(Folder).GetFiles("*.city");
            if (files.Length == 0) { CityUi.I.Toast($"{Folder} 폴더에 .city 파일을 넣어 주세요.", "warn"); return; }
            Array.Sort(files, (a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
            inst.OnPicked(File.ReadAllText(files[0].FullName));
#endif
        }

        public void OnPicked(string text) { var p = pending; pending = null; p?.Invoke(text); }
    }
}
