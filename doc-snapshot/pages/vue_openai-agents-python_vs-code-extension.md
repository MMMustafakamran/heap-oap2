# VS Code Extension

> Preview supported CopilotKit UI sources, A2UI catalog components, and the AG-UI event stream without leaving VS Code.

You want to see your render hooks, A2UI components, or agent events without running the whole app. The CopilotKit VS Code extension shows each one in your editor. Install it once and you get three sidebars under the CopilotKit activity-bar icon:

- **A2UI Catalog**: live preview of your A2UI catalog components with fixture-driven scenarios and hot-reload on save.
- **AG-UI Inspector**: a real-time, color-coded, filterable stream of every AG-UI event your runtime emits.

The A2UI catalog preview runs without a localhost server, browser tab, or agent
run. The AG-UI Inspector connects to a running development runtime.

## Install [#install]

<Steps>
<Step>
### Install the extension [#install-the-extension]

From a terminal, run:

```bash
code --install-extension copilotkit.copilotkit
```

Or install it from VS Code:

1. Press `Cmd+Shift+X` (macOS) or `Ctrl+Shift+X` to open Extensions.
2. Search for **CopilotKit**.
3. Click Install.
</Step>

<Step>
### Open the CopilotKit activity bar [#open-the-copilotkit-activity-bar]

Click the **CopilotKit icon** in the Activity Bar on the left edge of VS Code. Three sidebar views expand underneath it, in this order:

1. **CopilotKit Hooks**
2. **A2UI Catalog**
3. **AG-UI Inspector**

Each is a self-contained tool. Pick the one that matches what you're working on.
</Step>
</Steps>

## A2UI Catalog [#a2ui-catalog]

You have a file that exports an A2UI catalog via `createCatalog` (or imports `@copilotkit/a2ui-renderer`). The **A2UI Catalog** sidebar lists every catalog file in your workspace, plus any named fixtures you've defined alongside them. Clicking a component opens a live preview; edit the file and the preview updates on save while preserving interaction state.

<Steps>
<Step>
### Find your catalog files [#find-your-catalog-files]

Open the **A2UI Catalog** sidebar. Each row is a catalog file (discovered by scanning for `@copilotkit/a2ui-renderer` imports). Rows with fixture files expand to show named scenarios; rows without one get an `auto` badge and render with a default empty surface.

Hover any row to reveal a `</>` button that jumps to the source. On fixture rows, it jumps to the named fixture key inside the fixture file.
</Step>

<Step>
### Preview a component [#preview-a-component]

1. Click a component row. The preview opens.
2. If the row has fixtures, expand it and pick one.
3. Edit the component file and save. The preview rebundles and re-renders.
</Step>

<Step>
### Add fixtures [#add-fixtures]

Fixtures are named test-data scenarios. Create a fixture file next to your component:

<Tabs items={["JSON", "TypeScript"]}>
<Tab value="JSON">
`MyComponent.fixture.json`:
```json
{
  "default": {
    "surfaceId": "preview",
    "messages": [
      { "beginRendering": { "surfaceId": "preview", "root": "root" } },
      { "surfaceUpdate": { "surfaceId": "preview", "components": [] } }
    ]
  },
  "empty state": {
    "surfaceId": "preview",
    "messages": []
  }
}
```
</Tab>
<Tab value="TypeScript">
`MyComponent.fixture.ts`:
```ts
export default {
  "default": {
    surfaceId: "preview",
    messages: [
      { beginRendering: { surfaceId: "preview", root: "root" } },
      { surfaceUpdate: { surfaceId: "preview", components: [] } },
    ],
  },
  "empty state": {
    surfaceId: "preview",
    messages: [],
  },
};
```
</Tab>
</Tabs>

Each top-level key is a named fixture. Switch between them from the fixture dropdown inside the preview panel.
</Step>
</Steps>

<Callout type="info">
  The extension validates fixture files on save and surfaces structural warnings (missing `surfaceId`, invalid `messages`, unknown component types) as in-editor diagnostics.
</Callout>

## AG-UI Inspector [#ag-ui-inspector]

You're running a CopilotKit runtime and something in an agent interaction is off: a tool call isn't firing, a state delta is wrong, or the run ends before the UI settles. The **AG-UI Inspector** sidebar opens a dedicated SSE connection to `{runtimeUrl}/cpk-debug-events` and renders every event in a filterable, color-coded stream. Click any event row to expand the full JSON payload. That path is relative to the base path the runtime is mounted at. In the AG-UI Inspector sidebar, enter the full runtime URL (for example `http://localhost:3000/api/copilotkit`), not only the origin.

<Callout type="info">
  Full walkthrough, event-type color reference, and production guard details: [AG-UI Event Inspector](/vue/openai-agents-python/troubleshooting/event-inspector).
</Callout>
