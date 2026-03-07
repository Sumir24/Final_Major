import urllib.request
import urllib.error
import json
import sys

def generate_indicator_code(prompt=""):
    url = "http://127.0.0.1:1234/v1/chat/completions"
    model = "qwen2.5-coder-1.5b-instruct"
    
    # Instructions extracted from frontend/src/pages/IndicatorBuilder.js
    system_prompt = """You are an expert Python Quantitative Developer writing code for a trading platform. 
Your task is to write Pandas code to calculate a technical indicator based on the user's request.

Follow these exactly instructions:
# 1. THE DATA (df):
#    A dataframe named 'df' is automatically loaded with Date, Open, High, Low, Close, Volume.
#    A 'Datetime' column is also pre-calculated for you.
# 
# 2. DO YOUR MATH:
#    Create your new indicator columns based on the 'df' dataframe.

Constraints:
- Output ONLY valid Python code. NO markdown formatting blocks like ```python. NO explanatory text before or after.
- Put configuration variables (like window settings) at the top of your code snippet.
- Do NOT import pandas or redefine 'df'. Assume it already exists.

Example for Bollinger Bands:
window = 20
std_dev = 2.0

df['SMA'] = df['Close'].rolling(window=window).mean()
df['STD'] = df['Close'].rolling(window=window).std()
df['Upper'] = df['SMA'] + (df['STD'] * std_dev)
df['Lower'] = df['SMA'] - (df['STD'] * std_dev)
"""

    if not prompt:
        prompt = input("\nEnter the indicator you want to generate (e.g., 'RSI 14 period' or 'MACD'): ")
        if not prompt.strip():
            print("No prompt provided. Exiting.")
            return

    user_message = f"Write the python Pandas logic for: {prompt}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.1,
        "max_tokens": 1000
    }

    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
        
        print(f"\nCalling LLM API at {url} with model: '{model}'")
        print("Waiting for response...\n")
        
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            
            if 'choices' in result and len(result['choices']) > 0:
                generated_code = result['choices'][0]['message']['content']
                print("="*50)
                print("GENERATED INDICATOR CODE:")
                print("="*50)
                # Removing any leading/trailing markdown code blocks if the LLM outputted them despite instructions
                clean_code = generated_code.strip()
                if clean_code.startswith("```python"):
                    clean_code = clean_code[9:]
                elif clean_code.startswith("```"):
                    clean_code = clean_code[3:]
                if clean_code.endswith("```"):
                    clean_code = clean_code[:-3]
                if not clean_code.strip():
                    print("\nWARNING: The model returned an empty response.")
                    print(f"This is common with highly specialized models like '{model}' (FinGPT).")
                    print("These models are often fine-tuned for specific tasks (like sentiment analysis) and do not know how to generate code.")
                    print("\nACTION REQUIRED: Please load a general-purpose coding model like 'Llama-3-8B-Instruct', 'CodeLlama', 'DeepSeek-Coder', or 'Mistral-Instruct' in LM Studio and try again.")
                    print("="*50)
                    return ""
                
                print(clean_code.strip())
                print("="*50)
                return clean_code
            else:
                print("Error: Unexpected response format from API.")
                print(result)
                
    except urllib.error.URLError as e:
        print(f"Failed to connect to the API. Is your LLM server running on {url}?")
        print(f"Error detail: {e}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    initial_prompt = ""
    if len(sys.argv) > 1:
        initial_prompt = " ".join(sys.argv[1:])
    
    generate_indicator_code(initial_prompt)
