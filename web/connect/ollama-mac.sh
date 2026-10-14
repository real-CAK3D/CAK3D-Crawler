#!/bin/bash
# Arachnotes: let your phone or tablet use Ollama on this Mac over your home Wi-Fi.
# Run:   curl -fsSL __SITE__connect/ollama-mac.sh | bash
# Undo:  curl -fsSL __SITE__connect/ollama-mac.sh | bash -s undo
ORIGINS="__ORIGINS__"
AGENT="$HOME/Library/LaunchAgents/com.arachnotes.ollama-env.plist"
restart() { osascript -e 'quit app "Ollama"' >/dev/null 2>&1; sleep 2; open -a Ollama; }
if [ "$1" = "undo" ]; then
  launchctl unsetenv OLLAMA_HOST; launchctl unsetenv OLLAMA_ORIGINS; rm -f "$AGENT"; restart
  echo "Done. Ollama only answers this Mac again."; exit 0
fi
if [ ! -d /Applications/Ollama.app ]; then echo "Ollama isn't installed. Get it at https://ollama.com/download and run this again."; exit 1; fi
launchctl setenv OLLAMA_HOST 0.0.0.0
launchctl setenv OLLAMA_ORIGINS "$ORIGINS"
# keep the setting after a restart
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$AGENT" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.arachnotes.ollama-env</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>-c</string><string>launchctl setenv OLLAMA_HOST 0.0.0.0; launchctl setenv OLLAMA_ORIGINS '$ORIGINS'</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
PLIST
restart
echo
echo "All set. If macOS asks whether Ollama may accept incoming network connections, choose Allow."
echo "In Arachnotes on your phone: Settings > Research > Your AI > \"Ollama on my computer\", and type:"
for i in en0 en1 en2 en3; do ip=$(ipconfig getifaddr "$i" 2>/dev/null); [ -n "$ip" ] && echo "    $ip"; done
echo
echo "Models on this Mac:"; /Applications/Ollama.app/Contents/Resources/ollama list 2>/dev/null || ollama list
echo "No models listed? Download one, for example:  ollama pull qwen3"
