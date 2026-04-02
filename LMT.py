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
Output EXACTLY these 6 sections — keep each section SHORT (2-4 lines max):

0. PRIMARY INDICATOR — name of requested indicator only (e.g. "MACD")
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
[RULE 4] Lists indicators=[] and trades=[] are already declared. Just .append() to them.
[RULE 5] Use names like 'RSI', 'SMA_20', 'BB_Upper' etc. as provided in the spec.
[RULE 6] Output ONLY raw Python code between the markers. NO markdown backticks (```) allowed inside.
[RULE 7] Start your code with a prominent header `# === PRIMARY INDICATOR: [NAME] ===` immediately before the main indicator's calculation.

════════════════════════════════════════
 OVERLAY RULE (read carefully)
════════════════════════════════════════
overlay: True  → ONLY: Moving Averages, BB bands, EMA, VWAP
overlay: False → RSI, MACD, ATR, ADX, Stoch, CCI, Volume, BB_Width, any oscillator

CORRECT registration examples:
  indicators.append({'name': 'EMA_200',   'type': 'line',      'color': '#546E7A', 'overlay': True})
  indicators.append({'name': 'BB_Upper',  'type': 'line',      'color': '#2962FF', 'overlay': True})
  indicators.append({'name': 'BB_Lower',  'type': 'line',      'color': '#2962FF', 'overlay': True})
  indicators.append({'name': 'RSI',       'type': 'line',      'color': '#6200EA', 'overlay': False})
  indicators.append({'name': 'ATR',       'type': 'line',      'color': '#FF6D00', 'overlay': False})
  indicators.append({'name': 'MACD',      'type': 'line',      'color': '#2962FF', 'overlay': False})
  indicators.append({'name': 'MACD_Hist', 'type': 'histogram', 'color': '#26A69A', 'overlay': False})
  trades.append({'name': 'Buy_Signal',  'type': 'buy',  'color': '#00E676'})
  trades.append({'name': 'Sell_Signal', 'type': 'sell', 'color': '#FF1744'})

════════════════════════════════════════
 MANDATORY PATTERNS
════════════════════════════════════════

# ATR:
_hl = df['High'] - df['Low']
_hc = (df['High'] - df['Close'].shift()).abs()
_lc = (df['Low']  - df['Close'].shift()).abs()
df['ATR'] = pd.concat([_hl, _hc, _lc], axis=1).max(axis=1).rolling(14).mean()

# === PRIMARY INDICATOR: RSI ===
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

    # Priority 1 — explicit START/END markers
    m = re.search(
        r"#\s*-+\s*START\s*-+\s*(.*?)\s*#\s*-+\s*END\s*-+",
        raw, flags=re.DOTALL | re.IGNORECASE
    )
    if m:
        code = m.group(1).strip()
    else:
        # Priority 2 — any fenced block (```python, ```py, or plain ```)
        fence = re.search(r"```(?:python|py)?\s*\n(.*?)```", raw, flags=re.DOTALL)
        code  = fence.group(1).strip() if fence else raw.strip()

    # Hard-strip any leftover fence lines and stray imports line by line
    clean = []
    for line in code.splitlines():
        if re.match(r"^\s*```", line):                                              # stray fence
            continue
        if re.match(r"^\s*(import|from)\s+(pandas|numpy|ta\b|talib|scipy|requests)", line):
            continue
        clean.append(line)

    return re.sub(r"\n{3,}", "\n\n", "\n".join(clean)).strip()


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
    if not re.search(r"(indicators|trades)\s*\.\s*append\s*\(", code):
        return False, "Missing registration block"

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
#  AUTO-FIX missing boilerplate (no retry needed)
# ─────────────────────────────────────────────
def auto_fix_missing(code: str) -> str:
    """
    Inject mandatory boilerplate the model forgot:
      - EMA_200 + bull/bear regime if missing
      - A minimal registration block if missing entirely
    """
    lines = code.splitlines()

    # ── Fix 1: EMA_200 missing but referenced ────────────────────
    if "EMA_200" not in code and ("bull_regime" in code or "bear_regime" in code):
        inject = (
            "df['EMA_200'] = df['Close'].ewm(span=200, adjust=False).mean()\n"
            "bull_regime = df['Close'] > df['EMA_200']\n"
            "bear_regime = df['Close'] < df['EMA_200']"
        )
        lines.insert(0, inject)

    # ── Fix 2: EMA_200 computed but bull/bear_regime missing ──────
    rebuilt = "\n".join(lines)
    if "EMA_200" in rebuilt and "bull_regime" not in rebuilt:
        lines.append("bull_regime = df['Close'] > df['EMA_200']")
        lines.append("bear_regime = df['Close'] < df['EMA_200']")

    # ── Fix 3: registration block missing entirely ────────────────
    rebuilt = "\n".join(lines)
    if not re.search(r"(indicators|trades)\s*\.\s*append\s*\(", rebuilt):
        # Guess which sub-pane columns exist and register them
        reg_lines = []
        col_colors = {
            "RSI": ("#6200EA", False), "MACD": ("#2962FF", False),
            "ATR": ("#FF6D00", False), "ADX":  ("#B39DDB", False),
            "EMA_200": ("#546E7A", True), "BB_Upper": ("#2962FF", True),
            "BB_Lower": ("#2962FF", True), "BB_Mid": ("#FF6D00", True),
        }
        registered = set()
        for col, (color, overlay) in col_colors.items():
            # Match df['COL'] or df["COL"]
            if re.search(rf"df\[['\"]{re.escape(col)}['\"]\]", rebuilt):
                reg_lines.append(
                    f"indicators.append({{'name': '{col}', 'type': 'line', "
                    f"'color': '{color}', 'overlay': {overlay}}})"
                )
                registered.add(col)

        # Catch any other df['SOMETHING'] assignments not in the map
        for col_match in re.finditer(r"df\[['\"]([\w_]+)['\"]\]\s*=", rebuilt):
            col = col_match.group(1)
            if col in ("Open","High","Low","Close","Volume") or col in registered:
                continue
            overlay = not _is_subpane(col)
            color   = "#546E7A" if overlay else "#6200EA"
            reg_lines.append(
                f"indicators.append({{'name': '{col}', 'type': 'line', "
                f"'color': '{color}', 'overlay': {overlay}}})"
            )
            registered.add(col)

        if "Buy_Signal" in rebuilt:
            reg_lines.append("trades.append({'name': 'Buy_Signal',  'type': 'buy',  'color': '#00E676'})")
        if "Sell_Signal" in rebuilt:
            reg_lines.append("trades.append({'name': 'Sell_Signal', 'type': 'sell', 'color': '#FF1744'})")

        if reg_lines:
            lines.append("")
            lines.extend(reg_lines)

    return "\n".join(lines).strip()



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
        extracted      = auto_fix_missing(extracted)    # inject EMA_200 / registration if absent
        extracted      = auto_fix_overlays(extracted)   # flip wrong overlay: True → False
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

    # Extract primary indicator name for display
    primary_name = "Unknown"
    match = re.search(r"PRIMARY INDICATOR:\s*(.*)", code, re.IGNORECASE)
    if match:
        primary_name = match.group(1).strip().replace("=", "").strip()

    print("\n" + "═" * 62)
    print(f"  ✅  GENERATED: {primary_name}")
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
        f"# Prompt      : {prompt}\n"
        f"# Indicator   : {primary_name}\n"
        f"# Models      : {REASONER_MODEL} → {CODER_MODEL}\n"
        f"# Pre-imported: pd, np, df, indicators=[], trades=[]\n\n"
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