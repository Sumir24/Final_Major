import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import sys
import io
import traceback
import json
import os

app = FastAPI()

# Global Data Cache
_global_df = None
_global_time = None
_global_open = None
_global_high = None
_global_low = None
_global_close = None
_global_volume = None

def load_data():
    global _global_df, _global_time, _global_open, _global_high, _global_low, _global_close, _global_volume
    try:
        base_dir = os.path.dirname(__file__)
        enriched_path = os.path.join(base_dir, '../HISTDATA_COM_ASCII_EURUSD_M12025/enriched_data.csv')
        raw_path = os.path.join(base_dir, '../HISTDATA_COM_ASCII_EURUSD_M12025/DAT_ASCII_EURUSD_M1_2025.csv')
        
        if os.path.exists(enriched_path):
            print(f"Loading enriched data from {enriched_path}...")
            _global_df = pd.read_csv(enriched_path)
            # Ensure Date column is string and has no spaces (in case it was saved that way, though we convert it)
            _global_df['Date'] = _global_df['Date'].astype(str).str.replace(' ', '')
        else:
            print(f"Loading raw data from {raw_path}...")
            _global_df = pd.read_csv(raw_path, delimiter=';', names=['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])
            _global_df['Date'] = _global_df['Date'].astype(str).str.replace(' ', '')
            
        # Pre-extract lists to mirror node.js global state optimizations
        _global_time = _global_df['Date'].tolist()
        _global_open = _global_df['Open'].tolist()
        _global_high = _global_df['High'].tolist()
        _global_low = _global_df['Low'].tolist()
        _global_close = _global_df['Close'].tolist()
        _global_volume = _global_df['Volume'].tolist()
        print("Data loaded and cached successfully.")
    except Exception as e:
        print(f"Error loading global dataset: {e}")

# Load data on startup
@app.on_event("startup")
async def startup_event():
    load_data()

from typing import Optional

class ExecutionRequest(BaseModel):
    code: str
    executionType: str  # 'signal' | 'indicator'
    fileName: Optional[str] = None

@app.post("/execute")
async def execute_python(request: ExecutionRequest):
    global _global_df, _global_time, _global_open, _global_high, _global_low, _global_close, _global_volume
    print(f"[{request.executionType.upper()}] Received execution request from Node server!")
    print(f"Code Length: {len(request.code)} characters")
    
    if _global_df is None:
        raise HTTPException(status_code=500, detail="Data not loaded yet.")

    # Prepare isolated local namespace
    exec_locals = {}

    # Setup Context based on type
    if request.executionType == 'indicator' or request.executionType == 'save_indicator':
        # Need to explicitly check if it's None in case load_data failed
        if _global_df is None:
             raise HTTPException(status_code=500, detail="DataFrame not initialized")
        exec_locals['df'] = _global_df.copy()
        exec_locals['trades'] = []
        exec_locals['indicators'] = []
    else:  # 'signal'
        exec_locals['df'] = _global_df.copy()
        # Aliasing for convenience in signal scripts, derived directly from the dataframe so it stays synced
        exec_locals['time'] = exec_locals['df']['Date'].tolist()
        exec_locals['open'] = exec_locals['df']['Open'].tolist()
        exec_locals['high'] = exec_locals['df']['High'].tolist()
        exec_locals['low'] = exec_locals['df']['Low'].tolist()
        exec_locals['close'] = exec_locals['df']['Close'].tolist()
        exec_locals['volume'] = exec_locals['df']['Volume'].tolist()
        exec_locals['data'] = exec_locals['close']  # Alias
        exec_locals['trades'] = []
        exec_locals['indicators'] = [] # Safely provide both

    user_code = request.code

    # Capture outputs securely (though this is localhost anyway)
    original_stdout = sys.stdout
    sys.stdout = io.StringIO()

    try:
        # Standard lib safe imports
        # Import pd so user script doesn't explicitly have to if they forgot
        exec("import pandas as pd\n" + user_code, exec_locals)
    except Exception as e:
        print(traceback.format_exc()) # Print trackback to stdout buffer to be returned if helpful, but primarily capture it
        return { "error": str(e), "traceback": traceback.format_exc() }
    finally:
        sys.stdout = original_stdout

    # If this was a save request, update the global dataframe
    if request.executionType == 'save_indicator':
        modified_df = exec_locals['df']
        # Identify new columns that were added
        new_cols = [c for c in modified_df.columns if c not in _global_df.columns]
        
        # We only update if there are new columns, or just replace entirely
        _global_df = modified_df.copy()
        
        # We also MUST update the pre-extracted lists because signal execution uses them for speed!
        _global_time = _global_df['Date'].tolist()
        _global_open = _global_df['Open'].tolist()
        _global_high = _global_df['High'].tolist()
        _global_low = _global_df['Low'].tolist()
        _global_close = _global_df['Close'].tolist()
        _global_volume = _global_df['Volume'].tolist()
        
        print(f"Global dataframe updated in memory. New columns added: {new_cols}")
        
        # Export physical file to hard drive
        try:
            base_dir = os.path.dirname(__file__)
            
            # Use custom fileName if provided, otherwise fallback to enriched_data.csv
            if request.fileName:
                # Sanitize the filename to prevent path traversal
                safe_name = "".join([c for c in request.fileName if c.isalpha() or c.isdigit() or c=='_']).strip()
                if not safe_name: safe_name = "export"
                export_name = f"{safe_name}.csv"
            else:
                export_name = "enriched_data.csv"
                
            export_path = os.path.join(base_dir, f'../HISTDATA_COM_ASCII_EURUSD_M12025/{export_name}')
            _global_df.to_csv(export_path, index=False)
            print(f"Physically saved modified dataset to {export_path}")
            csv_saved = True
        except Exception as file_e:
            print(f"Error exporting CSV: {file_e}")
            csv_saved = False
            
        return {
            "status": "success", 
            "new_columns": new_cols,
            "csv_saved": csv_saved,
            "file_name": export_name if 'export_name' in locals() else "enriched_data.csv"
        }

    # Extract Results
    result = {'trades': [], 'indicators': []}
    
    if 'trades' in exec_locals and isinstance(exec_locals['trades'], list):
         result['trades'] = exec_locals['trades']
    
    if 'indicators' in exec_locals and isinstance(exec_locals['indicators'], list):
         result['indicators'] = exec_locals['indicators']

    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

