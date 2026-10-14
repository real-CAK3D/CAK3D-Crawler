#!/bin/sh
# Arachnotes: let your phone or tablet use Ollama on this computer over your home Wi-Fi.
# Run:   curl -fsSL __SITE__connect/ollama-linux.sh | sh
# Undo:  curl -fsSL __SITE__connect/ollama-linux.sh | sh -s undo
ORIGINS="__ORIGINS__"
CONF=/etc/systemd/system/ollama.service.d/arachnotes.conf
if [ "$1" = "undo" ]; then
  sudo rm -f "$CONF"; sudo systemctl daemon-reload; sudo systemctl restart ollama
  if command -v ufw >/dev/null 2>&1; then sudo ufw delete allow from 192.168.0.0/16 to any port 11434 proto tcp >/dev/null 2>&1; sudo ufw delete allow from 10.0.0.0/8 to any port 11434 proto tcp >/dev/null 2>&1; fi
  echo "Done. Ollama only answers this computer again."; exit 0
fi
if ! command -v ollama >/dev/null 2>&1; then echo "Ollama isn't installed. Install it with:  curl -fsSL https://ollama.com/install.sh | sh"; exit 1; fi
sudo mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0"\nEnvironment="OLLAMA_ORIGINS=%s"\n' "$ORIGINS" | sudo tee "$CONF" >/dev/null
sudo systemctl daemon-reload && sudo systemctl restart ollama
# a firewall that's on: allow the home network only
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow from 192.168.0.0/16 to any port 11434 proto tcp >/dev/null; sudo ufw allow from 10.0.0.0/8 to any port 11434 proto tcp >/dev/null
fi
echo
echo "All set. In Arachnotes on your phone: Settings > Research > Your AI > \"Ollama on my computer\", and type:"
hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9.]+$' | grep -vE '^(127|172\.1[7-9])\.' | sed 's/^/    /'
echo
echo "Models on this computer:"; ollama list
echo "No models listed? Download one, for example:  ollama pull qwen3"
