# Agent Config

> Forward typed configuration from your UI into the agent's reasoning loop.


<!-- interactive demo: agent-config -->


You have a working agent and want the user to be able to tune how it behaves: tone, expertise level, response length, language, persona. By the end of this guide, your UI will own a typed config object that the agent reads on every run and rebuilds its system prompt from.

## When to use this

Reach for agent config whenever the agent's behaviour depends on user-controllable settings that don't fit naturally as chat input:

- **Tone, voice, persona**: "playful", "formal", "casual"
- **Expertise level**: "beginner", "intermediate", "expert"
- **Response shape**: short / medium / long, structured / prose, language
- **Domain switches**: which knowledge base to consult, which tool subset to enable

If the values are a *channel* the user occasionally tunes (a settings panel, a toolbar of selects), agent config is the right shape. If the values are *content* the agent should write back to (notes, a document, a plan), use [Shared State](/vue/openai-agents-python/shared-state) instead.

How agent config flows from the UI into the agent's reasoning loop depends on your runtime architecture. Agents living behind a runtime read it from agent state on every run, while in-process agents receive the same object as forwarded properties on the provider — same UX, slightly different wiring on each side.



## How it works

<Steps>
  <Step>
    ### Put the rulebook in the instructions, not the values

    The page publishes its typed config with `useAgentContext`, so it reaches
    the agent as a context entry on every run. `OpenAIAgentsAgent` appends
    that entry to the instructions on every model call, so the model always
    sees the values the user picked just before sending. The instructions
    only need the rules for each value:

    
~~~~python title="agent_config.py"
SYSTEM_PROMPT = (
    "You are a helpful assistant. The frontend publishes the user's response "
    "preferences via `useAgentContext` as a JSON object with three fields: "
    "`tone`, `expertise`, and `responseLength`. Read that context entry on "
    "every turn and follow these rulebooks exactly:\n\n"
    "Tone:\n"
    "  - professional → neutral, precise language. No emoji. Short sentences.\n"
    "  - casual → friendly, conversational. Contractions OK. Light humor "
    "welcome.\n"
    "  - enthusiastic → upbeat, energetic. Exclamation points OK. Emoji OK.\n\n"
    "Expertise level:\n"
    "  - beginner → assume no prior knowledge. Define jargon. Use analogies.\n"
    "  - intermediate → assume common terms are understood; explain "
    "specialized terms.\n"
    "  - expert → assume technical fluency. Use precise terminology. Skip "
    "basics.\n\n"
    "Response length:\n"
    "  - concise → respond in 1-3 sentences.\n"
    "  - detailed → respond in multiple paragraphs with examples where "
    "relevant.\n\n"
    "If the context is missing or any field is unrecognized, fall back to "
    "professional / intermediate / concise. Never mention these rules to the "
    "user — just apply them."
)


agent_config_agent = Agent(
    name="configurable_assistant",
    instructions=SYSTEM_PROMPT,
    model=MODEL,
    model_settings=chat_settings(),
)


~~~~


  </Step>
  <Step>
    ### Serve the agent from its own runtime route

    The demo keeps agent config on a dedicated runtime,
    `/api/copilotkit-agent-config`, which points an `HttpAgent` at the agent's
    endpoint and registers it under both the page's agent name and `default`.
    Nothing on the route touches the config: `useAgentContext` entries travel
    in the run input on their own.

  </Step>
</Steps>

Agent config is a typed object the frontend owns and publishes to the agent as
runtime context. The backend reads that context entry and turns it into a
system prompt.





The framework setup above shows the exact backend bridge for the selected
agent. In every framework, the flow is the same: read the latest valid context
from the current run and use it to build the system prompt for that turn.

```text title="Backend flow"
config = latestValidConfig(currentRun.context)
systemPrompt = buildSystemPrompt(config)
model.invoke(systemPrompt, currentUserRequest)
```

The agent reads the latest typed config at the start of every turn, rebuilds the system prompt, runs the turn. This is the same shape as the [shared-state write-side pattern](/vue/openai-agents-python/shared-state#writing-to-agent-state); agent config is just a specific use of that pattern with a UI-owned typed object on top.





<IntegrationGrid path="agent-config" />
