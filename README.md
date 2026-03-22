# LeetReview 🧱✨

LeetReview 是一款基于 **Minecraft (我的世界)** 像素视觉风格开发的 **力扣 (LeetCode) 艾宾浩斯智能复习** 浏览器插件。它能帮助力扣刷题者科学安排复习计划，通过 AI 导师提供解题建议，并集成原生热力图数据。

## 🌟 核心功能

-   **艾宾浩斯智能复习**: 自动计算复习周期，支持 "轻松/一般/困难" 三档反馈，科学抗遗忘。
-   **Minecraft 像素风**: 深度定制的 MC UI 皮肤，泥土、草方块、钻石块... 刷题就像挖矿。
-   **DeepSeek AI 导师**: 集成 DeepSeek-V3 API，提供每日学情总结、代码诊疗和渐进式解题提示。
-   **分级复习限额**: 针对刷题量巨大的用户，支持设置每日最大复习数量（如每天仅复习 20 题），缓解压力。
-   **原生热力图同步**: 自动抓取并展示力扣官网的提交活跃度，与插件本地记录完美融合。

## 🛠️ 安装与运行

### 1. 克隆仓库
```bash
git clone git@github.com:123kaze/LeetReview.git
cd LeetReview
```

### 2. 安装依赖
```bash
npm run install-all
```
*(该命令会自动安装根目录及 extension/ui 中的所有 npm 依赖)*

### 3. 编译插件
```bash
npm run build
```

### 4. 加载到浏览器
-   打开 Chrome 或 Edge 的 `扩展程序` 页面 (`chrome://extensions/`)。
-   开启右侧的 **开发者模式**。
-   点击 **加载已解压的扩展程序**。
-   选择项目中的 `extension/dist` 目录即可。

## 📦 目录结构

-   `/extension`: 插件主目录
    -   `/dist`: 编译后的可分发资源
    -   `/ui`: 基于 React + Vite 的控制面板源码
    -   `background.js`: 核心 Service Worker 及 GraphQL 拦截器
    -   `ebbinghaus.js`: 艾宾浩斯调度引擎
-   `mt.md`: 进阶刷题路线参考文档

## ⚙️ 配置说明

在使用前，建议在插件的 **设置 (Settings)** 页面配置：
-   **DeepSeek API Key**: 用于开启 AI 导师功能。
-   **每日最大复习数**: 建议设置为 15-30 之间，平衡学习强度。

---

**Happy Leetcoding with Blocks! ⛏️💎**
