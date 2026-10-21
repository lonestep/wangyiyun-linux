Name:           netease-cloud-music
Version:        3.1.40
Release:        1.el10
Summary:        NetEase Cloud Music for Linux (CentOS Stream 9/10, RHEL 9/10, Fedora)
License:        Proprietary
URL:            https://music.163.com/
BuildArch:      x86_64

%global __strip /bin/true
%global debug_package %{nil}
%define _build_id_links none
%global __os_install_post %{nil}
%global __check_files %{nil}
%define _unpackaged_files_terminate_build 0

%{!?builddir: %define builddir %{_topdir}/BUILD/netease-cloud-music}

Requires:       alsa-lib
Requires:       cairo
Requires:       cups-libs
Requires:       gtk3
Requires:       libX11
Requires:       libXcomposite
Requires:       libXcursor
Requires:       libXdamage
Requires:       libXext
Requires:       libXfixes
Requires:       libXi
Requires:       libXrandr
Requires:       libXrender
Requires:       libXtst
Requires:       mesa-libgbm
Requires:       nss
Requires:       pango

%description
NetEase Cloud Music desktop client ported to Linux (CentOS Stream 9/10).
Features native audio playback, QR code scan login, local caching, and Wayland/X11 compatibility.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/opt/netease-cloud-music
mkdir -p %{buildroot}/usr/bin
mkdir -p %{buildroot}/usr/share/applications
mkdir -p %{buildroot}/usr/share/icons/hicolor/512x512/apps
mkdir -p %{buildroot}/usr/share/pixmaps

cp -a %{builddir}/* %{buildroot}/opt/netease-cloud-music/
ln -sf /opt/netease-cloud-music/netease-cloud-music %{buildroot}/usr/bin/netease-cloud-music
cp %{builddir}/netease-cloud-music.desktop %{buildroot}/usr/share/applications/
cp %{builddir}/netease-cloud-music.png %{buildroot}/usr/share/icons/hicolor/512x512/apps/
cp %{builddir}/netease-cloud-music.png %{buildroot}/usr/share/pixmaps/

%post
DESKTOP_SRC="/usr/share/applications/netease-cloud-music.desktop"
install_user_shortcut() {
  user_home="$1"
  user_name="$2"
  [ -d "$user_home" ] || return 0
  [ -f "$DESKTOP_SRC" ] || return 0
  desktop_dir=""
  if [ -f "$user_home/.config/user-dirs.dirs" ]; then
    xdg_val="$(grep -E '^XDG_DESKTOP_DIR=' "$user_home/.config/user-dirs.dirs" | tail -n 1 | cut -d= -f2- | tr -d '"')"
    if [ -n "$xdg_val" ]; then
      desktop_dir="$(echo "$xdg_val" | sed "s|\$HOME|$user_home|g")"
    fi
  fi
  if [ -z "$desktop_dir" ]; then
    if [ -d "$user_home/桌面" ]; then
      desktop_dir="$user_home/桌面"
    else
      desktop_dir="$user_home/Desktop"
    fi
  fi
  mkdir -p "$desktop_dir" 2>/dev/null || :
  if [ -d "$desktop_dir" ]; then
    target_desktop="$desktop_dir/netease-cloud-music.desktop"
    cp -f "$DESKTOP_SRC" "$target_desktop" 2>/dev/null || :
    chmod 0755 "$target_desktop" 2>/dev/null || :
    if [ -n "$user_name" ] && id "$user_name" >/dev/null 2>&1; then
      user_uid="$(id -u "$user_name" 2>/dev/null || true)"
      user_group="$(id -gn "$user_name" 2>/dev/null || echo "$user_name")"
      chown "$user_name:$user_group" "$desktop_dir" "$target_desktop" 2>/dev/null || :
      user_apps="$user_home/.local/share/applications"
      mkdir -p "$user_apps" 2>/dev/null || :
      cp -f "$DESKTOP_SRC" "$user_apps/netease-cloud-music.desktop" 2>/dev/null || :
      chmod 0755 "$user_apps/netease-cloud-music.desktop" 2>/dev/null || :
      chown "$user_name:$user_group" "$user_apps" "$user_apps/netease-cloud-music.desktop" 2>/dev/null || :
      if [ -n "$user_uid" ] && [ -S "/run/user/$user_uid/bus" ]; then
        su - "$user_name" -c "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$user_uid/bus gio set '$target_desktop' metadata::trusted true" &>/dev/null || :
        su - "$user_name" -c "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$user_uid/bus python3 -c \"
import subprocess, ast
try:
    cur = subprocess.check_output(['gsettings', 'get', 'org.gnome.shell', 'favorite-apps'], text=True).strip()
    apps = ast.literal_eval(cur) if cur.startswith('[') else []
    if isinstance(apps, list) and 'netease-cloud-music.desktop' not in apps:
        apps.append('netease-cloud-music.desktop')
        subprocess.run(['gsettings', 'set', 'org.gnome.shell', 'favorite-apps', str(apps)], check=False)
except Exception:
    pass
\"" &>/dev/null || :
      fi
    fi
  fi
}
mkdir -p /etc/skel/Desktop 2>/dev/null || :
cp -f "$DESKTOP_SRC" /etc/skel/Desktop/netease-cloud-music.desktop 2>/dev/null || :
chmod 0755 /etc/skel/Desktop/netease-cloud-music.desktop 2>/dev/null || :
install_user_shortcut "/root" "root"
for home_dir in /home/*; do
  if [ -d "$home_dir" ]; then
    install_user_shortcut "$home_dir" "$(basename "$home_dir")"
  fi
done
/usr/bin/update-desktop-database &> /dev/null || :
/bin/touch --no-create /usr/share/icons/hicolor &>/dev/null || :
/usr/bin/gtk-update-icon-cache /usr/share/icons/hicolor &>/dev/null || :

%postun
if [ $1 -eq 0 ]; then
  rm -f /etc/skel/Desktop/netease-cloud-music.desktop 2>/dev/null || :
  rm -f /root/Desktop/netease-cloud-music.desktop /root/桌面/netease-cloud-music.desktop 2>/dev/null || :
  for home_dir in /home/*; do
    if [ -d "$home_dir" ]; then
      rm -f "$home_dir/Desktop/netease-cloud-music.desktop" "$home_dir/桌面/netease-cloud-music.desktop" "$home_dir/.local/share/applications/netease-cloud-music.desktop" 2>/dev/null || :
    fi
  done
fi
/usr/bin/update-desktop-database &> /dev/null || :
/bin/touch --no-create /usr/share/icons/hicolor &>/dev/null || :
/usr/bin/gtk-update-icon-cache /usr/share/icons/hicolor &>/dev/null || :

%files
/opt/netease-cloud-music
/usr/bin/netease-cloud-music
/usr/share/applications/netease-cloud-music.desktop
/usr/share/icons/hicolor/512x512/apps/netease-cloud-music.png
/usr/share/pixmaps/netease-cloud-music.png

%changelog
* Tue Oct 20 2026 Community <community@netease.com> - 3.1.40-1
- Initial release for CentOS Stream 9/10 & Ubuntu 22.04/24.04
