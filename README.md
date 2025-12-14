# ChatbotProject1

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is almost ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/nx-api/nest?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## Finish your CI setup

[Click here to finish setting up your workspace!](https://cloud.nx.app)


## Run tasks

To run the dev server for your app, use:

```sh
npx nx serve chatbot-project-1
```

To create a production bundle:

```sh
npx nx build chatbot-project-1
```

To see all available targets to run for a project, run:

```sh
npx nx show project chatbot-project-1
```
        
These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

Use the plugin's generator to create new projects.

To generate a new application, use:

```sh
npx nx g @nx/nest:app demo
```

To generate a new library, use:

```sh
npx nx g @nx/node:lib mylib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)


[Learn more about Nx on CI](https://nx.dev/ci/intro/ci-with-nx#ready-get-started-with-your-provider?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/nx-api/nest?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects)
- [Learn about Nx on CI](https://nx.dev/ci/intro/ci-with-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:
- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

```mermaid
flowchart LR
%% Lanes
  subgraph B["Browser"]
    B0(["Start click"])
    B1["getUserMedia: mic audio"]
    B2["Create RTCPeerConnection"]
    B3["Add mic track (upstream)"]
    B4["Create Offer + setLocalDescription"]
    B5["POST /realtime/webrtc/offer (SDP offer)"]
    B6["Set RemoteDescription (SDP answer)"]
    B7["Play translated audio (remote track -> <audio>)"]
    B8["Show transcript (DataChannel messages)"]
    B9(["Stop click"])
    B10["POST /realtime/stop (sessionId)"]
    B11["Close PC + stop tracks"]
  end

  subgraph M["Middleware (NestJS)"]
    M0["Controller: /realtime/webrtc/offer"]
    M1["Create server PeerConnection"]
    M2["Create DataChannel: translation"]
    M3["Create downstream audio track (RTCAudioSource)"]
    M4["Set offer -> create answer -> return answer + sessionId"]
    M5["ontrack: RTCAudioSink reads incoming mic audio"]
    M6["Encode PCM16 to base64"]
    M7["Debounce / chunking"]
    M8["Open WebSocket to OpenAI Realtime"]
    M9["Send: input_audio_buffer.append"]
    M10["Send: input_audio_buffer.commit"]
    M11["Send: response.create (translate text + audio)"]
    M12["Receive WS events (text/audio deltas)"]
    M13["Forward text delta -> DataChannel.send"]
    M14["Decode audio delta (base64 PCM16)"]
    M15["Optional: resample 24k -> 48k and frame 10ms"]
    M16["Push frames -> RTCAudioSource.onData (downstream)"]
    M17["Controller: /realtime/stop"]
    M18["Cleanup: close WS, close PC, free resources"]
  end

  subgraph O["OpenAI Realtime API"]
    O0["Realtime WebSocket endpoint (wss)"]
    O1["Input audio buffer (append)"]
    O2["Commit chunk"]
    O3["Create response (translation)"]
    O4["Stream: output_text.delta"]
    O5["Stream: output_audio.delta"]
    O6["Done / failed"]
  end

%% Setup / signaling
  B0 --> B1 --> B2 --> B3 --> B4 --> B5 --> M0
  M0 --> M1 --> M2 --> M3 --> M4 --> B6
  B6 --> B7
  B6 --> B8

%% Upstream audio path
  B3 -- "RTP/Opus mic audio" --> M5 --> M6 --> M7 --> M8 --> O0
  M8 --> M9 --> O1
  M7 --> M10 --> O2
  M7 --> M11 --> O3

%% Downstream text and audio
  O4 --> M12 --> M13 --> B8
  O5 --> M12 --> M14 --> M15 --> M16 --> B7
  O6 --> M12

%% Stop
  B9 --> B10 --> M17 --> M18
  B9 --> B11
```
