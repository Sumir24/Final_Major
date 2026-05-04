
import re

def count_tags(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple regex for tags
    # Open tags NOT ending in />
    open_tags = re.findall(r'<([a-zA-Z0-9]+)(?:\s+[^>]*?)(?<!/)>', content)
    # Close tags
    close_tags = re.findall(r'</([a-zA-Z0-9]+)>', content)
    # Self-closing tags
    self_closing = re.findall(r'<([a-zA-Z0-9]+)(?:\s+[^>]*?|)/>', content)
    
    print(f"File: {file_path}")
    print(f"Open tags: {len(open_tags)}")
    print(f"Close tags: {len(close_tags)}")
    print(f"Self-closing tags: {len(self_closing)}")
    
    tags = {}
    for t in open_tags:
        tags[t] = tags.get(t, 0) + 1
    for t in close_tags:
        tags[t] = tags.get(t, 0) - 1
        
    print("\nTag Balance (Open - Close):")
    for t, balance in tags.items():
        if balance != 0:
            print(f"  {t}: {balance}")

count_tags('e:/Final_Major/frontend/src/pages/terminal.js')
