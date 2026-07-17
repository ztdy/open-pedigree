# Open Pedigree Desktop

把 open-pedigree（PhenoTips 家系图编辑器）封装为 Windows 桌面软件的 Electron 壳。
详见根目录 `DESKTOP_PLAN.md`。

进度：
- **M0 安全壳 PoC** — ✅ 7/7 冒烟（`smoke.js`）
- **M1 单文档保存** — ✅ 经 Codex 对抗性审核并修复 5 高危 + 5 中危后：
  - DocumentStore 单测 13/13（`test-documentstore.js`）
  - S1 round-trip 5/5（`test-s1-roundtrip.js`）
  - S4 dirty/关闭契约 6/6（`test-s4-dirty-close.js`，覆盖导入标脏 / 保存中编辑保持脏 / 保存并关闭 ack）

- **M2 多文档文件库** — ✅ library.html（列表/搜索/排序/新建/打开/重命名/复制/删除）+ 视图切换 + 返回库未保存拦截；S2 防串档 5/5（`test-s2-library.js`）
- **M3 导入加固** — ✅ 「导入为新家系」(library→main 选文件→建 doc→编辑器自动导入)、格式判定(`importDetect.js`)、失败回滚、8MB 上限；S3 18/18（4 格式 PED/GEDCOM/BOADICEA/GA4GH + 检测 + 回滚，`test-s3-import.js`）
- **Windows 实机验证** — ✅ 真 Windows 运行：库窗口、AppData 建库、DocumentStore 13/13、S1 5/5、S3 18/18（无 WSL 的 loadFile flake）
- **M2+M3 关键节点 Codex 审核** — ✅ 10 项高/中危(导入成功/失败事件分离、视图状态机竞态、保存并关闭 clean 校验、文件名ID权威等)全修复并验证：S2b **真实 main.js 状态机** 10/10（allowlist 拦截 / pendingOpen 原子 / 导航提交顺序 / clean 打开不弹框 / 无串档）+ S3 18/18，均 Windows 实机
- **M4 Windows 发布** — ✅ electron-builder 26 产 **NSIS 安装版**(默认 per-user 免管理员、可选 all-users、可选目录、桌面/开始菜单快捷方式) + **portable exe**，各约 108MB；图标嵌入；打包实机冒烟通过（库视图启动 + 默认 `%APPDATA%\Open Pedigree\pedigrees` 建库 + 中文 Unicode 路径 + portable）。见 `PACKAGING.md`、CI `.github/workflows/desktop-release.yml`
- **M4 关键节点 Codex 审核 + 修复** — ✅ Codex 查出 1 高/5 中/2 低,全部修复并验证：
  - **升级 Electron 31(EOL)→41(受支持 major)** — 全套 Windows 回归无回归：smoke 7/7 + S1 5/5 + S2b 10/10 + S3 18/18 + S4 6/6
  - **安全 fuses**(`electronFuses`)：`RunAsNode`/`NodeOptions`/`NodeCliInspect` 关、`OnlyLoadAppFromAsar`/`CookieEncryption` 开。⚠️ `GrantFileProtocolExtraPrivileges` 必须保持默认开(关掉会掐断 file:// 加载→窗口空白 `ERR_FILE_NOT_FOUND`）；`EmbeddedAsarIntegrity` 暂缓(在 eb26+electron41+Windows 组合下会破坏 file:// 加载,待兼容性处理)
  - **打包后端到端实机验证**（截图确认）：库页面完整渲染(新建/导入/搜索/排序/文档卡片) → 点开 → 编辑器完整加载(Templates/Import/Save 工具栏 + 平移/缩放控件 + 模板选择框)。修复了 `GrantFileProtocolExtraPrivileges` fuse 导致的打包版空白窗口 bug
- **产品打磨(用户反馈)** — ✅ 均截图验证：
  - 去掉 PhenoTips/Gene42 品牌(窗口标题、编辑器"Powered by PhenoTips"、"© Gene42";保留 LGPL 源码版权头 + LICENSE)
  - 模板/加载后家系图按全图 bbox **居中**(不再顶到上方被遮)
  - Save 后底部弹绿色 **"✓ Saved"** toast(失败弹红色),不再无反馈
  - 去掉无用的原生菜单栏(File/Edit/View/Window)
  - library 卡片显示**临床摘要**:🧬 候选基因 + HPO/disorder/人数计数(主进程从 .opedigree graph 解析)
  - **CI 签名 fail-closed** — tag 发布强制 `forceCodeSigning` + `Get-AuthenticodeSignature` 校验每个 PE + 显式 `CSC_IDENTITY_AUTO_DISCOVERY=false`;tag 版本必须==package.json;`npm ci` 锁定依赖(重建 lockfile);未用 font-awesome scss 排除;NSIS 提权与文档一致化

## 测试

WSL（开发迭代，WSLg 提供 DISPLAY）：
```bash
DISPLAY=:0 bash desktop/run-tests.sh    # 跑全部（unit + 3 个 Electron 场景）
node desktop/test-documentstore.js       # 纯 Node，无需 Electron
```

Windows（交付形态验证）：
```
双击 desktop\run-windows.cmd            # 启动 app（用 .win\ 下独立的 Windows electron）
cd desktop && .\.win\node_modules\electron\dist\electron.exe test-s1-roundtrip.js
```
> WSL 用 Linux electron 做快速逻辑回归；`.win\` 下装 Windows electron 做交付形态验证。两者互不干扰。

## M1 已修复的关键缺陷（Codex 审核）

- 保存并关闭的 ack 用 `event.sender` + `requestId` 校验（不再恒超时）
- dirty 用单调 revision 计数（保存期间的新编辑不会被误清）
- 导入 / 选模板经 `pedigree:load:finish` 标脏（不再静默丢导入）
- 加载异常时 `suppressDirty` 在 finally 释放并提示（不再永久吞掉编辑）
- 桌面 bootstrap 失败显示致命/重试页，不退回不可保存的 web 模式
- IPC 校验 sender、导航锁定入口页；`.opedigree` 原子写 + `.bak` 原子 + 不可读文件隔离
- 识别 legacy raw graph、拒绝更高 `fileFormatVersion`；移除打印医疗数据的 console.log

## M0 证明了什么

现有的老前端（Prototype.js + Raphael + webpack 4 bundle）能在**硬化的 Electron 壳**里原样运行，
且 `contextIsolation:true` / `nodeIntegration:false` / `sandbox:true` 不破坏它——这是整条 Electron 路线的前提。

冒烟验收项（`smoke.js`，7/7 PASS）：
- preload contextBridge 生效（隔离世界）
- Prototype.js 全局就位（`Class.create` / `$` / `Prototype`）
- editor 单例初始化
- Raphael 渲染 SVG（603 节点）
- 工具栏渲染（import/export 入口存在）
- PED 导入端到端可用（maxNodeId -1→4）
- renderer 无非预期 console 错误

视觉证据：`m0-smoke.png`（编辑器 + 模板选择框正常渲染）。

## 目录

```
desktop/
  package.json      Electron 壳的独立 package（现代 Node）
  main.js           BrowserWindow + 安全基线 + 单实例锁 + 导航拦截
  preload.js        隔离世界桥；M0 只暴露 isDesktop 标记，M1 长成 DocumentStore API
  stage.js          把 repo 的 index.html + dist + public 装配进 renderer/
  smoke.js          M0 端到端冒烟测试（electron smoke.js，exit 0 = 通过）
  renderer/         staging 产物（git 忽略，由 stage.js 生成）
```

## 从零复现

```bash
# 1) 仓库根目录：装依赖（跳过 node-sass 原生编译，源码未 import scss）+ 构建 bundle
cd <repo-root>
npm install --ignore-scripts
NODE_OPTIONS=--openssl-legacy-provider ./node_modules/.bin/webpack --mode production

# 2) desktop：装 Electron（国内建议用镜像）
cd desktop
ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/" npm install

# 3) 装配 renderer 资源
npm run stage

# 4a) 手动看窗口
DISPLAY=:0 npm start
# 4b) 或跑冒烟验收
DISPLAY=:0 ./node_modules/.bin/electron smoke.js
```

## 环境记录（本机 WSL2）

- Node 24 + webpack 4：需 `NODE_OPTIONS=--openssl-legacy-provider`。
- 源码未 import 任何 `.scss`（font-awesome scss 是未用的 vendor 文件），故 `--ignore-scripts` 跳过 node-sass 即可构建，无需降 Node。
- Electron 二进制走 GitHub 代理下载会 TLS 中断，改用 `ELECTRON_MIRROR=registry.npmmirror.com` 直连成功。
- GUI 依赖 WSLg 的 `DISPLAY=:0`。

## 已知缺口（M1 处理，非回归）

- 未注入 backend，故 renderer 打印 `No "save"/"load" function provided for backend` 并回退到模板选择框——符合预期。
- OMIM/HPO/基因联想依赖 XWiki REST，离线不可用（首版将降级为纯自由文本）。

## 下一步：M1（单文档正确保存）

1. preload 暴露 DocumentStore 契约（listDocuments/openDocument/saveDocument/...）。
2. main 侧 `documentStore.js`：`.opedigree` 原子保存（temp→rename→.bak）。
3. renderer 侧 `desktopBackend.js` 注入 `SaveLoadEngine` 的 save/load；引入 DocumentSession 取代 patientDataUrl；补顶栏 Save 菜单。
4. 场景测试 S1（编辑→存→重开 round-trip 一致）。
