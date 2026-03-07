import pandas as pd

df = pd.read_csv('E:/Final_Major/HISTDATA_COM_ASCII_EURUSD_M12025/DAT_ASCII_EURUSD_M1_2025.csv', header=None, names=['Date', 'Open', 'High', 'Low', 'Close', 'Volume'], sep=';')
print(f'Total Rows Loaded: {len(df)}')

period = 14
delta = df['Close'].diff()
gain = delta.clip(lower=0)
loss = -delta.clip(upper=0)
avg_gain = gain.rolling(period).mean()
avg_loss = loss.rolling(period).mean()
rs = avg_gain / avg_loss
df['RSI'] = 100 - (100 / (1 + rs))

df['Momentum'] = df['Close'] - df['Close'].shift(5)

df['Volume_MA'] = df['Volume'].rolling(20).mean()
df['Volume_Spike'] = df['Volume'] > df['Volume_MA'] * 1.5

df['Bullish_Candle'] = df['Close'] > df['Open']

print(f"\\n--- INDIVIDUAL CONDITION BREAKDOWN ---")
print(f"Rows with RSI < 30 (Oversold): {len(df[df['RSI'] < 30])}")
print(f"Rows with Positive Momentum  : {len(df[df['Momentum'] > 0])}")
print(f"Rows with Volume Spikes (1.5x) : {len(df[df['Volume_Spike']])}")
print(f"Rows with Bullish (Green) Candles: {len(df[df['Bullish_Candle']])}")

print(f"\\n--- COMPOUND CONDITION BREAKDOWN ---")
step1 = df[df['RSI'] < 30]
print(f"Step 1 (RSI < 30): {len(step1)}")

step2 = df[(df['RSI'] < 30) & (df['Volume_Spike'])]
print(f"Step 2 (Step 1 + Volume Spike): {len(step2)}")

step3 = df[(df['RSI'] < 30) & (df['Volume_Spike']) & (df['Bullish_Candle'])]
print(f"Step 3 (Step 2 + Green Candle): {len(step3)}")

step4 = df[
    (df['RSI'] < 30) &
    (df['Momentum'] > 0) &
    (df['Volume_Spike']) &
    (df['Bullish_Candle'])
]
print(f"Step 4 (Step 3 + Positive Momentum): {len(step4)} <--- THIS IS WHY YOU HAVE 0 TRADES")
