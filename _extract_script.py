import re

# Ler o arquivo HTML
with open(r'public\index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extrair o script
match = re.search(r'<script type="module">(.*?)</script>', content, re.DOTALL)
if match:
    script_content = match.group(1)
    
    # Salvar o script completo
    with open(r'public\js\_full_script.js', 'w', encoding='utf-8') as f:
        f.write(script_content)
    
    print(f"Script extraído: {len(script_content)} caracteres")
    print(f"Linhas: {len(script_content.splitlines())}")
else:
    print("Script não encontrado")
