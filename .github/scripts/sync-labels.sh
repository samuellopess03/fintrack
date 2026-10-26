#!/usr/bin/env bash
# sync-labels.sh
#
# Aplica os labels definidos em .github/labels.yml no repositório via GitHub CLI.
# Pré-requisito: gh CLI autenticado (`gh auth login`)
#
# Uso:
#   chmod +x .github/scripts/sync-labels.sh
#   ./.github/scripts/sync-labels.sh samuellopess03/fintrack

set -euo pipefail

REPO="${1:-}"

if [[ -z "$REPO" ]]; then
  echo "❌ Uso: $0 <owner>/<repo>"
  echo "   Exemplo: $0 samuellopess03/fintrack"
  exit 1
fi

echo "🏷️  Sincronizando labels em $REPO ..."

# Apaga todos os labels padrão do GitHub que não estão no nosso padrão
DEFAULT_LABELS=(
  "bug" "documentation" "duplicate" "enhancement"
  "good first issue" "help wanted" "invalid" "question" "wontfix"
)

for label in "${DEFAULT_LABELS[@]}"; do
  gh label delete "$label" --repo "$REPO" --yes 2>/dev/null || true
done

# Cria os labels do projeto a partir do YAML
# Requer: python e PyYAML instalados
python - "$REPO" << 'PYTHON'
import sys, subprocess, yaml

repo = sys.argv[1]

with open(".github/labels.yml") as f:
    labels = yaml.safe_load(f)

for label in labels:
    if not label.get("name"):
        continue

    name  = label["name"]
    color = label.get("color", "EEEEEE").lstrip("#")
    desc  = label.get("description", "")

    result = subprocess.run(
        ["gh", "label", "create", name,
         "--color", color,
         "--description", desc,
         "--repo", repo,
         "--force"],     # --force atualiza se já existir
        capture_output=True, text=True
    )

    if result.returncode == 0:
        print(f"  ✅ {name}")
    else:
        print(f"  ❌ {name}: {result.stderr.strip()}")

print("\n✅ Sincronização concluída.")
PYTHON
