import re

file_path = r'd:\user\Desktop\AI\Antigravity\ChatFoilio\ChatFoilio\portfolio_minimal_schedule.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Split into pages
pages = content.split('<div class="page')

# Page 0 is everything before the first <div class="page
# Page 1 is the cover
# Page 2 is TOC
# ...

for i in range(1, len(pages)):
    # Fix the footer in each page
    # Look for <span>Page \d+</span>
    pattern = r'<span>Page \d+</span>'
    replacement = f'<span>Page {i}</span>'
    pages[i] = re.sub(pattern, replacement, pages[i])

new_content = '<div class="page'.join(pages)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Updated {len(pages)-1} pages.")
