import re

file_path = r'd:\user\Desktop\AI\Antigravity\ChatFoilio\ChatFoilio\portfolio_minimal_schedule.html'

with open(file_path, 'rb') as f:
    content = f.read().decode('utf-8', errors='ignore')

# 1. Fix the TOC for MinimalSchedule (Project 3)
content = content.replace('<span>P.7</span></li>\r\n            <li class="toc-item sub"><span>02', '<span>P.7</span></li>\r\n            <li class="toc-item sub"><span>02') # 01 is P.7, correct.
content = content.replace('02 ??亮?：象?判定??收納?算?</span><span class="toc-dots"></span><span>P.7</span>', 
                          '02 ??亮?：象?判定??收納?算?</span><span class="toc-dots"></span><span>P.8</span>')
content = content.replace('03-1 介面設???主?系統</span><span class="toc-dots"></span><span>P.8</span>', 
                          '03-1 介面設???主?系統</span><span class="toc-dots"></span><span>P.9</span>')
content = content.replace('03-2 ??互???</span><span class="toc-dots"></span><span>P.9</span>', 
                          '03-2 ??互???</span><span class="toc-dots"></span><span>P.10</span>')

# 2. Fix the page footers and comments in MinimalSchedule section
# We know where it starts.
# Page 7 is correct for the first page.
# The second 'Page 7' should be 'Page 8'.
# Then 8 -> 9, 9 -> 10, 10 -> 11.

# Use a specific enough replacement to avoid touching ChatFolio (which ends at Page 6).
content = content.replace('<!-- ?面 4：核心亮?(02) -->', '<!-- ?面 8：核心亮?(02) -->')
content = content.replace('<span>Page 7</span>\r\n        </footer>\r\n    </div>\r\n\r\n    <!-- ?面 4：核心亮?(02) -->', 
                          '<span>Page 7</span>\r\n        </footer>\r\n    </div>\r\n\r\n    <!-- ?面 8：核心亮?(02) -->')

# Actually, let's just do sequential replacement of Page 7, 8, 9, 10 footers after line 400.
# No, let's be more precise.

# Fix the '??' arrows to '→'
content = content.replace('color: var(--primary-blue);">??/div>', 'color: var(--primary-blue);">→</div>')

# Fix the page footers for MinimalSchedule
# 02 (Page 7 -> Page 8)
content = content.replace('02 ??亮?：象?判定??收納?算?</h3>', '02 ??亮?：象?判定??收納?算?</h3>', 1)
# Find the second Page 7
parts = content.split('<span>Page 7</span>')
if len(parts) > 2:
    content = parts[0] + '<span>Page 7</span>' + parts[1] + '<span>Page 8</span>' + '<span>Page 7</span>'.join(parts[2:])

# 03-1 (Page 8 -> Page 9)
content = content.replace('<span>Page 8</span>', '<span>Page 9</span>')
# 03-2 (Page 9 -> Page 10)
content = content.replace('<span>Page 9</span>', '<span>Page 10</span>')
# 04 (Page 10 -> Page 11)
content = content.replace('<span>Page 10</span>', '<span>Page 11</span>')

# Fix comments numbering too
content = content.replace('<!-- ?面 6：??? 專?簡? (01) -->', '<!-- ?面 7：??? 專?簡? (01) -->')
content = content.replace('<!-- ?面 4：核心亮?(02) -->', '<!-- ?面 8：核心亮?(02) -->')
content = content.replace('<!-- ?面 5：??設計?多主題系?(03-1) -->', '<!-- ?面 9：??設計?多主題系?(03-1) -->')
content = content.replace('<!-- ?面 6：置??????(03-2) -->', '<!-- ?面 10：置??????(03-2) -->')
content = content.replace('<!-- ?面 7：總?-->', '<!-- ?面 11：總?-->')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("MinimalSchedule fixes applied.")
