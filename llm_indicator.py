import urllib.request
import urllib.error
import json
import sys
import re
import hashlib
import textwrap
import pandas as pd
import numpy as np

# =============================================================================
# CONFIG
# =============================================================================
LLM_API_URL = "http://127.0.0.1:1234/v1/chat/completions"

# Single model for both reasoning AND code generation.
# DeepSeek-R1-Distill-Qwen-7B: chain-of-thought reasoning, 128k context,
# proper instruction following, strong code generation.
# Set this to the exact model ID shown in LM Studio after loading.
DEEPSEEK_MODEL = "deepseek-r1-distill-qwen-7b"

CSV_PATH = r"e:\Final_Major\HISTDATA_COM_ASCII_EURUSD_M12025\DAT_ASCII_EURUSD_M1_2025.csv"

# Token budgets — DeepSeek-R1-7B has 128k context so we can be generous.
REASON_MAX_TOKENS    = 2000
BLUEPRINT_MAX_TOKENS = 2500
CODE_MAX_TOKENS      = 2500
REPAIR_MAX_TOKENS    = 2500

# =============================================================================
# PROMPT NORMALISER
# Translates trading slang and ambiguous terms into precise technical language
# BEFORE the LLM ever sees the prompt. Prevents hallucination at the source.
# =============================================================================

# Each entry: (regex_pattern, replacement_text)
# Applied in order — more specific patterns first.
NORMALISER_RULES = [
    # Direction / action terms
    # Note: replacements do NOT end with 'when' to avoid double-when
    (r'\bfade\s+the\s+move\b',      'take a SELL/SHORT signal (inverse of the condition) when'),
    (r'\bfade\b',                    'take a SELL/SHORT signal (inverse) when'),
    (r'\bshort\s+the\b',            'take a SELL signal when'),
    (r'\bgo\s+long\b',              'take a BUY signal when'),
    (r'\bgo\s+short\b',             'take a SELL signal when'),
    (r'\benter\s+long\b',           'BUY when'),
    (r'\benter\s+short\b',          'SELL when'),
    (r'\bbuy\s+the\s+dip\b',        'BUY when price has pulled back and'),
    (r'\bsell\s+the\s+rally\b',     'SELL when price has risen and'),

    # Candle anatomy
    (r'\blong\s+upper\s+wick\b',    'upper wick greater than 2x body (Wup > 2*Body where Wup=High-max(Close,Open) and Body=abs(Close-Open))'),
    (r'\blong\s+lower\s+wick\b',    'lower wick greater than 2x body (Wlo > 2*Body where Wlo=min(Close,Open)-Low and Body=abs(Close-Open))'),
    (r'\blong\s+wick\b',            'wick greater than 2x body size'),
    (r'\bdoji\b',                    'body less than 10 percent of candle range (abs(Close-Open) < 0.1*(High-Low))'),
    (r'\bpin\s+bar\b',              'lower wick greater than 2x body and upper wick less than body'),
    (r'\bmarubozu\b',               'body greater than 90 percent of candle range'),
    (r'\bbearish\s+engulf\w*\b',    'bearish engulfing: current body covers previous body and Close < Open'),
    (r'\bbullish\s+engulf\w*\b',    'bullish engulfing: current body covers previous body and Close > Open'),
    (r'\bshooting\s+star\b',        'upper wick greater than 2x body and lower wick less than body and Close < Open'),
    (r'\bhammer\b',                  'lower wick greater than 2x body and upper wick less than body and Close > Open'),

    # Market condition terms
    (r'\boverextended\b',           'RSI above 75 or price more than 2 ATR above 20-period EMA'),
    (r'\boverbought\b',             'RSI above 70'),
    (r'\boversold\b',               'RSI below 30'),
    (r'\bsqueez\w*\b',              'Bollinger Band width at 20-bar minimum (BB_w < BB_w.rolling(20).quantile(0.2))'),
    (r'\bhigh\s+volatility\b',      'ATR above 1.5 times its 50-bar average (ATR_14 > ATR_14.rolling(50).mean() * 1.5)'),
    (r'\blow\s+volatility\b',       'ATR below 0.7 times its 50-bar average'),
    (r'\bvolatility\s+spike\b',     'ATR above 2 times its 50-bar average'),
    (r'\bunusually\s+(high\s+)?volume\b', 'volume Z-score above 2.0 (Vol_Z > 2 where Vol_Z=(Volume-Volume.rolling(20).mean())/Volume.rolling(20).std())'),
    (r'\bunusual\s+volume\b',       'volume Z-score above 2.0'),
    (r'\bvolume\s+spike\b',         'relative volume above 2.0 times 20-bar average (RVOL > 2.0)'),
    (r'\bstrong\s+volume\b',        'relative volume above 1.5 times 20-bar average'),

    # Trend terms
    (r'\bgolden\s+cross\b',         'SMA_50 crosses above SMA_200'),
    (r'\bdeath\s+cross\b',          'SMA_50 crosses below SMA_200'),
    (r'\btrend\s+reversal\b',       'EMA slope changes sign'),
    (r'\bmomentum\s+building\b',    'MACD histogram increasing for 3 consecutive bars'),
    (r'\bbreakout\b',               'Close above the highest High of the last 20 bars'),
    (r'\bbreakdown\b',              'Close below the lowest Low of the last 20 bars'),
    (r'\bpullback\b',               'price retracing toward the EMA after trending away'),
    (r'\buptrend\b',                'Close above EMA_50 and EMA_50 slope positive'),
    (r'\bdowntrend\b',              'Close below EMA_50 and EMA_50 slope negative'),
    (r'\brange-?bound\b',           'ATR is low and price between recent high and low'),

    # Session terms
    (r'\blondon\s+open\b',          'Hour between 8 and 12 UTC (London session)'),
    (r'\bnew\s+york\s+open\b',      'Hour between 13 and 17 UTC (New York session)'),
    (r'\basian\s+session\b',        'Hour between 0 and 7 UTC (Asian session)'),
    (r'\bmarket\s+open\b',          'first 30 minutes of London or New York session'),

    # Misc
    (r'\bmoving\s+average\s+cross\w*\b', 'EMA crossover'),
    (r'\b(\d+)\s*[-\s]?ema\b',      r'EMA_\1 (span=\1)'),
    (r'\b(\d+)\s*[-\s]?sma\b',      r'SMA_\1 (window=\1)'),
    (r'\b(\d+)\s*[-\s]?period\s+rsi\b', r'RSI_\1 (window=\1)'),
]


def normalise_prompt(raw_prompt: str) -> tuple:
    """
    Apply normalisation rules to translate trading slang into precise
    technical descriptions before sending to the LLM.
    Avoids double-word artifacts like 'when when'.
    Returns (normalised_prompt, list_of_changes_made).
    """
    text    = raw_prompt.strip()
    changes = []

    for pattern, replacement in NORMALISER_RULES:
        new_text, n = re.subn(pattern, replacement, text, flags=re.IGNORECASE)
        if n > 0:
            changes.append(f"  '{pattern}' -> '{replacement}'")
            text = new_text

    # Fix double 'when when' artifacts from replacements
    text = re.sub(r'\bwhen\s+when\b', 'when', text, flags=re.IGNORECASE)
    # Fix double 'and and' artifacts
    text = re.sub(r'\band\s+and\b', 'and', text, flags=re.IGNORECASE)

    return text, changes


# =============================================================================
# INDICATOR CHEAT-SHEET
# Extended with price action formulas since DeepSeek can use them fully.
# =============================================================================
INDICATOR_CHEATSHEET = """
INDICATOR CHEAT-SHEET (pure pandas/numpy only, 1-min EURUSD)
df columns: Datetime(parsed), Open, High, Low, Close, Volume

TREND
  SMA_W    : df['SMA_W']   = df['Close'].rolling(W, min_periods=W).mean()
  EMA_W    : df['EMA_W']   = df['Close'].ewm(span=W, adjust=False).mean()
  EMA_slope: df['EMA_sl']  = df['EMA_W'].diff(5)/5
  DEMA_W   : e1=df['Close'].ewm(span=W,adjust=False).mean(); e2=e1.ewm(span=W,adjust=False).mean(); df['DEMA_W']=2*e1-e2

MOMENTUM
  RSI_14   : d=df['Close'].diff(); g=d.clip(lower=0).rolling(14).mean(); l=(-d.clip(upper=0)).rolling(14).mean(); df['RSI_14']=100-100/(1+g/l.replace(0,np.nan))
  MACD     : ef=df['Close'].ewm(span=12,adjust=False).mean(); es=df['Close'].ewm(span=26,adjust=False).mean(); df['MACD']=ef-es; df['MACD_sig']=df['MACD'].ewm(span=9,adjust=False).mean(); df['MACD_hist']=df['MACD']-df['MACD_sig']
  Stoch    : lo=df['Low'].rolling(W).min(); hi=df['High'].rolling(W).max(); df['Stoch_K']=100*(df['Close']-lo)/(hi-lo).replace(0,np.nan); df['Stoch_D']=df['Stoch_K'].rolling(3).mean()
  ROC_W    : df['ROC_W']   = df['Close'].pct_change(W)*100
  MOM_W    : df['MOM_W']   = df['Close']-df['Close'].shift(W)

VOLATILITY
  ATR_14   : hl=df['High']-df['Low']; hc=(df['High']-df['Close'].shift()).abs(); lc=(df['Low']-df['Close'].shift()).abs(); df['ATR_14']=pd.concat([hl,hc,lc],axis=1).max(axis=1).rolling(14).mean()
  ATR_avg  : df['ATR_avg'] = df['ATR_14'].rolling(50).mean()
  BB_20    : m=df['Close'].rolling(20).mean(); s=df['Close'].rolling(20).std(); df['BB_up']=m+2*s; df['BB_lo']=m-2*s; df['BB_w']=(df['BB_up']-df['BB_lo'])/m; df['BB_pB']=(df['Close']-df['BB_lo'])/(df['BB_up']-df['BB_lo']).replace(0,np.nan)
  HV_20    : lr=np.log(df['Close']/df['Close'].shift()); df['HV_20']=lr.rolling(20).std()*np.sqrt(252*1440)

VOLUME
  RVOL     : df['RVOL']    = df['Volume']/df['Volume'].rolling(20).mean().replace(0,np.nan)
  Vol_Z    : vm=df['Volume'].rolling(20).mean(); vs=df['Volume'].rolling(20).std().replace(0,np.nan); df['Vol_Z']=(df['Volume']-vm)/vs
  OBV      : df['OBV']     = (np.sign(df['Close'].diff()).fillna(0)*df['Volume']).cumsum()
  VWAP     : df['VWAP']    = (df['Close']*df['Volume']).cumsum()/df['Volume'].cumsum().replace(0,np.nan)

PRICE ACTION (candle anatomy)
  Body     : df['Body']    = (df['Close']-df['Open']).abs()
  Wup      : df['Wup']     = df['High']-df[['Close','Open']].max(axis=1)
  Wlo      : df['Wlo']     = df[['Close','Open']].min(axis=1)-df['Low']
  Crange   : df['Crange']  = df['High']-df['Low']
  Bratio   : df['Bratio']  = df['Body']/df['Crange'].replace(0,np.nan)
  LongWup  : df['LongWup'] = df['Wup'] > 2*df['Body']    (long upper wick signal)
  LongWlo  : df['LongWlo'] = df['Wlo'] > 2*df['Body']    (long lower wick signal)
  Hi_W     : df['Hi_W']    = df['High'].rolling(W).max()
  Lo_W     : df['Lo_W']    = df['Low'].rolling(W).min()

CROSSOVER PATTERN (exact — always use this form):
  cross_up   = (A > B) & (A.shift(1) <= B.shift(1))
  cross_down = (A < B) & (A.shift(1) >= B.shift(1))

NEGATION (for fade/sell/short strategies):
  inverse_signal = ~(condition)    # ~ is pandas negation, NOT 'not' or 'Not'

TIME
  df['Hour']   = df['Datetime'].dt.hour
  df['DOW']    = df['Datetime'].dt.dayofweek
  df['London'] = (df['Hour']>=8)&(df['Hour']<12)
  df['NY']     = (df['Hour']>=13)&(df['Hour']<17)
"""

# =============================================================================
# STEP 1 SYSTEM PROMPT — DeepSeek Reasoning + Blueprint
# DeepSeek-R1 will produce <think>...</think> blocks automatically.
# We ask for plain SECTION: headers which it handles naturally.
# Single call replaces the old FinGPT 1A + 1B split.
# =============================================================================
REASON_SYSTEM = f"""You are a world-class quantitative analyst and Python developer specialising in EURUSD 1-minute bar strategies.

A user describes a trading strategy. You must:
1. Reason deeply about what it means
2. Choose the right indicators
3. Produce an exact implementation blueprint

MARKET CONTEXT:
- Instrument: EURUSD, 1-minute bars
- DataFrame 'df' has columns: Datetime (parsed), Open, High, Low, Close, Volume
- Libraries available: pandas (pd) and numpy (np) ONLY
- No external libs (no ta, talib, pandas_ta, scipy)
- Volume is often zero in this dataset — avoid volume-only strategies

INDICATOR REFERENCE (use these exact formulas):
{INDICATOR_CHEATSHEET}

IMPORTANT RULES FOR CONDITIONS:
- Crossovers: ALWAYS use (A > B) & (A.shift(1) <= B.shift(1)) — never just A > B
- Negation (fade/short/sell): ALWAYS use ~ operator — NEVER write 'not', 'Not', or 'NOT'
- Wick conditions: compute Body and Wup/Wlo columns first, then compare them
- Signal logic: use & for AND, | for OR, ~ for NOT — pure pandas boolean operators only

MANDATORY FORMULAS — YOU MUST USE THESE EXACTLY, DO NOT INVENT ALTERNATIVES:
RSI (14):
  d = df['Close'].diff()
  g = d.clip(lower=0).rolling(14).mean()
  l = (-d.clip(upper=0)).rolling(14).mean()
  df['RSI_14'] = 100 - 100 / (1 + g / l.replace(0, np.nan))

Body (candle body size):
  df['Body'] = (df['Close'] - df['Open']).abs()

Upper wick:
  df['Wup'] = df['High'] - df[['Close', 'Open']].max(axis=1)

Lower wick:
  df['Wlo'] = df[['Close', 'Open']].min(axis=1) - df['Low']

Fill in ALL sections below. Think carefully before writing each one.

SECTION: STRATEGY_TYPE
One word only: momentum, mean_reversion, breakout, volatility, volume, or hybrid

SECTION: REASONING
5-8 sentences:
- What market behaviour this targets and why it should produce an edge
- Which indicators were chosen and why over the alternatives
- Whether RSI/ATR thresholds need adjustment for 1-min EURUSD vs daily
- All NaN risks and how the code should handle them
- Whether this is a BUY signal, SELL signal, or inverse of conditions
- Realistic fire rate estimate as a percentage

SECTION: REQUIRED_INDICATORS
One per line, format: NAME | window | column_name
Include EVERY column referenced in conditions, even intermediate ones like Body, Wup, Wlo.

SECTION: CONDITIONS
One per line, format: ID | exact_pandas_boolean_expression | plain_english_meaning
Rules:
- Use df['col'] syntax always
- Crossover: (df['A'] > df['B']) & (df['A'].shift(1) <= df['B'].shift(1))
- Negation: ~(df['col'] > value)  -- use ~ not 'not'
- Wick: df['Wup'] > 2 * df['Body']
All condition expressions must be complete and runnable as-is.

SECTION: SIGNAL_LOGIC
Exact pandas boolean combination using C1, C2 etc.
Use & for AND, | for OR, ~ for NOT.
Example: C1 & C2
Example for fade: ~C1 & C2  or  ~(C1 & C2)

SECTION: INDICATOR_SPECS
For each required indicator, one block:
  INDICATOR: name
  COLUMN: df['col']
  CODE: <exact pandas — split semicolons onto separate lines>
  NAN_NOTE: <what happens to early rows>

SECTION: CONDITION_SPECS
For each condition, one block:
  ID: C1
  EXPRESSION: <exact pandas boolean expression>
  MEANING: <plain english>

SECTION: CODE_BLUEPRINT
Numbered steps. Each step = one operation. Be exhaustive.
STEP 01: compute Body -> df['Body'] = ...
STEP 02: compute Wup  -> df['Wup']  = ...
...
STEP NN: assemble signal -> df['Vibe_Signal'] = (full_expression).fillna(False)

SECTION: VALIDATION_CONTRACT
REQUIRED_COLUMNS: col1, col2, Vibe_Signal
FIRE_RATE_MIN: X.X
FIRE_RATE_MAX: Y.Y
"""

# =============================================================================
# STEP 2 SYSTEM PROMPT — DeepSeek Code Generation
# Same model, second call. Near-zero temperature for pure transcription.
# =============================================================================
CODE_SYSTEM = """You are a Python code writer for quantitative trading strategies.
You receive a complete blueprint and write clean, executable pandas code.

ENVIRONMENT:
- DataFrame 'df' exists with columns: Datetime, Open, High, Low, Close, Volume
- 'pd' (pandas) and 'np' (numpy) are already imported and available
- Do NOT import anything

ABSOLUTE RULES — violations cause rejection:
1. NO imports of any kind (not even pandas or numpy)
2. NO external libraries (no ta, talib, pandas_ta, scipy)
3. NO .apply() except WMA with raw=True
4. NO loops, NO iterrows(), NO itertuples(), NO function definitions
5. df['Vibe_Signal'] MUST be the last meaningful line, boolean, with .fillna(False)
6. Use .replace([np.inf,-np.inf], np.nan) after every division
7. One comment line above each indicator block
8. Use ~ for negation (NOT 'not' or 'Not')
9. NO PROSE — output executable Python ONLY, zero English explanation sentences

MANDATORY FORMULA — RSI MUST be computed EXACTLY like this, no alternatives:
  d = df['Close'].diff()
  g = d.clip(lower=0).rolling(14).mean()
  l = (-d.clip(upper=0)).rolling(14).mean()
  df['RSI_14'] = 100 - 100 / (1 + g / l.replace(0, np.nan))
DO NOT use diff().abs(), DO NOT use rolling().std(), DO NOT restructure this formula.

MANDATORY FORMULA — Body MUST be computed EXACTLY like this:
  df['Body'] = (df['Close'] - df['Open']).abs()
DO NOT use Close.diff().abs() or Close.abs().diff().

MANDATORY FORMULA — Wup (upper wick) MUST be:
  df['Wup'] = df['High'] - df[['Close', 'Open']].max(axis=1)

Copy CODE lines from the blueprint EXACTLY — do not rewrite or restructure any formula.

SIGNAL LINE FORMAT (mandatory):
df['Vibe_Signal'] = (full_inlined_expression).fillna(False)
- Inline ALL expressions directly — do NOT use C1, C2 as intermediate variables
- Wrong:  C1 = (df['RSI_14'] < 30); df['Vibe_Signal'] = (C1).fillna(False)
- Right:  df['Vibe_Signal'] = (df['RSI_14'] < 30).fillna(False)

End with:
# === Signal Summary ===
# Vibe_Signal is True when: <plain english description>

Output ONLY executable Python code. No markdown. No explanations. No prose.
"""

# =============================================================================
# HELPERS
# =============================================================================

def prompt_fp(text: str) -> str:
    return hashlib.md5(text.encode()).hexdigest()[:8]


def clean_code(text: str) -> str:
    """
    Strip all non-code content from LLM code output.
    Handles DeepSeek-R1's known behaviour of outputting reasoning prose
    before code even when instructed not to, both inside and outside <think> tags.
    """
    # Step 1: Remove explicit <think>...</think> blocks
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)

    # Step 2: Remove markdown fences
    text = re.sub(r'```(?:python)?\s*', '', text)
    text = re.sub(r'```', '', text)

    # Step 3: Remove remaining XML-style tags
    text = re.sub(r'<[^>]+>', '', text)

    # Step 4: Find the first real Python line and discard everything before it.
    # A real Python line starts with:
    #   - df[  (dataframe assignment)
    #   - #    (comment — acceptable as first line)
    #   - a variable name followed by = (e.g. d = , g = , delta = )
    #   - np.  or pd.
    lines      = text.splitlines()
    start_idx  = 0
    code_start = re.compile(
        r'''^\s*(
            df\s*\[           |   # df['col'] = ...
            \#                |   # comment
            [a-zA-Z_]\w*\s*=  |   # var = ...
            np\.              |   # np.something
            pd\.                  # pd.something
        )''', re.VERBOSE
    )
    for i, line in enumerate(lines):
        if code_start.match(line):
            start_idx = i
            break

    lines = lines[start_idx:]

    # Step 5: Line-by-line filter
    skip_starts = ("note:", "here is", "here's", "explanation:", "output:",
                   "this code", "the following", "i'll ", "i will ",
                   "okay,", "ok,", "let's", "let me", "so,", "first,",
                   "next,", "finally,", "putting it", "wait,", "but wait",
                   "actually,", "alternatively,", "so the code")
    clean_lines = []
    for l in lines:
        stripped = l.strip().lower()
        # Strip forbidden import lines
        if re.match(r'^\s*import\s+(pandas|numpy|ta\b|talib|scipy)', l):
            continue
        if re.match(r'^\s*from\s+(pandas|numpy|scipy|ta\b)', l):
            continue
        # Strip prose lines — English sentences that are not Python
        if stripped.startswith(skip_starts):
            continue
        # Strip lines that look like pure English prose (no Python syntax)
        # A line is prose if it has no =, [, (, #, and is longer than 20 chars
        if (len(stripped) > 20
                and not any(c in l for c in ('=', '[', '(', '#', '.'))
                and re.match(r'^[A-Za-z]', stripped)):
            continue
        clean_lines.append(l)

    return '\n'.join(clean_lines).strip()


def clean_text(text: str) -> str:
    """Strip DeepSeek think blocks from non-code LLM output."""
    if not text:
        return text
    # Remove <think>...</think> before parsing sections
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    return text.strip()


def _strip_markdown_table(content: str) -> str:
    """
    Convert markdown table rows AND bullet-list pipe items to plain pipe-separated lines.

    Handles:
      | NAME | WINDOW | COLUMN_NAME |   -> NAME | WINDOW | COLUMN_NAME
      |------|--------|-------------|   -> (skipped)
      - Body | 1 | df['Body']          -> Body | 1 | df['Body']
      * Wup | 1 | df['Wup']           -> Wup | 1 | df['Wup']
      1. RSI_14 | 14 | df['RSI_14']   -> RSI_14 | 14 | df['RSI_14']
    """
    lines  = content.splitlines()
    output = []
    for line in lines:
        stripped = line.strip()

        # Skip markdown separator rows like |---|---|
        if re.match(r'^\|[-| :]+\|$', stripped):
            continue

        # Strip leading bullet/number markers: "- ", "* ", "1. ", "2. " etc.
        cleaned = re.sub(r'^[-*]\s+', '', stripped)
        cleaned = re.sub(r'^\d+\.\s+', '', cleaned)

        # If it's a markdown table row with outer pipes: | cell | cell |
        if cleaned.startswith('|') and cleaned.endswith('|'):
            inner = cleaned[1:-1]
            cells = [c.strip() for c in inner.split('|')]
            # Skip pure header rows (all caps OR known mixed-case header words)
            header_words = {'id', 'name', 'window', 'column', 'column_name',
                            'condition', 'expression', 'meaning', 'indicator',
                            'nan_note', 'code', 'guard', 'type'}
            if (all(re.match(r'^[A-Z_\s]+$', c) for c in cells if c)
                    or all(c.lower().strip() in header_words for c in cells if c)):
                continue
            if cells:
                output.append(' | '.join(cells))

        # If it's a bullet-style pipe-separated line: "Body | 1 | df['Body']"
        elif '|' in cleaned and not cleaned.startswith('#'):
            parts = [p.strip() for p in cleaned.split('|')]
            if len(parts) >= 2 and parts[0]:
                header_words = {'id', 'name', 'window', 'column', 'column_name',
                                'condition', 'expression', 'meaning', 'indicator',
                                'nan_note', 'code', 'guard', 'type'}
                # Skip header rows — all caps OR all known header words
                if (all(re.match(r'^[A-Z_\s]+$', p) for p in parts if p)
                        or all(p.lower().strip() in header_words for p in parts if p)):
                    continue
                output.append(' | '.join(p for p in parts if p != ''))
        else:
            output.append(line)

    return '\n'.join(output)


def _clean_signal_logic(logic: str) -> str:
    """
    Strip trailing pipe artifacts, backticks, empty groups.
    Preserves valid OR combinations like C2 | ~C1.
    """
    if not logic:
        return logic
    logic = logic.strip('`').strip()
    # Remove trailing pipe + empty group: "C1 | (" or "C1 | ()"
    logic = re.sub(r'\s*\|\s*\(?\s*\)?\s*$', '', logic).strip()
    # Remove trailing standalone pipe
    logic = re.sub(r'\s*\|\s*$', '', logic).strip()
    # Take only the first line
    logic = logic.splitlines()[0].strip() if logic else logic
    # Remove markdown bold
    logic = re.sub(r'\*\*(.+?)\*\*', r'\1', logic)
    # Strip trailing | followed by prose (not a C-var, ~ or operator)
    # "C1 | some prose" -> "C1"  but "C2 | ~C1" stays intact
    logic = re.sub(r'\s*\|\s*(?![~C\d\s&|()]).*$', '', logic).strip()
    # Deduplicate C1 & C1 -> C1 (& only, not |)
    parts = re.split(r'(\s*&\s*)', logic)
    seen, dedup = set(), []
    for part in parts:
        clean = part.strip()
        if clean == '&' or clean == '':
            if dedup:
                dedup.append(part)
        elif clean not in seen:
            seen.add(clean)
            dedup.append(part)
    logic = ''.join(dedup).strip().rstrip('&').strip()
    return logic


def extract_tag(text: str, tag: str) -> str | None:
    """
    Four-strategy extractor compatible with DeepSeek, FinGPT, and Qwen output.
    1. XML-style: <tag>...</tag>
    2. Plain SECTION: TAG_NAME headers
    3. Markdown ### SECTION: TAG_NAME headers (DeepSeek uses these)
    4. Bare label fallback
    Post-processes: markdown tables → plain pipe format, strips backticks/pipes from signal_logic.
    """
    if not text:
        return None

    text = clean_text(text)

    # Strategy 1: XML tags
    m = re.search(rf'<{tag}>(.*?)</{tag}>', text, re.DOTALL | re.IGNORECASE)
    if m:
        content = m.group(1).strip()
        return _post_process_section(tag, content)

    # Strategy 2: Plain SECTION: headers (strip surrounding * before matching)
    tag_upper = tag.upper().replace('-', '_').replace(' ', '_')
    # Also matches **SECTION: TAG** by stripping asterisks from the search text
    text_stripped = re.sub(r'\*+', '', text)  # remove all asterisks for matching
    pattern   = (rf'SECTION:\s*{re.escape(tag_upper)}\s*\n'
                 rf'(.*?)'
                 rf'(?=SECTION:\s+[A-Z_]+\s*\n|###\s*SECTION|\Z)')
    m2 = re.search(pattern, text_stripped, re.DOTALL | re.IGNORECASE)
    if m2:
        # Extract same span from original text to preserve formatting
        start_marker = f'SECTION: {tag_upper}'
        orig_idx = text.upper().find(start_marker)
        if orig_idx >= 0:
            # Find content start after the header line
            content_start = text.find('\n', orig_idx)
            if content_start >= 0:
                # Find next SECTION: marker
                next_section = re.search(
                    r'\n\*{0,2}SECTION:\s+[A-Z_]+',
                    text[content_start:], re.IGNORECASE
                )
                end = (content_start + next_section.start()
                       if next_section else len(text))
                content = text[content_start:end].strip()
                return _post_process_section(tag, content)
        content = m2.group(1).strip()
        return _post_process_section(tag, content)

    # Strategy 3: Markdown ### **SECTION: TAG_NAME** headers (DeepSeek R1 style)
    # Matches: ### **SECTION: REQUIRED_INDICATORS**  or  ### SECTION: CONDITIONS
    md_pattern = (rf'###\s*\**\s*SECTION:\s*{re.escape(tag_upper)}\s*\**\s*\n'
                  rf'(.*?)'
                  rf'(?=###\s*\**\s*SECTION:|\Z)')
    m3 = re.search(md_pattern, text, re.DOTALL | re.IGNORECASE)
    if m3:
        content = m3.group(1).strip()
        return _post_process_section(tag, content)

    # Strategy 4: Bare label fallback
    for variant in [tag_upper, tag_upper.replace('_', ' '), tag.upper()]:
        p4 = (rf'^{re.escape(variant)}[:\s]*\n?(.*?)(?=^[A-Z_]{{3,}}[:\s]*\n|\Z)')
        m4 = re.search(p4, text, re.DOTALL | re.MULTILINE | re.IGNORECASE)
        if m4:
            content = m4.group(1).strip()
            if content:
                return _post_process_section(tag, content)

    return None


def _post_process_section(tag: str, content: str) -> str:
    """Apply tag-specific post-processing to extracted section content."""
    if not content:
        return content

    tag_upper = tag.upper().replace('-', '_')

    # Extract single keyword for strategy_type
    if tag_upper == 'STRATEGY_TYPE':
        # Strip markdown formatting and explanations — keep only the type word
        # DeepSeek writes "**Strategy Type:** Momentum\nThis strategy targets..."
        # We want just "momentum"
        content = re.sub(r'\*\*Strategy\s+Type:\*\*\s*', '', content, flags=re.IGNORECASE)
        content = re.sub(r'Strategy\s+Type:\s*', '', content, flags=re.IGNORECASE)
        # Take first non-empty line
        for line in content.splitlines():
            word = line.strip().strip('*').strip()
            if word and len(word) < 50:   # ignore long explanation lines
                content = word
                break
        # Extract just the first word if it's a known type
        known = ['momentum', 'mean_reversion', 'breakout', 'volatility',
                 'volume', 'hybrid', 'sell', 'buy', 'short']
        first_word = content.split()[0].lower().rstrip('/:,') if content.split() else content
        if first_word in known:
            content = first_word

    # Convert markdown tables to plain pipe format for indicator/condition sections
    if tag_upper in ('REQUIRED_INDICATORS', 'CONDITIONS', 'INDICATOR_SPECS',
                     'CONDITION_SPECS'):
        content = _strip_markdown_table(content)

    # Clean signal logic — strip pipes, backticks, take first line only
    if tag_upper == 'SIGNAL_LOGIC':
        # Case 1: backtick-wrapped code block ```python\ndf['Vibe_Signal']=(C1&C2).fillna...```
        code_block = re.search(r'```(?:python)?\s*(.*?)```', content, re.DOTALL)
        if code_block:
            block_content = code_block.group(1)
            cv_match = re.search(r'\(([\s~C\d&|()]+)\)\.fillna', block_content)
            if cv_match:
                content = cv_match.group(1).strip()
            else:
                cv_match2 = re.search(r'(~?\s*C\d+[\s&|~()C\d]*)', block_content)
                content = cv_match2.group(1).strip() if cv_match2 else content
        else:
            # Case 2: inline backtick `C1 & C2`
            m = re.search(r'`([^`]+)`', content)
            if m:
                content = m.group(1)
            else:
                # Case 3: "- Signal = C2 | ~C1" or "Signal = C2 | ~C1" pattern
                sig_eq = re.search(
                    r'[-*]?\s*Signal\s*=\s*([~C\d\s&|()|]+)',
                    content, re.IGNORECASE)
                if sig_eq:
                    content = sig_eq.group(1).strip()
                else:
                    # Case 4: scan all lines for a C-variable combination
                    # Take the first line that contains C\d with & | ~
                    best = None
                    for line in content.splitlines():
                        stripped = line.strip().lstrip('-* ')
                        # Strip "Signal:" or "Logic:" label prefixes
                        stripped = re.sub(
                            r'^(?:Signal|Logic|The\s+final\s+signal[^:]*):?\s*',
                            '', stripped, flags=re.IGNORECASE)
                        # Check if this line looks like C-var logic
                        if re.search(r'~?\s*C\d+', stripped):
                            best = stripped
                            break
                    if best:
                        content = best
                    else:
                        # Last resort: strip all prose prefixes
                        content = re.sub(
                            r'^[-*]\s*(?:Signal|Logic|The\s+final\s+signal[^:]*):?\s*',
                            '', content, flags=re.IGNORECASE | re.MULTILINE)
                        content = content.strip()
        content = _clean_signal_logic(content)

    # Strip markdown bold/italic from all sections
    content = re.sub(r'\*\*(.+?)\*\*', r'\1', content)
    content = re.sub(r'\*(.+?)\*',   r'\1', content)

    # Strip markdown header lines (### ... ) from section content
    content = re.sub(r'^#{1,4}\s+', '', content, flags=re.MULTILINE)

    return content.strip()


def call_llm(model: str, system: str, user: str,
             temp: float, max_tokens: int,
             is_code: bool = False, label: str = "") -> str | None:

    payload = {
        "model":       model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "temperature": temp,
        "max_tokens":  max_tokens,
    }

    lbl        = label or model
    est_tokens = (len(system) + len(user)) // 4
    print(f"\n  [LLM] -> {lbl}  (temp={temp}, max_tokens={max_tokens}, prompt~{est_tokens}tok)")

    try:
        data = json.dumps(payload).encode('utf-8')
        req  = urllib.request.Request(
            LLM_API_URL, data=data,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            if 'choices' in result and result['choices']:
                raw    = result['choices'][0]['message']['content'].strip()
                finish = result['choices'][0].get('finish_reason', '?')
                print(f"  [LLM]    {len(raw)} chars  finish={finish}")
                if not raw.strip():
                    print("  [LLM]    WARNING: model returned empty string")
                    return None
                return clean_code(raw) if is_code else raw
            print("  [LLM] Unexpected response format.")
            return None

    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print(f"  [LLM] HTTP {e.code} {e.reason}: {body[:400]}")
        return None
    except urllib.error.URLError as e:
        print(f"  [LLM] Connection error: {e}")
        return None
    except Exception as e:
        print(f"  [LLM] {type(e).__name__}: {e}")
        return None


def test_connection() -> bool:
    print(f"\n[Connection] Testing {LLM_API_URL.replace('/chat/completions','')} ...")
    try:
        url = LLM_API_URL.replace('/chat/completions', '/models')
        req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data   = json.loads(resp.read().decode('utf-8'))
            models = [m['id'] for m in data.get('data', [])]
            print(f"  Loaded models: {models}")
            found = any(DEEPSEEK_MODEL in mid for mid in models)
            if found:
                print(f"  [OK] '{DEEPSEEK_MODEL}' confirmed.")
            else:
                print(f"  [WARN] '{DEEPSEEK_MODEL}' not found.")
                print(f"  Available: {models}")
                print(f"  Update DEEPSEEK_MODEL at the top of this file to match exactly.")
            return True
    except Exception as e:
        print(f"  [FAIL] {e}")
        return False


# =============================================================================
# STEP 1 — DeepSeek: Deep Reasoning + Full Blueprint
# Single call replaces old FinGPT 1A + 1B.
# =============================================================================

def deepseek_reason(user_prompt: str, normalised_prompt: str) -> dict | None:
    fp = prompt_fp(user_prompt)

    user_msg = textwrap.dedent(f"""
        Original strategy: "{user_prompt}"
        Clarified strategy: "{normalised_prompt}"
        Diversity seed: {fp}

        Think carefully about what this strategy means, then fill in every
        section completely. Be specific about all thresholds and formulas.
        Remember: ~ for negation, never 'not' or 'Not'.
    """).strip()

    raw = call_llm(
        model      = DEEPSEEK_MODEL,
        system     = REASON_SYSTEM,
        user       = user_msg,
        temp       = 0.3,
        max_tokens = REASON_MAX_TOKENS,
        label      = "DeepSeek-Reason"
    )
    if not raw:
        return None

    # Strip think blocks before printing (they can be very long)
    clean = clean_text(raw)

    print(f"\n  [DeepSeek-Reason] Raw output (think blocks stripped):")
    for line in clean.splitlines():
        print(f"    {line}")

    result = {
        'strategy_type':       extract_tag(raw, 'strategy_type')       or _fb_strategy_type(raw),
        'reasoning':           extract_tag(raw, 'reasoning')            or _fb_reasoning(raw),
        'required_indicators': extract_tag(raw, 'required_indicators')  or _fb_indicators(raw),
        'conditions':          extract_tag(raw, 'conditions')           or _fb_conditions(raw),
        'signal_logic':        extract_tag(raw, 'signal_logic')         or _fb_signal_logic(raw),
        'fire_rate_estimate':  extract_tag(raw, 'fire_rate_estimate')   or _fb_fire_rate(raw),
        'indicator_specs':     extract_tag(raw, 'indicator_specs')      or '',
        'condition_specs':     extract_tag(raw, 'condition_specs')      or '',
        'code_blueprint':      extract_tag(raw, 'code_blueprint')       or '',
        'validation_contract': extract_tag(raw, 'validation_contract')  or '',
        'raw':                 raw,
    }

    # Normalise signal_logic — fix 'not', 'Not', 'NOT' → '~'
    result['signal_logic'] = _normalise_signal_logic(result['signal_logic'])

    # Fix condition expressions — same normalisation
    if result['conditions']:
        result['conditions'] = _normalise_conditions(result['conditions'])
        result['conditions'] = _dedup_conditions(result['conditions'])
    if result['condition_specs']:
        result['condition_specs'] = _normalise_conditions(result['condition_specs'])
        result['condition_specs'] = _dedup_conditions(result['condition_specs'])

    # Check completeness
    missing = [k for k in ['reasoning','required_indicators','conditions','signal_logic']
               if not result[k]]
    if missing:
        print(f"  [DeepSeek-Reason] Missing sections: {missing} — retrying at temp=0.1")
        raw2 = call_llm(
            model      = DEEPSEEK_MODEL,
            system     = REASON_SYSTEM,
            user       = user_msg,
            temp       = 0.1,
            max_tokens = REASON_MAX_TOKENS,
            label      = "DeepSeek-Reason-Retry"
        )
        if raw2:
            for k in missing:
                v = extract_tag(raw2, k)
                if not v:
                    v = {'reasoning':_fb_reasoning,'required_indicators':_fb_indicators,
                         'conditions':_fb_conditions,'signal_logic':_fb_signal_logic
                        }.get(k, lambda x: '')(raw2)
                if v:
                    result[k] = v
            result['raw'] = raw2

    # Last resort: synthesise conditions from indicator list
    if not result['conditions'] and result['required_indicators']:
        result['conditions'] = _synthesise_conditions(
            normalised_prompt, result['required_indicators'])
        print("  [DeepSeek-Reason] Conditions synthesised from indicators.")

    if not result['signal_logic'] and result['conditions']:
        ids = re.findall(r'^(C\d+)', result['conditions'], re.MULTILINE)
        result['signal_logic'] = ' & '.join(ids) if ids else 'C1'

    return result


# =============================================================================
# STEP 2 — DeepSeek: Blueprint → Code
# =============================================================================

def deepseek_codegen(reason: dict) -> str | None:
    """
    Sends the full blueprint from Step 1 to DeepSeek for code generation.
    If Step 1 already produced indicator_specs and condition_specs, they
    are passed directly. Otherwise we build from the conditions dict.
    """
    # Build explicit per-indicator code extraction for DeepSeek
    explicit = _build_explicit_blocks(reason)

    user_msg = textwrap.dedent(f"""
        STRATEGY TYPE : {reason['strategy_type']}
        SIGNAL LOGIC  : {reason['signal_logic']}

        ============================================================
        EXPLICIT INDICATOR CODE BLOCKS — COPY EACH LINE EXACTLY
        DO NOT REWRITE, SIMPLIFY OR RESTRUCTURE ANY FORMULA
        ============================================================
        {explicit}

        ============================================================
        INDICATOR SPECS (full detail)
        ============================================================
        {reason.get('indicator_specs') or '[see explicit blocks above]'}

        ============================================================
        CONDITION SPECS
        ============================================================
        {reason.get('condition_specs') or reason.get('conditions', '[missing]')}

        ============================================================
        CODE BLUEPRINT STEPS
        ============================================================
        {reason.get('code_blueprint') or '[derive from indicator and condition specs]'}

        ============================================================
        SIGNAL LOGIC: {reason['signal_logic']}
        Inline all condition expressions directly into the signal line.
        Do NOT use C1, C2 as intermediate Python variables.
        ============================================================

        Write the complete Python code now.
    """).strip()

    return call_llm(
        model      = DEEPSEEK_MODEL,
        system     = CODE_SYSTEM,
        user       = user_msg,
        temp       = 0.05,
        max_tokens = CODE_MAX_TOKENS,
        is_code    = True,
        label      = "DeepSeek-CodeGen"
    )


def deepseek_repair(broken: str, violations: list, reason: dict) -> str | None:
    user_msg = textwrap.dedent(f"""
        The following code has violations that MUST be fixed:

        VIOLATIONS:
        {chr(10).join(f'  [{i+1}] {v}' for i, v in enumerate(violations))}

        BROKEN CODE:
        {broken}

        CORRECT INDICATOR SPECS (ground truth):
        {reason.get('indicator_specs', '')}

        CORRECT CONDITION SPECS (ground truth):
        {reason.get('condition_specs', '') or reason.get('conditions', '')}

        SIGNAL LOGIC: {reason['signal_logic']}

        Fix ALL violations. Return only corrected Python code.
        Remember: inline all expressions, no C1/C2 variables, ~ for negation.
    """).strip()

    return call_llm(
        model      = DEEPSEEK_MODEL,
        system     = CODE_SYSTEM,
        user       = user_msg,
        temp       = 0.05,
        max_tokens = REPAIR_MAX_TOKENS,
        is_code    = True,
        label      = "DeepSeek-Repair"
    )


# =============================================================================
# SIGNAL LOGIC NORMALISER
# Converts prose negation to pandas ~ operator
# =============================================================================

def _normalise_signal_logic(logic: str) -> str:
    if not logic:
        return logic
    # "Not (C1 & C2)" -> "~(C1 & C2)"  -- keep full parenthesised expression
    logic = re.sub(r'\b(?:Not|NOT|not)\s*(\([^)]*(?:\([^)]*\)[^)]*)*\))', r'~\1', logic)
    # "Not C1" -> "~C1"  -- bare C-var
    logic = re.sub(r'\b(?:Not|NOT|not)\s+(C\d+)', r'~\1', logic)
    # Strip only outermost redundant parens that wrap the ENTIRE expression
    # e.g. "(C1 & C2)" -> "C1 & C2"  but "~(C1 & C2)" stays as-is
    m = re.match(r'^\((.+)\)$', logic.strip())
    if m and '~' not in logic[:2]:
        logic = m.group(1)
    return logic.strip()


def _normalise_conditions(text: str) -> str:
    if not text:
        return text
    # Replace 'not df[' with '~df[' in expression fields
    text = re.sub(r'\bnot\s+(df\[)', r'~\1', text, flags=re.IGNORECASE)
    # Replace standalone 'Not' before parentheses
    text = re.sub(r'\bNot\s*\(', '~(', text)
    return text


def _dedup_conditions(text: str) -> str:
    """
    Remove exact duplicate condition lines.
    Handles: C1 | expr | meaning appearing twice → kept once.
    Also strips trailing | artifacts from individual condition lines.
    """
    seen  = set()
    lines = []
    for line in text.splitlines():
        # Strip trailing pipe from markdown table leakage: "C1 | expr | meaning |"
        clean_line = line.rstrip('| ').rstrip()
        # Use the cleaned line as the dedup key
        key = clean_line.strip()
        if key and key not in seen:
            seen.add(key)
            lines.append(clean_line)
        elif not key:
            lines.append(line)   # preserve blank lines
    return '\n'.join(lines)


# =============================================================================
# FALLBACK EXTRACTORS
# =============================================================================

def _fb_strategy_type(text: str) -> str:
    text = clean_text(text).lower()
    for t in ['momentum','mean_reversion','breakout','volatility','volume','hybrid']:
        if t in text:
            return t
    return 'hybrid'


def _fb_reasoning(text: str) -> str:
    text = clean_text(text)
    lines = [l for l in text.splitlines()
             if len(l.strip()) > 40
             and not l.strip().startswith('SECTION')
             and not re.match(r'^(C\d+|NAME|STEP|ID|INDICATOR)\s*[|:]', l.strip())]
    return '\n'.join(lines[:8]).strip()


def _fb_indicators(text: str) -> str:
    text = clean_text(text)
    lines = re.findall(r'[A-Z_]+\s*\|\s*\d+\s*\|[\s\w_]+', text)
    return '\n'.join(lines).strip()


def _fb_conditions(text: str) -> str:
    text = clean_text(text)
    lines = re.findall(r'C\d+\s*\|[^|\n]+\|[^\n]+', text)
    return '\n'.join(lines).strip()


def _fb_signal_logic(text: str) -> str:
    text = clean_text(text)
    # Look for backtick-wrapped logic first: `C1 & C2`
    m = re.search(r'`([^`]+)`', text)
    if m:
        return _clean_signal_logic(m.group(1))
    # Look for C-variable combination pattern
    m2 = re.search(r'(~?\s*C\d+[\s&|~()C\d]*)', text)
    return _clean_signal_logic(_normalise_signal_logic(m2.group(1).strip())) if m2 else ''


def _fb_fire_rate(text: str) -> str:
    text = clean_text(text)
    m = re.search(r'(\d+\.?\d*)\s*%', text)
    return m.group(1) if m else '1.0'


def _synthesise_conditions(prompt: str, indicators_text: str) -> str:
    """Build correct pandas conditions from indicator list + prompt keywords."""
    conditions = []
    cid        = 1
    text_lower = prompt.lower()

    for line in indicators_text.splitlines():
        parts = [p.strip() for p in line.split('|')]
        if len(parts) < 3:
            continue
        name, window_str, col = parts[0].strip(), parts[1].strip(), parts[2].strip()
        try:
            w = int(re.search(r'\d+', window_str).group())
        except (AttributeError, ValueError):
            w = 14

        if 'RSI' in name.upper():
            threshold = 30 if any(k in text_lower for k in ['below','oversold','low','under','buy']) else 70
            op        = '<' if threshold == 30 else '>'
            conditions.append(f"C{cid} | (df['{col}'] {op} {threshold}) | RSI {op} {threshold}")
            cid += 1
        elif any(x in name.upper() for x in ['EMA','SMA','DEMA']):
            if any(k in text_lower for k in ['cross','above','breakout']):
                conditions.append(
                    f"C{cid} | (df['Close'] > df['{col}']) & (df['Close'].shift(1) <= df['{col}'].shift(1)) | Close crosses above {col}")
            else:
                conditions.append(f"C{cid} | (df['Close'] > df['{col}']) | Close above {col}")
            cid += 1
        elif 'ATR' in name.upper():
            conditions.append(
                f"C{cid} | (df['{col}'] > df['{col}'].rolling(50).mean() * 1.5) | ATR spike")
            cid += 1
        elif name.upper() in ('WUP','WICKS','BODY'):
            conditions.append(
                f"C{cid} | (df['Wup'] > 2 * df['Body']) | Long upper wick")
            cid += 1
        elif 'BB' in name.upper():
            conditions.append(
                f"C{cid} | (df['BB_w'] < df['BB_w'].rolling(20).quantile(0.2)) | BB squeeze")
            cid += 1
        elif any(x in name.upper() for x in ['VOL','RVOL']):
            conditions.append(
                f"C{cid} | (df['RVOL'] > 2.0) | Volume spike")
            cid += 1

    return '\n'.join(conditions)


def _build_explicit_blocks(reason: dict) -> str:
    """
    Pre-parse indicator_specs CODE lines so DeepSeek gets unambiguous
    copy-paste blocks — prevents any formula rewriting.
    """
    lines     = []
    ind_specs = reason.get('indicator_specs', '')

    blocks = re.split(r'INDICATOR:', ind_specs)
    for block in blocks:
        if not block.strip():
            continue
        name_m = re.match(r'\s*(\S+)', block)
        col_m  = re.search(r'COLUMN:\s*(.+)', block)
        code_m = re.search(r'CODE:\s*(.+?)(?=NAN_NOTE:|INDICATOR:|\Z)', block, re.DOTALL)
        nan_m  = re.search(r'NAN_NOTE:\s*(.+)', block)

        name     = name_m.group(1).strip()  if name_m  else '?'
        col      = col_m.group(1).strip()   if col_m   else '?'
        code_raw = code_m.group(1).strip()  if code_m  else ''
        nan_note = nan_m.group(1).strip()   if nan_m   else 'NaN possible'

        if not code_raw or name == '?':
            continue

        lines.append(f"INDICATOR BLOCK: {name}")
        lines.append(f"  Output column : {col}")
        lines.append(f"  NaN note      : {nan_note}")
        lines.append(f"  COPY THESE LINES EXACTLY:")
        for stmt in [s.strip() for s in code_raw.split(';') if s.strip()]:
            lines.append(f"    {stmt}")
        lines.append("")

    lines.append("CONDITION EXPRESSIONS TO INLINE:")
    cond_specs = reason.get('condition_specs', '') or reason.get('conditions', '')

    # Parse from condition_specs blocks
    for block in re.split(r'ID:', cond_specs):
        cid_m  = re.match(r'\s*(C\d+)', block)
        expr_m = re.search(r'EXPRESSION:\s*(.+?)(?=GUARD:|MEANING:|ID:|\Z)', block, re.DOTALL)
        mean_m = re.search(r'MEANING:\s*(.+)', block)
        if cid_m:
            cid     = cid_m.group(1).strip()
            expr    = expr_m.group(1).strip() if expr_m else ''
            meaning = mean_m.group(1).strip() if mean_m else ''
            if not expr:
                # Try parsing from conditions format: C1 | expr | meaning
                for cline in cond_specs.splitlines():
                    if cline.startswith(cid + ' |') or cline.startswith(cid + '|'):
                        parts = [p.strip() for p in cline.split('|')]
                        if len(parts) >= 2:
                            expr    = parts[1].strip()
                            meaning = parts[2].strip() if len(parts) > 2 else ''
                        break
            lines.append(f"  {cid}: {expr}  ({meaning})")

    lines.append("")
    lines.append(f"SIGNAL LOGIC: {reason.get('signal_logic','C1')}")
    lines.append(f"FINAL LINE:   df['Vibe_Signal'] = ({reason.get('signal_logic','C1')}).fillna(False)")
    lines.append("NOTE: Expand C1, C2 etc inline — do NOT keep them as Python variables")

    return '\n'.join(lines)


# =============================================================================
# CODE VALIDATOR
# =============================================================================

FORBIDDEN = [
    (r'import\s+ta\b',                     "External lib 'ta'"),
    (r'import\s+talib',                    "External lib 'talib'"),
    (r'pandas_ta',                         "External lib 'pandas_ta'"),
    (r'from\s+scipy',                      "External lib 'scipy'"),
    (r'^\s*import\s+pandas',               "Forbidden: 'import pandas' -- pd already exists"),
    (r'^\s*import\s+numpy',                "Forbidden: 'import numpy' -- np already exists"),
    (r'^\s*from\s+pandas',                 "Forbidden: 'from pandas' import"),
    (r'^\s*from\s+numpy',                  "Forbidden: 'from numpy' import"),
    (r'\.iterrows\s*\(',                   "iterrows()"),
    (r'\.itertuples\s*\(',                 "itertuples()"),
    (r'for\s+\w+\s*,\s*\w+\s+in\s+df\.',  "row for-loop"),
    (r'def\s+\w+\s*\(',                    "function definition"),
    (r'\bNot\s+',                          "Prose 'Not' — use ~ for pandas negation"),
    (r'\bNOT\s+',                          "Prose 'NOT' — use ~ for pandas negation"),
]


def validate_code(code: str, contract: dict) -> list[str]:
    violations = []

    for pattern, msg in FORBIDDEN:
        if re.search(pattern, code, re.MULTILINE):
            violations.append(f"FORBIDDEN: {msg}")

    # apply() check
    n_apply    = len(re.findall(r'\.apply\s*\(', code))
    n_raw_true = len(re.findall(r'\.apply\s*\(.*?raw\s*=\s*True', code, re.DOTALL))
    if n_apply - n_raw_true > 0:
        violations.append(f"FORBIDDEN: {n_apply - n_raw_true} .apply() without raw=True")

    # Detect RSI temp variables used as DataFrame columns — a sign the
    # code generator referenced local variable names as column names.
    # df['d'], df['l'], df['g'] are never real columns — they are RSI intermediates.
    rsi_temp_cols = re.findall(r"df\['([dlg])'\]", code)
    if rsi_temp_cols:
        violations.append(
            f"WRONG REFERENCE: df['{rsi_temp_cols[0]}'] — '{rsi_temp_cols[0]}' is an RSI "
            f"temp variable, not a DataFrame column. RSI must be recomputed from scratch: "
            f"d=diff(); g=clip/rolling; l=clip/rolling; RSI=100-100/(1+g/l)"
        )
    # A line is prose if it starts with a capital letter, has no Python syntax chars,
    # and is longer than 25 chars. We allow up to 2 such lines (comments often start caps).
    prose_lines = []
    for l in code.splitlines():
        s = l.strip()
        if (len(s) > 25
                and re.match(r'^[A-Z][a-z]', s)      # starts with capital word
                and not s.startswith('#')              # not a comment
                and not any(c in s for c in ('=','[','(','.',':'))  # no Python syntax
                and re.search(r'\b(the|is|are|we|so|but|wait|let|okay|this|that|when|since)\b', s, re.I)):
            prose_lines.append(s[:60])
    if len(prose_lines) > 2:
        violations.append(
            f"PROSE IN CODE: {len(prose_lines)} English prose line(s) detected — "
            f"DeepSeek thinking leaked into code output. First: '{prose_lines[0]}'")

    # Signal line checks — accept both same-line and two-line fillna patterns
    if 'Vibe_Signal' not in code:
        violations.append("MISSING: df['Vibe_Signal'] never assigned")
    else:
        # Check for fillna(False) on same line OR on the immediately following line
        lines_list = code.splitlines()
        has_fillna = False
        for idx, line in enumerate(lines_list):
            if 'Vibe_Signal' in line and not line.strip().startswith('#'):
                # Same line check
                if '.fillna(False)' in line:
                    has_fillna = True
                    break
                # Next line check (two-line pattern)
                if idx + 1 < len(lines_list):
                    next_line = lines_list[idx + 1].strip()
                    if ('Vibe_Signal' in next_line or next_line.startswith('.fillna')) \
                            and '.fillna(False)' in next_line:
                        has_fillna = True
                        break
                    # inplace=True variant
                    if 'fillna(False, inplace=True)' in next_line:
                        has_fillna = True
                        break
        if not has_fillna:
            violations.append("MISSING: Vibe_Signal not protected with .fillna(False)")

    # Catch undefined C-variable references
    sig_lines = [l for l in code.splitlines()
                 if 'Vibe_Signal' in l and not l.strip().startswith('#')]
    for sig_line in sig_lines:
        for cnum in re.findall(r'\bC(\d+)\b', sig_line):
            cvar = f'C{cnum}'
            if not re.search(rf'^\s*{cvar}\s*=', code, re.MULTILINE):
                violations.append(
                    f"UNDEFINED: '{cvar}' used in Vibe_Signal but never defined")

    # Catch C-variable lines with truncated/broken expressions
    cvar_lines = [(i+1, l) for i, l in enumerate(code.splitlines())
                  if re.match(r'^\s*C\d+\s*=', l) and not l.strip().startswith('#')]
    for lineno, cl in cvar_lines:
        if not re.search(r'[><=!]', cl):
            violations.append(
                f"BROKEN: C-var line {lineno} has no comparison operator: {cl.strip()[:60]}")
        if cl.count('(') != cl.count(')'):
            violations.append(
                f"BROKEN: C-var line {lineno} has unmatched parentheses: {cl.strip()[:60]}")

    # Minimum substance check
    real_lines = [l for l in code.splitlines()
                  if l.strip() and not l.strip().startswith('#')]
    if len(real_lines) < 4:
        violations.append(
            f"INCOMPLETE: only {len(real_lines)} real lines — model skipped computation")

    # Syntax check
    try:
        compile(code, "<validate>", "exec")
    except SyntaxError as e:
        violations.append(f"SYNTAX ERROR line {e.lineno}: {e.msg} -- {str(e.text).strip()[:80]}")

    # RSI formula checks
    if 'RSI' in code:
        has_correct_rsi = re.search(r'100\s*-\s*100\s*/\s*\(\s*1\s*\+', code)
        has_inverted    = re.search(r'rolling\(\d+\)\.mean\(\)\s*/.*\*\s*100\s*-\s*100', code)
        # DeepSeek's wrong formula: diff().abs().rolling / rolling().std()
        has_wrong_rsi   = re.search(r'diff\(\)\.abs\(\)\.rolling.*mean\(\)\s*/\s*.*rolling.*std\(\)', code)
        if has_inverted and not has_correct_rsi:
            violations.append("WRONG FORMULA: RSI inverted — must use 100 - 100/(1 + gain/loss)")
        if has_wrong_rsi and not has_correct_rsi:
            violations.append(
                "WRONG FORMULA: RSI uses abs(diff)/std — must use gain/loss pattern: "
                "d=diff(); g=d.clip(lower=0).rolling(14).mean(); l=(-d.clip(upper=0)).rolling(14).mean(); RSI=100-100/(1+g/l)")

    # Body formula check — handles both single and double quotes
    if 'Body' in code:
        has_wrong_body   = re.search(
            r'''df\[['"]Body['"]\]\s*=\s*df\[['"]Close['"]\]\s*\.abs\(\)\s*\.diff\(\)''', code)
        has_correct_body = re.search(
            r'''df\[['"]Body['"]\]\s*=\s*\(df\[['"]Close['"]\]\s*-\s*df\[['"]Open['"]\]\)\s*\.abs\(\)''', code)
        if has_wrong_body and not has_correct_body:
            violations.append(
                "WRONG FORMULA: Body = Close.abs().diff() is wrong — must be (Close-Open).abs()")

    # Required columns
    req = contract.get('REQUIRED_COLUMNS', '')
    for col in [c.strip() for c in req.split(',') if c.strip()]:
        if col != 'Vibe_Signal' and col not in code:
            violations.append(f"MISSING COLUMN: '{col}'")

    return violations


CORRECT_FORMULAS = {
    'RSI_14': [
        "d = df['Close'].diff()",
        "g = d.clip(lower=0).rolling(14).mean()",
        "l = (-d.clip(upper=0)).rolling(14).mean()",
        "df['RSI_14'] = 100 - 100 / (1 + g / l.replace(0, np.nan))",
    ],
    'Body': ["df['Body'] = (df['Close'] - df['Open']).abs()"],
    'Wup':  ["df['Wup'] = df['High'] - df[['Close', 'Open']].max(axis=1)"],
    'Wlo':  ["df['Wlo'] = df[['Close', 'Open']].min(axis=1) - df['Low']"],
    'Crange': ["df['Crange'] = df['High'] - df['Low']"],
}


def patch_code(code: str, reason: dict) -> str:
    """
    Rebuilds broken/missing signal line and indicator code from reason dict.
    Uses CORRECT_FORMULAS to override wrong formulas in indicator_specs.
    Handles: prose-in-code, skipped computation, broken signal line, undefined C-vars.
    """
    cond_specs  = reason.get('condition_specs', '') or reason.get('conditions', '')
    ind_specs   = reason.get('indicator_specs', '')
    expressions = {}
    meanings    = []

    # Parse condition expressions from condition_specs blocks
    for block in re.split(r'ID:', cond_specs):
        cid_m  = re.match(r'\s*(C\d+)', block)
        expr_m = re.search(r'EXPRESSION:\s*(.+?)(?=GUARD:|MEANING:|ID:|\Z)', block, re.DOTALL)
        mean_m = re.search(r'MEANING:\s*(.+)', block)
        if cid_m and expr_m:
            expressions[cid_m.group(1).strip()] = expr_m.group(1).strip()
        if cid_m and mean_m:
            meanings.append(mean_m.group(1).strip())

    # Fall back to pipe-separated conditions format: C1 | expr | meaning
    if not expressions:
        for line in cond_specs.splitlines():
            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 3 and re.match(r'^C\d+$', parts[0]):
                expressions[parts[0]] = parts[1]
                meanings.append(parts[2])

    if not expressions:
        print("  [Patcher] No expressions found — cannot patch.")
        return code

    # Build fully-inlined signal expression
    logic      = _normalise_signal_logic(reason.get('signal_logic', ' & '.join(expressions.keys())))
    signal_str = logic
    for cid, expr in expressions.items():
        signal_str = signal_str.replace(cid, f"({expr})")
    new_signal_line = f"df['Vibe_Signal'] = ({signal_str}).fillna(False)"

    # Detect failure patterns that require full rebuild
    real_lines = [l for l in code.splitlines()
                  if l.strip() and not l.strip().startswith('#')]
    has_undefined_cvars = any(
        re.search(rf'\bC\d+\b', l) and not re.search(r'^\s*C\d+\s*=', l)
        for l in real_lines if 'Vibe_Signal' in l
    )
    has_prose = sum(
        1 for l in real_lines
        if len(l.strip()) > 25
        and re.match(r'^[A-Z][a-z]', l.strip())
        and not any(c in l for c in ('=', '[', '(', '.', ':'))
    ) > 2
    # Detect RSI temp variables used as DataFrame columns
    has_rsi_temp_cols = bool(re.search(r"df\['[dlg]'\]|df\[\"[dlg]\"\]", code))

    if has_undefined_cvars or len(real_lines) < 4 or has_prose or has_rsi_temp_cols:
        print("  [Patcher] Full rebuild from blueprint specs.")
        rebuilt = []

        # Determine which columns are referenced in conditions
        needed_cols = set(re.findall(r"df\['(\w+)'\]", ' '.join(expressions.values())))
        # Add prerequisites
        for prereq in ['Body', 'Wup', 'Wlo', 'Crange']:
            if any(prereq in expr for expr in expressions.values()):
                needed_cols.add(prereq)

        written = set()
        # Write known-correct formulas first (dependency order)
        # Always check needed_cols even if ind_specs is empty
        for col in ['Body', 'Wup', 'Wlo', 'Crange', 'RSI_14']:
            if col in needed_cols and col in CORRECT_FORMULAS:
                rebuilt.append(f"# {col}")
                rebuilt.extend(CORRECT_FORMULAS[col])
                rebuilt.append('')
                written.add(col)

        # Also check if RSI-type columns are needed by name pattern
        for col in needed_cols:
            if re.match(r'RSI_\d+', col) and col not in written:
                w = int(re.search(r'\d+', col).group())
                rebuilt.append(f"# RSI_{w}")
                rebuilt.append(f"d = df['Close'].diff()")
                rebuilt.append(f"g = d.clip(lower=0).rolling({w}).mean()")
                rebuilt.append(f"l = (-d.clip(upper=0)).rolling({w}).mean()")
                rebuilt.append(f"df['{col}'] = 100 - 100 / (1 + g / l.replace(0, np.nan))")
                rebuilt.append('')
                written.add(col)

        # Write remaining indicators from indicator_specs
        for block in re.split(r'INDICATOR:', ind_specs):
            code_m = re.search(r'CODE:\s*(.+?)(?=NAN_NOTE:|INDICATOR:|\Z)', block, re.DOTALL)
            name_m = re.match(r'\s*(\S+)', block)
            if not code_m or not name_m:
                continue
            name     = name_m.group(1).strip()
            raw_code = code_m.group(1).strip()
            if not raw_code or name in ('', '?') or name in written:
                continue
            if name in CORRECT_FORMULAS:
                continue  # already written above with correct formula
            rebuilt.append(f"# {name}")
            for stmt in [s.strip() for s in raw_code.split(';') if s.strip()]:
                rebuilt.append(stmt)
            rebuilt.append('')
            written.add(name)

        rebuilt.append(new_signal_line)
        rebuilt.append('# === Signal Summary ===')
        rebuilt.append(f"# Vibe_Signal is True when: {' AND '.join(meanings) or signal_str}")
        print(f"  [Patcher] Rebuilt {len(rebuilt)} lines.")
        return '\n'.join(rebuilt)

    # Partial repair: strip only broken signal/C-var lines, keep indicator code
    clean_lines = []
    for l in code.splitlines():
        s = l.strip()
        if s.startswith('#') and ('Signal Summary' in s or 'Vibe_Signal is True' in s):
            continue
        if 'Vibe_Signal' in l and not s.startswith('#'):
            continue
        if re.match(r'^C\d+\s*=', s):
            continue
        clean_lines.append(l)

    clean_lines += ['', new_signal_line,
                    '# === Signal Summary ===',
                    f"# Vibe_Signal is True when: {' AND '.join(meanings) or signal_str}"]
    print(f"  [Patcher] Rebuilt signal: {new_signal_line}")
    return '\n'.join(clean_lines)


# =============================================================================
# CONTRACT PARSER
# =============================================================================

def parse_contract(text: str) -> dict:
    out = {}
    for line in (text or '').splitlines():
        if ':' in line and not line.strip().startswith('-'):
            k, _, v = line.partition(':')
            # Strip trailing %, leading ~, and whitespace from values
            v_clean = v.strip().lstrip('~').rstrip('%').strip()
            out[k.strip()] = v_clean

    # Normalise decimal fire rates (0.015 means 1.5%)
    for key in ['FIRE_RATE_MIN', 'FIRE_RATE_MAX']:
        if key in out:
            try:
                val = float(out[key])
                if val < 1.0:
                    val = val * 100
                out[key] = str(val)
            except ValueError:
                out[key] = '0.0' if 'MIN' in key else '100.0'

    # Widen range by 10x — fire rate estimates from LLMs are imprecise
    try:
        out['FIRE_RATE_MIN'] = str(max(0.0,  float(out.get('FIRE_RATE_MIN', '0.01')) / 10.0))
        out['FIRE_RATE_MAX'] = str(min(100.0, float(out.get('FIRE_RATE_MAX', '50.0'))  * 10.0))
    except (ValueError, KeyError):
        out['FIRE_RATE_MIN'] = '0.0'
        out['FIRE_RATE_MAX'] = '100.0'

    return out


# =============================================================================
# DATA LOADING
# =============================================================================

def load_data(csv_path: str) -> pd.DataFrame:
    print(f"\n[Data] Loading: {csv_path}")
    df = pd.read_csv(
        csv_path, sep=';', header=None,
        names=['Datetime', 'Open', 'High', 'Low', 'Close', 'Volume']
    )
    df['Datetime'] = pd.to_datetime(df['Datetime'], format='%Y%m%d %H%M%S')
    df = df.sort_values('Datetime').reset_index(drop=True)
    print(f"       {len(df):,} bars  "
          f"({df['Datetime'].iloc[0]}  ->  {df['Datetime'].iloc[-1]})")
    if df['Volume'].sum() < 100:
        print("  [Warn] Volume column is essentially zero.")
    return df


# =============================================================================
# EXECUTION ENGINE
# =============================================================================

def execute_code(code: str, df: pd.DataFrame) -> pd.DataFrame | None:
    scope = {"df": df.copy(), "pd": pd, "np": np}
    try:
        exec(compile(code, "<generated>", "exec"), {**globals(), **scope}, scope)
        return scope.get("df")
    except SyntaxError as e:
        print(f"\n  [Exec] SYNTAX ERROR line {e.lineno}: {e.msg}")
        return None
    except Exception as e:
        print(f"\n  [Exec] RUNTIME ERROR: {type(e).__name__}: {e}")
        return None


def validate_execution(result_df: pd.DataFrame, contract: dict) -> list[str]:
    failures = []
    if 'Vibe_Signal' not in result_df.columns:
        return ["df['Vibe_Signal'] does not exist"]

    sig = result_df['Vibe_Signal'].astype(bool)
    if sig.all():
        failures.append("Vibe_Signal is True on every bar — meaningless")
    if (~sig).all():
        failures.append("Vibe_Signal is False on every bar — never fires")

    inf_cols = [c for c in result_df.select_dtypes(include=[np.number]).columns
                if np.isinf(result_df[c]).any()]
    if inf_cols:
        failures.append(f"Infinite values in: {inf_cols}")

    try:
        pct = 100 * sig.sum() / len(sig)
        lo  = float(contract.get('FIRE_RATE_MIN', 0))
        hi  = float(contract.get('FIRE_RATE_MAX', 100))
        if pct < lo:
            failures.append(f"Fire rate {pct:.2f}% below minimum {lo}%")
        if pct > hi:
            failures.append(f"Fire rate {pct:.2f}% above maximum {hi}%")
    except (ValueError, TypeError):
        pass

    return failures


# =============================================================================
# RESULT REPORTER
# =============================================================================

def report(result_df: pd.DataFrame, original_cols: list, reason: dict):
    sig   = result_df['Vibe_Signal'].astype(bool)
    total = len(result_df)
    fires = int(sig.sum())
    pct   = 100 * fires / total if total else 0

    print(f"\n{'='*65}")
    print("  RESULTS")
    print(f"{'='*65}")
    print(f"  Total bars   : {total:,}")
    print(f"  Signal fires : {fires:,}  ({pct:.3f}%)")
    print(f"  Strategy type: {reason.get('strategy_type','?')}")

    new_cols = [c for c in result_df.columns
                if c not in original_cols and c != 'Datetime']
    print(f"\n  Computed columns ({len(new_cols)}):")
    for col in new_cols:
        s = result_df[col]
        if pd.api.types.is_bool_dtype(s):
            print(f"    {col:35s}  bool   {s.sum():,} True")
        elif pd.api.types.is_numeric_dtype(s):
            print(f"    {col:35s}  float  "
                  f"min={s.min():.5f}  max={s.max():.5f}  "
                  f"nan={s.isna().sum():,}")

    flips   = int(sig.astype(int).diff().abs().sum())
    avg_gap = total / max(flips // 2, 1)
    print(f"\n  Signal diagnostics:")
    print(f"    Flips           : {flips:,}")
    print(f"    Avg bars between: {avg_gap:.1f}")

    if reason.get('reasoning'):
        print(f"\n  Reasoning (excerpt):")
        print(textwrap.indent(reason['reasoning'][:500], "    "))

    view = (['Datetime', 'Close'] +
            [c for c in new_cols if c != 'Vibe_Signal'][-4:] +
            ['Vibe_Signal'])
    view = [c for c in dict.fromkeys(view) if c in result_df.columns]
    rows = result_df[sig][view].tail(10)
    print(f"\n  Last 10 signal rows:")
    print(rows.to_string(index=False) if not rows.empty else "  (none)")


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def run_pipeline(user_prompt: str, csv_path: str, max_repairs: int = 2):

    print("\n" + "="*65)
    print("  VIBE TRADING SYSTEM  --  DeepSeek-R1 Architecture")
    print("="*65)
    print(f"  Prompt : \"{user_prompt}\"")
    print(f"  Model  : {DEEPSEEK_MODEL}")
    print("="*65)

    test_connection()
    df            = load_data(csv_path)
    original_cols = list(df.columns)

    # ── Prompt Normalisation ──────────────────────────────────────────────
    normalised, changes = normalise_prompt(user_prompt)
    if changes:
        print(f"\n[Normaliser] {len(changes)} term(s) translated:")
        for c in changes:
            print(f"  {c}")
        print(f"  Normalised: \"{normalised}\"")
    else:
        print("\n[Normaliser] No slang detected — prompt is already precise.")

    # ── Step 1: DeepSeek Reasoning + Blueprint ────────────────────────────
    print(f"\n{'─'*65}")
    print("  STEP 1 -- DeepSeek: Deep Reasoning + Implementation Blueprint")
    print(f"{'─'*65}")

    reason = deepseek_reason(user_prompt, normalised)
    if not reason:
        print("  Halted — DeepSeek reasoning returned nothing.")
        return

    print(f"\n  Strategy type  : {reason['strategy_type']}")
    print(f"  Fire rate est. : ~{reason['fire_rate_estimate']}%")
    print(f"  Signal logic   : {reason['signal_logic']}")
    print(f"\n  Reasoning:\n{textwrap.indent(reason['reasoning'][:600], '    ')}")
    print(f"\n  Required indicators:\n{textwrap.indent(reason['required_indicators'], '    ')}")
    print(f"\n  Conditions:\n{textwrap.indent(reason['conditions'], '    ')}")

    for sec in ['indicator_specs', 'condition_specs', 'code_blueprint', 'validation_contract']:
        content = reason.get(sec, '')
        if content:
            print(f"\n  -- {sec.upper().replace('_',' ')} --")
            print(textwrap.indent(content, "    "))

    contract = parse_contract(reason.get('validation_contract', ''))

    # ── Step 2: DeepSeek Code Generation ─────────────────────────────────
    print(f"\n{'─'*65}")
    print("  STEP 2 -- DeepSeek: Code Generation")
    print(f"{'─'*65}")

    code = deepseek_codegen(reason)
    if not code:
        print("  Halted — DeepSeek code generation returned nothing.")
        return

    # Validate + repair loop
    for attempt in range(max_repairs + 1):
        violations = validate_code(code, contract)
        if not violations:
            print(f"\n  [Validate] Clean (pass {attempt+1}).")
            break

        print(f"\n  [Validate] Pass {attempt+1} -- {len(violations)} violation(s):")
        for v in violations:
            print(f"    x {v}")

        # Check if violations are patchable
        patchable_kws  = ('Vibe_Signal', 'BROKEN', 'SYNTAX ERROR', 'UNDEFINED',
                          'INCOMPLETE', 'WRONG REFERENCE', 'WRONG FORMULA',
                          'PROSE IN CODE', 'MISSING: Vibe_Signal')
        has_syntax     = any('SYNTAX ERROR' in v for v in violations)
        has_broken     = any(any(k in v for k in ('BROKEN','UNDEFINED','INCOMPLETE',
                                                   'WRONG REFERENCE','WRONG FORMULA',
                                                   'PROSE IN CODE',
                                                   'MISSING: Vibe_Signal')) for v in violations)
        only_patchable = all(any(k in v for k in patchable_kws) for v in violations)

        # On first pass with syntax/broken issues, go straight to patcher
        if attempt == 0 and (has_syntax or has_broken) and only_patchable:
            print(f"\n  [Patcher] Patchable violations on first pass — skipping repair, patching directly.")
            code = patch_code(code, reason)
            final_v = validate_code(code, contract)
            if not final_v:
                print("  [Patcher] Clean after patching.")
            else:
                print(f"  [Patcher] {len(final_v)} violation(s) remain after patching.")
                for v in final_v:
                    print(f"    x {v}")
            break

        if attempt < max_repairs:
            code = deepseek_repair(code, violations, reason)
            if not code:
                print("  Repair returned nothing — stopping.")
                return
        else:
            # Exhausted repairs — try patcher for patchable violations
            patchable   = [v for v in violations if any(k in v for k in patchable_kws)]
            fundamental = [v for v in violations if not any(k in v for k in patchable_kws)]
            if patchable:
                print(f"\n  [Patcher] Applying patcher for {len(patchable)} patchable violation(s).")
                code = patch_code(code, reason)
                final_v = validate_code(code, contract)
                if not final_v:
                    print("  [Patcher] Clean after patching.")
                else:
                    print(f"  [Patcher] {len(final_v)} violation(s) remain.")
            if fundamental:
                print(f"  [Validate] {len(fundamental)} fundamental violation(s) — proceeding anyway.")

    # Print final code
    print(f"\n  -- FINAL GENERATED CODE --")
    for i, line in enumerate(code.splitlines(), 1):
        print(f"  {i:4d} | {line}")

    # ── Step 3: Execute ───────────────────────────────────────────────────
    print(f"\n{'─'*65}")
    print("  STEP 3 -- Execution")
    print(f"{'─'*65}")

    result_df = execute_code(code, df)
    if result_df is None:
        print("  Execution failed.")
        return

    # Emergency patch if Vibe_Signal still missing
    if 'Vibe_Signal' not in result_df.columns:
        print("  [Emergency] Vibe_Signal missing — applying emergency patch.")
        patched   = patch_code(code, reason)
        result_df = execute_code(patched, df)
        if result_df is None or 'Vibe_Signal' not in result_df.columns:
            print("  Emergency patch failed. Halting.")
            return
        code = patched

    exec_failures = validate_execution(result_df, contract)
    if exec_failures:
        print(f"\n  [Post-Exec] {len(exec_failures)} issue(s):")
        for f in exec_failures:
            print(f"    x {f}")
    else:
        print("\n  [Post-Exec] All checks passed.")

    report(result_df, original_cols, reason)


# =============================================================================
# ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    prompt = (" ".join(sys.argv[1:]) if len(sys.argv) > 1
              else "Buy when RSI is below 30 and price crosses above the 50 EMA")

    run_pipeline(
        user_prompt = prompt,
        csv_path    = CSV_PATH,
        max_repairs = 2,
    )
