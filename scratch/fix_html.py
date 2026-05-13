import re

file_path = r'd:\user\Desktop\AI\Antigravity\ChatFoilio\ChatFoilio\portfolio_minimal_schedule.html'

with open(file_path, 'rb') as f:
    content = f.read().decode('utf-8', errors='ignore')

# Target redundant block
# From Page 6 footer </div> to the next </div> after Page 5 footer.
# Note the broken tag 'div class="page">' without '<'

pattern = re.compile(r'(<footer class="page-footer">.*?Page 6</span>.*?</footer>\s*</div>\s*)div class="page">.*?Page 5</span>.*?</footer>\s*</div>', re.DOTALL)

new_content = pattern.sub(r'\1', content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Fix applied successfully.")
