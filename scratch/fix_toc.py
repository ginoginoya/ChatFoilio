import re

file_path = r'd:\user\Desktop\AI\Antigravity\ChatFoilio\ChatFoilio\portfolio_minimal_schedule.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix TOC for MinimalSchedule (Project 3)
# 02: P.7 -> P.8
content = content.replace('02 ???????收納?算?</span><span class="toc-dots"></span><span>P.7</span>', 
                          '02 ???????收納?算?</span><span class="toc-dots"></span><span>P.8</span>')
# 03-1: P.8 -> P.9
content = content.replace('03-1 介面設???主?系統</span><span class="toc-dots"></span><span>P.8</span>', 
                          '03-1 介面設???主?系統</span><span class="toc-dots"></span><span>P.9</span>')
# 03-2: P.9 -> P.10
content = content.replace('03-2 ??互動??</span><span class="toc-dots"></span><span>P.9</span>', 
                          '03-2 ??互動??</span><span class="toc-dots"></span><span>P.10</span>')

# Note: Using generic placeholders for Chinese characters as the tool might mangle them.
# Let's try to match by P.X patterns specifically in the TOC area.

# Actually, I'll just use line numbers for the TOC fix.
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Based on Select-String:
# 501: 01 P.7 (OK)
# 503: 02 P.7 -> P.8
# 505: 03-1 P.8 -> P.9
# 507: 03-2 P.9 -> P.10 (Guessing line 507)

lines[503-1] = lines[503-1].replace('P.7', 'P.8')
lines[505-1] = lines[505-1].replace('P.8', 'P.9')
# Let's find 03-2 and 04 in the TOC
for i in range(500, 520):
    if '03-2' in lines[i]:
        lines[i] = lines[i].replace('P.9', 'P.10')
    if '04' in lines[i] and 'P.10' in lines[i]:
        lines[i] = lines[i].replace('P.10', 'P.11')

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("TOC corrected.")
