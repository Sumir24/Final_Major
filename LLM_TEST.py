import requests
import json
import sys
import re

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
BASE_URL      = "http://127.0.0.1:1234"
CHAT_ENDPOINT = f"{BASE_URL}/v1/chat/completions"
MODEL_NAME    = "deepseek-r1-distill-qwen-7b"
MAX_RETRIES   = 3
TEMPERATURE   = 0.0


# ─────────────────────────────────────────────
#  CORE ARCHITECTURAL GUIDELINES
# ─────────────────────────────────────────────
CORE_STANDARDS = """
You are a high-performance code synthesis engine. Your goal is to transform 
trading descriptions into optimized, vectorized Python (Pandas) code.

STRICT VECTORIZATION:
  - NO for-loops, NO itertuples, NO .apply(), NO lambda.
  - Use ONLY pandas vectorized methods (.rolling, .ewm, .diff, .shift, .clip).
  - Pre-imported: 'pd' (pandas), 'np' (numpy), 'df' (dataframe).
  - Outputs: 'indicators' list (chart series), 'trades' list (buy/sell markers).

SIGNAL INTEGRITY:
  - CROSSOVERS: Use (A > B) & (A.shift(1) <= B.shift(1)) for robust detection.
  - NO REPAINTING: Logic should always depend on the most recently closed bar.
  - TREND FILTER: Use a 200-period EMA to separate bullish from bearish regimes.
"""

REFERENCE_PATTERNS = """
BEST-PRACTICE PATTERNS (Apply these techniques to any requested indicator)

# PATTERN: Vectorized RSI/Oscillator
_diff = df['Close'].diff()
_gain = _diff.clip(lower=0).rolling(14).mean()
_loss = (-_diff.clip(upper=0)).rolling(14).mean()
df['RSI'] = 100 - 100 / (1 + _gain / _loss.replace(0, np.nan))

# PATTERN: Range/Volatility Normalization (e.g. BB, KC)
_mid = df['Close'].rolling(20).mean()
_std = df['Close'].rolling(20).std()
df['Upper'] = _mid + (2 * _std)
df['Lower'] = _mid - (2 * _std)

# PATTERN: ATR-based Risk Management
_hl = df['High'] - df['Low']
_hc = (df['High'] - df['Close'].shift()).abs()
_lc = (df['Low'] - df['Close'].shift()).abs()
df['ATR'] = pd.concat([_hl, _hc, _lc], axis=1).max(axis=1).rolling(14).mean()
"""

REGISTRATION_TEMPLATE = """
REGISTRATION BLOCK — mandatory at the end of output:

indicators.append({'name': 'COLUMN', 'type': 'line',      'color': '#HEX', 'overlay': True_or_False})
indicators.append({'name': 'COLUMN', 'type': 'histogram',  'color': '#HEX', 'overlay': False})
trades.append(    {'name': 'SIGNAL', 'type': 'buy',        'color': '#00E676'})
trades.append(    {'name': 'SIGNAL', 'type': 'sell',       'color': '#FF1744'})

APPROVED COLORS:
  Price-pane lines  : #2962FF (blue), #FF6D00 (orange), #00BFA5 (teal), #D50000 (red), #546E7A (grey)
  Sub-pane lines    : #6200EA (purple), #B39DDB (lavender), #FF6D00 (orange)
  Histogram positive: #26A69A   Histogram negative: #EF5350
  Buy arrow         : #00E676   Sell arrow         : #FF1744
"""

SYSTEM_PROMPT = f"""
### INSTRUCTIONS (MANDATORY) ###
1. Synthesize the requested indicator using the patterns below.
2. ALWAYS include a registration block at the end using:
   indicators.append(...) and/or trades.append(...)
3. If the user asks for a 'strategy', include a trend filter (EMA 200) and risk levels.
4. Output ONLY pure Python code wrapped in markers:
# --- START ---
[Your Code]
# --- END ---

### STANDARDS ###
{CORE_STANDARDS}

### REFERENCE PATTERNS ###
{REFERENCE_PATTERNS}

### REGISTRATION TEMPLATE ###
{REGISTRATION_TEMPLATE}
"""




# ─────────────────────────────────────────────
#  EXTRACTION
# ─────────────────────────────────────────────
def extract_code(raw: str) -> str:
    # 1. Strip thinking blocks
    raw = re.sub(r"<think>.*?\n", "", raw, flags=re.DOTALL) # Strip thinking block first
    raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    
    # 2. Try marker-based extraction (Hyper-Lenient)
    marker_match = re.search(r"#\s*---\s*START\s*---\s*(.*?)\s*#\s*---\s*END\s*---", raw, flags=re.DOTALL | re.IGNORECASE)
    if marker_match:
        code = marker_match.group(1).strip()
    else:
        # Fallback to any code block
        fence = re.search(r"```(?:python)?\s*\n(.*?)```", raw, flags=re.DOTALL)
        code  = fence.group(1).strip() if fence else raw.strip()
    
    # 3. Final cleaning
    lines = []
    for line in code.splitlines():
        if re.match(r"^\s*(import|from)\s+(pandas|numpy|ta\b|talib|scipy|requests)", line):
            continue
        lines.append(line)
        
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()




# ─────────────────────────────────────────────
#  VALIDATION  (quant-aware)
# ─────────────────────────────────────────────
def validate(code: str) -> tuple[bool, str]:
    if not code:
        return False, "Empty output"
    if "df[" not in code:
        return False, "No df[] assignments — output is prose"
    
    # Use regex for registration block to be flexible with whitespace
    if not re.search(r"(indicators|trades)\.append\s*\(", code):
        return False, "Missing registration block (indicators.append or trades.append)"


    # Catch overlay violations for non-price indicators
    bad = [
        (r"'name':\s*'ATR[^']*'[^}]*overlay.*?True",  "ATR must be overlay: False"),
        (r"'name':\s*'RSI[^']*'[^}]*overlay.*?True",  "RSI must be overlay: False"),
        (r"'name':\s*'MACD[^']*'[^}]*overlay.*?True", "MACD must be overlay: False"),
        (r"'name':\s*'ADX[^']*'[^}]*overlay.*?True",  "ADX must be overlay: False"),
        (r"'name':\s*'BB_Width[^']*'[^}]*overlay.*?True", "BB_Width must be overlay: False"),
    ]
    for pattern, reason in bad:
        if re.search(pattern, code, re.IGNORECASE | re.DOTALL):
            return False, f"Quant violation: {reason}"

    try:
        compile(code, "<indicator>", "exec")
    except SyntaxError as e:
        return False, f"SyntaxError: {e}"

    return True, "OK"


# ─────────────────────────────────────────────
#  GENERATION  (retry loop)
# ─────────────────────────────────────────────
def generate_indicator_code(user_prompt: str) -> str:
    messages   = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_prompt},
    ]
    last_raw   = ""
    last_error = ""

    for attempt in range(1, MAX_RETRIES + 1):
        print(f"  [Attempt {attempt}/{MAX_RETRIES}] Querying {MODEL_NAME}…")

        if attempt > 1:
            messages.append({"role": "assistant", "content": last_raw})
            messages.append({
                "role": "user",
                "content": (
                    f"Validation failed: {last_error}\n\n"
                    "Fix and return ONLY corrected Python code — no prose, no fences.\n"
                    "Key rules:\n"
                    "  - ATR, RSI, MACD, ADX, BB_Width → overlay: False\n"
                    "  - Signals use .shift(1) crossovers, never raw level touches\n"
                    "  - Include EMA_200 trend filter and ATR-based stop/target"
                ),
            })

        payload = {
            "model":       MODEL_NAME,
            "messages":    messages,
            "temperature": TEMPERATURE,
            "max_tokens":  2048,
        }

        try:
            resp = requests.post(
                CHAT_ENDPOINT,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=300,
            )
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.RequestException as e:
            return f"# API request failed: {e}"

        last_raw     = data["choices"][0]["message"]["content"]
        code         = extract_code(last_raw)
        ok, reason   = validate(code)

        if ok:
            print(f"  ✓ Valid code on attempt {attempt}.")
            return code

        last_error = reason
        print(f"  ✗ Failed: {reason}")

    return (
        f"# Failed after {MAX_RETRIES} attempts. Last error: {last_error}\n\n"
        + "\n".join(f"# {l}" for l in last_raw.splitlines())
    )


# ─────────────────────────────────────────────
#  INTERACTIVE REPL
# ─────────────────────────────────────────────
def interactive_mode():
    print("=" * 62)
    print("  Quant Indicator Builder  —  Local LLM Pipeline")
    print(f"  Model : {MODEL_NAME}")
    print(f"  URL   : {CHAT_ENDPOINT}")
    print("=" * 62)
    print("Describe your indicator in plain English.")
    print("Type 'quit' to leave.\n")

    while True:
        try:
            prompt = input(">>> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break
        if not prompt:
            continue
        if prompt.lower() in ("quit", "exit", "q"):
            print("Bye!")
            break

        code = generate_indicator_code(prompt)
        print("\n" + "─" * 62)
        print("GENERATED CODE")
        print("─" * 62)
        print(code)
        print("─" * 62 + "\n")


# ─────────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])
        print(f"Prompt : {prompt}\n")
        result = generate_indicator_code(prompt)
        print("=== GENERATED CODE ===")
        print(result)
    else:
        interactive_mode()