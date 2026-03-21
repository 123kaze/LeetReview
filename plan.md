# LeetCode Ebbinghaus Review Extension - Project Plan

## 1. 项目概述 (Project Overview)
本项目旨在开发一款浏览器插件（Chrome Extension），核心功能是基于**艾宾浩斯遗忘曲线**（Ebbinghaus Forgetting Curve）帮助用户科学地复习 LeetCode 题目。插件将自动获取用户的刷题记录，计算复习节点，并结合 `mt.md` 中的科学刷题路线，每天向用户精准推送“今日复习”和“今日新学”任务。
同时接入 **DeepSeek 大模型**，根据用户的做题情况、卡壳程度以及知识点薄弱项，提供个性化的学习建议和复习提示。

## 2. 核心功能设计 (Core Features)

### 2.1 LeetCode 数据同步与监听
- **历史数据全量同步**：通过调用 LeetCode.cn 的 GraphQL API（参考 `leetcode周赛显示.js` 中的实现，如 `allPbPostData`），拉取用户已做题目的状态、难度、标签等。
- **实时解题监听**：通过 Content Script 注入到 LeetCode 刷题页面，监听用户 `Accepted`（通过） 的提交动作，自动记录首次通过时间，将其加入遗忘曲线调度池。

### 2.2 艾宾浩斯复习调度引擎
- **复习周期**：默认按照 1天、2天、4天、7天、15天、30天 等节点安排复习。
- **状态流转**：
  - 待复习 -> 今日需要重做的题目。
  - 掌握程度调节：每次复习后，用户可以标注“轻松掌握”、“一般”、“困难”，系统动态微调下一次复习间隔间隔。

### 2.3 科学刷题指引 (基于 `mt.md`)
- 解析 `mt.md` 中的核心刷题路线和各个专题（如滑动窗口、二分、动态规划等）。
- **今日新学**：结合用户的当前进度和难度分（Rating），按照系统化的路线推荐适合用户当前水平（例如 难度分 ≤ 1700 或 匹配当前训练专题）的新题目。

### 2.4 DeepSeek 大模型赋能
- **每日学情总结与打气**：根据昨日刷题量和今日任务量，生成一段专属的早安/督促语音或文字。
- **智能提示导师 (Hint Tutor)**：复习时如果卡壳，不直接看题解，而是通过 DeepSeek 分析题目和用户以往的弱点，给出 Step-by-Step 的思路提示（启发式学习）。
- **个性化排期建议**：如果积累的待复习题目过多（Review Hell），DeepSeek 会建议哪些题目优先级高（如热点面试题、核心算法），哪些可以暂时降级。

## 3. 技术架构 (Technical Architecture)

- **前端/UI层**：
  - **Popup 面板**：点击扩展图标弹出，展示粗略的今日任务统计（复习：X道，新学：Y道）。
  - **Home Dashboard (New Tab 或 独立页面)**：以类似看板的形式，详细列出今日需要完成的题目卡片，集成 DeepSeek 交互对话框。
- **逻辑控制层 (Background / Service Worker)**：
  - `background.js`：运行常驻服务，管理定时器（Alarms）用于每日提醒，处理 Chrome 本地存储（`chrome.storage.local`）的读写，以及调度 DeepSeek API 请求。
- **数据抓取层 (Content Scripts)**：
  - `content.js`：匹配 `https://leetcode.cn/problems/*`，负责页面的 DOM 监听和向 Background 发送解题成功事件。
- **第三方服务**：
  - **LeetCode GraphQL API**：获取题目详细信息和提交记录。
  - **DeepSeek API**：大语言模型服务端点。

## 4. 开发步骤规划 (Development Steps)

### 阶段一：基础框架搭建与数据同步 (Phase 1)
1. 初始化 Chrome 插件目录结构（Manifest V3）。
2. 实现 LeetCode GraphQL 接口封装，支持获取题目列表、用户提交状态。
3. 实现 Content Script 拦截和解析用户过题状态。

### 阶段二：艾宾浩斯引擎与存储设计 (Phase 2)
1. 设计 `chrome.storage.local` 数据结构，存储题目 ID、首次通过时间、下一次复习时间戳、复习次数。
2. 编写调度核心逻辑：每天凌晨自动计算生成“今日复习名单”。

### 阶段三：UI 界面开发 (Phase 3)
1. 开发插件 Popup 界面，显示精简任务视图。
2. 开发 Dashboard 页面，使用清晰的 UI 呈现“今日复习”和“今日新学（根据题单提取）”。

### 阶段四：DeepSeek 接入与业务融合 (Phase 4)
1. 在插件设置页增加 DeepSeek API Key 的配置项。
2. 编写 Prompt 模板，在获取今日任务后向 DeepSeek 请求针对性点评和鼓励语。
3. 开发“智能提示”功能面板。

### 阶段五：测试与优化 (Phase 5)
1. 异常处理：LeetCode 登录态过期处理、API 请求限流处理。
2. 根据真实体验调优调度算法。
