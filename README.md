# 网易云音乐 Linux 版 (CentOS Stream 9/10 & RHEL 兼容版)

[![Platform](https://img.shields.io/badge/platform-CentOS%20Stream%209%2F10%20%7C%20RHEL%20%7C%20Fedora-blue.svg)](https://centos.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Arch](https://img.shields.io/badge/arch-x86__64-orange.svg)](#)

网易云音乐 Linux 客户端适配版，专为 CentOS Stream 9/10、RHEL 9/10、Fedora 及主流现代 Linux 桌面环境打造。通过重构 Chromium / CEF 桥接层与 HTML5 Audio 管道，完整解决现代 Linux 发行版下的启动白屏、扫码登录失效、音频无声、切歌“加载失败”、头像封面不显示等兼容性问题。

---

## 特性与修复

- **原生音频播放**：完整实现 HTML5 AudioPlayer 核心接口，修复播放无声、秒级进度同步与切歌异常（解决播放结束时上报结构体不兼容导致的 “加载失败 / 切歌” 问题）。
- **完整账户系统**：支持网易云音乐 App 扫码登录，内置持久化 Cookie 存储机制（`~/.config/netease-cloud-music/cookies.json`），免去重复登录困扰。
- **资源缓存与图像优化**：拦截 `orpheus://cache/` 自定义协议，建立本地二级磁盘图片缓存机制，支持高清头像与专辑封面即时渲染。
- **现代化桌面集成**：针对 GNOME / KDE 桌面环境优化，提供完整的 `.desktop` 快捷方式与 512x512 高清应用图标，支持系统托盘与基础窗口管理。
- **高兼容性渲染**：针对 CentOS Stream 9/10 的 Wayland / XWayland 渲染栈注入专用参数，杜绝 GPU 崩溃与启动白屏。

---

## 安装方式

### 方式一：RPM 包一键安装（推荐）

适用于 CentOS Stream 9/10、RHEL 9/10、Rocky Linux、AlmaLinux 及 Fedora：

```bash
# 进入发布包目录或下载 rpm 后执行：
sudo dnf install -y ./dist/netease-cloud-music-3.1.40-1.el10.x86_64.rpm

# 或使用 rpm 命令：
sudo rpm -ivh ./dist/netease-cloud-music-3.1.40-1.el10.x86_64.rpm
```

安装完成后，可以在桌面应用列表搜索 **网易云音乐** 启动，或者在终端直接输入：
```bash
netease-cloud-music
```

卸载方式：
```bash
sudo dnf remove netease-cloud-music
```

---

### 方式二：免 Root 便携版解压即用

如果你没有 root 权限，可以直接使用便携归档包：

```bash
# 解压便携包
tar -zxvf ./dist/netease-cloud-music-3.1.40-linux-x64.tar.gz

# 运行客户端
./netease-cloud-music/netease-cloud-music
```

如需添加到当前用户的应用菜单：
```bash
mkdir -p ~/.local/share/applications ~/.local/share/icons/hicolor/512x512/apps
cp ./netease-cloud-music/netease-cloud-music.png ~/.local/share/icons/hicolor/512x512/apps/
cp ./netease-cloud-music/netease-cloud-music.desktop ~/.local/share/applications/
# 修改 desktop 文件中的 Exec 路径为当前解压目录即可
```

---

## 依赖与运行环境要求

### 核心运行时依赖
CentOS Stream 9/10 最小化安装环境可能缺少部分多媒体及 X11 运行库，建议确认安装：

```bash
sudo dnf install -y \
  alsa-lib \
  cairo \
  cups-libs \
  gtk3 \
  libX11 \
  libXcomposite \
  libXcursor \
  libXdamage \
  libXext \
  libXfixes \
  libXi \
  libXrandr \
  libXrender \
  libXtst \
  mesa-libgbm \
  nss \
  pango
```

### 音频服务说明
支持现代 Linux 标配的 PipeWire 或 PulseAudio。若系统未启动用户级音频服务，可执行：
```bash
systemctl --user start pipewire pipewire-pulse
```

---

## 本地构建与打包

如果你希望自行从源码构建二进制安装包：

```bash
# 1. 确保安装了 rpm-build 工具（构建 RPM 必需）
sudo dnf install -y rpm-build

# 2. 运行打包脚本
./scripts/build.sh
```

构建完成后产物将输出在 `dist/` 目录：
- `dist/netease-cloud-music-3.1.40-linux-x64.tar.gz`：便携压缩包
- `dist/netease-cloud-music-3.1.40-1.el10.x86_64.rpm`：系统安装包

---

## 调试与问题排查

如果遇到任何运行异常，可携带 `--debug` 或指定 `DEBUG=1` 环境变量启动以获取完整控制台诊断日志：

```bash
netease-cloud-music --debug
# 或
DEBUG=1 netease-cloud-music
```

数据与缓存目录位置：
- 用户配置与 Cookie：`~/.config/netease-cloud-music/`
- 本地图片缓存：`~/.config/netease-cloud-music/ImageCache/`

---

## 开源协议与声明

- 本仓库的封装脚本、协议适配与预加载桥接代码采用 [MIT 许可证](LICENSE)。
- 网易云音乐的客户端前端资源、品牌标识、图标及音乐版权均归属于网易公司（NetEase, Inc.）。本仓库仅供 Linux 平台技术交流与兼容性适配研究。
