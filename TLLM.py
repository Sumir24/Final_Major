import requests
import sys
import re
import ast

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
BASE_URL       = "http://127.0.0.1:1234"
CHAT_ENDPOINT  = f"{BASE_URL}/v1/chat/completions"

REASONER_MODEL = "deepseek-r1-distill-qwen-7b"
CODER_MODEL    = "qwen/qwen2.5-coder-14b"

MAX_RETRIES    = 4
TEMPERATURE    = 0.0

# Timeouts — reasoner needs more time to think; coder just writes code
REASONER_TIMEOUT = 300   # seconds
CODER_TIMEOUT    = 480   # seconds — Qwen2.5-14b is a big model, give it room


# ─────────────────────────────────────────────
#  THINK-BLOCK STRIPPING  (robust, multi-pass)
# ─────────────────────────────────────────────
def strip_think(text: str) -> str:
    """
    Remove ALL DeepSeek <think>...</think> blocks.
    Handles: closed blocks, unclosed blocks, nested content, partial blocks.
    """
    # Pass 1 — remove properly closed blocks
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Pass 2 — remove unclosed <think> block (everything after an orphan <think>)
    text = re.sub(r"<think>.*$", "", text, flags=re.DOTALL)
    # Pass 3 — remove any orphan closing tag
    text = re.sub(r"</think>", "", text)
    # Pass 4 — collapse excess blank lines left behind
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_spec(raw: str) -> str:
    """
    From DeepSeek's raw output, extract only the structured spec —
    the part AFTER the </think> block.
    If no think block present, return cleaned raw text.
    """
    # If there's a </think> tag, take everything after it
    if "</think>" in raw:
        raw = raw.split("</think>", 1)[1]

    raw = strip_think(raw)

    # Trim spec to max 2000 chars to avoid bloating Qwen's context
    # The spec should be concise — if it's longer it's usually noise
    if len(raw) > 2000:
        # Try to keep up to the REGISTRATION section (most important for Qwen)
        # Cut after registration if possible
        reg_pos = raw.lower().find("registration")
        if reg_pos != -1:
            # Find a natural end point after registration section
            end_pos = min(reg_pos + 800, len(raw))
            raw = raw[:end_pos]
        else:
            raw = raw[:2000]
        raw = raw + "\n\n[Spec trimmed for brevity — implement all 5 sections]"

    return raw.strip()


# ─────────────────────────────────────────────
#  PROMPTS
# ─────────────────────────────────────────────
REASONER_SYSTEM = """
You are a quantitative analyst. Produce a CONCISE mathematical specification.
Output EXACTLY these 5 sections — keep each section SHORT (2-4 lines max):

1. INDICATOR MATH   — formulas and window sizes only
2. SIGNAL LOGIC     — entry/exit crossover conditions (current bar vs prev bar)
3. TREND FILTER     — EMA(200) bull/bear gate
4. RISK LEVELS      — ATR multipliers for SL and TP
5. REGISTRATION     — every series: name | type | overlay True/False

OVERLAY RULES (critical):
  overlay: True  → price-pane only: MA, BB bands, EMA, VWAP
  overlay: False → ALL oscillators: RSI, MACD, ATR, ADX, Stoch, CCI, Volume, BB_Width

Do NOT write code. Keep the entire spec under 400 words.
"""

CODER_SYSTEM = """
You are a code synthesis engine. Convert the quantitative spec into vectorized Python.

════════════════════════════════════════
 HARD RULES
════════════════════════════════════════
[RULE 1] NO loops — no for/while, no .apply(), no .itertuples(), no lambda
[RULE 2] ONLY: .rolling() .ewm() .diff() .shift() .clip() .where() pd.concat()
[RULE 3] Pre-imported: pd, np, df (OHLCV DataFrame). Do NOT write any imports.
[RULE 4] DO NOT write any indicators.append() or trades.append() calls. 
[RULE 5] Use names like 'RSI', 'SMA_20', 'BB_Upper' etc. as provided in the spec.
[RULE 6] Output ONLY raw Python code between the markers. NO markdown backticks (```) allowed inside.

════════════════════════════════════════
 MANDATORY PATTERNS
════════════════════════════════════════

# ATR:
_hl = df['High'] - df['Low']
_hc = (df['High'] - df['Close'].shift()).abs()
_lc = (df['Low']  - df['Close'].shift()).abs()
df['ATR'] = pd.concat([_hl, _hc, _lc], axis=1).max(axis=1).rolling(14).mean()

# RSI:
_diff = df['Close'].diff()
_gain = _diff.clip(lower=0).rolling(14).mean()
_loss = (-_diff.clip(upper=0)).rolling(14).mean()
df['RSI'] = 100 - 100 / (1 + _gain / _loss.replace(0, np.nan))

# Crossover:
cross_up   = (fast > slow) & (fast.shift(1) <= slow.shift(1))
cross_down = (fast < slow) & (fast.shift(1) >= slow.shift(1))

# Trend filter:
df['EMA_200'] = df['Close'].ewm(span=200, adjust=False).mean()
bull_regime = df['Close'] > df['EMA_200']
bear_regime = df['Close'] < df['EMA_200']

# Signal columns:
df['Buy_Signal']  = np.where(buy_condition,  df['Close'], np.nan)
df['Sell_Signal'] = np.where(sell_condition, df['Close'], np.nan)

════════════════════════════════════════
 COLORS
════════════════════════════════════════
Price-pane : #2962FF #FF6D00 #00BFA5 #D50000 #546E7A
Sub-pane   : #6200EA #B39DDB #FF6D00
Hist+      : #26A69A   Hist- : #EF5350
Buy        : #00E676   Sell  : #FF1744

════════════════════════════════════════
 OUTPUT — wrap code exactly like this:
════════════════════════════════════════
# --- START ---
<pure python only — no prose, no markdown inside>
# --- END ---
"""


# ─────────────────────────────────────────────
#  LOW-LEVEL API CALL
# ─────────────────────────────────────────────
def _call(model: str, messages: list, max_tokens: int, timeout: int) -> str:
    payload = {
        "model":       model,
        "messages":    messages,
        "temperature": TEMPERATURE,
        "max_tokens":  max_tokens,
    }
    try:
        resp = requests.post(
            CHAT_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except requests.exceptions.Timeout:
        raise RuntimeError(
            f"Model '{model}' timed out after {timeout}s.\n"
            f"  Tips: reduce max_tokens, or check if the model is fully loaded in LM Studio."
        )
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            f"Cannot reach LM Studio at {BASE_URL}.\n"
            f"  Is LM Studio running? Is the model loaded?"
        )
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"API error [{model}]: {e}")


# ─────────────────────────────────────────────
#  STAGE 1 — REASONER  (DeepSeek-R1)
# ─────────────────────────────────────────────
def reason(user_prompt: str) -> str:
    print("  [Stage 1] DeepSeek-R1 reasoning…")
    messages = [
        {"role": "system", "content": REASONER_SYSTEM},
        {"role": "user",   "content": f"Indicator request: {user_prompt}"},
    ]
    raw  = _call(REASONER_MODEL, messages, max_tokens=800, timeout=REASONER_TIMEOUT)
    spec = extract_spec(raw)

    if not spec:
        raise RuntimeError("DeepSeek returned an empty spec after stripping think blocks.")

    print(f"  [Stage 1] ✓ Spec ready ({len(spec)} chars)")
    return spec


# ─────────────────────────────────────────────
#  STAGE 2 — CODER  (Qwen2.5-Coder)
# ─────────────────────────────────────────────
def code_from_spec(spec: str, user_prompt: str,
                   prev_code: str = "", error: str = "") -> str:
    if prev_code and error:
        user_msg = (
            f"Original request: {user_prompt}\n\n"
            f"Spec:\n{spec}\n\n"
            f"VALIDATION ERROR TO FIX:\n{error}\n\n"
            f"BROKEN CODE:\n{prev_code}\n\n"
            "Fix the error. RSI/ATR/MACD/ADX/Stoch → overlay: False (never True).\n"
            "Return corrected code between # --- START --- and # --- END ---."
        )
    else:
        user_msg = (
            f"Request: {user_prompt}\n\n"
            f"Spec:\n{spec}"
        )

    messages = [
        {"role": "system", "content": CODER_SYSTEM},
        {"role": "user",   "content": user_msg},
    ]
    return _call(CODER_MODEL, messages, max_tokens=2048, timeout=CODER_TIMEOUT)


# ─────────────────────────────────────────────
#  CODE EXTRACTION
# ─────────────────────────────────────────────
def extract_code(raw: str) -> str:
    raw = strip_think(raw)

    # Strategy 1: Look for the custom START/END markers
    m = re.search(
        r"#\s*-+\s*START\s*-+\s*(.*?)\s*#\s*-+\s*END\s*-+",
        raw, flags=re.DOTALL | re.IGNORECASE
    )
    if m:
        code = m.group(1).strip()
    else:
        # Strategy 2: Fallback to triple backticks
        fence = re.search(r"```(?:python)?\s*\n?(.*?)```", raw, flags=re.DOTALL)
        code  = fence.group(1).strip() if fence else raw.strip()

    # CRITICAL: Strip any leftover backticks that the LLM might have nested 
    # inside the markers (a common fail case for Qwen/DeepSeek)
    code = re.sub(r"```(?:python)?", "", code, flags=re.IGNORECASE)
    code = code.replace("```", "").strip()

    lines = [
        line for line in code.splitlines()
        if not re.match(r"^\s*(import|from)\s+(pandas|numpy|ta\b|talib|scipy|requests)", line)
    ]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# ─────────────────────────────────────────────
#  VALIDATION  (AST-based per-dict)
# ─────────────────────────────────────────────
SUBPANE_KEYWORDS = {
    "rsi", "macd", "atr", "adx", "stoch", "cci",
    "bb_width", "bb_pct", "volume", "vol", "obv",
    "mfi", "roc", "willr", "momentum", "dmi",
}

def _is_subpane(name: str) -> bool:
    n = name.lower().replace(" ", "_")
    return any(n == kw or n.startswith(kw) or kw in n for kw in SUBPANE_KEYWORDS)


def _parse_appends(code: str) -> list[dict]:
    """Parse every indicators/trades .append({...}) dict via ast — no greedy regex."""
    results = []
    for m in re.finditer(
        r"(indicators|trades)\s*\.\s*append\s*\(\s*(\{[^}]*\})\s*\)",
        code, re.DOTALL
    ):
        try:
            d = ast.literal_eval(m.group(2))
            d["_call"] = m.group(1)
            results.append(d)
        except Exception:
            pass
    return results


def validate(code: str) -> tuple[bool, str]:
    if not code:
        return False, "Empty output"
    if "df[" not in code:
        return False, "No df[] assignments — looks like prose not code"
 # Validation check for .append is removed as the frontend handles registration now

    for entry in _parse_appends(code):
        if entry.get("_call") != "indicators":
            continue
        name    = str(entry.get("name", ""))
        overlay = entry.get("overlay")
        if _is_subpane(name) and overlay is True:
            return False, (
                f"Overlay violation: '{name}' → overlay must be False, got True.\n"
                f"  Change:  'overlay': True  →  'overlay': False  for '{name}'"
            )

    try:
        compile(code, "<indicator>", "exec")
    except SyntaxError as e:
        return False, f"SyntaxError line {e.lineno}: {e.msg}"

    if ".apply(" in code:
        return False, "Forbidden: .apply() — use vectorized pandas"

    return True, "OK"


# ─────────────────────────────────────────────
#  AUTO-FIX overlay violations (no retry needed)
# ─────────────────────────────────────────────
def auto_fix_overlays(code: str) -> str:
    def _fix(m: re.Match) -> str:
        list_name, dict_str = m.group(1), m.group(2)
        try:
            d = ast.literal_eval(dict_str)
        except Exception:
            return m.group(0)
        if list_name == "indicators" and _is_subpane(str(d.get("name", ""))) and d.get("overlay") is True:
            d["overlay"] = False
            rebuilt = (
                f"{{'name': {repr(d['name'])}, 'type': {repr(d.get('type','line'))}, "
                f"'color': {repr(d.get('color','#6200EA'))}, 'overlay': False}}"
            )
            return f"{list_name}.append({rebuilt})"
        return m.group(0)

    return re.compile(
        r"(indicators|trades)\s*\.\s*append\s*\(\s*(\{[^}]*\})\s*\)", re.DOTALL
    ).sub(_fix, code)


# ─────────────────────────────────────────────
#  MAIN PIPELINE
# ─────────────────────────────────────────────
def generate(user_prompt: str) -> str:
    print(f"\n{'━'*62}")
    print(f"  PIPELINE START")
    print(f"  Prompt   : {user_prompt}")
    print(f"  Reasoner : {REASONER_MODEL}  (timeout={REASONER_TIMEOUT}s)")
    print(f"  Coder    : {CODER_MODEL}  (timeout={CODER_TIMEOUT}s)")
    print(f"{'━'*62}")

    # Stage 1 — DeepSeek reasons
    try:
        spec = reason(user_prompt)
    except RuntimeError as e:
        return f"# Stage 1 failed: {e}"

    print(f"\n{'─'*62}")
    print("  QUANTITATIVE SPEC (clean, think-blocks removed)")
    print(f"{'─'*62}")
    for line in spec.splitlines():
        print(f"  {line}")
    print(f"{'─'*62}\n")

    # Stage 2 — Qwen codes
    last_raw, last_error = "", ""

    for attempt in range(1, MAX_RETRIES + 1):
        print(f"  [Attempt {attempt}/{MAX_RETRIES}] Qwen2.5-Coder writing code…")
        try:
            raw = code_from_spec(spec, user_prompt, last_raw, last_error)
        except RuntimeError as e:
            print(f"  ✗ {e}")
            if attempt == MAX_RETRIES:
                return f"# Stage 2 failed: {e}"
            print("  Retrying…")
            continue

        extracted      = extract_code(raw)
        extracted      = auto_fix_overlays(extracted)   # cheap fix before validate
        ok, last_error = validate(extracted)
        last_raw       = extracted

        if ok:
            print(f"  ✓ Valid code produced on attempt {attempt}.\n")
            return extracted

        print(f"  ✗ Validation failed: {last_error}")

    # All retries exhausted — print the error separately, return the raw code as-is
    # so it's still copy-pasteable (may have minor issues but better than commented-out)
    print(f"\n  ⚠ All {MAX_RETRIES} attempts failed. Returning best code produced.")
    print(f"  Last error: {last_error}")
    print(f"  The code below may need a small manual fix.\n")
    return last_raw


# ─────────────────────────────────────────────
#  DISPLAY + SAVE
# ─────────────────────────────────────────────
def _display_and_save(code: str, prompt: str) -> None:
    """Print clean copy-pasteable code and save to a .py file."""
    import os, time

    print("\n" + "═" * 62)
    print("  ✅  GENERATED INDICATOR CODE  — copy & paste ready")
    print("═" * 62)
    print(code)
    print("═" * 62)

    # Save to file — name derived from prompt slug + timestamp
    slug      = re.sub(r"[^a-z0-9]+", "_", prompt.lower())[:40].strip("_")
    timestamp = time.strftime("%H%M%S")
    filename  = f"indicator_{slug}_{timestamp}.py"

    # Write with header comment so file is self-contained
    header = (
        f"# Generated by Dual-Model Indicator Builder\n"
        f"# Prompt  : {prompt}\n"
        f"# Models  : {REASONER_MODEL} → {CODER_MODEL}\n"
        f"# Pre-imported in sandbox: pd, np, df, indicators=[], trades=[]\n\n"
    )
    try:
        with open(filename, "w", encoding="utf-8") as f:
            f.write(header + code + "\n")
        print(f"\n  💾  Saved to: {os.path.abspath(filename)}\n")
    except OSError as e:
        print(f"\n  ⚠ Could not save file: {e}\n")


# ─────────────────────────────────────────────
#  INTERACTIVE REPL
# ─────────────────────────────────────────────
def interactive():
    print("=" * 62)
    print("  Dual-Model Quant Indicator Builder")
    print(f"  Reasoner : {REASONER_MODEL}")
    print(f"  Coder    : {CODER_MODEL}")
    print(f"  Endpoint : {CHAT_ENDPOINT}")
    print("=" * 62)
    print("Describe your indicator. Type 'quit' to exit.\n")

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

        result = generate(prompt)
        _display_and_save(result, prompt)


# ─────────────────────────────────────────────
#  ENTRY POINT
# ─────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) > 1:
        prompt = " ".join(sys.argv[1:])
        print(f"Prompt: {prompt}\n")
        result = generate(prompt)
        _display_and_save(result, prompt)
    else:
        interactive()