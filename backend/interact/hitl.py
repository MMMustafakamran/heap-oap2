from agents import Agent

from demo_agents._common import MODEL, chat_settings

HITL_IN_CHAT_PROMPT = (
    "You help users book an onboarding call with the sales team. "
    "When they ask to book a call, call the frontend-provided "
    "`book_call` tool with a short topic and the user's name. "
    "Keep any chat reply to one short sentence."
)


hitl_in_chat_agent = Agent(
    name="booking_assistant",
    instructions=HITL_IN_CHAT_PROMPT,
    model=MODEL,
    model_settings=chat_settings(),
)
