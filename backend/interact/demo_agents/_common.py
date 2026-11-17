# HARNESS: `demo_agents._common` (MODEL, chat_settings) is imported by the agent code on the Vue OpenAI Agents pages
# (HITL, Shared State, Sub-Agents) but never shown or linked. Minimal stand-in.
from agents import ModelSettings

MODEL = "gpt-4.1-mini"


def chat_settings(**kwargs) -> ModelSettings:
    return ModelSettings(**kwargs)
