import argparse
import json
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
	sys.path.insert(0, str(BACKEND_DIR))

from app.services.analyzer import CodeAnalyzer


def _safe_div(numerator, denominator):
	return numerator / denominator if denominator else 0.0


def _normalize_pred_type(value):
	if value is None:
		return 0
	if isinstance(value, int):
		return value if value in (0, 1, 2, 3) else 0
	text = str(value).strip().lower()
	if text in {"0", "none", "non-clone", "non_clone", "no_clone"}:
		return 0
	if "type-1" in text or text == "1":
		return 1
	if "type-2" in text or text == "2":
		return 2
	if "type-3" in text or text == "3":
		return 3
	return 0


def _compute_metrics(cases, predictions):
	tp = fp = fn = tn = 0
	type_totals = {1: 0, 2: 0, 3: 0}
	type_correct = {1: 0, 2: 0, 3: 0}

	for case in cases:
		cid = case["id"]
		expected_type = int(case["expected_type"])
		predicted_type = _normalize_pred_type(predictions.get(cid, 0))

		expected_clone = expected_type > 0
		predicted_clone = predicted_type > 0

		if expected_clone and predicted_clone:
			tp += 1
		elif not expected_clone and predicted_clone:
			fp += 1
		elif expected_clone and not predicted_clone:
			fn += 1
		else:
			tn += 1

		if expected_type in type_totals:
			type_totals[expected_type] += 1
			if predicted_type == expected_type:
				type_correct[expected_type] += 1

	precision = _safe_div(tp, tp + fp)
	recall = _safe_div(tp, tp + fn)
	f1 = _safe_div(2 * precision * recall, precision + recall)
	accuracy = _safe_div(tp + tn, len(cases))

	return {
		"total_cases": len(cases),
		"accuracy": round(accuracy, 4),
		"precision": round(precision, 4),
		"recall": round(recall, 4),
		"f1": round(f1, 4),
		"tp": tp,
		"fp": fp,
		"fn": fn,
		"tn": tn,
		"type_accuracy": {
			str(t): round(_safe_div(type_correct[t], type_totals[t]), 4)
			for t in (1, 2, 3)
			if type_totals[t] > 0
		},
	}


def _run_tahd(cases):
	preds = {}
	for case in cases:
		analyzer = CodeAnalyzer(case["language"])
		result = analyzer.analyze_pair(
			case["code_a"],
			case["code_b"],
			case.get("file_a", "a"),
			case.get("file_b", "b"),
		)
		preds[case["id"]] = result["dominant_clone_type"] if result["clone_count"] > 0 else 0
	return preds


def _print_table(rows):
	headers = ["Tool", "Acc", "Prec", "Recall", "F1", "TP", "FP", "FN", "TN"]
	widths = [len(h) for h in headers]
	for row in rows:
		for i, cell in enumerate(row):
			widths[i] = max(widths[i], len(str(cell)))

	line = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
	sep = "-+-".join("-" * widths[i] for i in range(len(headers)))
	print(line)
	print(sep)
	for row in rows:
		print(" | ".join(str(cell).ljust(widths[i]) for i, cell in enumerate(row)))


def main():
	parser = argparse.ArgumentParser(
		description="Compare TAHD metrics against external tool predictions (e.g., MOSS/JPlag)."
	)
	parser.add_argument(
		"--dataset",
		type=Path,
		default=Path(__file__).with_name("ground_truth_extended.json"),
		help="Path to benchmark dataset JSON.",
	)
	parser.add_argument(
		"--tools",
		type=Path,
		default=None,
		help=(
			"Optional JSON with external predictions. Format: "
			'{"moss": {"case_id": 0|1|2|3|"Type-2"}, "jplag": {...}}'
		),
	)
	args = parser.parse_args()

	payload = json.loads(args.dataset.read_text(encoding="utf-8"))
	cases = payload.get("cases", [])

	tahd_preds = _run_tahd(cases)
	tahd_metrics = _compute_metrics(cases, tahd_preds)

	external = {}
	if args.tools is not None and args.tools.exists():
		external = json.loads(args.tools.read_text(encoding="utf-8"))

	tool_reports = {"TAHD": {"metrics": tahd_metrics, "predictions": tahd_preds}}
	for tool_name, preds in external.items():
		tool_reports[tool_name] = {
			"metrics": _compute_metrics(cases, preds),
			"predictions": preds,
		}

	print("Clone Detection Comparison")
	print("========================")
	print(f"Dataset: {args.dataset.name}")
	print(f"Cases:   {len(cases)}")
	print()

	rows = []
	for tool_name, report in tool_reports.items():
		m = report["metrics"]
		rows.append([
			tool_name,
			f"{m['accuracy']:.4f}",
			f"{m['precision']:.4f}",
			f"{m['recall']:.4f}",
			f"{m['f1']:.4f}",
			m["tp"],
			m["fp"],
			m["fn"],
			m["tn"],
		])
	_print_table(rows)

	print("\nType-level accuracy")
	print("-------------------")
	for tool_name, report in tool_reports.items():
		ta = report["metrics"]["type_accuracy"]
		parts = [f"Type-{k}={v:.4f}" for k, v in ta.items()]
		print(f"{tool_name}: " + (", ".join(parts) if parts else "n/a"))


if __name__ == "__main__":
	main()
