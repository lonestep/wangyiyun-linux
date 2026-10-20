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

cp -a %{builddir}/* %{buildroot}/opt/netease-cloud-music/
ln -sf /opt/netease-cloud-music/netease-cloud-music %{buildroot}/usr/bin/netease-cloud-music
cp %{builddir}/netease-cloud-music.desktop %{buildroot}/usr/share/applications/
cp %{builddir}/netease-cloud-music.png %{buildroot}/usr/share/icons/hicolor/512x512/apps/

%post
/usr/bin/update-desktop-database &> /dev/null || :
/bin/touch --no-create /usr/share/icons/hicolor &>/dev/null || :
/usr/bin/gtk-update-icon-cache /usr/share/icons/hicolor &>/dev/null || :

%postun
/usr/bin/update-desktop-database &> /dev/null || :
/bin/touch --no-create /usr/share/icons/hicolor &>/dev/null || :
/usr/bin/gtk-update-icon-cache /usr/share/icons/hicolor &>/dev/null || :

%files
/opt/netease-cloud-music
/usr/bin/netease-cloud-music
/usr/share/applications/netease-cloud-music.desktop
/usr/share/icons/hicolor/512x512/apps/netease-cloud-music.png

%changelog
* Tue Oct 20 2026 Community <community@netease.com> - 3.1.40-1
- Initial release for CentOS Stream 9/10
