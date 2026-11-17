# HARNESS: `demo_agents._common` (MODEL, chat_settings) is imported by the A2UI Fixed Schema agent
# (a2ui_fixed.py) but never shown or linked on the page. Minimal stand-in.
from agents import ModelSettings

MODEL = "gpt-4.1-mini"


def chat_settings(**kwargs) -> ModelSettings:
    return ModelSettings(**kwargs)
