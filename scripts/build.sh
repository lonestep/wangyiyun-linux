#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_DIR="$DIST_DIR/netease-cloud-music"

# Resolve electron runtime directory
ELECTRON_RUNTIME="${ELECTRON_RUNTIME:-}"
if [ -z "$ELECTRON_RUNTIME" ]; then
  if [ -d "$HOME/.local/share/electron-runtime" ]; then
    ELECTRON_RUNTIME="$HOME/.local/share/electron-runtime"
  elif [ -d "/usr/lib/electron" ]; then
    ELECTRON_RUNTIME="/usr/lib/electron"
  elif command -v electron &>/dev/null; then
    ELECTRON_RUNTIME="$(dirname "$(readlink -f "$(which electron)")")"
  fi
fi

if [ -z "$ELECTRON_RUNTIME" ] || [ ! -d "$ELECTRON_RUNTIME" ]; then
  echo "Error: Electron runtime directory not found. Please set ELECTRON_RUNTIME environment variable." >&2
  exit 1
fi

echo "=== Building NetEase Cloud Music Linux Distribution ==="
echo "Electron Runtime: $ELECTRON_RUNTIME"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"

echo "-> Copying Electron runtime..."
cp -a "$ELECTRON_RUNTIME"/* "$APP_DIR/"

echo "-> Configuring application launcher..."
if [ -f "$APP_DIR/electron" ]; then
  mv "$APP_DIR/electron" "$APP_DIR/netease-cloud-music-bin"
fi

cat << 'LAUNCHER' > "$APP_DIR/netease-cloud-music"
#!/bin/bash
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
exec "$HERE/netease-cloud-music-bin" "$HERE/resources/app/main.js" \
  --ozone-platform=x11 \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-gpu-sandbox \
  --no-sandbox \
  "$@"
LAUNCHER
chmod +x "$APP_DIR/netease-cloud-music"

echo "-> Packing application resources..."
mkdir -p "$APP_DIR/resources/app"
cp "$ROOT_DIR/main.js" "$APP_DIR/resources/app/"
cp "$ROOT_DIR/preload.js" "$APP_DIR/resources/app/"
cp "$ROOT_DIR/package.json" "$APP_DIR/resources/app/"
cp "$ROOT_DIR/icon.png" "$APP_DIR/resources/app/"
cp -a "$ROOT_DIR/pub" "$APP_DIR/resources/app/"

echo "-> Creating desktop integration files..."
mkdir -p "$DIST_DIR"
cp "$ROOT_DIR/icon.png" "$APP_DIR/netease-cloud-music.png"

cat << 'DESKTOP' > "$APP_DIR/netease-cloud-music.desktop"
[Desktop Entry]
Name=网易云音乐
Name[zh_CN]=网易云音乐
Comment=NetEase Cloud Music for Linux (CentOS Stream 9/10)
Exec=/opt/netease-cloud-music/netease-cloud-music %U
Icon=netease-cloud-music
Terminal=false
Type=Application
Categories=AudioVideo;Player;Audio;
StartupWMClass=netease-cloud-music
MimeType=x-scheme-handler/orpheus;
DESKTOP

echo "-> Creating portable tarball..."
cd "$DIST_DIR"
tar -czf "netease-cloud-music-3.1.40-linux-x64.tar.gz" netease-cloud-music

# Check for rpmbuild to build native RPM package
if command -v rpmbuild &>/dev/null; then
  echo "-> Building RPM package..."
  RPM_TOPDIR="$HOME/rpmbuild"
  mkdir -p "$RPM_TOPDIR/SOURCES" "$RPM_TOPDIR/SPECS" "$RPM_TOPDIR/BUILD" "$RPM_TOPDIR/RPMS" "$RPM_TOPDIR/SRPMS"
  
  # Update spec to use current build directory if needed
  rpmbuild -bb \
    --define "_topdir $RPM_TOPDIR" \
    --define "builddir $APP_DIR" \
    "$ROOT_DIR/packaging/netease-cloud-music.spec"
  
  # Copy built RPM to dist
  cp -f "$RPM_TOPDIR"/RPMS/x86_64/netease-cloud-music-3.1.40-*.rpm "$DIST_DIR/" 2>/dev/null || true
fi

echo "=== Build finished ==="
ls -lh "$DIST_DIR"/*.tar.gz "$DIST_DIR"/*.rpm 2>/dev/null || true
