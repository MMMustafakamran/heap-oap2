# Tool Call Rendering page (docs.copilotkit.ai/vue/openai-agents-python/generative-ui/tool-rendering).
# The page shows only two fragments: the TOOLS/Agent block and get_weather. Everything else here is
# HARNESS: the page never shows the imports, SYSTEM_PROMPT, MODEL, chat_settings(), or the other three tools.
from agents import Agent, ModelSettings, function_tool  # HARNESS: imports never shown on the page

SYSTEM_PROMPT = "You are a helpful concierge. Use your tools when they fit the question."  # HARNESS: never shown
MODEL = "gpt-5-mini"  # HARNESS: never shown


def chat_settings() -> ModelSettings:  # HARNESS: never shown
    return ModelSettings()


# --- doc: second snippet (src/demo_agents/tool_rendering.py), verbatim ---
@function_tool
def get_weather(location: str) -> dict:
    """Get the current weather for a given location."""
    return {
        "city": location,
        "temperature": 68,
        "humidity": 55,
        "wind_speed": 10,
        "conditions": "Sunny",
    }


# HARNESS: search_flights / get_stock_price / roll_d20 are listed in TOOLS but never shown; minimal stand-ins.
@function_tool
def search_flights(origin: str, destination: str) -> dict:
    """Search flights between two cities."""
    return {"origin": origin, "destination": destination, "flights": []}


@function_tool
def get_stock_price(ticker: str) -> dict:
    """Get the stock price for a ticker."""
    return {"ticker": ticker, "price": 100.0}


@function_tool
def roll_d20() -> int:
    """Roll a 20-sided die."""
    return 12


# --- doc: first snippet (tool_rendering.py), verbatim ---
TOOLS = [get_weather, search_flights, get_stock_price, roll_d20]


tool_rendering_agent = Agent(
    name="concierge",
    instructions=SYSTEM_PROMPT,
    model=MODEL,
    model_settings=chat_settings(),
    tools=TOOLS,
)
