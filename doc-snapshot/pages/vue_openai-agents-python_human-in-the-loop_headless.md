# Headless Interrupts

> Resolve agent interrupts from any UI, without a chat interrupt slot.

## What is this? [#what-is-this]

Some approvals belong outside the chat, such as a dashboard button, a modal, or a test fixture. This page shows how to render the pending request anywhere in your Vue tree. The UI can be a button grid, a form, a modal, or a keyboard shortcut.

> **Use `useHumanInTheLoop` on this framework.** Headless interrupts need an agent that emits an AG-UI interrupt or an `on_interrupt` custom event, and a working resume path. On the Built-in Agent, interrupts are temporarily unavailable. [`useHumanInTheLoop`](/vue/human-in-the-loop) pauses on a tool call instead.

## When should I use this? [#when-should-i-use-this]

- **Testing / Playwright fixtures**: a deterministic, chat-less button grid is easier to drive than a picker that appears after an LLM call.
- **Non-chat UIs**: dashboards, side panels, inspector surfaces, or any place where you want the agent's interrupt without the transcript.
- **Custom flow control**: when you need to know exactly when the interrupt arrived and when it was resolved.
- **Research / debugging**: when you want to observe raw interrupt state without the chat abstraction.

If you just want a picker in chat, use [`useInterrupt`](./useInterrupt) with the default `renderInChat: true` and the `#interrupt` slot.
