import urllib.request
import urllib.error
import json
import sys
import pandas as pd
import numpy as np

LLM_API_URL = "http://127.0.0.1:1234/v1/chat/completions"

# Change these to match the exact model names loaded in your local server (e.g., LM Studio)
# If you are only running one model at a time, you will need to swap models back and forth, 
# or use a setup that allows multiple concurrent models.
FINGPT_MODEL = "fingpt-mt-llama-3-8b-lora"
QWEN_MODEL = "qwen2.5-coder-1.5b-instruct"

def call_llm(model_name, system_prompt, user_message, temp=0.1):
    payload = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": temp,
        "max_tokens": 1000
    }
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(LLM_API_URL, data=data, headers={'Content-Type': 'application/json'})
        
        print(f"\n[API Call] Querying {model_name}...")
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            if 'choices' in result and len(result['choices']) > 0:
                raw_response = result['choices'][0]['message']['content'].strip()
                
                # Clean up markdown code blocks if the LLM outputted them despite instructions
                if raw_response.startswith("```json"):
                    raw_response = raw_response[7:]
                elif raw_response.startswith("```python"):
                    raw_response = raw_response[9:]
                elif raw_response.startswith("```"):
                    raw_response = raw_response[3:]
                
                if raw_response.endswith("```"):
                    raw_response = raw_response[:-3]
                
                return raw_response.strip()
            else:
                print("Error: Unexpected response format from API.")
                return None
                
    except urllib.error.URLError as e:
        print(f"Failed to connect. Is your LLM server running on {LLM_API_URL}?")
        print(f"Error detail: {e}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

def query_fingpt(user_prompt, context):
    system_prompt = f"""You are a strict financial logic parser. 
A user will provide a custom trading strategy prompt. 
Translate this prompt into a strict JSON syntax tree representing the exact quantitative logic requested by the user. DO NOT invent conditions that the user did not ask for.

Context / Available Data:
- Allowed Columns in Data: {context.get('columns', [])}
- Built-in capabilities: math logic, standard indicators (SMA, EMA, RSI, MACD, ATR, Bollinger, Volume)

You must return ONLY valid JSON.
Format required:
{{
  "isValid": true,
  "logic_summary": "Short explanation of how you mapped the user's custom prompt to math.",
  "strategy": {{
     "condition_1": {{ "description": "...", "metric": "...", "operator": "...", "threshold": "..." }},
     "condition_2": {{ "description": "...", "metric": "...", "operator": "...", "threshold": "..." }}
  }}
}}
"""
    return call_llm(FINGPT_MODEL, system_prompt, user_prompt, temp=0.1)

def query_qwen(json_logic, context):
    system_prompt = f"""You are an expert Python Quantitative Developer.
Your task is to take a structured JSON logic tree (which translates a user's custom prompt) and write a pure Pandas script that implements it exactly.

Instructions:
1. 'df' is a Pandas DataFrame already provided in the local scope with proper capitalized columns: {context.get('columns', [])}.
2. Return ONLY executable Python code. NO markdown formatting blocks like ```python. NO explanatory text before or after.
3. You must use pure pandas math (like `df['Close'].rolling(window=20).mean()`). You also have numpy available as `np`. DO NOT import external libraries.
4. DO NOT redefine 'df'. Assume it already exists.
5. Calculate ONLY the indicators required by the custom JSON logic using the exact capitalized column names (e.g., 'Volume' not 'volume').
6. Combine the conditions logic to exactly match the user's intent.
7. Create a new boolean column in 'df' named 'Vibe_Signal' which is True when ALL conditions in the logic are met, otherwise False.

Example expected output structure:
# Calculate indicators required by custom logic using pure pandas
df['SMA_Volume_20'] = df['Volume'].rolling(window=20).mean()

# Create conditions based exactly on JSON tree
condition_1 = df['Volume'] > (df['SMA_Volume_20'] * 2) 
condition_2 = df['Close'] > df['Open']

# Final signal combining the user's custom conditions
df['Vibe_Signal'] = condition_1 & condition_2
"""
    user_message = f"Write the Python Pandas logic for this JSON tree:\n{json_logic}"
    return call_llm(QWEN_MODEL, system_prompt, user_message, temp=0.1)

def load_market_data():
    """Loads real user market data instead of dummy data."""
    csv_path = r"e:\Final_Major\HISTDATA_COM_ASCII_EURUSD_M12025\DAT_ASCII_EURUSD_M1_2025.csv"
    print(f"[Data] Loading real market data from: {csv_path}")
    
    # Load the CSV. The format is: YYYYMMDD HHMMSS;open;high;low;close;volume
    df = pd.read_csv(
        csv_path, 
        sep=';', 
        header=None, 
        names=['Datetime', 'Open', 'High', 'Low', 'Close', 'Volume']
    )
    
    # Convert 'Datetime' string (e.g., '20250101 170000') into proper pandas datetime objects
    df['Datetime'] = pd.to_datetime(df['Datetime'], format='%Y%m%d %H%M%S')
    
    print(f"       Loaded {len(df)} rows of 1-minute data successfully.")
    return df

def run_vibe_pipeline(user_prompt):
    print("="*60)
    print(f"VIBE PROMPT: '{user_prompt}'")
    print("="*60)

    # 1. Load Data First
    df = load_market_data()

    # 2. Setup Context Dictionary Dynamically (Grounding)
    valid_columns = []
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col in df.columns:
            # Check if volume is essentially empty
            if col == "Volume" and df[col].sum() < 100:
                print("\n[Context Warning] 'Volume' column is mostly empty or zero. Removing it from LLM context to prevent hallucinations.")
                continue
            valid_columns.append(col)

    context = {
        "columns": valid_columns,
        "indicators": ["SMA", "EMA", "RSI", "MACD", "ATR", "Bollinger Bands"]
    }

    # 2. Query FinGPT for Math Logic
    print("\n[Step 1] Asking FinGPT to parse the 'vibes' into math logic...")
    fingpt_json = query_fingpt(user_prompt, context)
    
    if not fingpt_json:
        print("Pipeline stopped - FinGPT failed to return logic.")
        return

    print("\n--- FinGPT Output (JSON Logic Tree) ---")
    print(fingpt_json)
    
    # 3. Query Qwen for Python Syntx
    print("\n[Step 2] Asking Qwen Coder to write the Pandas Script based on JSON...")
    qwen_code = query_qwen(fingpt_json, context)

    if not qwen_code:
        print("Pipeline stopped - Qwen failed to return code.")
        return

    print("\n--- Qwen Code Output (Executable Python) ---")
    print(qwen_code)
    print("--------------------------------------------")

    # 4. Safe Local Execution Engine
    print("\n[Step 3] Executing Qwen's code locally against DataFrame...")

    # Isolate variables for exec() to be safe. It has access to df, pd, np.
    local_scope = {
        "df": df, 
        "pd": pd, 
        "np": np
    }
    
    try:
        # Run Qwen's code inside local_scope, providing globals() so lambdas can find np
        exec(qwen_code, globals(), local_scope)
        
        # The modified df remains in local_scope
        modified_df = local_scope.get("df")
        
        if 'Vibe_Signal' in modified_df.columns:
            print(f"\nSUCCESS! Vibe_Signal column generated. Data shape: {modified_df.shape}")
            print("\nPreview of the tail (last 5 rows):")
            
            # Print relevant columns to keep terminal output clean
            view_cols = ['Datetime', 'Close', 'Volume', 'Vibe_Signal']
            new_cols = [c for c in modified_df.columns if c not in context["columns"] and c not in view_cols and c != "Datetime"]
            view_cols.extend(new_cols)
            
            print(modified_df[view_cols].tail())
            
            # Count triggers
            # convert to bool just in case its numeric (1/0)
            triggers = modified_df['Vibe_Signal'].astype(bool).sum()
            print(f"\n=> Vibe mapping triggered {triggers} times out of {len(modified_df)} historical bars.")
            
        else:
            print("\nERROR: Qwen script ran cleanly but did not generate a 'Vibe_Signal' column!")

    except Exception as e:
        print(f"\nERROR: Generated code failed during execution.")
        print(f"Exception: {e}")

if __name__ == "__main__":
    initial_prompt = "Buy when volume is unusually big and we are experiencing high volatility"
    if len(sys.argv) > 1:
        initial_prompt = " ".join(sys.argv[1:])
    
    run_vibe_pipeline(initial_prompt)
