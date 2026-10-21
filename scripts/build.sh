#!/bin/bash
set -euo pipefail

VERSION="3.1.40"
RELEASE="1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
APP_DIR="$DIST_DIR/netease-cloud-music"

# Resolve electron runtime directory across Ubuntu / Debian / CentOS / RHEL
ELECTRON_RUNTIME="${ELECTRON_RUNTIME:-}"
if [ -z "$ELECTRON_RUNTIME" ]; then
  if [ -d "$HOME/.local/share/electron-runtime" ]; then
    ELECTRON_RUNTIME="$HOME/.local/share/electron-runtime"
  elif [ -d "/tmp/electron-runtime" ]; then
    ELECTRON_RUNTIME="/tmp/electron-runtime"
  elif [ -d "$ROOT_DIR/node_modules/electron/dist" ]; then
    ELECTRON_RUNTIME="$ROOT_DIR/node_modules/electron/dist"
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

echo "=== Building NetEase Cloud Music Linux Distribution (v${VERSION}) ==="
echo "Electron Runtime: $ELECTRON_RUNTIME"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"

echo "-> Copying Electron runtime..."
cp -a "$ELECTRON_RUNTIME"/* "$APP_DIR/"

echo "-> Configuring application launcher..."
if [ -f "$APP_DIR/electron" ]; then
  mv "$APP_DIR/electron" "$APP_DIR/netease-cloud-music-bin"
fi

# Note: Chromium/Electron sandbox & platform flags MUST precede the app entry script
# to ensure Ubuntu 24.04 (AppArmor userns restriction) and Wayland/XWayland compatibility.
cat << 'LAUNCHER' > "$APP_DIR/netease-cloud-music"
#!/bin/bash
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
exec "$HERE/netease-cloud-music-bin" \
  --no-sandbox \
  --disable-setuid-sandbox \
  --disable-gpu-sandbox \
  --ozone-platform="${NCM_OZONE_PLATFORM:-x11}" \
  --disable-gpu \
  --disable-dev-shm-usage \
  "$HERE/resources/app/main.js" \
  "$@"
LAUNCHER
chmod +x "$APP_DIR/netease-cloud-music"

echo "-> Packing application resources..."
rm -rf "$APP_DIR/resources/default_app.asar"
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
Version=1.0
Name=网易云音乐
Name[zh_CN]=网易云音乐
GenericName=音乐播放器
Comment=NetEase Cloud Music for Linux (Ubuntu 22.04/24.04 & CentOS Stream 9/10)
Comment[zh_CN]=网易云音乐 Linux 客户端
Exec=/opt/netease-cloud-music/netease-cloud-music %U
Icon=/opt/netease-cloud-music/netease-cloud-music.png
Terminal=false
Type=Application
Categories=AudioVideo;Player;Audio;
StartupNotify=true
StartupWMClass=netease-cloud-music
Keywords=netease;cloudmusic;music;163;网易云音乐;音乐;
MimeType=x-scheme-handler/orpheus;
DESKTOP
chmod +x "$APP_DIR/netease-cloud-music.desktop"

cat << 'SHORTCUT_INSTALLER' > "$APP_DIR/install-shortcut.sh"
#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
APP_MENU_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"

mkdir -p "$APP_MENU_DIR" "$ICON_DIR"
cp -f "$HERE/netease-cloud-music.png" "$ICON_DIR/netease-cloud-music.png"

cat << EOF > "$APP_MENU_DIR/netease-cloud-music.desktop"
[Desktop Entry]
Version=1.0
Name=网易云音乐
Name[zh_CN]=网易云音乐
GenericName=音乐播放器
Comment=NetEase Cloud Music for Linux
Exec=$HERE/netease-cloud-music %U
Icon=$HERE/netease-cloud-music.png
Terminal=false
Type=Application
Categories=AudioVideo;Player;Audio;
StartupNotify=true
StartupWMClass=netease-cloud-music
Keywords=netease;cloudmusic;music;163;网易云音乐;音乐;
MimeType=x-scheme-handler/orpheus;
EOF
chmod +x "$APP_MENU_DIR/netease-cloud-music.desktop"

DESKTOP_DIR="$HOME/Desktop"
if [ -d "$HOME/桌面" ]; then
  DESKTOP_DIR="$HOME/桌面"
fi
mkdir -p "$DESKTOP_DIR"
cp -f "$APP_MENU_DIR/netease-cloud-music.desktop" "$DESKTOP_DIR/netease-cloud-music.desktop"
chmod +x "$DESKTOP_DIR/netease-cloud-music.desktop"
if command -v gio &>/dev/null; then
  gio set "$DESKTOP_DIR/netease-cloud-music.desktop" metadata::trusted true 2>/dev/null || true
fi
echo "Shortcuts installed to $APP_MENU_DIR and $DESKTOP_DIR"
SHORTCUT_INSTALLER
chmod +x "$APP_DIR/install-shortcut.sh"

echo "-> Creating portable tarball..."
cd "$DIST_DIR"
tar -czf "netease-cloud-music-${VERSION}-linux-x64.tar.gz" netease-cloud-music

# Build Debian/Ubuntu (.deb) package supporting both Ubuntu 22.04 and Ubuntu 24.04
build_deb() {
  echo "-> Building Debian/Ubuntu (.deb) package (Ubuntu 22.04 & 24.04 compatible)..."
  local DEB_STAGE
  DEB_STAGE="$(mktemp -d)"
  local DEB_ROOT="$DEB_STAGE/pkg"
  local DEB_FILE="$DIST_DIR/netease-cloud-music_${VERSION}-${RELEASE}_amd64.deb"

  mkdir -p "$DEB_ROOT/DEBIAN"
  mkdir -p "$DEB_ROOT/opt/netease-cloud-music"
  mkdir -p "$DEB_ROOT/usr/bin"
  mkdir -p "$DEB_ROOT/usr/share/applications"
  mkdir -p "$DEB_ROOT/usr/share/icons/hicolor/128x128/apps"
  mkdir -p "$DEB_ROOT/usr/share/icons/hicolor/512x512/apps"
  mkdir -p "$DEB_ROOT/usr/share/pixmaps"

  cp -a "$APP_DIR"/* "$DEB_ROOT/opt/netease-cloud-music/"
  ln -sf /opt/netease-cloud-music/netease-cloud-music "$DEB_ROOT/usr/bin/netease-cloud-music"
  cp "$APP_DIR/netease-cloud-music.desktop" "$DEB_ROOT/usr/share/applications/"
  chmod 0755 "$DEB_ROOT/usr/share/applications/netease-cloud-music.desktop"
  cp "$APP_DIR/netease-cloud-music.png" "$DEB_ROOT/usr/share/icons/hicolor/128x128/apps/"
  cp "$APP_DIR/netease-cloud-music.png" "$DEB_ROOT/usr/share/icons/hicolor/512x512/apps/"
  cp "$APP_DIR/netease-cloud-music.png" "$DEB_ROOT/usr/share/pixmaps/"

  local INSTALLED_SIZE
  INSTALLED_SIZE="$(du -sk "$DEB_ROOT/opt" "$DEB_ROOT/usr" | awk '{s+=$1} END {print s}')"

  cp "$ROOT_DIR/packaging/deb/control" "$DEB_ROOT/DEBIAN/control"
  if ! grep -q "^Installed-Size:" "$DEB_ROOT/DEBIAN/control"; then
    sed -i "/^Architecture:/a Installed-Size: ${INSTALLED_SIZE}" "$DEB_ROOT/DEBIAN/control"
  fi
  cp "$ROOT_DIR/packaging/deb/postinst" "$DEB_ROOT/DEBIAN/postinst"
  cp "$ROOT_DIR/packaging/deb/postrm" "$DEB_ROOT/DEBIAN/postrm"
  chmod 0644 "$DEB_ROOT/DEBIAN/control"
  chmod 0755 "$DEB_ROOT/DEBIAN/postinst" "$DEB_ROOT/DEBIAN/postrm"

  rm -f "$DEB_FILE"
  if command -v dpkg-deb &>/dev/null; then
    dpkg-deb --root-owner-group --build "$DEB_ROOT" "$DEB_FILE"
  elif command -v ar &>/dev/null; then
    (
      cd "$DEB_STAGE"
      echo "2.0" > debian-binary
      tar --owner=0 --group=0 -czf control.tar.gz -C "$DEB_ROOT/DEBIAN" ./control ./postinst ./postrm
      tar --owner=0 --group=0 --exclude='./DEBIAN' -czf data.tar.gz -C "$DEB_ROOT" ./opt ./usr
      ar rcD "$DEB_FILE" debian-binary control.tar.gz data.tar.gz
    )
  else
    echo "Warning: Neither dpkg-deb nor ar found; skipping .deb build." >&2
  fi

  rm -rf "$DEB_STAGE"
}

build_deb

# Check for rpmbuild to build native RPM package
RPMBUILD_BIN="$(command -v rpmbuild || true)"
if [ -z "$RPMBUILD_BIN" ] && [ -x "/tmp/rpm-build-root/usr/bin/rpmbuild" ]; then
  RPMBUILD_BIN="/tmp/rpm-build-root/usr/bin/rpmbuild"
fi
if [ -n "$RPMBUILD_BIN" ]; then
  echo "-> Building RPM package..."
  RPM_TOPDIR="${RPM_TOPDIR:-$HOME/rpmbuild}"
  mkdir -p "$RPM_TOPDIR/SOURCES" "$RPM_TOPDIR/SPECS" "$RPM_TOPDIR/BUILD" "$RPM_TOPDIR/RPMS" "$RPM_TOPDIR/SRPMS"

  "$RPMBUILD_BIN" -bb \
    --define "_topdir $RPM_TOPDIR" \
    --define "builddir $APP_DIR" \
    "$ROOT_DIR/packaging/netease-cloud-music.spec"

  cp -f "$RPM_TOPDIR"/RPMS/x86_64/netease-cloud-music-${VERSION}-*.rpm "$DIST_DIR/" 2>/dev/null || true
fi

echo "=== Build finished ==="
ls -lh "$DIST_DIR"/*.tar.gz "$DIST_DIR"/*.deb "$DIST_DIR"/*.rpm 2>/dev/null || true
