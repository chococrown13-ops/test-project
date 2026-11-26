using System;
using System.Threading.Tasks;
using Unity.Services.Authentication;
using Unity.Services.Core;
using UnityEngine;

// Added by `unity projects create`. Signs the player in anonymously before the
// first scene loads, so every service call has a player ID. The player sees
// nothing, and the account can be upgraded to a real sign-in later.
public static class PlayerAuthentication
{
    static TaskCompletionSource<bool> signedIn = new TaskCompletionSource<bool>();

    // True once the player is signed in, false when sign-in failed. Await it
    // before calling another Unity Gaming Service. It stays pending until the
    // sign-in finishes, whichever startup code reads it first.
    public static Task<bool> SignedIn => signedIn.Task;

    // A new task for each Play session, ahead of every BeforeSceneLoad
    // callback, including when domain reload is off.
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    static void ResetForPlaySession()
    {
        signedIn = new TaskCompletionSource<bool>();
    }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    static async void SignInAtStartup()
    {
        var pending = signedIn;
        pending.TrySetResult(await SignInAsync());
    }

    static async Task<bool> SignInAsync()
    {
        try
        {
            // Also while another startup callback is initializing: a second
            // call waits for that initialization instead of starting one.
            if (UnityServices.State != ServicesInitializationState.Initialized)
            {
                await UnityServices.InitializeAsync();
            }
            if (!AuthenticationService.Instance.IsSignedIn)
            {
                await AuthenticationService.Instance.SignInAnonymouslyAsync();
            }
            Debug.Log($"Signed in anonymously as player {AuthenticationService.Instance.PlayerId}");
            return true;
        }
        catch (Exception e)
        {
            // The game keeps running offline; services that need a player
            // ID stay unavailable until the next start.
            Debug.LogWarning($"Anonymous sign-in failed: {e.Message}");
            return false;
        }
    }
}
