"""
Evaluate TAHD on the synthetic todo_act1_40 dataset.

Compares expected pair labels from manifest.csv against analyzer.analyze_batch output.
Reports:
- TP / FP / TN / FN
- Precision / Recall / F1
- Type mismatches for expected-positive pairs
- Example false positives / false negatives
"""

from __future__ import annotations

import csv
import itertools
from pathlib import Path

from app.services.analyzer import CodeAnalyzer

DATASET_DIR = Path(__file__).resolve().parent / "datasets" / "todo_act1_40"
MANIFEST = DATASET_DIR / "manifest.csv"

TYPE_NUM = {"type1": 1, "type2": 2, "type3": 3}


def load_manifest() -> list[dict]:
    rows = []
    with MANIFEST.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            file_path = DATASET_DIR / row["filename"]
            row["path"] = file_path
            row["code"] = file_path.read_text(encoding="utf-8")
            rows.append(row)
    return rows


def expected_pair(row_a: dict, row_b: dict) -> tuple[bool, int | None]:
    key_a = row_a["pair_key"]
    key_b = row_b["pair_key"]
    if key_a != "none" and key_a == key_b:
        cat = row_a["expected_category"]
        return True, TYPE_NUM.get(cat)
    return False, None


def evaluate(manifest: list[dict], detected_map: dict, label: str, corpus_enabled: bool) -> None:
    tp = fp = tn = fn = 0
    type_mismatch = 0
    false_positives = []
    false_negatives = []
    type_mismatches = []

    by_filename = {row["filename"]: row for row in manifest}

    for a, b in itertools.combinations(manifest, 2):
        key = tuple(sorted((a["filename"], b["filename"])))
        detected = detected_map.get(key, {"clone_count": 0, "dominant_type": None, "overall_similarity": 0.0})
        pred_pos = detected["clone_count"] > 0

        exp_pos, exp_type = expected_pair(a, b)

        if exp_pos and pred_pos:
            tp += 1
            if exp_type != detected["dominant_type"]:
                type_mismatch += 1
                type_mismatches.append(
                    {
                        "pair": key,
                        "expected_type": exp_type,
                        "predicted_type": detected["dominant_type"],
                        "sim": detected["overall_similarity"],
                    }
                )
        elif exp_pos and not pred_pos:
            fn += 1
            false_negatives.append(
                {
                    "pair": key,
                    "expected_type": exp_type,
                }
            )
        elif not exp_pos and pred_pos:
            fp += 1
            false_positives.append(
                {
                    "pair": key,
                    "predicted_type": detected["dominant_type"],
                    "sim": detected["overall_similarity"],
                    "cat_a": by_filename[key[0]]["expected_category"],
                    "cat_b": by_filename[key[1]]["expected_category"],
                }
            )
        else:
            tn += 1

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    print(f"=== TAHD Evaluation: {label} ===")
    print(f"Corpus weighting enabled: {corpus_enabled}")
    print("---")
    print(f"TP: {tp}")
    print(f"FP: {fp}")
    print(f"TN: {tn}")
    print(f"FN: {fn}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1:        {f1:.4f}")
    print(f"Type mismatches (within TP): {type_mismatch}")
    print("---")

    if false_positives:
        print("Top false positives (up to 10):")
        for row in sorted(false_positives, key=lambda x: x["sim"], reverse=True)[:10]:
            print(
                f"  {row['pair'][0]} <-> {row['pair'][1]} | "
                f"pred_type={row['predicted_type']} sim={row['sim']:.4f} "
                f"cats=({row['cat_a']},{row['cat_b']})"
            )
    else:
        print("No false positives.")

    print("---")

    if false_negatives:
        print("False negatives (all):")
        for row in false_negatives:
            print(f"  {row['pair'][0]} <-> {row['pair'][1]} | expected_type={row['expected_type']}")
    else:
        print("No false negatives.")

    print("---")

    if type_mismatches:
        print("Top type mismatches (up to 10):")
        for row in sorted(type_mismatches, key=lambda x: x["sim"], reverse=True)[:10]:
            print(
                f"  {row['pair'][0]} <-> {row['pair'][1]} | "
                f"expected={row['expected_type']} predicted={row['predicted_type']} sim={row['sim']:.4f}"
            )
    else:
        print("No type mismatches in true positives.")

    print()


def run() -> None:
    manifest = load_manifest()
    analyzer = CodeAnalyzer("python")

    submissions = [
        {
            "file": row["filename"],
            "code": row["code"],
        }
        for row in manifest
    ]

    result = analyzer.analyze_batch(submissions, corpus_common_ngram_ratio=0.60)

    detected_map = {}
    for pair in result["pairs"]:
        a = pair["file_a"]
        b = pair["file_b"]
        key = tuple(sorted((a, b)))
        detected_map[key] = {
            "clone_count": pair["clone_count"],
            "dominant_type": pair["dominant_clone_type"],
            "overall_similarity": pair["overall_similarity"],
        }

    print(f"Submission count: {result['submission_count']}")
    print(f"Pair count: {result['pair_count']}")
    print()

    evaluate(
        manifest,
        detected_map,
        label="todo_act1_40 (batch, corpus-weighted)",
        corpus_enabled=result["corpus_weighting"]["enabled"],
    )

    baseline_detected = {}
    for a, b in itertools.combinations(manifest, 2):
        r = analyzer.analyze_pair(
            a["code"],
            b["code"],
            file_a=a["filename"],
            file_b=b["filename"],
            corpus_codes=None,
        )
        key = tuple(sorted((a["filename"], b["filename"])))
        baseline_detected[key] = {
            "clone_count": r["clone_count"],
            "dominant_type": r["dominant_clone_type"],
            "overall_similarity": r["overall_similarity"],
        }

    evaluate(
        manifest,
        baseline_detected,
        label="todo_act1_40 (pairwise, no corpus)",
        corpus_enabled=False,
    )


if __name__ == "__main__":
    run()
