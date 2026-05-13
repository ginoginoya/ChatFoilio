import re

file_path = r'd:\user\Desktop\AI\Antigravity\ChatFoilio\ChatFoilio\portfolio_minimal_schedule.html'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# We know the specific lines from Select-String output
# Note: Line numbers in Select-String are 1-indexed.
# Lines: 891, 973, 1037, 1077
lines[891-1] = lines[891-1].replace('Page 11', 'Page 8')
lines[973-1] = lines[973-1].replace('Page 11', 'Page 9')
lines[1037-1] = lines[1037-1].replace('Page 11', 'Page 10')
# lines[1077-1] is already Page 11, leave it.

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Numbering corrected.")
