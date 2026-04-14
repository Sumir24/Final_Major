import requests
import sys
import io
import re
import ast
import pandas as pd
import numpy as np
import json
from contextlib import redirect_stdout

# Ensure stdout supports UTF-8 for special characters in strategy output
if hasattr(sys.stdout, 'encoding') and sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    import codecs
    try:
        sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    except Exception:
        pass # Fallback in restricted or unusual environments

# =============================================
#  CONFIG
# =============================================
BASE_URL        = "http://127.0.0.1:1234"
CHAT_ENDPOINT   = f"{BASE_URL}/v1/chat/completions"

REASONER_MODEL  = "deepseek-r1-distill-qwen-7b"
CODER_MODEL     = "qwen/qwen2.5-coder-14b"

MAX_RETRIES     = 4
TEMPERATURE     = 0.0

REASONER_TIMEOUT = 300
CODER_TIMEOUT    = 600   # Strategies are bigger — give more room


# =============================================
#  THINK-BLOCK STRIPPING
# =============================================
def strip_think(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"<think>.*$",         "", text, flags=re.DOTALL)
    text = re.sub(r"</think>",           "", text)
    text = re.sub(r"\n{3,}",            "\n\n", text)
    return text.strip()


def extract_spec(raw: str) -> str:
    if "</think>" in raw:
        raw = raw.split("</think>", 1)[1]
    raw = strip_think(raw)
    if len(raw) > 2500:
        raw = raw[:2500] + "\n\n[Spec trimmed — implement all 8 sections]"
    return raw.strip()


# =============================================
#  PROMPTS
# =============================================
REASONER_SYSTEM = """
You are a quantitative trading strategist. Produce a CONCISE mathematical specification for trading strategy logic.
PRIORITY: Your ONLY goal is to define discrete TRADE ENTRY and EXIT points.

[SIGNAL RULES]
1. TRIGGERS ONLY: Signals must be discrete triggers (e.g., crossovers). AVOID STATE-BASED SIGNALS (price > SMA) that trigger on every bar.
2. NO FUTURE PEEKING: Strictly NO use of future data. All calculations must use current or past bars only.
3. DENSITY: Strategies should typically generate 1-30 trades per 300 bars. Avoid signal spam.

Output EXACTLY these 4 sections:
0. STRATEGY NAME        — short descriptive name
1. CORE MATH            — indicators and logic used for signals
2. TRADE ENTRY          — precise conditions for 'Buy_Signal' (Long) and 'Sell_Signal' (Short)
3. TRADE EXIT (RISK)    — price levels for SL/TP or exit-after-N-bars

Mandatory: You MUST define 'Buy_Signal' and 'Sell_Signal' events.
NOTE: For RSI, 70 is overbought (SELL/SHORT), 30 is oversold (BUY/LONG).
Do NOT write code. Focus only on TRADING LOGIC and MATH.
"""


CODER_SYSTEM = """
You are a trading strategy code synthesis engine. Convert the quantitative strategy spec into clean, vectorized Python.

════════════════════════════════════════
 HARD RULES
════════════════════════════════════════
[RULE 1]  NO loops — no for/while, no .apply(), no .itertuples(), no lambda
[RULE 2]  ONLY vectorized ops: .rolling() .ewm() .diff() .shift() .clip() .where() pd.concat() np.where()
[RULE 3]  MANDATORY: Always include `import pandas as pd` and `import numpy as np` at the top of the code.
[RULE 4]  Output ONLY raw Python code between markers. NO markdown backticks inside.
[RULE 5]  Column names must match spec exactly — no trailing spaces, no abbreviation drift.
[RULE 6]  ORGANIZE CODE INTO TWO DISTINCT SECTIONS:
            # --- CALCULATIONS ---          (Indicators & Math)
            # --- TRADE EXPORT ---          (unix_time & trades list population)
[RULE 7]  NEVER assume columns exist — always calculate them from 'Open', 'High', 'Low', 'Close', 'Volume'.
[RULE 8]  TIME & TRADES (Mandatory): 
            1. Calculate df['unix_time'] from df['Date'].
            2. Populate the `trades` list with event objects: [{'time': int, 'type': 'buy'/'sell', 'price': float, 'size': float}, ...]
            3. Populate the `indicators` list with visualization objects: [{'name': str, 'type': str, 'color': str, 'overlay': bool}, ...]
[RULE 9]  No Loops: Population of `trades` MUST use vectorized pattern (zip/comprehension on filtered df). NEVER use `for` loops to append.
[RULE 10] ENTRIES & EXITS: Ensure `Buy_Signal` and `Sell_Signal` are captured as events. 
            Include 'size': 1000 (fixed) or risk-based sizing in each trade object.
            A trade must be closed (e.g. buy then sell) for the UI blotter to show it properly.
[RULE 11] NO FUTURE PEEKING: Strictly NO use of `shift()` with negative values. Use only positive shifts for history.
[RULE 12] DISCRETE TRIGGERS: Always use crossovers for signals: `(A > B) & (A.shift(1) <= B.shift(1))`
[RULE 13] REALISTIC THRESHOLDS: For FX volatility, use decimals like 0.0002 (2 pips), NOT 0.02 (2%) which is too high for M1 charts.

════════════════════════════════════════
 MANDATORY PATTERNS
════════════════════════════════════════

# --- CALCULATIONS ---
_hl = df['High'] - df['Low']
_hc = (df['High'] - df['Close'].shift()).abs()
_lc = (df['Low']  - df['Close'].shift()).abs()
_tr = pd.concat([_hl, _hc, _lc], axis=1).max(axis=1)
df['ATR'] = _tr.rolling(14).mean()

# --- TREND FILTER ---
df['EMA_200'] = df['Close'].ewm(span=200, adjust=False).mean()
bull_regime   = df['Close'] > df['EMA_200']
bear_regime   = df['Close'] < df['EMA_200']

# === STRATEGY: Name ===
EQUITY   = 10_000
SL_MULT  = 1.5
TP_MULT  = 3.0
RISK_PCT = 0.01

# ... indicator calculations ...

long_cond  = (df['RSI'] < 30) & (df['RSI'].shift(1) >= 30)
short_cond = (df['RSI'] > 70) & (df['RSI'].shift(1) <= 70)

df['Long_Entry']  = np.where(long_cond  & bull_regime, df['Close'], np.nan)
df['Short_Entry'] = np.where(short_cond & bear_regime, df['Close'], np.nan)
df['Long_SL']     = df['Close'] - SL_MULT  * df['ATR']
# --- CALCULATIONS ---
# Math and indicators here...

# --- TRADE EXPORT ---
# 1. Initialize Timing (Mandatory)
df['unix_time'] = (pd.to_datetime(df['Date'].astype(str).str.replace(' ', ''), format='%Y%m%d%H%M%S').values.astype('datetime64[s]').astype(np.int64))

# 2. Export Events to 'trades' (Vectorized - NO LOOPS)
buy_events = df[df['Buy_Signal'].notna()]
trades += [{'time': int(t), 'type': 'buy', 'price': float(p), 'size': 1000, 'name': 'RSI Entry'} for t, p in zip(buy_events['unix_time'], buy_events['Buy_Signal'])]

# 3. Export Indicators (Optional)
indicators += [{'name': 'RSI', 'type': 'line', 'color': '#6200EA', 'overlay': False}]

════════════════════════════════════════
 COLORS
════════════════════════════════════════
Price-pane overlays : #2962FF #FF6D00 #00BFA5 #D50000 #546E7A
Sub-pane oscillators: #6200EA #B39DDB #FF6D00
Stop-Loss           : #EF5350
Take-Profit         : #26A69A
Long Entry Signal   : #00E676
Short Entry Signal  : #FF1744

════════════════════════════════════════
 OUTPUT — wrap code exactly like this:
════════════════════════════════════════
# --- START ---
<pure python only — no prose, no markdown inside>
# --- END ---
"""


# =============================================
#  LOW-LEVEL API CALL
# =============================================
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


# =============================================
#  STAGE 1 — REASONER  (DeepSeek-R1)
# =============================================
def reason(user_prompt: str, quiet: bool = False) -> str:
    if not quiet:
        print("  [Stage 1] DeepSeek-R1 designing strategy spec...")
    messages = [
        {"role": "system", "content": REASONER_SYSTEM},
        {"role": "user",   "content": f"Strategy request: {user_prompt}"},
    ]
    raw  = _call(REASONER_MODEL, messages, max_tokens=900, timeout=REASONER_TIMEOUT)
    spec = extract_spec(raw)

    if not spec:
        raise RuntimeError("DeepSeek returned an empty spec after stripping think blocks.")

    if not quiet:
        print(f"  [Stage 1] OK: Spec ready ({len(spec)} chars)")
    return spec


# =============================================
#  STAGE 2 — CODER  (Qwen2.5-Coder)
# =============================================
def code_from_spec(spec: str, user_prompt: str,
                   prev_code: str = "", error: str = "") -> str:
    if prev_code and error:
        user_msg = (
            f"Original request: {user_prompt}\n\n"
            f"Spec:\n{spec}\n\n"
            f"VALIDATION ERROR TO FIX:\n{error}\n\n"
            f"BROKEN CODE:\n{prev_code}\n\n"
            "Fix the error. Remember:\n"
            "- Signals must be crossover-only (single bar)\n"
            "- SL/TP must be price levels\n"
            "- RSI/ATR/MACD/ADX oscillators → overlay: False\n"
            "- indicators and trades lists must be defined before .append()\n"
            "Return corrected code between # --- START --- and # --- END ---."
        )
    else:
        user_msg = (
            f"Strategy request: {user_prompt}\n\n"
            f"Spec:\n{spec}"
        )

    messages = [
        {"role": "system", "content": CODER_SYSTEM},
        {"role": "user",   "content": user_msg},
    ]
    return _call(CODER_MODEL, messages, max_tokens=2500, timeout=CODER_TIMEOUT)


# =============================================
#  CODE EXTRACTION
# =============================================
def extract_code(raw: str) -> str:
    raw = strip_think(raw)

    m = re.search(
        r"#\s*-+\s*START\s*-+\s*(.*?)\s*#\s*-+\s*END\s*-+",
        raw, flags=re.DOTALL | re.IGNORECASE
    )
    if m:
        code = m.group(1).strip()
    else:
        fence = re.search(r"```(?:python)?\s*\n?(.*?)```", raw, flags=re.DOTALL)
        code  = fence.group(1).strip() if fence else raw.strip()

    code = re.sub(r"```(?:python)?", "", code, flags=re.IGNORECASE)
    code = code.replace("```", "").strip()

    lines = code.splitlines()
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# =============================================
#  VALIDATION
# =============================================
SUBPANE_KEYWORDS = {
    "rsi", "macd", "atr", "adx", "stoch", "cci",
    "bb_width", "bb_pct", "volume", "vol", "obv",
    "mfi", "roc", "willr", "momentum", "dmi",
}

def _is_subpane(name: str) -> bool:
    n = name.lower().replace(" ", "_")
    return any(n == kw or n.startswith(kw) or kw in n for kw in SUBPANE_KEYWORDS)


def _parse_appends(code: str) -> list[dict]:
    results = []
    # 1. Look for explicit .append() calls
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
            
    # 2. Look for vectorized list comprehension pattern (+= or = )
    # e.g., trades += [{'time': ..., 'type': 'buy', ...} ...]
    # or trades = [{'time': ..., 'type': 'buy', ...} ...]
    for m in re.finditer(
        r"(indicators|trades)\s*(?:\+?=|:)\s*\[\s*(\{[^}]*\}).*?\]",
        code, re.DOTALL
    ):
        try:
            dict_str = m.group(2)
            # Basic cleanup: if it has zip(...) or for ..., just extract the dict template
            d = ast.literal_eval(dict_str)
            d["_call"] = m.group(1)
            results.append(d)
        except Exception:
            pass
            
    return results


def validate(code: str) -> tuple[bool, str]:
    if not code:
        return False, "Empty output"

    if "df[" not in code:
        return False, "No df[] assignments — looks like prose, not code"

    # Strategy-specific: must have entry signals
    if "Buy_Signal" not in code and "Sell_Signal" not in code and "Long_Entry" not in code:
        return False, "No entry signal columns found (Buy_Signal / Sell_Signal)"

    # Must have unix_time
    if "unix_time" not in code:
        return False, "Missing mandatory df['unix_time'] calculation for chart sync."

    # Must populate trades list
    if not any(x in code for x in ["trades +=", "trades.extend", "trades.append({", "trades = [", "trades=["]):
        return False, "Missing trades list population with event objects."

    # Syntax check
    try:
        compile(code, "<strategy>", "exec")
    except SyntaxError as e:
        return False, f"SyntaxError line {e.lineno}: {e.msg}"

    if ".apply(" in code:
        return False, "Forbidden: .apply() — use vectorized pandas"

    return True, "OK"


# =============================================
#  AUTO-FIX overlay violations
# =============================================
def auto_fix_overlays(code: str) -> str:
    def _fix(m: re.Match) -> str:
        list_name, dict_str = m.group(1), m.group(2)
        try:
            d = ast.literal_eval(dict_str)
        except Exception:
            return m.group(0)
        if (list_name == "indicators"
                and _is_subpane(str(d.get("name", "")))
                and d.get("overlay") is True):
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


# =============================================
#  AUTO-FIX: ensure indicators/trades are defined before first append
# =============================================
def auto_fix_list_init(code: str) -> str:
    """Inject `trades = []` before any usage if missing."""
    usage_tr  = any(x in code for x in ["trades.append", "trades += ", "trades.extend"])
    if usage_tr and "trades = []" not in code:
        return "trades = []\n\n" + code
    return code


# =============================================
#  PREVIEW VALUES
# =============================================
def _preview_values(code: str, strategy_name: str, quiet: bool = False) -> None:
    if not quiet:
        print("  [Preview] Running strategy on synthetic data...")

    np.random.seed(42)
    rows  = 300
    base  = 1.1000
    close = base + np.cumsum(np.random.randn(rows) * 0.001)
    
    # Generate Date strings YYYYMMDDHHMMSS
    dates = pd.date_range(start="2025-01-01", periods=rows, freq="min").strftime("%Y%m%d%H%M%S")
    
    df    = pd.DataFrame({
        "Date":   dates,
        "Open":   close + np.random.randn(rows) * 0.0005,
        "High":   close + np.abs(np.random.randn(rows) * 0.001),
        "Low":    close - np.abs(np.random.randn(rows) * 0.001),
        "Close":  close,
        "Volume": np.random.randint(100, 1000, size=rows),
    })

    namespace = {
        "df": df, "pd": pd, "np": np, 
        "trades": []
    }
    try:
        exec(code, namespace)  # noqa: S102
    except Exception as e:
        if not quiet:
            print(f"  [WARN] Preview exec failed: {e}")
        return

    std_cols = {"Open", "High", "Low", "Close", "Volume"}
    new_cols  = [c for c in df.columns if c not in std_cols and not c.startswith("_")]

    if not new_cols:
        if not quiet:
            print("  [WARN] No new columns detected.")
        return

    if not quiet:
        print("\n" + "-" * 68)
        print(f"  STRATEGY PREVIEW: {strategy_name}")
        print("-" * 68)

    pd.set_option("display.max_columns", None)
    pd.set_option("display.width",       1000)
    pd.set_option("display.precision",   5)

    priority = ["Long_Entry", "Short_Entry", "Long_SL", "Long_TP",
                "Short_SL",  "Short_TP",    "Position_Size", "ATR"]
    display_cols = [c for c in priority if c in new_cols]
    for c in new_cols:
        if c not in display_cols:
            display_cols.append(c)
        if len(display_cols) >= 10:
            break

    print(df[display_cols].dropna(how="all").tail(5).to_string())
    print("─" * 68 + "\n")


# =============================================
#  SIMULATION SETUP HINTS
# =============================================
def _show_ui_setup(spec: str, code: str, quiet: bool = False) -> None:
    if not quiet:
        print("  [UI] Parsing Trade Configuration for Simulation...")

    appends = _parse_appends(code)
    trades_reg  = [e for e in appends if e["_call"] == "trades"]
    indics_reg  = [e for e in appends if e["_call"] == "indicators"]

    print("\n+" + "-" * 66 + "+")
    print("| " + "SIMULATION CONFIGURATION".center(64) + " |")
    print("+" + "-" * 66 + "+")

    if trades_reg or indics_reg:
        if trades_reg:
            print("| TRADE EVENTS:".ljust(67) + "|")
            for tr in trades_reg:
                name = tr.get('name', tr.get('type', 'Signal'))
                row = f"|  {name:<18} type={tr.get('type','?'):<12} {tr.get('color','')}"
                print(row.ljust(67) + "|")
        
        if indics_reg:
            print("| INDICATORS:".ljust(67) + "|")
            for ind in indics_reg:
                name = ind.get('name', 'Indicator')
                row = f"|  {name:<18} overlay={str(ind.get('overlay',False)):<12} {ind.get('color','')}"
                print(row.ljust(67) + "|")
    else:
        print("| No explicit trade/indicator registration found.".ljust(67) + "|")

    print("+" + "-" * 66 + "+\n")


# =============================================
#  DISPLAY
# =============================================
def _display(result: dict, prompt: str, quiet: bool = False) -> None:
    code  = result.get("code",  "")
    spec  = result.get("spec",  "")
    error = result.get("error", "")

    if error and not code:
        if not quiet:
            print(f"\n  [FAIL] Error: {error}")
        return

    strategy_name = "Unknown Strategy"
    m = re.search(r"=+\s*STRATEGY\s*[:\-]?\s*([^\n=]+)", code, re.IGNORECASE)
    if m:
        strategy_name = m.group(1).strip()
    else:
        m2 = re.search(r"0\.\s*STRATEGY\s*NAME\s*[:\-]+(.*)", spec, re.IGNORECASE)
        if m2:
            strategy_name = m2.group(1).strip()

    if not quiet:
        print("\n" + "=" * 68)
        print(f"  [OK] GENERATED STRATEGY: {strategy_name}")
        print("=" * 68)
        print(code)
        print("=" * 68)

        _preview_values(code, strategy_name, quiet=quiet)
        _show_ui_setup(spec, code, quiet=quiet)

        if error:
            print(f"\n  [WARN] Validation note: {error}")


# =============================================
#  MAIN PIPELINE
# =============================================
def generate(user_prompt: str, quiet: bool = False) -> dict:
    """
    Full two-stage pipeline.
    Returns: {'code': str, 'spec': str, 'error': str, 'terminal_log': str}
    """
    f = io.StringIO()
    with redirect_stdout(f):
        print(f"\n{'='*68}")
        print("  STRATEGY PIPELINE START")
        print(f"  Prompt   : {user_prompt}")
        print(f"  Reasoner : {REASONER_MODEL}  (timeout={REASONER_TIMEOUT}s)")
        print(f"  Coder    : {CODER_MODEL}  (timeout={CODER_TIMEOUT}s)")
        print(f"{'='*68}")

        # Stage 1 — DeepSeek designs the strategy spec
        try:
            spec = reason(user_prompt, quiet=False)
        except RuntimeError as e:
            return {
                "code": "", "spec": "", "error": f"Stage 1 failed: {e}",
                "terminal_log": f.getvalue()
            }

        print(f"\n{'-'*68}")
        print("  STRATEGY SPEC (clean, think-blocks removed)")
        print(f"{'-'*68}")
        for line in spec.splitlines():
            print(f"  {line}")
        print(f"{'-'*68}\n")

        # Stage 2 — Qwen codes the strategy
        last_raw, last_error = "", ""
        result_dict = {"code": "", "spec": spec, "error": ""}

        for attempt in range(1, MAX_RETRIES + 1):
            print(f"  [Attempt {attempt}/{MAX_RETRIES}] Qwen2.5-Coder writing strategy code...")
            try:
                raw = code_from_spec(spec, user_prompt, last_raw, last_error)
            except RuntimeError as e:
                print(f"  [FAIL] {e}")
                if attempt == MAX_RETRIES:
                    result_dict["error"] = f"Stage 2 failed: {e}"
                    break
                print("  Retrying...")
                continue

            extracted      = extract_code(raw)
            extracted      = auto_fix_overlays(extracted)
            extracted      = auto_fix_list_init(extracted)
            ok, last_error = validate(extracted)
            last_raw       = extracted

            if ok:
                print(f"  [OK] Valid strategy code produced on attempt {attempt}.\n")
                result_dict["code"] = extracted
                break

            print(f"  [FAIL] Validation: {last_error}")

        if not result_dict["code"] and not result_dict["error"]:
            print(f"\n  [WARN] All {MAX_RETRIES} attempts failed. Returning best code produced.")
            result_dict["code"]  = last_raw
            result_dict["error"] = last_error

        _display(result_dict, user_prompt, quiet=False)

    result_dict["terminal_log"] = f.getvalue()
    if not quiet:
        print(result_dict["terminal_log"])

    return result_dict


# =============================================
#  INTERACTIVE REPL
# =============================================
def interactive():
    print("=" * 68)
    print("  Dual-Model Quantitative STRATEGY Builder")
    print(f"  Reasoner : {REASONER_MODEL}")
    print(f"  Coder    : {CODER_MODEL}")
    print(f"  Endpoint : {CHAT_ENDPOINT}")
    print("=" * 68)
    print("Describe your trading strategy. Type 'quit' to exit.\n")
    print("Examples:")
    print("  > RSI mean-reversion with ATR stop-loss on 1H crypto")
    print("  > MACD crossover trend-following with trailing stop on forex")
    print("  > Bollinger Band squeeze breakout with volume confirmation\n")

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

        result = generate(prompt, quiet=False)
        _display(result, prompt)


# =============================================
#  ENTRY POINT
# =============================================
if __name__ == "__main__":
    if len(sys.argv) > 1:
        use_json = "--json" in sys.argv
        args     = [a for a in sys.argv[1:] if a != "--json"]
        prompt   = " ".join(args)

        if not prompt:
            if use_json:
                print(json.dumps({"error": "No prompt provided", "code": "", "spec": ""}))
            else:
                print("Error: No prompt provided.")
            sys.exit(1)

        result = generate(prompt, quiet=use_json)

        if use_json:
            print(json.dumps(result))
        else:
            print(f"Prompt: {prompt}\n")
            _display(result, prompt, quiet=False)
    else:
        interactive()