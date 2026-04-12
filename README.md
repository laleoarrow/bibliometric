# bibliometric

### Web of Science 文献计量 - 排名实体指标提取与批量纯文本导出

<p>
  <img src="https://img.shields.io/badge/Claude_Code-black?style=flat-square&logo=anthropic&logoColor=white" alt="Claude Code">
  <img src="https://img.shields.io/badge/OpenAI_Codex_CLI-412991?style=flat-square&logo=openai&logoColor=white" alt="OpenAI Codex CLI">
  <img src="https://img.shields.io/badge/Web_of_Science-blue?style=flat-square" alt="Web of Science">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
</p>

> **面向 Web of Science 的文献计量 skill。** 处理排名实体指标提取、`Citation Report` 指标校验，以及已登录 Edge 会话中的 WoS 纯文本批量导出。

一个 AI Agent skill，用于把 Web of Science 文献计量任务变成可审计流程。它强调保存 HTML/导出文件等证据对象，而不是依赖一次性的页面读数或截图记忆。

## 当前范围

- `Analyze Results` 中 `Countries/Regions`、`Affiliations`、`Authors` 的排名指标提取
- `Citation Report` 中 `Citation`、`Citing Articles`、`H-Index`、`Average per item` 的提取与核对
- 向项目 CSV 回填标准化列名与校验后的 citation metrics
- 在已登录的 Edge 会话中，按批次导出 WoS plain-text records
- 保存 HTML、截图、manifest 等审计材料

当前不覆盖：
- Scopus
- Dimensions
- Lens
- PubMed-only 文献计量
- 一般性论文润色或写作任务

## 工作流概览

### 1. 排名实体指标提取

```
WoS Summary / Analyze Results
        ↓
保存 summary HTML
        ↓
进入 entity-specific Citation Report
        ↓
保存 Citation Report HTML
        ↓
解析指标 + 手工核对 Average per item
        ↓
更新输出表并保留验证痕迹
```

对应内部资源：
- `references/wos-rank-metrics-workflow.md`
- `scripts/parse_wos_citation_report.py`
- `scripts/update_position_csv.py`

### 2. WoS 纯文本批量导出

```
已登录 Edge 中打开 WoS 结果页
        ↓
读取 live export overlay limit
        ↓
按真实上限切批
        ↓
每批保存 overlay screenshot
        ↓
导出 tagged plain-text
        ↓
验证记录数并写出 manifest
```

对应内部资源：
- `references/export-wos-workflow.md`
- `scripts/export_wos_plaintext.mjs`

## 核心原则

1. 先验证 WoS 页面状态，再开始提取或导出。
2. 优先保存 HTML、`.txt`、截图、manifest 等耐久证据。
3. 不静默相信网页显示值；需要手工计算值与 HTML 指标互相校验。
4. 文件命名和批次命名必须可重复、可追溯。

## 安装

### CC Switch
```bash
git clone https://github.com/laleoarrow/bibliometric.git ~/agents/bibliometric
mkdir -p ~/.cc-switch/skills
ln -s ~/agents/bibliometric/skills/bibliometric ~/.cc-switch/skills/bibliometric
```

### Claude Code
```bash
git clone https://github.com/laleoarrow/bibliometric.git ~/agents/bibliometric
ln -s ~/agents/bibliometric/skills/bibliometric ~/.claude/skills/bibliometric
```

### Codex CLI
```bash
git clone https://github.com/laleoarrow/bibliometric.git ~/agents/bibliometric
ln -s ~/agents/bibliometric/skills/bibliometric ~/.codex/skills/bibliometric
```

## 目录结构

- `skills/bibliometric/`
  - 用户可见的 skill 入口
- `references/`
  - 细化的 WoS workflow 文档
- `scripts/`
  - 可复用的解析与导出脚本

## License

MIT License

---

**GitHub**: https://github.com/laleoarrow/bibliometric
