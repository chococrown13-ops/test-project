using UnityEngine;

namespace Ssuksuk
{
    /// <summary>
    /// The live floor: the player's best result kept in Cloud Save (the "progress" slot the project
    /// was created with), read at boot and written at the end of each run. It persists on this device
    /// while the anonymous sign-in stays cached. Offline, the game plays the same and the record
    /// stays local for that session.
    /// </summary>
    public class LiveFloor : MonoBehaviour
    {
        [System.Serializable]
        public class Record { public int runs; public int bestRounds; public int bestWins; public int clears; }

        public GameLoop loop;
        /// <summary>The kill switch. Remote Config wasn't set up for this project yet, so it stays on.</summary>
        public static bool LiveOpsEnabled = true;
        public Record Current { get; private set; } = new Record();
        public bool Loaded { get; private set; }
        public bool LastSaveOk { get; private set; }

        async void Start()
        {
            loop.StateChanged += OnState;
            if (!LiveOpsEnabled) return;
            Current = await PlayerSave.LoadAsync(new Record());
            Loaded = true;
            Hud.RecordLine = Line();
        }

        string Line() => Current.runs == 0 ? "" : $"<color=#B9A88A>지금까지 {Current.runs}번 · 가장 멀리 {Current.bestRounds}판 · 열 판 버티기 {Current.clears}번</color>";

        async void OnState(RunState s)
        {
            if (s != RunState.Won && s != RunState.Lost) return;
            Current.runs++;
            int fought = loop.Round;
            Current.bestRounds = Mathf.Max(Current.bestRounds, fought);
            Current.bestWins = Mathf.Max(Current.bestWins, loop.Wins);
            if (s == RunState.Won) Current.clears++;
            Hud.RecordLine = Line();
            if (!LiveOpsEnabled) return;
            LastSaveOk = await PlayerSave.SaveAsync(Current);
        }
    }
}
