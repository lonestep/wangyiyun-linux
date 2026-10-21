# 网易云音乐 Linux 版 (Ubuntu 22.04/24.04 & CentOS Stream 9/10 兼容版)

[![Platform](https://img.shields.io/badge/platform-Ubuntu%2022.04%2F24.04%20%7C%20Debian%20%7C%20CentOS%20Stream%209%2F10%20%7C%20RHEL%20%7C%20Fedora-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Arch](https://img.shields.io/badge/arch-x86__64%20%2F%20amd64-orange.svg)](#)

网易云音乐 Linux 客户端适配版，全面支持 **Ubuntu 22.04 LTS (Jammy)**、**Ubuntu 24.04 LTS (Noble)**、**Debian** 以及 **CentOS Stream 9/10、RHEL 9/10、Fedora** 等主流现代 Linux 桌面环境。通过重构 Chromium / CEF 桥接层与 HTML5 Audio 管道，完整解决现代 Linux 发行版下的启动白屏、Ubuntu 24.04 AppArmor 沙箱崩溃、扫码登录失效、音频无声、切歌“加载失败”、头像封面不显示等兼容性问题。

---

## 特性与修复

- **多发行版原生兼容**：
  - **Ubuntu 22.04 & 24.04 双版本自适应**：单 `.deb` 包同时兼容 Ubuntu 22.04 传统库名（如 `libasound2`、`libgtk-3-0`）与 Ubuntu 24.04 的 64-bit `time_t` (`t64`) 库名（如 `libasound2t64`、`libgtk-3-0t64`），并内置 Ubuntu 24.04 AppArmor 4.0 `userns` 沙箱策略与前置参数适配。
  - **CentOS Stream 9/10 & RHEL / Fedora 支持**：原生支持 `.rpm` 打包与安装。
- **完整账户与接口加密体系**：
  - 完整实现网易云音乐 `eapi` AES-128-ECB 加解密桥接（`serialData`、`deSerialData`、`serialKey`、`encryptId`）与匿名游客 ID 签名算法（`encodeAnonymousId`），彻底修复点击登录提示 **“服务端异常，请稍后再试”** 及未登录状态下首页 **“数据加载失败”** 的问题。
  - 支持网易云音乐 App 扫码登录，内置持久化 Cookie 存储机制（`~/.config/netease-cloud-music/cookies.json`），免去重复登录困扰。
- **智能网络直连策略**：默认绕过存在认证冲突的本地系统代理（避免 `*.music.163.com` 出现 `net::ERR_EMPTY_RESPONSE`）；如需强制走系统代理，可设置环境变量 `NCM_USE_SYSTEM_PROXY=1`。
- **原生音频播放**：完整实现 HTML5 AudioPlayer 核心接口，修复播放无声、秒级进度同步与切歌异常（解决播放结束时上报结构体不兼容导致的 “加载失败 / 切歌” 问题）。
- **资源缓存与图像优化**：拦截 `orpheus://cache/` 自定义协议，建立本地二级磁盘图片缓存机制，支持高清头像与专辑封面即时渲染。
- **现代化桌面与快捷方式集成**：安装 `.rpm` 或 `.deb` 时自动在系统应用菜单、用户桌面（`~/桌面` 或 `~/Desktop`）生成快捷方式并自动固定至 GNOME Dock 收藏栏；便携版亦附带 `install-shortcut.sh` 一键生成脚本。
- **高兼容性渲染**：针对 Wayland / XWayland 渲染栈注入专用参数，杜绝 GPU 崩溃与启动白屏（可通过环境变量 `NCM_OZONE_PLATFORM=wayland` 切换原生 Wayland 模式）。

---

## 安装方式

可直接从 [GitHub Releases (v3.1.40)](https://github.com/lonestep/wangyiyun-linux/releases/tag/v3.1.40) 下载最新预编译安装包，或使用本地 `dist/` 目录下的构建产物：

- **RPM 安装包（CentOS / RHEL / Fedora）**：[`netease-cloud-music-3.1.40-1.el10.x86_64.rpm`](https://github.com/lonestep/wangyiyun-linux/releases/download/v3.1.40/netease-cloud-music-3.1.40-1.el10.x86_64.rpm)
- **DEB 安装包（Ubuntu 22.04/24.04 / Debian）**：[`netease-cloud-music_3.1.40-1_amd64.deb`](https://github.com/lonestep/wangyiyun-linux/releases/download/v3.1.40/netease-cloud-music_3.1.40-1_amd64.deb)
- **通用便携包（全 Linux 免 Root）**：[`netease-cloud-music-3.1.40-linux-x64.tar.gz`](https://github.com/lonestep/wangyiyun-linux/releases/download/v3.1.40/netease-cloud-music-3.1.40-linux-x64.tar.gz)

### 方式一：Ubuntu 22.04 / 24.04 & Debian（DEB 包一键安装）

适用于 **Ubuntu 22.04 LTS**、**Ubuntu 24.04 LTS**、**Linux Mint** 及 **Debian 12+**：

```bash
# 推荐使用 apt 安装（自动解析并补齐 Ubuntu 22.04 或 24.04 对应依赖，并自动创建桌面快捷方式）：
sudo apt update
sudo apt install -y ./dist/netease-cloud-music_3.1.40-1_amd64.deb

# 或使用 dpkg 安装：
sudo dpkg -i ./dist/netease-cloud-music_3.1.40-1_amd64.deb
sudo apt-get install -f -y
```

卸载方式：
```bash
sudo apt remove -y netease-cloud-music
```

---

### 方式二：CentOS Stream 9/10 & RHEL / Fedora（RPM 包一键安装）

适用于 **CentOS Stream 9/10**、**RHEL 9/10**、**Rocky Linux**、**AlmaLinux** 及 **Fedora**：

```bash
# 进入发布包目录或下载 rpm 后执行（自动创建桌面快捷方式与应用菜单图标）：
sudo dnf install -y ./dist/netease-cloud-music-3.1.40-1.el10.x86_64.rpm

# 或使用 rpm 命令安装/强制覆盖升级：
sudo rpm -Uvh --force ./dist/netease-cloud-music-3.1.40-1.el10.x86_64.rpm
```

卸载方式：
```bash
sudo dnf remove -y netease-cloud-music
```

---

### 方式三：免 Root 便携版解压即用（全 Linux 通用）

如果你没有 root 权限，可在 Ubuntu 22.04/24.04 或 CentOS Stream 9/10 下直接使用便携归档包：

```bash
# 解压便携包
tar -zxvf ./dist/netease-cloud-music-3.1.40-linux-x64.tar.gz

# 一键生成桌面快捷方式与应用菜单图标（可选）
./netease-cloud-music/install-shortcut.sh

# 运行客户端
./netease-cloud-music/netease-cloud-music
```

---

## 依赖与运行环境要求

### 1. Ubuntu 22.04 / 24.04 核心运行时依赖

使用 `sudo apt install -y ./dist/netease-cloud-music_3.1.40-1_amd64.deb` 时会自动安装所需依赖。若使用便携版 `tar.gz`，可手动确认安装：

**Ubuntu 24.04 LTS (Noble):**
```bash
sudo apt update && sudo apt install -y \
  libasound2t64 libgtk-3-0t64 libcups2t64 libglib2.0-0t64 \
  libatk1.0-0t64 libatk-bridge2.0-0t64 libatspi2.0-0t64 \
  libcairo2 libdbus-1-3 libexpat1 libgbm1 libnspr4 libnss3 \
  libpango-1.0-0 libudev1 libx11-6 libxcb1 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  fonts-noto-cjk
```

**Ubuntu 22.04 LTS (Jammy):**
```bash
sudo apt update && sudo apt install -y \
  libasound2 libgtk-3-0 libcups2 libglib2.0-0 \
  libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
  libcairo2 libdbus-1-3 libexpat1 libgbm1 libnspr4 libnss3 \
  libpango-1.0-0 libudev1 libx11-6 libxcb1 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  fonts-noto-cjk
```

### 2. CentOS Stream 9/10 核心运行时依赖
```bash
sudo dnf install -y \
  alsa-lib cairo cups-libs gtk3 libX11 libXcomposite libXcursor \
  libXdamage libXext libXfixes libXi libXrandr libXrender libXtst \
  mesa-libgbm nss pango google-noto-sans-cjk-ttc-fonts
```

### 3. 音频服务说明
支持 Ubuntu 22.04（默认 PulseAudio / PipeWire）、Ubuntu 24.04（默认 PipeWire）及 CentOS Stream 9/10。若系统未启动用户级音频服务，可执行：
```bash
systemctl --user start pipewire pipewire-pulse || systemctl --user start pulseaudio
```

---

## 本地构建与打包

构建脚本 `./scripts/build.sh` 支持在 Ubuntu/Debian 或 CentOS/RHEL 下直接构建产物（即使在无 `dpkg-deb` 的 RPM 系统上也会自动通过 `ar` + `tar` 生成标准 `.deb` 安装包）：

```bash
# 运行构建脚本
./scripts/build.sh
```

构建完成后产物将输出在 `dist/` 目录：
- `dist/netease-cloud-music_3.1.40-1_amd64.deb`：Ubuntu 22.04 / 24.04 & Debian 通用安装包
- `dist/netease-cloud-music-3.1.40-linux-x64.tar.gz`：免安装便携压缩包
- `dist/netease-cloud-music-3.1.40-1.el10.x86_64.rpm`：CentOS / RHEL / Fedora 安装包（当系统安装了 `rpm-build` 时自动生成）

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
