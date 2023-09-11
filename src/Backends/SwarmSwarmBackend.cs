﻿using FreneticUtilities.FreneticDataSyntax;
using FreneticUtilities.FreneticExtensions;
using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using StableSwarmUI.Core;
using StableSwarmUI.Text2Image;
using StableSwarmUI.Utils;
using StableSwarmUI.WebAPI;
using System.Net;
using System.Net.Http;
using System.Net.WebSockets;

namespace StableSwarmUI.Backends;

/// <summary>A backend for Swarm to connect to other Swarm instances to use as the backend.</summary>
public class SwarmSwarmBackend : AbstractT2IBackend
{
    public class SwarmSwarmBackendSettings : AutoConfiguration
    {
        [ConfigComment("The network address of the other Swarm instance.\nUsually starts with 'http://' and ends with ':7801'.")]
        public string Address = "";

        [ConfigComment("Whether the backend is allowed to revert to an 'idle' state if the API address is unresponsive.\nAn idle state is not considered an error, but cannot generate.\nIt will automatically return to 'running' if the API becomes available.")]
        public bool AllowIdle = false;
    }

    /// <summary>Internal HTTP handler.</summary>
    public HttpClient HttpClient = NetworkBackendUtils.MakeHttpClient();

    public SwarmSwarmBackendSettings Settings => SettingsRaw as SwarmSwarmBackendSettings;

    public NetworkBackendUtils.IdleMonitor Idler = new();

    public ConcurrentDictionary<string, string> RemoteFeatureCombo = new();

    public override IEnumerable<string> SupportedFeatures => RemoteFeatureCombo.Keys;

    public string Session;

    /// <summary>If true, at least one remote sub-backend is still 'loading'.</summary>
    public volatile bool AnyLoading = true;

    public async Task ValidateAndBuild()
    {
        JObject sessData = await HttpClient.PostJson($"{Settings.Address}/API/GetNewSession", new());
        Session = sessData["session_id"].ToString();
        string id = sessData["server_id"]?.ToString();
        if (id == Utilities.LoopPreventionID.ToString())
        {
            Logs.Error($"Swarm is connecting to itself as a backend. This is a bad idea. Check the address being used: {Settings.Address}");
            throw new Exception("Swarm connected to itself, backend load failed.");
        }
        await ReviseRemoteDataList();
    }

    public async Task ReviseRemoteDataList()
    {
        await RunWithSession(async () =>
        {
            JObject backendData = await HttpClient.PostJson($"{Settings.Address}/API/ListBackends", new() { ["session_id"] = Session });
            if (backendData.TryGetValue("error_id", out JToken errorId) && errorId.ToString() == "invalid_session_id")
            {
                throw new SessionInvalidException();
            }
            HashSet<string> features = new();
            bool isLoading = false;
            foreach (JToken backend in backendData.Values())
            {
                string status = backend["status"].ToString();
                if (status == "running")
                {
                    features.UnionWith(backend["features"].ToArray().Select(f => f.ToString()));
                }
                else if (status == "loading")
                {
                    isLoading = true;
                }
            }
            foreach (string str in features.Where(f => !RemoteFeatureCombo.ContainsKey(f)))
            {
                RemoteFeatureCombo.TryAdd(str, str);
            }
            foreach (string str in RemoteFeatureCombo.Keys.Where(f => !features.Contains(f)))
            {
                RemoteFeatureCombo.TryRemove(str, out _);
            }
            AnyLoading = isLoading;
        });
    }

    public class SessionInvalidException : Exception
    {
    }

    public async Task RunWithSession(Func<Task> run)
    {
        try
        {
            await run();
        }
        catch (SessionInvalidException)
        {
            await ValidateAndBuild();
            await RunWithSession(run);
        }
    }

    public override async Task Init()
    {
        if (string.IsNullOrWhiteSpace(Settings.Address))
        {
            Status = BackendStatus.DISABLED;
            return;
        }
        Idler.Stop();
        try
        {
            Status = BackendStatus.LOADING;
            await ValidateAndBuild();
            _ = Task.Run(async () =>
            {
                try
                {
                    while (AnyLoading)
                    {
                        Logs.Debug($"SwarmSwarmBackend {BackendData.ID} waiting for remote backends to load, have featureset {RemoteFeatureCombo.Keys.JoinString(", ")}");
                        if (Program.GlobalProgramCancel.IsCancellationRequested
                            || Status != BackendStatus.LOADING)
                        {
                            return;
                        }
                        await Task.Delay(TimeSpan.FromSeconds(1));
                        await ReviseRemoteDataList();
                    }
                    Status = BackendStatus.RUNNING;
                }
                catch (Exception ex)
                {
                    if (!Settings.AllowIdle)
                    {
                        Logs.Error($"SwarmSwarmBackend {BackendData.ID} failed to load: {ex}");
                        Status = BackendStatus.ERRORED;
                    }
                }
                if (Settings.AllowIdle)
                {
                    Idler.Backend = this;
                    Idler.ValidateCall = () => ReviseRemoteDataList().Wait();
                    Idler.Start();
                }
            });
        }
        catch (Exception)
        {
            if (!Settings.AllowIdle)
            {
                throw;
            }
        }
    }

    public override async Task Shutdown()
    {
        Logs.Info($"SwarmSwarmBackend {BackendData.ID} shutting down...");
        Idler.Stop();
        Status = BackendStatus.DISABLED;
    }

    public override async Task<bool> LoadModel(T2IModel model)
    {
        // TODO: actually trigger a remote model load and return whether it worked
        CurrentModelName = model.Name;
        return true;
    }

    public override async Task<Image[]> Generate(T2IParamInput user_input)
    {
        Image[] images = null;
        await RunWithSession(async () =>
        {
            JObject req = user_input.ToJSON();
            req["images"] = 1;
            req["session_id"] = Session;
            req["do_not_save"] = true;
            JObject generated = await HttpClient.PostJson($"{Settings.Address}/API/GenerateText2Image", req);
            if (generated.TryGetValue("error_id", out JToken errorId) && errorId.ToString() == "invalid_session_id")
            {
                throw new SessionInvalidException();
            }
            images = generated["images"].Select(img => new Image(img.ToString().After(";base64,"))).ToArray();
        });
        return images;
    }

    public override async Task GenerateLive(T2IParamInput user_input, string batchId, Action<object> takeOutput)
    {
        await RunWithSession(async () =>
        {
            JObject req = user_input.ToJSON();
            req["images"] = 1;
            req["session_id"] = Session;
            req["do_not_save"] = true;
            JObject generated = await HttpClient.PostJson($"{Settings.Address}/API/GenerateText2Image", req);
            ClientWebSocket websocket = await NetworkBackendUtils.ConnectWebsocket(Settings.Address, "API/GenerateText2ImageWS");
            await websocket.SendJson(req, API.WebsocketTimeout);
            while (true)
            {
                JObject response = await websocket.ReceiveJson(1024 * 1024 * 100);
                Logs.Verbose($"Swarm backend gave response: {response}");
                if (response.TryGetValue("error_id", out JToken errorId) && errorId.ToString() == "invalid_session_id")
                {
                    throw new SessionInvalidException();
                }
                if (websocket.CloseStatus.HasValue)
                {
                    break;
                }
                if (response.TryGetValue("gen_progress", out JToken val))
                {
                    takeOutput(val);
                }
                if (response.TryGetValue("image", out val))
                {
                    takeOutput(new Image(val.ToString().After(";base64,")));
                }
            }
        });
    }
}
