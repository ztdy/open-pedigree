# Open Pedigree · Windows 桌面版

**简体中文** | [English](README.en.md)

<p align="center">
  <img src="docs/img/hero.png" width="720" alt="桌面版编辑器：家系图、proband 箭头与临床图例"/>
</p>

[Open Pedigree](https://github.com/phenotips/open-pedigree)（PhenoTips 出品的浏览器版家系图 / 家谱编辑器）的**双击即用 Windows 桌面版**。**完全离线**运行——不需要 Web 服务器、不需要联网——家系数据以**本地文件**形式保存。

提供标准 **NSIS 安装版**和**免安装 portable `.exe`** 两种形态，下载见 [Releases](../../releases) 页面。

---

## 相较原版 Open Pedigree 新增了什么

原版 Open Pedigree 是一个浏览器应用，需要起 Web 服务器，且疾病 / 基因 / 表型的联想依赖在线的 XWiki / REST 后端。本版本把它做成了自包含的桌面程序，并新增以下功能。

### 🖥️ 原生 Windows 桌面运行
双击启动——无需 Node、无需服务器、无需配置浏览器。在硬化的 Electron 壳（`contextIsolation`、`sandbox`、关闭 `nodeIntegration`）里本地运行编辑器。

### 📁 本地家系库
<img src="docs/img/library.png" width="640" alt="本地家系库中的家系卡片"/>

把**多个**家系存为文件统一管理。家系库支持新建、搜索、排序、打开、重命名、复制、删除，每张卡片显示**临床摘要**（候选基因、HPO / 疾病计数、人数）。

### 💾 便携——数据跟着软件走
<img src="docs/img/data-location.png" width="560" alt="首次运行选择数据目录" />

首次运行时可选择数据存放位置。**portable** 版会把数据存放在 `.exe` 旁边，于是软件 + 家系数据整包塞进 U 盘即可随身携带。你也可以指定任意目录。

### 🔎 离线基因 & 表型联想
<p>
  <img src="docs/img/gene-autocomplete.png" width="420" alt="离线 HGNC 基因联想"/>
  <img src="docs/img/hpo-autocomplete.png" width="420" alt="离线 HPO 表型联想"/>
</p>

内置 **HGNC 基因**与 **HPO 表型**数据集，Genes 和 Phenotypic features 字段的自动补全**无需联网**即可用——而原版需要在线的 REST 服务。已保存的术语在重新打开时会正确解析回真实名称（不再卡在 “loading…”）。

### 🎯 指定 proband（先证者）
<img src="docs/img/proband.png" width="640" alt="Personal 页里的 Proband 复选框"/>

用一个复选框把任意成员标记为 **proband（先证者 / 索引病例）**。这个标记是**权威**的——它驱动亲缘关系计算和 GA4GH / FHIR 导出，而不只是那个 ↙ 箭头——切换时是单步可撤销的操作，且始终只保留一个 proband。

### 🎨 图例改色
点击图例上的色块，即可为某个疾病 / 基因 / 表型任选颜色。颜色会随家系一起保存，并在重新打开时恢复。

### 📥 导入为新家系
可将 **PED**、**GEDCOM**、**BOADICEA**、**GA4GH FHIR** 文件直接导入成一条新的家系库记录，支持格式自动识别，解析失败时干净回滚。单人（单个体）导入也已正确处理。

---

## 功能速览

- 🖥️ **原生 Windows 桌面运行**——双击即用，无需服务器或浏览器
- 📁 **本地家系库**——保存 / 搜索 / 排序 / 重命名 / 复制 / 删除，附临床摘要
- 💾 **便携**——数据存放在 `.exe` 旁边（U 盘即走）；首次运行可选目录
- 🔎 **离线基因（HGNC）与表型（HPO）联想**——无需联网
- 🎯 **proband 指定**——权威（驱动亲缘计算 + GA4GH/FHIR 导出），单步可撤销
- 🎨 **图例改色**——随家系保存与恢复
- 📥 **导入 PED / GEDCOM / BOADICEA / GA4GH FHIR** 为新家系

---

## 致谢与许可

本项目 fork 自 [PhenoTips Open Pedigree](https://github.com/phenotips/open-pedigree)，基于
[Prototype](http://prototypejs.org)、[Raphaël](https://dmitrybaranovskiy.github.io/raphael/) 和
[PhenoTips](https://phenotips.com) 构建。以
[LGPL‑2.1](https://opensource.org/licenses/LGPL-2.1) 许可发布，详见 [`LICENSE`](LICENSE)。
