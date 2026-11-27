# 需求提取评测资料

本目录随项目归档，保存需求提取（Requirement Agent）的评测样本、两版评测脚本与历史报告，用于说明提示词与校验规则的迭代效果。它不是 `pytest` 用例：文件名不以 `test_` 开头，不会进入默认离线测试。

## 内容

| 文件 | 说明 |
| --- | --- |
| `requirement_collection/requirement_cases_8.json` | 最早的 8 条样本，用于首轮调参 |
| `requirement_collection/requirement_cases_15.json` | 扩充后的 15 条样本 |
| `requirement_collection/requirement_cases_40.json` | 扩充后的 40 条样本 |
| `requirement_collection/requirement_cases_50.json` | 完整评测集，50 条（34 条正向 + 16 条边界与非法输入） |
| `requirement_collection/requirement_eval_agent_v1.py` | 旧口径脚本：偏好用集合交集判定，分母不拆分 |
| `requirement_collection/requirement_eval_agent_v2.py` | 现行口径脚本：分母拆分 + precision/recall/F1 + 样本级全对率 |
| `requirement_collection/eval_report_20261014.txt` | 50 条样本的历史评测报告 |

## 关键结果（历史报告，单次运行）

- 结构化输出合规率 50/50 = 100%
- 用户提及字段的提取准确率：目的地 41/42 = 97.6%，天数 32/32，预算 25/25
- 偏好元素级 micro-F1 86.2%（P 80.6% / R 92.6%）
- 样本级全对 43/50 = 86.0%

## 运行方式

需要可用的模型 Key（见项目根目录 `.env.example`），并会产生少量 API 费用：

```powershell
$env:PYTHONUTF8 = 1; $env:PYTHONIOENCODING = "utf-8"
uv run --locked -m tests.evaluation.requirement_collection.requirement_eval_agent_v2
```

## 说明

- 指标为单次运行结果，受模型采样随机性影响，存在约 ±3 个百分点的波动；比较不同提示词版本时应在同一批次内重跑。
- 本目录资料为历史对照基线，不属于默认自动化测试范围。
