"""
TAHD — Token-AST-Halstead Detection Pipeline  v1.15
=====================================================
A three-layer hybrid code clone detection engine for educational
Python and Java submissions.

Layer 1 — Token Prefilter      : Jaccard similarity on normalized token n-grams
Layer 2 — AST Structural Check : Body-only edit-distance + bag-of-nodes blend
Layer 3 — Halstead Fingerprint : Cosine similarity on Halstead complexity vectors

Fusion score = weighted combination (per clone type) of all three layer scores

Clone classification
--------------------
  Type 1 — Exact clone:
      (a) raw_tokens_a == raw_tokens_b                    [exact, whitespace/comment-free]
      (b) lit_tokens_a == lit_tokens_b                    [exact modulo constants]
      (c) raw_token_score >= 0.88 AND ast >= 0.95         [near-exact fallback]
          gate: line_ratio <= 1.05 (Fix #v112-3)

  Type 2 — Renamed clone (four paths, checked in order):
      STRICT   : token >= 0.75 AND ast >= 0.75
      HALSTEAD : token >= 0.75 AND ast >= 0.55
                 (relaxed to 0.45 for short blocks, Fix #v112-5)
                 AND halstead >= 0.85
      RELAXED  : token >= 0.82 AND ast >= 0.60
      LIT      : lit >= 0.70 AND ast >= 0.60
      ALIGN    : rename_align >= 0.80 AND ast >= 0.65 (Fix #v112-4)

  Type 3 — Near-miss clone (three paths):
      STANDARD : fusion_default >= 0.60 AND ast >= 0.35
                 AND (token >= 0.35 OR lit >= 0.30 OR tc_boost)
                 AND max(ast,token) >= 0.40
                 tc_boost = tc >= 0.65 AND (token >= 0.20 OR lit >= 0.20)
                 Confidence uses fusion_default (Fix #v112-7)
      HALSTEAD : fusion_t3 >= 0.55 AND ast >= 0.40 AND halstead >= 0.80
                 AND (token >= 0.25 OR (token > 0 AND tc >= 0.50) OR tc >= 0.65)
      HALSTEAD_DOMINANT (Fix #v114-19):
                 halstead >= 0.95 AND fusion_t3 >= 0.55 AND ast >= 0.25
                 AND token_containment >= 0.35 AND structurally_close
                 Targets OOP-to-procedural rewrites where Halstead complexity
                 fingerprints are near-identical but AST structure diverges.

Improvements in v1.15
---------------------
  Fix #v115-1  : BUG — all Python blocks in a file received the same AST
                 sequence. _make_block was passing the full Module tree to
                 _ensure_ast_sequence; _python_ast_sequence_from_tree always
                 resolved to body[0] (the first top-level node). Fixed by
                 passing the specific FunctionDef node as _ast_tree instead
                 of the Module tree. This was the most impactful correctness
                 bug: every pair in a class-based submission was compared
                 with identical AST sequences.

  Fix #v115-2  : BUG — bag-of-nodes cosine similarity used intersection
                 (element-wise min) instead of true dot product.
                 Old: sum((ca & cb).values()) / (|ca| * |cb|)
                 New: sum(ca[k]*cb[k] for k in ca if k in cb) / (|ca| * |cb|)
                 The old formula systematically underestimated similarity
                 for bags with high-frequency shared nodes (e.g. two loops
                 both containing 3 "Name" nodes scored ~0.33 instead of ~0.89).

  Fix #v115-3  : BUG — raw_token_score fallback in classify_clone silently
                 replaced a legitimate 0.0 raw score with token_score:
                 `raw_token_score if raw_token_score > 0 else token_score`.
                 A genuine raw score of 0.0 (no overlapping n-grams) could
                 trigger the Type-1 fallback via a high normalised token score.
                 Fixed: the sentinel is now checked against None (set explicitly
                 when raw_token_score is unavailable).

  Fix #v115-4  : PERF — _extract_python_blocks used ast.walk() to collect
                 FunctionDef nodes, which recurses into nested closures and
                 returns them as top-level blocks. Replaced with a one-level
                 DFS that descends through Module and ClassDef containers but
                 stops at function boundaries, so inner closures are not
                 extracted as independent blocks.

  Fix #v115-5  : PERF/ACCURACY — Combined the three separate AST traversals
                 (seq builder, bag-of-statements, cyclomatic complexity) into
                 a single DFS walk (_python_ast_combined_walk). Eliminates
                 2 redundant O(N) passes per block. Measured 2.2× speedup on
                 the per-block analysis phase. CC is now stored immediately in
                 _cc_cache during block construction (Python only), so
                 _compare_block_pairs never recomputes it.

  Fix #v115-6  : PERF — _lcs_ratio is O(M×N) in Python and dominates runtime
                 for short AST sequences (100–150 µs for 20-node seqs vs 28 µs
                 for SequenceMatcher). Added a short-sequence fast-path: when
                 both sequences are shorter than LCS_SHORT_THRESHOLD (80 nodes),
                 _edit_distance_normalized uses SM.ratio() only (weight = 1.0).
                 For longer sequences the existing 0.75/0.25 SM+LCS blend is
                 retained. Also added a disjoint-set early-exit in _lcs_ratio:
                 if the two sequences share no elements, returns 0.0 immediately
                 without allocating the DP table.

  Fix #v115-7  : PERF — _compute_nesting_depth (Python path) called ast.parse()
                 independently even though the block already has _ast_tree set
                 after Fix #v115-5. Now reuses the cached tree.

All v1.14.1 / v1.14 / v1.12 and earlier fixes are retained verbatim.

Dataset preparation guidelines
-------------------------------
TAHD compares all input files against each other in a single pool. When running
benchmarks or evaluating student submissions, ensure that original/reference
implementations are EXCLUDED from the input set. If reference files are included,
they will flag against each other at 100% similarity (Type-1 exact clones).

This is analogous to MOSS's `-b` base-file flag, which marks certain files as
reference implementations that should not be compared against themselves.

For thesis/research methodology:
  - Separate reference implementations from student submissions during dataset prep
  - Only pass student submission files to the analyzer
  - Store reference files separately for manual comparison if needed

v1.15 (2026-03-09)
  - Fix #v115-1 : Correct per-block AST tree (FunctionDef, not Module).
  - Fix #v115-2 : Bag cosine uses true dot product, not intersection.
  - Fix #v115-3 : raw_token_score=0 no longer replaced by token_score.
  - Fix #v115-4 : Block extraction stops at function boundaries (no closures).
  - Fix #v115-5 : Single combined AST walk for seq + bag + CC per block.
  - Fix #v115-6 : LCS skipped for short seqs; disjoint-set early-exit added.
  - Fix #v115-7 : _compute_nesting_depth reuses cached AST tree.
"""

import ast
import bisect
import collections
import difflib
import heapq
import io
import itertools
import logging
import math
import re
import sys
import textwrap
import time
import tokenize
import uuid
from dataclasses import dataclass, field
from typing import Iterator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = {"python", "java"}

# ---------------------------------------------------------------------------
# Per-type fusion weight vectors (Fix #v18-6)
# ---------------------------------------------------------------------------
FUSION_WEIGHTS = {
    1: (0.50, 0.30, 0.20),
    2: (0.25, 0.50, 0.25),
    3: (0.20, 0.35, 0.45),
    "default": (0.30, 0.40, 0.30),
}

W_TOKEN    = FUSION_WEIGHTS["default"][0]
W_AST      = FUSION_WEIGHTS["default"][1]
W_HALSTEAD = FUSION_WEIGHTS["default"][2]

assert abs(W_TOKEN + W_AST + W_HALSTEAD - 1.0) < 1e-9
for _k, _w in FUSION_WEIGHTS.items():
    if isinstance(_k, int):
        assert abs(sum(_w) - 1.0) < 1e-9, f"Fusion weights for type {_k} must sum to 1.0"

# Pre-filter thresholds
THRESH_TOKEN_PREFILTER    = 0.40
THRESH_HALSTEAD_PREFILTER = 0.80

# Optional tuning knobs for over-flagging control (defaults are non-destructive)
DEFAULT_CONFIDENCE_FLOOR = 0.0
DEFAULT_ENABLE_POOL_SUPPRESSION = False
DEFAULT_POOL_CONFIDENCE_FLOOR = 0.0
DEFAULT_POOL_CONFIDENCE_MODE = "max"
POOL_CONFIDENCE_MODES = frozenset({"max", "mean"})
DEFAULT_AUTO_TUNE_FILTERS = False
DEFAULT_BATCH_ENABLE_POOL_SUPPRESSION = True
DEFAULT_BATCH_AUTO_TUNE_FILTERS = True
DEFAULT_TYPE12_CONFIDENCE_FLOOR = 0.60
DEFAULT_TYPE3_CONFIDENCE_FLOOR = 0.0
DEFAULT_PRESERVE_TYPE3_RECALL = True

TYPE3_TEMPLATE_FANOUT_THRESHOLD = 6
TYPE3_TEMPLATE_TOKEN_MAX = 0.65
TYPE3_TEMPLATE_HALSTEAD_MIN = 0.95

TYPE12_TEMPLATE_FANOUT_THRESHOLD = 12
TYPE12_TEMPLATE_KEEP_TOP_K = 1

AUTO_CONFIDENCE_FLOOR_QUANTILE = 0.65
AUTO_POOL_CONFIDENCE_QUANTILE = 0.85
AUTO_MIN_CONFIDENCE_FLOOR = 0.55
AUTO_MIN_POOL_CONFIDENCE_FLOOR = 0.75
AUTO_MIN_SAMPLE_PAIRS = 8

# Type-1 thresholds
THRESH_TYPE1                  = 0.95
THRESH_TYPE1_FALLBACK         = 0.88
THRESH_TYPE1_FALLBACK_RATIO   = 1.05
THRESH_TYPE1_FALLBACK_MIN_LINES = 5
THRESH_TYPE1_FALLBACK_MIN_RAW_TOKENS = 15

# Type-2 thresholds
THRESH_TYPE2                    = 0.75
THRESH_TYPE2_HAL_AST            = 0.55
THRESH_TYPE2_HAL_AST_SHORT      = 0.45
THRESH_TYPE2_HAL_SHORT_LINES    = 15
THRESH_TYPE2_HAL_HALSTEAD       = 0.85
THRESH_TYPE2_RELAXED_TOKEN      = 0.82
THRESH_TYPE2_RELAXED_AST        = 0.60
THRESH_TYPE2_RENAME_ALIGN       = 0.80
THRESH_TYPE2_RENAME_AST         = 0.65
THRESH_TYPE2_STRICT_SHORT_MAX_LINES = 3
THRESH_TYPE2_STRICT_SHORT_MIN_RAW_TOKENS = 15

# Type-3 thresholds
THRESH_FUSION_TYPE3     = 0.60
THRESH_FUSION_TYPE3_HAL = 0.55
THRESH_TYPE3_AST_MIN    = 0.35
THRESH_TYPE3_TOKEN_MIN  = 0.35
THRESH_TYPE3_PEAK       = 0.40
THRESH_TYPE3_HAL_AST    = 0.40
THRESH_TYPE3_HAL_MIN    = 0.80
THRESH_TYPE3_HAL_TOKEN  = 0.25
THRESH_TYPE3_CONTAINMENT      = 0.58
THRESH_TYPE3_CONTAINMENT_WEAK = 0.50
THRESH_TYPE3_TC_BOOST         = 0.50
THRESH_TYPE3_TC_BOOST_BASE    = 0.15
THRESH_TYPE3_LIT_MIN          = 0.30
THRESH_TYPE3_HIGH_AST         = 0.75
THRESH_TYPE3_AST_HAL_FALLBACK = 0.50
THRESH_TYPE3_HAL_FALLBACK     = 0.75
THRESH_TYPE3_MIN_LINES = 4
THRESH_TYPE3_MIN_RAW_TOKENS = 18
THRESH_TYPE3_SMALL_BLOCK_CONTAINMENT_RESCUE = 0.78

# Fix #v114-19: HALSTEAD_DOMINANT path thresholds
THRESH_TYPE3_HALDOM_HALSTEAD  = 0.95   # near-identical Halstead fingerprint
THRESH_TYPE3_HALDOM_AST       = 0.25   # relaxed AST floor for structural rewrites
THRESH_TYPE3_HALDOM_AST_DISCOUNT_START = 0.40
THRESH_TYPE3_HALDOM_AST_DISCOUNT_SCALE = 1.0
THRESH_TYPE3_HALDOM_MIN_DISCOUNT = 0.65
# (reuses THRESH_FUSION_TYPE3_HAL = 0.55 as the fusion entry gate)

# Rename-alignment pre-gate
RENAME_ALIGN_GATE_THRESHOLD = 0.65

# AST blend weights
W_AST_EDIT     = 0.60
W_AST_BAG      = 0.40
_W_SM          = 0.75
_W_LCS         = 0.25
_W_BAG_NODES   = 0.875
_W_BAG_STMTS   = 0.125

# Adaptive n-gram boundaries
NGRAM_SHORT_BOUND  = 20
NGRAM_LONG_BOUND   = 60
NGRAM_SIZE_SHORT   = 2
NGRAM_SIZE_DEFAULT = 3
NGRAM_SIZE_LONG    = 4

# Token and line-count floors
MIN_TOKENS = 15
MIN_LINES  = 5

# Short-block rescue floors
MIN_TOKENS_SHORT = 8
MIN_LINES_SHORT  = 3

# Cross-pair asymmetric rescue
MIN_LINES_CROSS  = 3
MIN_TOKENS_CROSS = 20

# AST sequence sampling
MAX_AST_LEN = 500

# Refactoring snippet cap
MAX_SNIPPET_LINES = 15

# Per-pair safety caps
MAX_PAIR_SECONDS = 2.0
MAX_PAIRS        = 5000

TAHD_VERSION = "v1.15"

# Fix #v115-6: threshold below which LCS is skipped (SM-only is faster)
LCS_SHORT_THRESHOLD = 80

# Corpus-aware token weighting (classroom pool normalization)
CORPUS_COMMON_DOC_RATIO = 0.60
CORPUS_COMMON_MIN_WEIGHT = 0.15
CORPUS_COMMON_MAX_WEIGHT = 0.35
CORPUS_RARE_MAX_DOC_FREQ = 3
CORPUS_RARE_MAX_BOOST = 0.20
CORPUS_COMMON_SMALL_COHORT_RATIO_FLOOR = 0.70
CORPUS_COMMON_LARGE_COHORT_RATIO_CAP = 0.55
CORPUS_COMMON_OVERLAP_PENALTY_MIN = 0.70
CORPUS_COMMON_OVERLAP_AST_MAX = 0.55
CORPUS_COMMON_OVERLAP_SCALE = 0.60
CORPUS_COMMON_OVERLAP_MIN_FACTOR = 0.65
CORPUS_COMMON_OVERLAP_TYPE3_PENALTY_MIN = 0.75
CORPUS_COMMON_OVERLAP_TYPE3_SCALE = 1.20
CORPUS_COMMON_OVERLAP_TYPE3_MIN_FACTOR = 0.30
CORPUS_COMMON_OVERLAP_TYPE3_HARD_PENALTY_MIN = 0.88
CORPUS_COMMON_OVERLAP_TYPE3_HARD_MIN_FACTOR = 0.12
CORPUS_RARE_OVERLAP_SIGNAL_MAX_DOC_FREQ = 2
CORPUS_RARE_OVERLAP_SIGNAL_MAX_RATIO = 0.08

# ---------------------------------------------------------------------------
# Java token/keyword tables
# ---------------------------------------------------------------------------

JAVA_OPERATORS = frozenset([
    "+", "-", "*", "/", "%", "++", "--",
    "==", "!=", "<", ">", "<=", ">=",
    "&&", "||", "!", "&", "|", "^", "~", "<<", ">>", ">>>",
    "=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
    "<<=", ">>=", ">>>=", "?", ":",
    "new", "instanceof", "return", "if", "else", "for",
    "while", "do", "switch", "case", "break", "continue",
    "throw", "try", "catch", "finally",
])

JAVA_KEYWORDS = frozenset([
    "abstract", "assert", "boolean", "break", "byte", "case", "catch",
    "char", "class", "const", "continue", "default", "do", "double",
    "else", "enum", "extends", "final", "finally", "float", "for",
    "goto", "if", "implements", "import", "instanceof", "int", "interface",
    "long", "native", "new", "package", "private", "protected", "public",
    "return", "short", "static", "strictfp", "super", "switch",
    "synchronized", "this", "throw", "throws", "transient", "try",
    "void", "volatile", "while",
])

_JAVA_BOOL_NULL = frozenset({"true", "false", "null"})

_PY_KEYWORDS = frozenset({
    "def", "class", "return", "if", "else", "elif", "for", "while",
    "import", "from", "try", "except", "finally", "with", "as", "pass",
    "break", "continue", "raise", "yield", "lambda", "True", "False",
    "None", "and", "or", "not", "in", "is", "del", "global", "nonlocal",
    "assert", "async", "await",
})
_PY_OP_KEYWORDS = frozenset({
    "and", "or", "not", "in", "is", "del",
    "return", "yield", "lambda", "raise",
    "assert", "pass", "break", "continue",
})
_PY_SKIP_KEYWORDS = frozenset({
    "def", "class", "if", "else", "elif", "for", "while",
    "import", "from", "try", "except", "finally", "with",
    "as", "True", "False", "None", "async", "await",
    "global", "nonlocal",
})
_PY_BOOL_NONE = frozenset({"True", "False", "None"})

# ---------------------------------------------------------------------------
# Pre-compiled regex patterns
# ---------------------------------------------------------------------------

_JAVA_TOKEN_SPEC = [
    ("COMMENT_ML", r"/\*.*?\*/"),
    ("COMMENT_SL", r"//[^\n]*"),
    ("STRING",     r'"(?:\\.|[^"\\])*"'),
    ("CHAR",       r"'(?:\\.|[^'\\])'"),
    ("NUMBER",     r"\b\d+(?:\.\d+)?[lLfFdD]?\b"),
    ("IDENT",      r"\b[A-Za-z_]\w*\b"),
    ("OP3",        r">>>=|<<=|>>="),
    ("OP2",        r"==|!=|<=|>=|&&|\|\||<<|>>>|>>|\+\+|--|[+\-*/%&|^]="),
    ("OP1",        r"[+\-*/%&|^~!<>=?:;,.()\[\]{}]"),
    ("SKIP",       r"\s+"),
    ("MISMATCH",   r"."),
]
_JAVA_TOKEN_RE = re.compile(
    "|".join(f"(?P<{name}>{regex})" for name, regex in _JAVA_TOKEN_SPEC),
    re.DOTALL,
)

_JAVA_HALSTEAD_OP_RE = re.compile(
    r">>>=|<<=|>>=|==|!=|<=|>=|&&|\|\||<<|>>>|>>"
    r"|[+\-*/%&|^]=|\+\+|--|[+\-*/%&|^~!<>=?:]"
)
_JAVA_HALSTEAD_NUM_RE = re.compile(r"\b\d+(?:\.\d+)?[lLfFdD]?\b")
_JAVA_HALSTEAD_STR_RE = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])\'')
_JAVA_HALSTEAD_ID_RE  = re.compile(r"\b[A-Za-z_]\w*\b")

_JAVA_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_JAVA_LINE_COMMENT_RE  = re.compile(r"//[^\n]*")
_JAVA_STRING_LIT_RE    = re.compile(r'"(?:\\.|[^"\\])*"')
_JAVA_CHAR_LIT_RE      = re.compile(r"'(?:\\.|[^'\\])'")

_PY_COMMENT_RE       = re.compile(r'#[^\n]*')
_PY_TRIPLE_DQ_RE     = re.compile(r'""".*?"""', re.DOTALL)
_PY_TRIPLE_SQ_RE     = re.compile(r"'''.*?'''", re.DOTALL)
_PY_DOUBLE_STRING_RE = re.compile(r'"(?:\\.|[^"\\])*"')
_PY_SINGLE_STRING_RE = re.compile(r"'(?:\\.|[^'\\])*'")

_PY_NON_SEMANTIC_CALLS = frozenset({"print", "assert"})
_PY_NON_SEMANTIC_ATTRS = frozenset({"logging", "logger", "log"})

_PY_SIGNATURE_RE   = re.compile(r"\bdef\s+\w+\s*\(")
_JAVA_SIGNATURE_RE = re.compile(r"\b(?:public|private|protected|class|void)\b")

_LOGICAL_LOC_PY_COMMENT_RE   = re.compile(r'^\s*#')
_LOGICAL_LOC_JAVA_COMMENT_RE = re.compile(r'^\s*//')

_IDENTIFIER_RE = re.compile(r'^[A-Za-z_]\w*$')

# Fix #v114-16: cache for _detect_unused_functions compiled patterns
_UNUSED_PATTERN_CACHE: dict = {}


# ===========================================================================
# Fix #v114-12: O(N) Java generic type stabilisation
# ===========================================================================

def _stabilize_java_generics(source: str) -> str:
    _SAFE_GENERIC_RE = re.compile(
        r'\b([A-Za-z_]\w*)\s*'
        r'<\s*'
        r'(?:[A-Za-z_]\w*(?:\s*\[\s*\])?\s*(?:,\s*[A-Za-z_]\w*(?:\s*\[\s*\])?)*)'
        r'\s*>'
    )
    result = _SAFE_GENERIC_RE.sub('GENERIC_TYPE', source)
    result = _SAFE_GENERIC_RE.sub('GENERIC_TYPE', result)
    return result


def _clean_java_source(source: str) -> str:
    src = _JAVA_BLOCK_COMMENT_RE.sub(lambda m: " " * len(m.group()), source)
    src = _JAVA_LINE_COMMENT_RE.sub(lambda m:  " " * len(m.group()), src)
    src = _JAVA_STRING_LIT_RE.sub(lambda m:    " " * len(m.group()), src)
    src = _JAVA_CHAR_LIT_RE.sub(lambda m:      " " * len(m.group()), src)
    return src


def _logical_loc(source: str, language: str) -> int:
    count = 0
    in_block_comment = False
    for line in source.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if language == "java":
            if in_block_comment:
                if "*/" in stripped:
                    in_block_comment = False
                continue
            if stripped.startswith("/*"):
                if "*/" not in stripped[2:]:
                    in_block_comment = True
                continue
            if stripped.startswith("//"):
                continue
        else:
            if stripped.startswith("#"):
                continue
        count += 1
    return max(count, 1)


@dataclass
class ScoredPair:
    """All scores computed for a block pair."""
    token_score:          float
    lit_token_score:      float
    ast_score:            float
    halstead_score:       float
    fusion_score:         float
    line_ratio:           float = 1.0
    cc_delta:             float = 0.0
    vol_delta:            float = 0.0
    token_containment:    float = 0.0
    token_ratio:          float = 1.0
    raw_token_score:      float = 0.0
    raw_tokens_a:         list  = field(default_factory=list)
    raw_tokens_b:         list  = field(default_factory=list)
    lit_tokens_a:         list  = field(default_factory=list)
    lit_tokens_b:         list  = field(default_factory=list)
    rename_align_score:   float = 0.0
    lines_a:              int   = 0
    lines_b:              int   = 0


@dataclass
class FunctionBlock:
    """A single function / method extracted from source code."""
    name:       str
    start_line: int
    end_line:   int
    source:     str
    language:   str  = ""
    tokens:     list = field(default_factory=list)
    raw_tokens: list = field(default_factory=list)
    lit_tokens: list = field(default_factory=list)
    ast_sequence: list = field(default_factory=list)
    halstead:   dict = field(default_factory=dict)
    _ngrams_norm:    object = field(default=None,  init=False, repr=False, compare=False)
    _ngrams_raw:     object = field(default=None,  init=False, repr=False, compare=False)
    _ngrams_lit:     object = field(default=None,  init=False, repr=False, compare=False)
    _ngrams_norm_sum: int   = field(default=0,     init=False, repr=False, compare=False)
    _ngrams_raw_sum:  int   = field(default=0,     init=False, repr=False, compare=False)
    _ngrams_lit_sum:  int   = field(default=0,     init=False, repr=False, compare=False)
    _halstead_vec:   object = field(default=None,  init=False, repr=False, compare=False)
    _halstead_mag:   float  = field(default=0.0,   init=False, repr=False, compare=False)
    _ast_ready:      bool   = field(default=False, init=False, repr=False, compare=False)
    _bag_vec:        object = field(default=None,  init=False, repr=False, compare=False)
    _token_counter:  object = field(default=None,  init=False, repr=False, compare=False)
    _token_count:    int    = field(default=0,     init=False, repr=False, compare=False)
    _raw_token_counter: object = field(default=None, init=False, repr=False, compare=False)
    _raw_token_count:   int    = field(default=0,    init=False, repr=False, compare=False)
    _ast_sampled:    object = field(default=None,  init=False, repr=False, compare=False)
    _bag_magnitude:  float  = field(default=0.0,   init=False, repr=False, compare=False)
    _ast_seq_hash:   object = field(default=None,  init=False, repr=False, compare=False)
    _java_clean:     object = field(default=None,  init=False, repr=False, compare=False)
    _ngram_size:     int    = field(default=0,     init=False, repr=False, compare=False)
    _stmt_bag_vec:      object = field(default=None, init=False, repr=False, compare=False)
    _stmt_bag_magnitude: float = field(default=0.0,  init=False, repr=False, compare=False)
    _logical_loc:    int    = field(default=0,     init=False, repr=False, compare=False)
    _cc_cache:       object = field(default=None,  init=False, repr=False, compare=False)
    _ast_tree:       object = field(default=None,  init=False, repr=False, compare=False)
    _ast_seq_types:  object = field(default=None,  init=False, repr=False, compare=False)


@dataclass
class ClonePair:
    """A detected clone relationship between two function blocks."""
    clone_id:       str
    clone_type:     int
    token_score:    float
    ast_score:      float
    halstead_score: float
    fusion_score:   float
    block_a:        FunctionBlock
    block_b:        FunctionBlock
    file_a:         str   = ""
    file_b:         str   = ""
    confidence:     float = 0.0


_JAVA_AST_CONSTRUCTS = [
    (re.compile(r"\bSystem\s*\.\s*(?:out|err)\s*\.\s*print(?:ln|f)?\s*\("), None),
    (re.compile(r"\bif\s*\("),          sys.intern("IF")),
    (re.compile(r"\belse\s*\{"),        sys.intern("ELSE")),
    (re.compile(r"\bfor\s*\("),         sys.intern("FOR")),
    (re.compile(r"\bwhile\s*\("),       sys.intern("WHILE")),
    (re.compile(r"\bdo\s*\{"),          sys.intern("DO")),
    (re.compile(r"\bswitch\s*\("),      sys.intern("SWITCH")),
    (re.compile(r"\bcase\b"),           sys.intern("CASE")),
    (re.compile(r"\breturn\b"),         sys.intern("RETURN")),
    (re.compile(r"\bthrow\b"),          sys.intern("THROW")),
    (re.compile(r"\btry\s*\{"),         sys.intern("TRY")),
    (re.compile(r"\bcatch\s*\("),       sys.intern("CATCH")),
    (re.compile(r"\bfinally\s*\{"),     sys.intern("FINALLY")),
    (re.compile(r"\bnew\s+\w+"),        sys.intern("NEW")),
    (re.compile(r"\binstanceof\b"),     sys.intern("INSTANCEOF")),
    (re.compile(r"\bint\b|\blong\b|\bdouble\b|\bfloat\b|"
                r"\bboolean\b|\bString\b|\bchar\b|\bbyte\b|\bshort\b"),
     sys.intern("TYPEDECL")),
    (re.compile(r"\b(?!(?:if|else|for|while|do|switch|case|return|throw|"
                r"try|catch|finally|new|instanceof)\b)"
                r"[A-Za-z_]\w*\s*\("), sys.intern("CALL")),
]


# ===========================================================================
# LAYER 1 — TOKEN PREFILTER
# ===========================================================================

def _tokenize_python_all(source: str) -> tuple:
    norm_toks: list = []
    raw_toks:  list = []
    lit_toks:  list = []
    hal_ops:   list = []
    hal_opds:  list = []

    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype, tval = tok.type, tok.string

            if ttype == tokenize.NAME:
                norm_toks.append(tval if tval in _PY_KEYWORDS else "ID")
                raw_toks.append(tval)
                if tval in _PY_BOOL_NONE:
                    lit_toks.append("BOOL" if tval in ("True", "False") else "NULL")
                else:
                    lit_toks.append(tval)
                if tval in _PY_OP_KEYWORDS:
                    hal_ops.append(tval)
                elif tval not in _PY_SKIP_KEYWORDS:
                    hal_opds.append(tval)

            elif ttype == tokenize.NUMBER:
                norm_toks.append("NUM")
                raw_toks.append(tval)
                lit_toks.append("NUM")
                hal_opds.append(tval)

            elif ttype == tokenize.STRING:
                norm_toks.append("STR")
                raw_toks.append(tval)
                lit_toks.append("STR")
                hal_opds.append("STR")

            elif ttype == tokenize.OP:
                norm_toks.append(tval)
                raw_toks.append(tval)
                lit_toks.append(tval)
                hal_ops.append(tval)

    except tokenize.TokenError:
        pass

    return norm_toks, raw_toks, lit_toks, hal_ops, hal_opds


def _normalize_java_tokens(source: str) -> list:
    source = _stabilize_java_generics(source)
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(source):
        kind, val = mo.lastgroup, mo.group()
        if kind in ("COMMENT_ML", "COMMENT_SL", "SKIP"):
            continue
        elif kind in ("STRING", "CHAR"):
            tokens.append("STR")
        elif kind == "NUMBER":
            tokens.append("NUM")
        elif kind == "IDENT":
            if val == "GENERIC_TYPE":
                tokens.append("GENERIC_TYPE")
            else:
                tokens.append(val if val in JAVA_KEYWORDS else "ID")
        elif kind in ("OP1", "OP2", "OP3"):
            tokens.append(val)
    return tokens


def _raw_java_tokens(source: str) -> list:
    cleaned = _clean_java_source(source)
    cleaned = _stabilize_java_generics(cleaned)
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(cleaned):
        kind, val = mo.lastgroup, mo.group()
        if kind not in ("COMMENT_ML", "COMMENT_SL", "SKIP", "MISMATCH"):
            tokens.append(val)
    return tokens


def _literal_normalize_java_tokens(source: str) -> list:
    source = _stabilize_java_generics(source)
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(source):
        kind, val = mo.lastgroup, mo.group()
        if kind in ("COMMENT_ML", "COMMENT_SL", "SKIP", "MISMATCH"):
            continue
        elif kind in ("STRING", "CHAR"):
            tokens.append("STR")
        elif kind == "NUMBER":
            tokens.append("NUM")
        elif kind == "IDENT":
            if val in _JAVA_BOOL_NULL:
                tokens.append("BOOL" if val in ("true", "false") else "NULL")
            elif val == "GENERIC_TYPE":
                tokens.append("GENERIC_TYPE")
            else:
                tokens.append(val)
        else:
            tokens.append(val)
    return tokens


def _adaptive_ngram_size(token_count: int) -> int:
    if token_count < NGRAM_SHORT_BOUND:
        return NGRAM_SIZE_SHORT
    elif token_count >= NGRAM_LONG_BOUND:
        return NGRAM_SIZE_LONG
    return NGRAM_SIZE_DEFAULT


def _make_ngrams(tokens: list, n: int = None) -> collections.Counter:
    if n is None:
        n = _adaptive_ngram_size(len(tokens))
    interned = [sys.intern(t) if isinstance(t, str) else t for t in tokens]
    if len(interned) < n:
        return collections.Counter({tuple(interned): 1}) if interned else collections.Counter()
    return collections.Counter(
        tuple(interned[i:i+n]) for i in range(len(interned) - n + 1)
    )


def _jaccard(counter_a: collections.Counter,
             counter_b: collections.Counter) -> float:
    if not counter_a and not counter_b:
        return 1.0
    if not counter_a or not counter_b:
        return 0.0
    
    # Early-exit: if size ratio is too extreme, similarity will be very low
    len_a = len(counter_a)
    len_b = len(counter_b)
    if len_a > 0 and len_b > 0:
        ratio = max(len_a, len_b) / min(len_a, len_b)
        if ratio > 10.0:  # More than 10× size difference
            return 0.0
    
    # Optimized intersection: manual min is faster than counter_a & counter_b
    inter = sum(min(counter_a[k], counter_b[k]) for k in counter_a if k in counter_b)
    union = sum(counter_a.values()) + sum(counter_b.values()) - inter
    return inter / union if union else 1.0


def _build_corpus_ngram_profile(
        submission_blocks: list,
        common_doc_ratio: float = CORPUS_COMMON_DOC_RATIO) -> dict:
    """
    Build corpus-level document frequency profile for normalized token n-grams.

    submission_blocks: list of submissions, each submission is list[FunctionBlock].
    Returns None when profile is not usable (e.g. fewer than 2 submissions).
    """
    if not submission_blocks or len(submission_blocks) < 2:
        return None

    requested_ratio = float(common_doc_ratio)
    requested_ratio = min(max(requested_ratio, 0.05), 1.0)

    doc_freq: collections.Counter = collections.Counter()
    doc_count = 0

    for blocks in submission_blocks:
        if not blocks:
            continue
        doc_count += 1
        doc_ngrams: set = set()
        for block in blocks:
            ngrams = (
                block._ngrams_norm
                if block._ngrams_norm is not None
                else _make_ngrams(block.tokens)
            )
            if ngrams:
                doc_ngrams.update(ngrams.keys())
        for ng in doc_ngrams:
            doc_freq[ng] += 1

    if doc_count < 2 or not doc_freq:
        return None

    ratio = _calibrate_corpus_common_ratio(requested_ratio, doc_count)

    common_docs = max(1, int(math.ceil(ratio * doc_count)))
    return {
        "doc_freq": doc_freq,
        "doc_count": doc_count,
        "requested_common_doc_ratio": requested_ratio,
        "common_doc_ratio": ratio,
        "common_docs": common_docs,
    }


def _calibrate_corpus_common_ratio(requested_ratio: float, doc_count: int) -> float:
    """
    Calibrate common-doc threshold by cohort size.

    Smaller cohorts are noisier, so we require broader document presence before
    marking n-grams as common. Larger cohorts can safely downweight boilerplate
    more aggressively.
    """
    ratio = min(max(float(requested_ratio), 0.05), 1.0)
    if doc_count <= 5:
        return max(ratio, CORPUS_COMMON_SMALL_COHORT_RATIO_FLOOR)
    if doc_count >= 12:
        return min(ratio, CORPUS_COMMON_LARGE_COHORT_RATIO_CAP)
    return ratio


def _corpus_common_overlap_ratio(counter_a: collections.Counter,
                                 counter_b: collections.Counter,
                                 profile: dict) -> float:
    if not profile or not counter_a or not counter_b:
        return 0.0

    doc_freq = profile.get("doc_freq", {})
    common_docs = profile.get("common_docs", 0)
    if common_docs <= 0:
        return 0.0

    inter_total = 0
    inter_common = 0
    for ng in counter_a:
        cb_val = counter_b.get(ng)
        if not cb_val:
            continue
        shared_count = min(counter_a[ng], cb_val)
        inter_total += shared_count
        if doc_freq.get(ng, 0) >= common_docs:
            inter_common += shared_count

    if inter_total <= 0:
        return 0.0
    return inter_common / inter_total


def _corpus_rare_overlap_ratio(counter_a: collections.Counter,
                               counter_b: collections.Counter,
                               profile: dict) -> float:
    if not profile or not counter_a or not counter_b:
        return 0.0

    doc_freq = profile.get("doc_freq", {})

    inter_total = 0
    inter_rare = 0
    for ng in counter_a:
        cb_val = counter_b.get(ng)
        if not cb_val:
            continue
        shared_count = min(counter_a[ng], cb_val)
        inter_total += shared_count
        if doc_freq.get(ng, 0) <= CORPUS_RARE_OVERLAP_SIGNAL_MAX_DOC_FREQ:
            inter_rare += shared_count

    if inter_total <= 0:
        return 0.0
    return inter_rare / inter_total


def _corpus_ngram_weight(ngram: tuple, profile: dict) -> float:
    df = profile["doc_freq"].get(ngram, 0)
    doc_count = profile["doc_count"]
    if df <= 0 or doc_count <= 0:
        return 1.0

    common_docs = profile["common_docs"]
    if df >= common_docs:
        common_ratio = df / doc_count
        base_ratio = profile["common_doc_ratio"]
        if base_ratio >= 1.0:
            return CORPUS_COMMON_MIN_WEIGHT
        progress = (common_ratio - base_ratio) / max(1.0 - base_ratio, 1e-9)
        progress = min(max(progress, 0.0), 1.0)
        return CORPUS_COMMON_MAX_WEIGHT - (
            CORPUS_COMMON_MAX_WEIGHT - CORPUS_COMMON_MIN_WEIGHT
        ) * progress

    # Rare n-grams are a stronger plagiarism signal in larger cohorts.
    if doc_count >= 4 and df <= CORPUS_RARE_MAX_DOC_FREQ:
        rare_progress = (CORPUS_RARE_MAX_DOC_FREQ - df + 1) / CORPUS_RARE_MAX_DOC_FREQ
        return 1.0 + CORPUS_RARE_MAX_BOOST * rare_progress

    return 1.0


def _weighted_jaccard(counter_a: collections.Counter,
                      counter_b: collections.Counter,
                      profile: dict) -> float:
    if not counter_a and not counter_b:
        return 1.0
    if not counter_a or not counter_b:
        return 0.0

    # Keep the same coarse early-exit used by _jaccard for very imbalanced sizes.
    len_a = len(counter_a)
    len_b = len(counter_b)
    if len_a > 0 and len_b > 0:
        ratio = max(len_a, len_b) / min(len_a, len_b)
        if ratio > 10.0:
            return 0.0

    w_cache: dict = {}

    def _w(ngram: tuple) -> float:
        cached = w_cache.get(ngram)
        if cached is not None:
            return cached
        val = _corpus_ngram_weight(ngram, profile)
        w_cache[ngram] = val
        return val

    inter = 0.0
    for ng in counter_a:
        cb_val = counter_b.get(ng)
        if cb_val:
            inter += min(counter_a[ng], cb_val) * _w(ng)

    sum_a = sum(count * _w(ng) for ng, count in counter_a.items())
    sum_b = sum(count * _w(ng) for ng, count in counter_b.items())
    union = sum_a + sum_b - inter
    return inter / union if union else 1.0


def compute_token_similarity(block_a: FunctionBlock,
                              block_b: FunctionBlock,
                              corpus_profile: dict = None) -> float:
    na = block_a._ngrams_norm if block_a._ngrams_norm is not None else _make_ngrams(block_a.tokens)
    nb = block_b._ngrams_norm if block_b._ngrams_norm is not None else _make_ngrams(block_b.tokens)
    if corpus_profile:
        return _weighted_jaccard(na, nb, corpus_profile)
    return _jaccard(na, nb)


def compute_raw_token_similarity(block_a: FunctionBlock,
                                  block_b: FunctionBlock) -> float:
    na = block_a._ngrams_raw if block_a._ngrams_raw is not None else _make_ngrams(block_a.raw_tokens)
    nb = block_b._ngrams_raw if block_b._ngrams_raw is not None else _make_ngrams(block_b.raw_tokens)
    return _jaccard(na, nb)


def compute_literal_token_similarity(block_a: FunctionBlock,
                                     block_b: FunctionBlock) -> float:
    na = block_a._ngrams_lit if block_a._ngrams_lit is not None else _make_ngrams(block_a.lit_tokens)
    nb = block_b._ngrams_lit if block_b._ngrams_lit is not None else _make_ngrams(block_b.lit_tokens)
    return _jaccard(na, nb)


def compute_token_containment_similarity(block_a: FunctionBlock,
                                         block_b: FunctionBlock) -> float:
    ca = block_a._raw_token_counter
    cb = block_b._raw_token_counter
    if not ca or not cb:
        return 0.0
    inter    = sum((ca & cb).values())
    total_a  = max(block_a._raw_token_count, 1)
    total_b  = max(block_b._raw_token_count, 1)
    return min(inter / total_a, inter / total_b)


def _rename_alignment_score(block_a: FunctionBlock, block_b: FunctionBlock, token_score: float = 0.0) -> float:
    """
    Rename-consistent alignment score.

    Gate: if token_score is provided and is below the rename gate threshold,
    return 0.0 immediately.
    The Type-2 ALIGN branch requires rename_align >= 0.80; that is unreachable
    when Jaccard token similarity is below 0.65, so the O(N) SequenceMatcher
    diff is skipped.

    token_score=0.0 (default) means "not provided" and bypasses the gate.
    """
    if token_score > 0.0 and token_score < RENAME_ALIGN_GATE_THRESHOLD:
        return 0.0

    raw_a = block_a.raw_tokens
    raw_b = block_b.raw_tokens
    if not raw_a or not raw_b:
        return 0.0

    la, lb = len(raw_a), len(raw_b)
    if la > 3 * lb or lb > 3 * la:
        return 0.0
    if raw_a == raw_b:
        return 1.0

    sm = difflib.SequenceMatcher(None, raw_a, raw_b, autojunk=False)
    fwd_map: dict = {}
    rev_map: dict = {}
    total_aligned = 0
    consistent    = 0

    _JAVA_KW = JAVA_KEYWORDS | _JAVA_BOOL_NULL
    _PY_KW   = _PY_KEYWORDS
    lang = block_a.language

    def _is_identifier(tok: str) -> bool:
        if not _IDENTIFIER_RE.match(tok):
            return False
        if lang == "java":
            return tok not in _JAVA_KW
        return tok not in _PY_KW

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            n = i2 - i1
            total_aligned += n
            consistent    += n
            continue
        if tag != "replace":
            total_aligned += max(i2 - i1, j2 - j1)
            continue
        len_a = i2 - i1
        len_b = j2 - j1
        if len_a != len_b:
            total_aligned += max(len_a, len_b)
            continue
        for ka, kb in zip(raw_a[i1:i2], raw_b[j1:j2]):
            total_aligned += 1
            id_a = _is_identifier(ka)
            id_b = _is_identifier(kb)
            if id_a and id_b:
                existing_b = fwd_map.get(ka)
                existing_a = rev_map.get(kb)
                if existing_b is None and existing_a is None:
                    fwd_map[ka] = kb
                    rev_map[kb] = ka
                    consistent += 1
                elif existing_b == kb and existing_a == ka:
                    consistent += 1
            elif not id_a and not id_b:
                if ka == kb:
                    consistent += 1

    if total_aligned == 0:
        return 0.0
    return consistent / total_aligned


_HALSTEAD_VOL_RATIO_CAP = 8.0


def _volume_ratio_ok(block_a, block_b) -> bool:
    """
    Returns False when the Halstead volumes of two blocks differ by more than
    _HALSTEAD_VOL_RATIO_CAP (default 8).

    Halstead volume scales roughly with the informational content of a function.
    A ratio of 8 means one function is 8× larger in content; such pairs never
    produce a fusion score above the Type-3 floor regardless of other signals.

    Blocks with volume < 1.0 (trivially short, near-empty) are excluded from
    the check and always pass — other size filters handle them.
    """
    vol_a = block_a.halstead.get("volume", 0.0)
    vol_b = block_b.halstead.get("volume", 0.0)
    if vol_a < 1.0 or vol_b < 1.0:
        return True
    return (max(vol_a, vol_b) / min(vol_a, vol_b)) <= _HALSTEAD_VOL_RATIO_CAP


# ===========================================================================
# LAYER 2 — AST STRUCTURAL SIMILARITY
# ===========================================================================

def _is_non_semantic_py(node: ast.AST) -> bool:
    if isinstance(node, ast.Assert):
        return True
    if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
        func = node.value.func
        if isinstance(func, ast.Name) and func.id in _PY_NON_SEMANTIC_CALLS:
            return True
        if (isinstance(func, ast.Attribute)
                and isinstance(func.value, ast.Name)
                and func.value.id in _PY_NON_SEMANTIC_ATTRS):
            return True
    return False


def _python_ast_sequence_from_tree(tree: ast.AST) -> list:
    sequence: list = []
    _FUNC_WRAPPERS = (ast.FunctionDef, ast.AsyncFunctionDef)
    _SKIP_TYPES = frozenset({
        "Module", "FunctionDef", "AsyncFunctionDef", "arguments", "arg",
    })

    if isinstance(tree, _FUNC_WRAPPERS):
        func_node = tree
    elif isinstance(tree, ast.Module) and tree.body:
        func_node = tree.body[0] if isinstance(tree.body[0], _FUNC_WRAPPERS) else None
    else:
        func_node = None

    root_stmts = func_node.body if func_node else [tree]
    stack: list = []
    for stmt in reversed(root_stmts):
        stack.append((stmt, True))

    while stack:
        node, should_emit = stack.pop()
        if _is_non_semantic_py(node):
            continue
        node_type = type(node).__name__
        if isinstance(node, _FUNC_WRAPPERS):
            for child in reversed(list(ast.iter_child_nodes(node))):
                if not isinstance(child, (ast.arguments, ast.arg)):
                    stack.append((child, True))
            continue
        if should_emit and node_type not in _SKIP_TYPES:
            name = node_type
            if name == "Constant" and hasattr(node, "value"):
                name = f"Constant_{type(node.value).__name__}"
            sequence.append(sys.intern(name))
        for child in reversed(list(ast.iter_child_nodes(node))):
            stack.append((child, True))

    return sequence


def _python_ast_sequence(source: str) -> list:
    try:
        tree = ast.parse(source)
        return _python_ast_sequence_from_tree(tree)
    except SyntaxError:
        return []


def _java_ast_sequence(source: str, cleaned: str = None) -> list:
    src = cleaned if cleaned is not None else _clean_java_source(source)

    hits_by_start: list = []

    for pattern, symbol in _JAVA_AST_CONSTRUCTS:
        for m in pattern.finditer(src):
            bisect.insort(hits_by_start, (m.start(), m.end(), symbol))

    result = []
    max_end = 0
    for start, end, symbol in hits_by_start:
        if start >= max_end:
            if symbol is not None:
                result.append(symbol)
            max_end = end

    return result


def _sample_sequence(seq, max_len: int = MAX_AST_LEN) -> tuple:
    if len(seq) <= max_len:
        return tuple(seq) if not isinstance(seq, tuple) else seq
    seg = max_len // 3
    mid = len(seq) // 2
    half_mid = seg // 2
    head   = seq[:seg]
    middle = seq[max(0, mid - half_mid): mid + half_mid]
    tail   = seq[-(max_len - 2 * seg):]
    return tuple(head) + tuple(middle) + tuple(tail)


def _lcs_ratio(seq_a: tuple, seq_b: tuple,
               set_a=None, set_b=None) -> float:
    """
    LCS ratio with optional pre-built type sets for the disjoint-exit.

    set_a / set_b should be frozenset(seq_a) / frozenset(seq_b).
    When supplied (cached as _ast_seq_types on FunctionBlock) the disjoint
    check is O(1) — no set construction on the hot path.
    """
    la, lb = len(seq_a), len(seq_b)
    if la == 0 and lb == 0:
        return 1.0
    if la == 0 or lb == 0:
        return 0.0
    if seq_a is seq_b or seq_a == seq_b:
        return 1.0
    sa = set_a if set_a is not None else set(seq_a)
    sb = set_b if set_b is not None else set(seq_b)
    if sa.isdisjoint(sb):
        return 0.0
    prev = [0] * (lb + 1)
    for i in range(la):
        curr = [0] * (lb + 1)
        ai   = seq_a[i]
        for j in range(lb):
            if ai == seq_b[j]:
                curr[j + 1] = prev[j] + 1
            else:
                curr[j + 1] = max(curr[j], prev[j + 1])
        prev = curr
    return prev[lb] / max(la, lb)


def _edit_distance_normalized(seq_a: tuple, seq_b: tuple,
                               set_a=None, set_b=None) -> float:
    """
    Blended sequence similarity [0, 1].
    Passes cached type sets to _lcs_ratio to avoid set construction.
    """
    la, lb = len(seq_a), len(seq_b)
    if la == 0 and lb == 0:
        return 1.0
    if la == 0 or lb == 0:
        return 0.0
    if seq_a is seq_b or seq_a == seq_b:
        return 1.0
    if la > 2 * lb or lb > 2 * la:
        return 0.0
    sm_ratio = difflib.SequenceMatcher(None, seq_a, seq_b, autojunk=False).ratio()
    if max(la, lb) < LCS_SHORT_THRESHOLD:
        return sm_ratio
    lcs_r = _lcs_ratio(seq_a, seq_b, set_a, set_b)
    return _W_SM * sm_ratio + _W_LCS * lcs_r


_PY_STMT_TYPES = frozenset({
    "Assign", "AugAssign", "AnnAssign", "Return", "Delete", "If", "For",
    "While", "With", "Try", "ExceptHandler", "Raise", "Assert",
    "AsyncFor", "AsyncWith", "Global", "Nonlocal", "Pass", "Break", "Continue",
    "Expr",
})

_JAVA_STMT_SYMBOLS = frozenset({
    "IF", "ELSE", "FOR", "WHILE", "DO", "SWITCH", "CASE",
    "RETURN", "THROW", "TRY", "CATCH", "FINALLY", "NEW",
})


def _bag_of_statements_from_tree(tree: ast.AST) -> collections.Counter:
    bag: collections.Counter = collections.Counter()
    for node in ast.walk(tree):
        name = type(node).__name__
        if name in _PY_STMT_TYPES:
            bag[sys.intern(name)] += 1
    return bag


def _bag_of_statements_python(source: str) -> collections.Counter:
    bag: collections.Counter = collections.Counter()
    try:
        tree = ast.parse(source)
        return _bag_of_statements_from_tree(tree)
    except SyntaxError:
        pass
    return bag


def _bag_of_statements_java(ast_sequence: list) -> collections.Counter:
    return collections.Counter(
        sym for sym in ast_sequence if sym in _JAVA_STMT_SYMBOLS
    )


# Fix #v115-5: combined single-pass DFS for Python blocks —
# produces AST sequence + stmt bag + cyclomatic complexity in one walk,
# replacing three separate O(N) traversals.
_CC_NODES = (ast.If, ast.For, ast.While, ast.ExceptHandler,
             ast.With, ast.AsyncFor, ast.AsyncWith)
_FUNC_WRAP_TYPES = (ast.FunctionDef, ast.AsyncFunctionDef)
_SKIP_SEQ_TYPES  = frozenset({"Module", "FunctionDef", "AsyncFunctionDef",
                               "arguments", "arg"})


def _python_ast_combined_walk(func_node: ast.AST) -> tuple:
    """
    Fix #v115-5: Single DFS over a FunctionDef (or AsyncFunctionDef) that
    simultaneously builds:
      - ast_sequence  : pre-order node-type list (same semantics as
                        _python_ast_sequence_from_tree)
      - stmt_bag      : Counter of statement-type nodes
      - cc            : cyclomatic complexity (same semantics as
                        _compute_cc_from_tree)

    Non-semantic nodes (print/assert/logging calls) are skipped.
    Nested FunctionDef/AsyncFunctionDef bodies are traversed (matching
    the existing _python_ast_sequence_from_tree behaviour) but their
    outer FunctionDef node is not emitted into the sequence or bag.

    Returns (ast_sequence: list, stmt_bag: Counter, cc: int).
    """
    sequence: list = []
    bag: collections.Counter = collections.Counter()
    cc: int = 1

    stack = list(reversed(list(ast.iter_child_nodes(func_node))))

    while stack:
        node = stack.pop()

        # Skip non-semantic print/assert/logging calls
        if _is_non_semantic_py(node):
            continue

        node_type = type(node).__name__

        if isinstance(node, _FUNC_WRAP_TYPES):
            # Recurse into nested function body (same as old code) but do
            # not emit the FunctionDef node itself.
            for child in reversed(list(ast.iter_child_nodes(node))):
                if not isinstance(child, (ast.arguments, ast.arg)):
                    stack.append(child)
            continue

        # AST sequence
        if node_type not in _SKIP_SEQ_TYPES:
            name = node_type
            if node_type == "Constant" and hasattr(node, "value"):
                name = f"Constant_{type(node.value).__name__}"
            sequence.append(sys.intern(name))

        # Stmt bag
        if node_type in _PY_STMT_TYPES:
            bag[sys.intern(node_type)] += 1

        # Cyclomatic complexity
        if isinstance(node, _CC_NODES):
            cc += 1
        elif isinstance(node, ast.BoolOp):
            cc += len(node.values) - 1

        for child in reversed(list(ast.iter_child_nodes(node))):
            stack.append(child)

    return sequence, bag, cc


def _ensure_ast_sequence(block: FunctionBlock) -> None:
    """
    Lazily compute and cache all AST-related block fields.
    Fix #v115-5: Python path uses _python_ast_combined_walk (single DFS).
    Fix #v115-1: _ast_tree must be the FunctionDef node, not the Module.
    """
    if not block._ast_ready and block.source:
        src = textwrap.dedent(block.source)
        if block.language == "java":
            if block._java_clean is None:
                block._java_clean = _clean_java_source(src)
            block.ast_sequence = _java_ast_sequence(src, cleaned=block._java_clean)
            stmt_bag = _bag_of_statements_java(block.ast_sequence)
        else:
            # Fix #v115-1+5: _ast_tree must be the FunctionDef node (set by
            # _extract_python_blocks). If absent, parse the isolated source.
            func_node = block._ast_tree
            if func_node is None:
                try:
                    tree = ast.parse(src)
                    body = tree.body
                    func_node = body[0] if body and isinstance(
                        body[0], _FUNC_WRAP_TYPES) else None
                    if func_node is not None:
                        block._ast_tree = func_node
                except SyntaxError:
                    pass

            if func_node is not None and isinstance(func_node, _FUNC_WRAP_TYPES):
                seq, stmt_bag, cc = _python_ast_combined_walk(func_node)
                block.ast_sequence = seq
                # Fix #v115-5: store CC immediately so _compare_block_pairs
                # never has to recompute it.
                if block._cc_cache is None:
                    block._cc_cache = float(cc)
            else:
                block.ast_sequence = []
                stmt_bag = collections.Counter()

        block._ast_sampled   = _sample_sequence(block.ast_sequence)
        block._ast_seq_hash  = hash(block._ast_sampled)
        block._bag_vec       = collections.Counter(block.ast_sequence)
        block._bag_magnitude = math.sqrt(
            sum(v * v for v in block._bag_vec.values())
        ) if block._bag_vec else 0.0

        block._stmt_bag_vec       = stmt_bag
        block._stmt_bag_magnitude = math.sqrt(
            sum(v * v for v in stmt_bag.values())
        ) if stmt_bag else 0.0

        block._ast_seq_types = (
            frozenset(block._ast_sampled) if block._ast_sampled else frozenset()
        )

        block._ast_ready = True


def compute_ast_similarity(block_a: FunctionBlock,
                            block_b: FunctionBlock) -> float:
    """
    Patch 4: reads _ast_seq_types from each block instead of building sets
    inside _lcs_ratio on every call.
    """
    _ensure_ast_sequence(block_a)
    _ensure_ast_sequence(block_b)

    if (block_a._ast_seq_hash == block_b._ast_seq_hash
            and block_a._ast_sampled == block_b._ast_sampled):
        edit_sim = 1.0
    else:
        set_a = getattr(block_a, '_ast_seq_types', None)
        set_b = getattr(block_b, '_ast_seq_types', None)
        edit_sim = _edit_distance_normalized(
            block_a._ast_sampled, block_b._ast_sampled, set_a, set_b
        )

    ca    = block_a._bag_vec
    cb    = block_b._bag_vec
    mag_a = block_a._bag_magnitude
    mag_b = block_b._bag_magnitude

    if mag_a > 0 and mag_b > 0:
        node_bag_sim = sum(ca[k] * cb[k] for k in ca if k in cb) / (mag_a * mag_b)
    else:
        node_bag_sim = 1.0 if mag_a == mag_b else 0.0

    sa     = block_a._stmt_bag_vec
    sb     = block_b._stmt_bag_vec
    smag_a = block_a._stmt_bag_magnitude
    smag_b = block_b._stmt_bag_magnitude

    if smag_a > 0 and smag_b > 0:
        stmt_bag_sim = sum(sa[k] * sb[k] for k in sa if k in sb) / (smag_a * smag_b)
    else:
        stmt_bag_sim = 1.0 if smag_a == smag_b else 0.0

    bag_sim = _W_BAG_NODES * node_bag_sim + _W_BAG_STMTS * stmt_bag_sim
    return W_AST_EDIT * edit_sim + W_AST_BAG * bag_sim

# ===========================================================================
# LAYER 3 — HALSTEAD COMPLEXITY FINGERPRINT
# ===========================================================================

def _halstead_metrics(operators: list, operands: list) -> dict:
    op_counts  = collections.Counter(operators)
    opd_counts = collections.Counter(operands)
    n1 = len(op_counts);   n2 = len(opd_counts)
    N1 = sum(op_counts.values()); N2 = sum(opd_counts.values())
    n = n1 + n2;  N = N1 + N2
    volume     = N * math.log2(n)       if n  > 1 else 0.0
    difficulty = (n1 / 2) * (N2 / n2)  if n2 > 0 else 0.0
    effort     = difficulty * volume
    return {
        "n1": n1, "n2": n2, "N1": N1, "N2": N2,
        "vocabulary": n, "length": N,
        "volume":     round(volume,     4),
        "difficulty": round(difficulty, 4),
        "effort":     round(effort,     4),
    }


def _extract_halstead_python_from_lists(hal_ops: list, hal_opds: list) -> dict:
    return _halstead_metrics(hal_ops, hal_opds)


def _extract_halstead_python(source: str) -> dict:
    _, _, _, hal_ops, hal_opds = _tokenize_python_all(source)
    return _halstead_metrics(hal_ops, hal_opds)


def _extract_halstead_java(source: str, cleaned: str = None) -> dict:
    src = cleaned if cleaned is not None else _clean_java_source(source)
    operators, operands = [], []
    for m in _JAVA_HALSTEAD_OP_RE.finditer(src):
        operators.append(m.group())
    clean2 = _JAVA_HALSTEAD_STR_RE.sub("STR_LIT ", src)
    for m in _JAVA_HALSTEAD_NUM_RE.finditer(clean2):
        operands.append(m.group())
    for m in _JAVA_HALSTEAD_ID_RE.finditer(clean2):
        val = m.group()
        if val in JAVA_OPERATORS:
            operators.append(val)
        elif val not in JAVA_KEYWORDS:
            operands.append(val)
    return _halstead_metrics(operators, operands)


def _halstead_vector(h: dict) -> list:
    n1 = h.get("n1", 0); n2 = h.get("n2", 0)
    N1 = h.get("N1", 0); N2 = h.get("N2", 0)
    vocab = n1 + n2 + 1;  N = N1 + N2
    length_norm = math.log1p(N + 1)
    return [
        n1 / vocab,
        n2 / vocab,
        math.log1p(h.get("volume",     0)),
        math.log1p(h.get("difficulty", 0)),
        math.log1p(h.get("effort",     0)),
        math.log1p(N1 / (N2 + 1)) / length_norm if length_norm > 0 else 0.0,
        math.log1p(N / vocab)     / length_norm if length_norm > 0 else 0.0,
        math.log1p(N2 / (N1 + 1)) / length_norm if length_norm > 0 else 0.0,
    ]


def _cosine_similarity(va: list, vb: list,
                        mag_a: float = 0.0, mag_b: float = 0.0) -> float:
    dot = sum(a * b for a, b in zip(va, vb))
    if mag_a == 0.0:
        mag_a = math.sqrt(sum(a * a for a in va))
    if mag_b == 0.0:
        mag_b = math.sqrt(sum(b * b for b in vb))
    if mag_a == 0.0 or mag_b == 0.0:
        return 1.0 if mag_a == mag_b else 0.0
    return dot / (mag_a * mag_b)


def compute_halstead_similarity(block_a: FunctionBlock,
                                 block_b: FunctionBlock) -> float:
    va = block_a._halstead_vec if block_a._halstead_vec is not None else _halstead_vector(block_a.halstead)
    vb = block_b._halstead_vec if block_b._halstead_vec is not None else _halstead_vector(block_b.halstead)
    return _cosine_similarity(va, vb, block_a._halstead_mag, block_b._halstead_mag)


# ===========================================================================
# FUSION
# ===========================================================================

def compute_fusion_score(token_score: float,
                          ast_score: float,
                          halstead_score: float,
                          clone_type: int = None) -> float:
    wt, wa, wh = FUSION_WEIGHTS.get(clone_type, FUSION_WEIGHTS["default"])
    return wt * token_score + wa * ast_score + wh * halstead_score


# ===========================================================================
# CLASSIFICATION
# ===========================================================================

def classify_clone(sp: ScoredPair) -> tuple:
    """
    Fix #v114-17: Merged Type-1 branches so the raw_token_score shortcut
    fires correctly regardless of whether raw_tokens_a/b lists are populated.

    Fix #v114-19: Added HALSTEAD_DOMINANT Type-3 path for OOP↔procedural
    rewrites where Halstead ≈ 1.0 but AST is depressed by structural change.

    Fix #v115-3: raw_token_score=0.0 is now a legitimate value; no longer
    silently replaced by token_score. The Type-1 fallback using raw_token_score
    is skipped when raw_token_score is genuinely 0.0.

    Fix #v115-8: Type-2 ALIGN path now evaluates BEFORE Type-3 STANDARD path.
    Renamed clones with high structural similarity (e.g., Python keywords survive
    renaming) were routing through Type-3 fusion threshold before the rename_align
    check could fire. Moved ALIGN check to end of Type-2 section to ensure it
    evaluates before Type-3 classification begins.

    All v1.12 / v1.11 fixes retained.
    """
    token_score       = sp.token_score
    lit_token_score   = sp.lit_token_score
    ast_score         = sp.ast_score
    halstead_score    = sp.halstead_score
    line_ratio        = sp.line_ratio
    cc_delta          = sp.cc_delta
    vol_delta         = sp.vol_delta
    token_containment = sp.token_containment
    # Fix #v115-3: 0.0 is a valid raw score; only fall back when truly absent
    raw_token_score   = sp.raw_token_score  # may be 0.0 legitimately
    rename_align      = sp.rename_align_score
    raw_len_a         = len(sp.raw_tokens_a)
    raw_len_b         = len(sp.raw_tokens_b)
    short_snippet_pair = (
        sp.lines_a <= THRESH_TYPE2_STRICT_SHORT_MAX_LINES
        and sp.lines_b <= THRESH_TYPE2_STRICT_SHORT_MAX_LINES
    )
    has_strict_type2_substance = (
        raw_len_a >= THRESH_TYPE2_STRICT_SHORT_MIN_RAW_TOKENS
        and raw_len_b >= THRESH_TYPE2_STRICT_SHORT_MIN_RAW_TOKENS
    )

    # ------------------------------------------------------------------ Type 1
    has_raw = bool(sp.raw_tokens_a and sp.raw_tokens_b)
    has_lit = bool(sp.lit_tokens_a and sp.lit_tokens_b)

    if has_raw and sp.raw_tokens_a == sp.raw_tokens_b:
        return 1, 1.0

    if has_lit and sp.lit_tokens_a == sp.lit_tokens_b:
        conf = min(0.99, 0.94 + 0.05 * ast_score)
        return 1, round(conf, 4)

    if (raw_token_score >= THRESH_TYPE1_FALLBACK
            and ast_score >= THRESH_TYPE1
            and line_ratio <= THRESH_TYPE1_FALLBACK_RATIO
            and cc_delta <= 0.3
            and vol_delta <= 0.3
            and sp.lines_a >= THRESH_TYPE1_FALLBACK_MIN_LINES
            and sp.lines_b >= THRESH_TYPE1_FALLBACK_MIN_LINES
            and raw_len_a >= THRESH_TYPE1_FALLBACK_MIN_RAW_TOKENS
            and raw_len_b >= THRESH_TYPE1_FALLBACK_MIN_RAW_TOKENS):
        conf = 0.92 * (1.0 - 0.4 * max(cc_delta, vol_delta))
        return 1, round(conf, 4)

    # Pure-score shortcut when no raw token lists are available:
    # use normalised token_score since raw_token_score=0.0 is ambiguous
    # (Fix #v115-3: was using raw_token_score which could be 0 legitimately)
    if not has_raw and token_score >= THRESH_TYPE1 and ast_score >= THRESH_TYPE1:
        return 1, 0.96

    # ------------------------------------------------------------------ Type 2
    if (token_score >= THRESH_TYPE2
            and ast_score >= THRESH_TYPE2
            and (not short_snippet_pair or has_strict_type2_substance)):
        margin = min(token_score, ast_score) - THRESH_TYPE2
        conf = min(1.0, margin / max(1.0 - THRESH_TYPE2, 1e-9) + 0.5)
        return 2, round(conf, 4)

    _hal_ast_floor = (
        THRESH_TYPE2_HAL_AST_SHORT
        if (sp.lines_a <= THRESH_TYPE2_HAL_SHORT_LINES
            and sp.lines_b <= THRESH_TYPE2_HAL_SHORT_LINES)
        else THRESH_TYPE2_HAL_AST
    )
    if (token_score >= THRESH_TYPE2
            and ast_score >= _hal_ast_floor
            and halstead_score >= THRESH_TYPE2_HAL_HALSTEAD):
        margin = min(token_score, halstead_score) - THRESH_TYPE2
        conf = min(1.0, margin / max(1.0 - THRESH_TYPE2, 1e-9) * 0.8 + 0.4)
        return 2, round(conf, 4)

    if (token_score >= THRESH_TYPE2_RELAXED_TOKEN
            and ast_score >= THRESH_TYPE2_RELAXED_AST
            and line_ratio <= 1.5
            and cc_delta <= 0.4
            and vol_delta <= 0.4):
        margin = token_score - THRESH_TYPE2_RELAXED_TOKEN
        conf = min(1.0, margin / max(1.0 - THRESH_TYPE2_RELAXED_TOKEN, 1e-9) + 0.50)
        conf *= (1.0 - 0.4 * max(cc_delta, vol_delta))
        return 2, round(conf, 4)

    if (lit_token_score >= 0.70
            and ast_score >= THRESH_TYPE2_RELAXED_AST
            and line_ratio <= 1.8
            and cc_delta <= 0.45
            and vol_delta <= 0.45):
        conf = min(1.0, (lit_token_score - 0.70) / 0.30 + 0.48)
        conf *= (1.0 - 0.35 * max(cc_delta, vol_delta))
        return 2, round(conf, 4)

    # Type-2 ALIGN path: must evaluate before Type-3 to catch renamed clones
    # that have high structural similarity (Fix: Type-2 misclassification bug)
    if (rename_align >= THRESH_TYPE2_RENAME_ALIGN
            and ast_score >= THRESH_TYPE2_RENAME_AST
            and line_ratio <= 1.5
            and cc_delta <= 0.4
            and vol_delta <= 0.4):
        conf = min(1.0, (rename_align - THRESH_TYPE2_RENAME_ALIGN) / 0.20 + 0.50)
        conf *= (1.0 - 0.35 * max(cc_delta, vol_delta))
        return 2, round(conf, 4)

    # ------------------------------------------------------------------ Type 3
    has_type3_substance = (
        (sp.lines_a >= THRESH_TYPE3_MIN_LINES and sp.lines_b >= THRESH_TYPE3_MIN_LINES)
        or (raw_len_a >= THRESH_TYPE3_MIN_RAW_TOKENS and raw_len_b >= THRESH_TYPE3_MIN_RAW_TOKENS)
        or token_containment >= THRESH_TYPE3_SMALL_BLOCK_CONTAINMENT_RESCUE
    )
    if not has_type3_substance:
        return None, 0.0

    fusion_default = compute_fusion_score(token_score, ast_score, halstead_score)
    fusion_t3      = compute_fusion_score(token_score, ast_score, halstead_score, clone_type=3)

    max_line_ratio_t3 = 2.0
    if token_containment >= THRESH_TYPE3_CONTAINMENT and ast_score >= THRESH_TYPE3_HIGH_AST:
        max_line_ratio_t3 = 2.4

    structurally_close = (
        line_ratio <= max_line_ratio_t3
        and cc_delta <= 0.6
        and vol_delta <= 0.6
    )

    # --- STANDARD path ---
    if fusion_t3 >= THRESH_FUSION_TYPE3:
        tc_boost = (
            token_containment >= THRESH_TYPE3_TC_BOOST
            and (token_score >= THRESH_TYPE3_TC_BOOST_BASE
                 or lit_token_score >= THRESH_TYPE3_TC_BOOST_BASE)
        )
        ast_hal_fallback = (
            ast_score >= THRESH_TYPE3_AST_HAL_FALLBACK
            and halstead_score >= THRESH_TYPE3_HAL_FALLBACK
            and token_score >= 0.20
                    )
        lexical_support = (
            token_score >= THRESH_TYPE3_TOKEN_MIN
            or lit_token_score >= THRESH_TYPE3_LIT_MIN
            or tc_boost
            or ast_hal_fallback
        )
        both_baseline = (ast_score >= THRESH_TYPE3_AST_MIN and lexical_support)
        has_peak = (max(ast_score, token_score) >= THRESH_TYPE3_PEAK
            and token_score >= 0.10)
        if both_baseline and has_peak and structurally_close:
            margin = fusion_default - THRESH_FUSION_TYPE3
            conf = min(1.0, margin / max(1.0 - THRESH_FUSION_TYPE3, 1e-9) + 0.5)
            conf *= (1.0 - 0.4 * max(cc_delta, vol_delta))
            return 3, round(conf, 4)

    # --- HALSTEAD path ---
    if (fusion_t3 >= THRESH_FUSION_TYPE3_HAL
            and ast_score >= THRESH_TYPE3_HAL_AST
            and halstead_score >= THRESH_TYPE3_HAL_MIN
            and structurally_close):
        if token_score >= THRESH_TYPE3_HAL_TOKEN:
            tok_ok = True
        elif token_score > 0.0:
            tok_ok = token_containment >= THRESH_TYPE3_CONTAINMENT_WEAK
        else:
            tok_ok = (
                token_containment >= THRESH_TYPE3_CONTAINMENT
                and cc_delta <= 0.30
                and sp.token_ratio <= 1.80
            )
        if tok_ok:
            conf = min(1.0, halstead_score * 0.7 + 0.1)
            conf *= (1.0 - 0.4 * max(cc_delta, vol_delta))
            return 3, round(conf, 4)

    # --- HALSTEAD_DOMINANT path (Fix #v114-19) ---
    # Fires when Halstead fingerprints are near-identical (>= 0.95) but AST
    # similarity is depressed by a structural rewrite (e.g. class methods
    # refactored into free functions).  The existing HALSTEAD path requires
    # ast >= 0.40 which such rewrites routinely fall below.
    # Token containment >= 0.15 guards against spurious matches between
    # semantically unrelated short functions that happen to share vocabulary.
    if (halstead_score >= THRESH_TYPE3_HALDOM_HALSTEAD
            and fusion_t3 >= THRESH_FUSION_TYPE3_HAL
            and ast_score >= THRESH_TYPE3_HALDOM_AST
            and token_containment >= 0.35
            and structurally_close):
        ast_gap = max(0.0, THRESH_TYPE3_HALDOM_AST_DISCOUNT_START - ast_score)
        ast_discount = max(
            THRESH_TYPE3_HALDOM_MIN_DISCOUNT,
            1.0 - THRESH_TYPE3_HALDOM_AST_DISCOUNT_SCALE * ast_gap,
        )
        conf = min(1.0, halstead_score * 0.6 + ast_score * 0.2 + 0.1)
        conf *= ast_discount
        conf *= (1.0 - 0.4 * max(cc_delta, vol_delta))
        return 3, round(conf, 4)

    return None, 0.0


# ===========================================================================
# BLOCK EXTRACTION
# ===========================================================================

def _strip_decorators(source: str, language: str) -> str:
    if language == "python":
        return '\n'.join(l for l in source.splitlines()
                         if not l.strip().startswith('@'))
    else:
        return re.sub(r'@\w+(?:\([^)]*\))?\s*', '', source)


def _strip_imports(source: str, language: str) -> str:
    if language == "python":
        return '\n'.join(l for l in source.splitlines()
                         if not l.strip().startswith(('import ', 'from ')))
    else:
        return '\n'.join(l for l in source.splitlines()
                         if not l.strip().startswith('import '))


def _make_block(name, start_line, end_line, source, language,
                ast_node: ast.AST = None) -> FunctionBlock:
    """
    Fix #v115-1: ast_node must be the FunctionDef/AsyncFunctionDef node,
    not the containing Module.  The old signature accepted ast_tree (Module)
    which caused _ensure_ast_sequence to always resolve to body[0].
    """
    fb = FunctionBlock(
        name=name, start_line=start_line, end_line=end_line,
        source=source, language=language,
    )
    source_for_analysis = textwrap.dedent(source)
    clean = _strip_decorators(_strip_imports(source_for_analysis, language), language)

    if language == "python":
        norm, raw, lit, hal_ops, hal_opds = _tokenize_python_all(clean)
        fb.tokens     = norm
        fb.raw_tokens = raw
        fb.lit_tokens = lit
        fb.halstead   = _extract_halstead_python_from_lists(hal_ops, hal_opds)
        # Fix #v115-1: store the FunctionDef node itself
        if ast_node is not None:
            fb._ast_tree = ast_node
    else:
        java_clean = _clean_java_source(clean)
        fb._java_clean = java_clean
        fb.tokens     = _normalize_java_tokens(clean)
        fb.raw_tokens = _raw_java_tokens(clean)
        fb.lit_tokens = _literal_normalize_java_tokens(clean)
        fb.halstead   = _extract_halstead_java(clean, cleaned=java_clean)

    n = _adaptive_ngram_size(len(fb.tokens))
    fb._ngram_size  = n
    fb._ngrams_norm = _make_ngrams(fb.tokens,     n)
    fb._ngrams_raw  = _make_ngrams(fb.raw_tokens, n)
    fb._ngrams_lit  = _make_ngrams(fb.lit_tokens, n)
    
    # Precompute n-gram sums to avoid repeated sum() calls in Jaccard
    fb._ngrams_norm_sum = sum(fb._ngrams_norm.values())
    fb._ngrams_raw_sum  = sum(fb._ngrams_raw.values())
    fb._ngrams_lit_sum  = sum(fb._ngrams_lit.values())

    fb._token_counter     = collections.Counter(fb.tokens)
    fb._token_count       = sum(fb._token_counter.values())
    fb._raw_token_counter = collections.Counter(fb.raw_tokens)
    fb._raw_token_count   = sum(fb._raw_token_counter.values())

    vec = _halstead_vector(fb.halstead)
    fb._halstead_vec = vec
    fb._halstead_mag = math.sqrt(sum(v * v for v in vec))

    fb._logical_loc = _logical_loc(source, language)

    return fb


def _collect_top_level_funcs(tree: ast.AST) -> list:
    """
    Collect FunctionDef/AsyncFunctionDef nodes reachable through Module and
    ClassDef containers without recursing into function bodies.

    Patch 5: Uses an explicit stack instead of recursion to avoid Python's
    ~1000-frame recursion limit when processing deeply nested class hierarchies.
    """
    result: list = []
    stack = [tree]
    while stack:
        node = stack.pop()
        for child in ast.iter_child_nodes(node):
            if isinstance(child, _FUNC_WRAP_TYPES):
                result.append(child)
            elif isinstance(child, (ast.ClassDef, ast.Module)):
                stack.append(child)
    return result


def _extract_python_blocks(source: str) -> list:
    """
    Fix #v115-1: passes the FunctionDef node to _make_block (not Module tree).
    Fix #v115-4: uses _collect_top_level_funcs to exclude nested closures.
    """
    lines = source.splitlines()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return [_make_block("<module>", 1, len(lines), source, "python")]

    func_nodes = _collect_top_level_funcs(tree)
    if not func_nodes:
        return [_make_block("<module>", 1, len(lines), source, "python")]

    blocks = []
    for node in func_nodes:
        start    = node.lineno
        end      = node.end_lineno
        func_src = "\n".join(lines[start - 1: end])
        blocks.append(_make_block(node.name, start, end, func_src, "python",
                                  ast_node=node))
    return blocks


def _extract_java_blocks(source: str) -> list:
    lines  = source.splitlines()
    clean  = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    clean  = _JAVA_LINE_COMMENT_RE.sub(" ", clean)

    method_pattern = re.compile(
        r"(?:(?:public|private|protected|static|final|synchronized|"
        r"abstract|native|strictfp)\s+)*"
        r"(?:\w+(?:<(?:[^<>]|<[^<>]*>)*>)?)\s+"
        r"(\w+)\s*\([^)]*\)\s*"
        r"(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?\{"
    )
    constructor_pattern = re.compile(
        r"(?:public|private|protected)\s+([A-Z]\w*)\s*\([^)]*\)\s*"
        r"(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?\{"
    )
    abstract_pattern = re.compile(
        r"(?:(?:public|private|protected|abstract|static|final)\s+)*"
        r"(?:\w+(?:<(?:[^<>]|<[^<>]*>)*>)?)\s+"
        r"\w+\s*\([^)]*\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?;"
    )
    abstract_positions: set = {m.start() for m in abstract_pattern.finditer(clean)}

    all_matches: dict = {}
    for m in method_pattern.finditer(clean):
        if m.start() not in abstract_positions:
            all_matches[m.start()] = m.group(1)
    for m in constructor_pattern.finditer(clean):
        start = m.start()
        if start not in all_matches and start not in abstract_positions:
            all_matches[start] = m.group(1) + "_constructor"

    blocks = []
    for start_pos in sorted(all_matches):
        method_name = all_matches[start_pos]
        start_line  = clean[:start_pos].count("\n") + 1
        depth = 0; end_pos = start_pos; i = start_pos; n = len(clean)
        while i < n:
            ch = clean[i]
            if ch == '"':
                i += 1
                while i < n:
                    if clean[i] == '\\': i += 2; continue
                    if clean[i] == '"': break
                    i += 1
            elif ch == "'":
                i += 1
                while i < n:
                    if clean[i] == '\\': i += 2; continue
                    if clean[i] == "'": break
                    i += 1
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0: end_pos = i; break
            i += 1
        end_line = clean[:end_pos].count("\n") + 1
        func_src = "\n".join(lines[start_line - 1: end_line])
        blocks.append(_make_block(method_name, start_line, end_line, func_src, "java"))

    if not blocks:
        return [_make_block("<class>", 1, len(lines), source, "java")]
    return blocks


def extract_blocks(source: str, language: str) -> list:
    if language == "python":
        return _extract_python_blocks(source)
    elif language == "java":
        return _extract_java_blocks(source)
    return []


# ===========================================================================
# PAIRWISE DETECTION
# ===========================================================================

def _compare_block_pairs(
    pair_iter: Iterator,
    file_a: str,
    file_b: str,
    corpus_profile: dict = None,
    confidence_floor: float = DEFAULT_CONFIDENCE_FLOOR,
) -> list:
    pairs = []
    pair_count = 0

    for block_a, block_b in pair_iter:
        if pair_count >= MAX_PAIRS:
            logger.warning(
                "TAHD: MAX_PAIRS (%d) reached — remaining pairs skipped.", MAX_PAIRS
            )
            break
        pair_count += 1

        len_a, len_b = len(block_a.tokens), len(block_b.tokens)
        lines_a = block_a.end_line - block_a.start_line + 1
        lines_b = block_b.end_line - block_b.start_line + 1

        passes_default_floor = (
            len_a >= MIN_TOKENS and len_b >= MIN_TOKENS
            and lines_a >= MIN_LINES and lines_b >= MIN_LINES
        )
        passes_short_floor = (
            len_a >= MIN_TOKENS_SHORT and len_b >= MIN_TOKENS_SHORT
            and lines_a >= MIN_LINES_SHORT and lines_b >= MIN_LINES_SHORT
        )
        one_full = (
            (len_a >= MIN_TOKENS and lines_a >= MIN_LINES)
            or (len_b >= MIN_TOKENS and lines_b >= MIN_LINES)
        )
        other_compact = (
            (len_a >= MIN_TOKENS_CROSS and lines_a >= MIN_LINES_CROSS)
            and (len_b >= MIN_TOKENS_CROSS and lines_b >= MIN_LINES_CROSS)
        )
        passes_cross_floor = one_full and other_compact
        if not (passes_default_floor or passes_short_floor or passes_cross_floor):
            continue

        if max(len_a, len_b) > 3 * min(len_a, len_b):
            continue

        if not _volume_ratio_ok(block_a, block_b):
            continue

        _pair_start = time.perf_counter()

        try:
            token_score = compute_token_similarity(
                block_a, block_b, corpus_profile=corpus_profile
            )
            halstead_prefilter_score = None

            if token_score < THRESH_TOKEN_PREFILTER:
                hal_pre = compute_halstead_similarity(block_a, block_b)
                halstead_prefilter_score = hal_pre
                if hal_pre < THRESH_HALSTEAD_PREFILTER:
                    continue

            raw_token_score = compute_raw_token_similarity(block_a, block_b)

            if not (passes_default_floor or passes_cross_floor) \
                    and raw_token_score < THRESH_TYPE1_FALLBACK \
                    and token_score < THRESH_TYPE2:
                continue

            token_containment = compute_token_containment_similarity(block_a, block_b)
            ast_score = compute_ast_similarity(block_a, block_b)

            if time.perf_counter() - _pair_start > MAX_PAIR_SECONDS:
                logger.warning(
                    "TAHD: pair (%s, %s) exceeded %.1fs budget — skipped.",
                    block_a.name, block_b.name, MAX_PAIR_SECONDS,
                )
                continue

            if halstead_prefilter_score is not None:
                halstead_score = halstead_prefilter_score
            else:
                halstead_score = compute_halstead_similarity(block_a, block_b)

            fusion = compute_fusion_score(token_score, ast_score, halstead_score)

            lloc_a = block_a._logical_loc if block_a._logical_loc > 0 else _logical_loc(block_a.source, block_a.language)
            lloc_b = block_b._logical_loc if block_b._logical_loc > 0 else _logical_loc(block_b.source, block_b.language)
            min_lloc = max(min(lloc_a, lloc_b), 1)
            line_ratio = max(lloc_a, lloc_b) / min_lloc

            if block_a._cc_cache is None:
                if block_a.language == "python" and block_a._ast_tree is not None:
                    block_a._cc_cache = _compute_cc_from_tree(block_a._ast_tree)
                else:
                    block_a._cc_cache = compute_cyclomatic_complexity(block_a.source, block_a.language)
            if block_b._cc_cache is None:
                if block_b.language == "python" and block_b._ast_tree is not None:
                    block_b._cc_cache = _compute_cc_from_tree(block_b._ast_tree)
                else:
                    block_b._cc_cache = compute_cyclomatic_complexity(block_b.source, block_b.language)

            cc_a: float = block_a._cc_cache
            cc_b: float = block_b._cc_cache
            max_cc = max(cc_a, cc_b, 2.0)
            cc_delta = abs(cc_a - cc_b) / max_cc

            vol_a = block_a.halstead.get("volume", 0.0)
            vol_b = block_b.halstead.get("volume", 0.0)
            max_vol = max(vol_a, vol_b, 1.0)
            vol_delta = abs(vol_a - vol_b) / max_vol

            lit_token_score = compute_literal_token_similarity(block_a, block_b)
            rename_align = _rename_alignment_score(block_a, block_b, token_score=token_score)

            sp = ScoredPair(
                token_score       = token_score,
                lit_token_score   = lit_token_score,
                ast_score         = ast_score,
                halstead_score    = halstead_score,
                fusion_score      = fusion,
                line_ratio        = line_ratio,
                cc_delta          = cc_delta,
                vol_delta         = vol_delta,
                token_containment = token_containment,
                token_ratio       = max(len_a, len_b) / max(min(len_a, len_b), 1),
                raw_token_score   = raw_token_score,
                raw_tokens_a      = block_a.raw_tokens,
                raw_tokens_b      = block_b.raw_tokens,
                lit_tokens_a      = block_a.lit_tokens,
                lit_tokens_b      = block_b.lit_tokens,
                rename_align_score = rename_align,
                lines_a            = lloc_a,
                lines_b            = lloc_b,
            )
            clone_type, confidence = classify_clone(sp)

            if clone_type is not None:
                if corpus_profile:
                    common_overlap_ratio = _corpus_common_overlap_ratio(
                        block_a._ngrams_norm,
                        block_b._ngrams_norm,
                        corpus_profile,
                    )
                    rare_overlap_ratio = _corpus_rare_overlap_ratio(
                        block_a._ngrams_norm,
                        block_b._ngrams_norm,
                        corpus_profile,
                    )
                    if (common_overlap_ratio >= CORPUS_COMMON_OVERLAP_PENALTY_MIN
                            and ast_score <= CORPUS_COMMON_OVERLAP_AST_MAX):
                        overlap_excess = common_overlap_ratio - CORPUS_COMMON_OVERLAP_PENALTY_MIN
                        penalty_factor = max(
                            CORPUS_COMMON_OVERLAP_MIN_FACTOR,
                            1.0 - CORPUS_COMMON_OVERLAP_SCALE * overlap_excess,
                        )
                        confidence *= penalty_factor

                    # Type-3 near-miss matches are the most prone to boilerplate
                    # inflation in classroom pools. Apply an additional penalty
                    # when overlap is mostly corpus-common n-grams.
                    if (clone_type == 3
                            and common_overlap_ratio >= CORPUS_COMMON_OVERLAP_TYPE3_PENALTY_MIN):
                        type3_overlap_excess = (
                            common_overlap_ratio - CORPUS_COMMON_OVERLAP_TYPE3_PENALTY_MIN
                        )
                        type3_penalty_factor = max(
                            CORPUS_COMMON_OVERLAP_TYPE3_MIN_FACTOR,
                            1.0 - CORPUS_COMMON_OVERLAP_TYPE3_SCALE * type3_overlap_excess,
                        )
                        confidence *= type3_penalty_factor

                    # Suppress template-driven near-miss clones where overlap is
                    # overwhelmingly corpus-common and carries almost no rare signal.
                    if (clone_type == 3
                            and common_overlap_ratio >= CORPUS_COMMON_OVERLAP_TYPE3_HARD_PENALTY_MIN
                            and rare_overlap_ratio <= CORPUS_RARE_OVERLAP_SIGNAL_MAX_RATIO):
                        confidence *= CORPUS_COMMON_OVERLAP_TYPE3_HARD_MIN_FACTOR

                confidence = round(max(0.0, confidence), 4)
                if confidence < confidence_floor:
                    continue
                typed_fusion = compute_fusion_score(
                    token_score, ast_score, halstead_score, clone_type=clone_type
                )
                pairs.append(ClonePair(
                    clone_id       = str(uuid.uuid4()),
                    clone_type     = clone_type,
                    token_score    = round(token_score,    4),
                    ast_score      = round(ast_score,      4),
                    halstead_score = round(halstead_score, 4),
                    fusion_score   = round(typed_fusion,   4),
                    block_a        = block_a,
                    block_b        = block_b,
                    file_a         = file_a,
                    file_b         = file_b,
                    confidence     = confidence,
                ))
        except Exception as exc:
            logger.warning(
                "TAHD: pair (%s, %s) raised %s — skipped.",
                block_a.name, block_b.name, exc,
            )
    return pairs


def _deduplicate_clone_pairs(pairs: list, mode: str = "rank",
                              top_k: int = None) -> list:
    if mode == "rank":
        if top_k is not None:
            return heapq.nlargest(top_k, pairs, key=lambda p: p.fusion_score)
        return sorted(pairs, key=lambda p: p.fusion_score, reverse=True)

    pairs_sorted = sorted(pairs, key=lambda p: p.fusion_score, reverse=True)
    used_a: set = set()
    used_b: set = set()
    result = []
    for p in pairs_sorted:
        key_a = (p.block_a.name, p.block_a.start_line)
        key_b = (p.block_b.name, p.block_b.start_line)
        if key_a in used_a:
            continue
        if mode == "strict" and key_b in used_b:
            continue
        result.append(p)
        used_a.add(key_a)
        if mode == "strict":
            used_b.add(key_b)
    return result


def detect_clones_in_blocks(
    blocks_a: list,
    blocks_b: list,
    file_a: str = "file_a",
    file_b: str = "file_b",
    corpus_profile: dict = None,
    confidence_floor: float = DEFAULT_CONFIDENCE_FLOOR,
) -> list:
    pairs = _compare_block_pairs(
        itertools.product(blocks_a, blocks_b),
        file_a,
        file_b,
        corpus_profile=corpus_profile,
        confidence_floor=confidence_floor,
    )
    return _deduplicate_clone_pairs(pairs, mode="rank")


def detect_clones_single_file(
    blocks: list,
    filename: str = "submission",
    confidence_floor: float = DEFAULT_CONFIDENCE_FLOOR,
) -> list:
    pairs = _compare_block_pairs(
        itertools.combinations(blocks, 2),
        filename,
        filename,
        confidence_floor=confidence_floor,
    )
    return _deduplicate_clone_pairs(pairs, mode="rank")


def _validate_unit_interval(value, field_name: str, allow_none: bool = False):
    if value is None:
        if allow_none:
            return None
        raise ValueError(f"{field_name} must be numeric")
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be numeric") from None
    if not 0.0 <= value <= 1.0:
        raise ValueError(f"{field_name} must be between 0.0 and 1.0")
    return value


def _aggregate_clone_confidence(clone_pairs: list, mode: str) -> float:
    if not clone_pairs:
        return 0.0
    if mode == "max":
        return max(p.confidence for p in clone_pairs)
    if mode == "mean":
        return sum(p.confidence for p in clone_pairs) / len(clone_pairs)
    raise ValueError(
        f"pool_confidence_mode must be one of {sorted(POOL_CONFIDENCE_MODES)}"
    )


def _contains_clone_type(clone_pairs: list, clone_type: int) -> bool:
    return any(getattr(p, "clone_type", None) == clone_type for p in clone_pairs)


def _filter_clone_pairs_for_precision(
    clone_pairs: list,
    base_confidence_floor: float,
    type12_confidence_floor: float,
    type3_confidence_floor: float,
) -> tuple[list, int, int]:
    """
    Apply stricter confidence gating to Type-1/Type-2 only.

    Type-3 is intentionally not tightened here so near-miss recall remains stable.
    Returns (filtered_pairs, suppressed_type12_count, suppressed_type3_count).
    """
    if not clone_pairs:
        return clone_pairs, 0, 0

    filtered: list = []
    suppressed_type12 = 0
    suppressed_type3 = 0
    for pair in clone_pairs:
        clone_type = getattr(pair, "clone_type", None)
        if clone_type in (1, 2):
            floor = max(base_confidence_floor, type12_confidence_floor)
        elif clone_type == 3:
            floor = max(base_confidence_floor, type3_confidence_floor)
        else:
            floor = base_confidence_floor

        if pair.confidence < floor:
            if clone_type in (1, 2):
                suppressed_type12 += 1
            elif clone_type == 3:
                suppressed_type3 += 1
            continue
        filtered.append(pair)
    return filtered, suppressed_type12, suppressed_type3


def _pool_confidence_for_suppression(
    clone_pairs: list,
    mode: str,
    preserve_type3_recall: bool,
) -> tuple[float, str]:
    """
    Derive pair confidence used for pool suppression.

    For non-Type-3 pairs, use mean confidence when mode=max to reduce
    outlier-driven false positives. For Type-3-containing pairs, keep caller mode.
    Returns (pair_confidence, effective_mode_used).
    """
    if not clone_pairs:
        return 0.0, mode

    has_type3 = preserve_type3_recall and _contains_clone_type(clone_pairs, 3)
    if has_type3:
        return _aggregate_clone_confidence(clone_pairs, mode), mode

    effective_mode = "mean" if mode == "max" else mode
    return _aggregate_clone_confidence(clone_pairs, effective_mode), effective_mode


def _type3_block_key(file_name: str, block: FunctionBlock) -> tuple:
    return (file_name, block.name, block.start_line)


def _type12_edge_key(
    file_a: str,
    block_a: FunctionBlock,
    file_b: str,
    block_b: FunctionBlock,
) -> tuple:
    key_a = _type3_block_key(file_a, block_a)
    key_b = _type3_block_key(file_b, block_b)
    return tuple(sorted((key_a, key_b)))


def _build_type3_fanout_map(pair_candidates: list) -> dict:
    fanout: dict = collections.defaultdict(set)
    for item in pair_candidates:
        file_a = item["a"]["file"]
        file_b = item["b"]["file"]
        for pair in item["clone_pairs"]:
            if pair.clone_type != 3:
                continue
            key_a = _type3_block_key(file_a, pair.block_a)
            key_b = _type3_block_key(file_b, pair.block_b)
            fanout[key_a].add(key_b)
            fanout[key_b].add(key_a)
    return {k: len(v) for k, v in fanout.items()}


def _build_type12_fanout_map(pair_candidates: list) -> dict:
    fanout: dict = collections.defaultdict(set)
    for item in pair_candidates:
        file_a = item["a"]["file"]
        file_b = item["b"]["file"]
        for pair in item["clone_pairs"]:
            if pair.clone_type not in (1, 2):
                continue
            key_a = _type3_block_key(file_a, pair.block_a)
            key_b = _type3_block_key(file_b, pair.block_b)
            fanout[key_a].add(key_b)
            fanout[key_b].add(key_a)
    return {k: len(v) for k, v in fanout.items()}


def _build_type12_template_keep_set(
    pair_candidates: list,
    fanout_map: dict,
    top_k: int = TYPE12_TEMPLATE_KEEP_TOP_K,
    fanout_threshold: int = TYPE12_TEMPLATE_FANOUT_THRESHOLD,
) -> set:
    edge_best_conf: dict = {}
    edge_endpoints: dict = {}
    edges_by_block: dict = collections.defaultdict(list)

    for item in pair_candidates:
        file_a = item["a"]["file"]
        file_b = item["b"]["file"]
        for pair in item["clone_pairs"]:
            if pair.clone_type not in (1, 2):
                continue
            key_a = _type3_block_key(file_a, pair.block_a)
            key_b = _type3_block_key(file_b, pair.block_b)
            edge_key = _type12_edge_key(file_a, pair.block_a, file_b, pair.block_b)
            best = edge_best_conf.get(edge_key)
            if best is None or pair.confidence > best:
                edge_best_conf[edge_key] = pair.confidence
                edge_endpoints[edge_key] = (key_a, key_b)

    for edge_key, confidence in edge_best_conf.items():
        key_a, key_b = edge_endpoints[edge_key]
        if fanout_map.get(key_a, 0) >= fanout_threshold:
            edges_by_block[key_a].append((confidence, edge_key))
        if fanout_map.get(key_b, 0) >= fanout_threshold:
            edges_by_block[key_b].append((confidence, edge_key))

    keep_set: set = set()

    for edge_key, (key_a, key_b) in edge_endpoints.items():
        if (fanout_map.get(key_a, 0) < fanout_threshold
                and fanout_map.get(key_b, 0) < fanout_threshold):
            keep_set.add(edge_key)

    for block_key, scored_edges in edges_by_block.items():
        scored_edges.sort(key=lambda x: (-x[0], x[1]))
        for _, edge_key in scored_edges[:max(1, top_k)]:
            keep_set.add(edge_key)

    return keep_set


def _suppress_template_type12_pairs(
    clone_pairs: list,
    file_a: str,
    file_b: str,
    fanout_map: dict,
    keep_edges: set,
    fanout_threshold: int = TYPE12_TEMPLATE_FANOUT_THRESHOLD,
) -> tuple[list, int]:
    if not clone_pairs or not fanout_map:
        return clone_pairs, 0

    kept: list = []
    suppressed = 0

    for pair in clone_pairs:
        if pair.clone_type not in (1, 2):
            kept.append(pair)
            continue

        key_a = _type3_block_key(file_a, pair.block_a)
        key_b = _type3_block_key(file_b, pair.block_b)
        edge_key = _type12_edge_key(file_a, pair.block_a, file_b, pair.block_b)

        template_like = (
            fanout_map.get(key_a, 0) >= fanout_threshold
            or fanout_map.get(key_b, 0) >= fanout_threshold
        )
        if template_like and edge_key not in keep_edges:
            suppressed += 1
            continue

        kept.append(pair)

    return kept, suppressed


def _suppress_template_type3_pairs(
    clone_pairs: list,
    file_a: str,
    file_b: str,
    fanout_map: dict,
) -> tuple[list, int]:
    if not clone_pairs or not fanout_map:
        return clone_pairs, 0

    kept: list = []
    suppressed = 0
    for pair in clone_pairs:
        if pair.clone_type != 3:
            kept.append(pair)
            continue

        key_a = _type3_block_key(file_a, pair.block_a)
        key_b = _type3_block_key(file_b, pair.block_b)
        fanout_a = fanout_map.get(key_a, 0)
        fanout_b = fanout_map.get(key_b, 0)
        template_like = (
            pair.token_score <= TYPE3_TEMPLATE_TOKEN_MAX
            and pair.halstead_score >= TYPE3_TEMPLATE_HALSTEAD_MIN
        )
        if template_like and (
            fanout_a >= TYPE3_TEMPLATE_FANOUT_THRESHOLD
            or fanout_b >= TYPE3_TEMPLATE_FANOUT_THRESHOLD
        ):
            suppressed += 1
            continue

        kept.append(pair)

    return kept, suppressed


def _quantile(values: list, q: float) -> float:
    if not values:
        return 0.0
    if q <= 0.0:
        return min(values)
    if q >= 1.0:
        return max(values)

    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]

    pos = q * (len(ordered) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return ordered[lo]
    alpha = pos - lo
    return ordered[lo] * (1.0 - alpha) + ordered[hi] * alpha


def _derive_auto_filter_thresholds(
    clone_confidences: list,
    pair_confidences: list,
    confidence_floor: float,
    pool_confidence_floor: float,
) -> tuple[float, float]:
    if len(pair_confidences) < AUTO_MIN_SAMPLE_PAIRS:
        return confidence_floor, pool_confidence_floor

    derived_conf_floor = _quantile(
        clone_confidences, AUTO_CONFIDENCE_FLOOR_QUANTILE
    ) if clone_confidences else confidence_floor
    derived_pool_floor = _quantile(
        pair_confidences, AUTO_POOL_CONFIDENCE_QUANTILE
    ) if pair_confidences else pool_confidence_floor

    derived_conf_floor = max(
        confidence_floor,
        min(max(derived_conf_floor, AUTO_MIN_CONFIDENCE_FLOOR), 1.0),
    )
    derived_pool_floor = max(
        pool_confidence_floor,
        min(max(derived_pool_floor, AUTO_MIN_POOL_CONFIDENCE_FLOOR), 1.0),
    )
    return round(derived_conf_floor, 4), round(derived_pool_floor, 4)


# ===========================================================================
# CYCLOMATIC COMPLEXITY
# ===========================================================================

def _compute_cc_from_tree(tree: ast.AST) -> float:
    """
    Cyclomatic complexity matching _python_ast_combined_walk exactly.

    Uses an explicit stack that recurses into nested FunctionDef bodies
    (same traversal as combined_walk) but does NOT add +1 for the
    FunctionDef node itself. This keeps results consistent regardless of
    which code path populates _cc_cache.
    """
    try:
        cc = 1
        if isinstance(tree, _FUNC_WRAP_TYPES):
            stack = list(ast.iter_child_nodes(tree))
        else:
            stack = [tree]
        while stack:
            node = stack.pop()
            if isinstance(node, _FUNC_WRAP_TYPES):
                # Recurse into body but don't count the def node itself
                stack.extend(ast.iter_child_nodes(node))
                continue
            if isinstance(node, _CC_NODES):
                cc += 1
            elif isinstance(node, ast.BoolOp):
                cc += len(node.values) - 1
            stack.extend(ast.iter_child_nodes(node))
        return float(cc)
    except (ValueError, MemoryError, RecursionError):
        return 1.0


def compute_cyclomatic_complexity(source: str, language: str) -> float:
    if language == "python":
        try:
            tree = ast.parse(source)
            return _compute_cc_from_tree(tree)
        except (SyntaxError, ValueError, MemoryError, RecursionError):
            pass
        clean = _PY_COMMENT_RE.sub(' ', source)
        clean = _PY_TRIPLE_DQ_RE.sub('STR', clean)
        clean = _PY_TRIPLE_SQ_RE.sub('STR', clean)
        clean = _PY_DOUBLE_STRING_RE.sub('STR', clean)
        clean = _PY_SINGLE_STRING_RE.sub('STR', clean)
        count = 1
        count += clean.count("elif ")
        clean_no_elif = clean.replace("elif ", "ELIF_ ")
        count += clean_no_elif.count("if ")
        for kw in ["else:", "for ", "while ", "except", " and ", " or "]:
            count += clean.count(kw)
        return float(count)
    else:
        clean = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
        clean = _JAVA_LINE_COMMENT_RE.sub(" ", clean)
        clean = _JAVA_STRING_LIT_RE.sub('STR', clean)
        clean = _JAVA_CHAR_LIT_RE.sub('STR', clean)
        count = 1
        for kw in ["if ", "else ", "for ", "while ", "case ", "catch ", " && ", " || ", " ? "]:
            count += clean.count(kw)
        return float(count)


# ===========================================================================
# REFACTORING ENGINE
# ===========================================================================

_REFACTOR_RULES = {
    1: {
        "type":    "Remove Duplicate",
        "explain": {
            "remember":   "These two blocks are exact copies (Type 1 clone).",
            "understand": "Exact duplication means any bug fix must be applied "
                          "in every copy, increasing maintenance cost.",
            "apply":      "Delete one copy entirely and update all call sites "
                          "to reference the single remaining version.",
        },
    },
    2: {
        "type":    "Extract Method",
        "explain": {
            "remember":   "These blocks are structurally identical but use "
                          "different variable names (Type 2 clone).",
            "understand": "Renamed duplicates hide shared logic, making the "
                          "codebase harder to reason about.",
            "apply":      "Extract the shared logic into a new method with "
                          "parameters replacing the renamed variables.",
        },
    },
    3: {
        "type":    "Refactor Near-Miss Clone",
        "explain": {
            "remember":   "These blocks are similar but not identical "
                          "(Type 3 clone — near-miss).",
            "understand": "Near-miss clones often indicate copied code that "
                          "was partially adapted. The shared core should live "
                          "in one place.",
            "apply":      "Identify the common sub-logic, extract it into a "
                          "helper method, and adjust each original block to "
                          "call it with the differing parts as arguments.",
        },
    },
}


def _generate_after_code(pair: ClonePair) -> str:
    name_a = pair.block_a.name
    name_b = pair.block_b.name
    lang   = pair.block_a.language

    if lang == "python":
        if pair.clone_type == 1:
            return (
                f"# Keep only one of the two identical functions.\n"
                f"# Delete '{name_b}' and update all callers to use '{name_a}'.\n\n"
                f"def {name_a}(...):\n"
                f"    # (original body — unchanged)\n"
                f"    ...\n\n"
                f"# All former calls to {name_b}(...) → {name_a}(...)"
            )
        elif pair.clone_type == 2:
            return (
                f"# Extract shared logic; use parameters instead of renamed variables.\n\n"
                f"def {name_a}_extracted(param1, param2, ...):\n"
                f"    # Shared logic from both '{name_a}' and '{name_b}'\n"
                f"    ...\n\n"
                f"def {name_a}(...):\n"
                f"    return {name_a}_extracted(a_var1, a_var2, ...)\n\n"
                f"def {name_b}(...):\n"
                f"    return {name_a}_extracted(b_var1, b_var2, ...)"
            )
        else:
            return (
                f"# Extract the common sub-logic into a helper function.\n\n"
                f"def _shared_core(...):\n"
                f"    # Common logic identified between '{name_a}' and '{name_b}'\n"
                f"    ...\n\n"
                f"def {name_a}(...):\n"
                f"    _shared_core(...)\n"
                f"    # {name_a}-specific logic\n\n"
                f"def {name_b}(...):\n"
                f"    _shared_core(...)\n"
                f"    # {name_b}-specific logic"
            )
    else:
        if pair.clone_type == 1:
            return (
                f"// Keep only one of the two identical methods.\n"
                f"// Delete '{name_b}' and update all callers to use '{name_a}'.\n\n"
                f"public ReturnType {name_a}(...) {{\n"
                f"    // (original body — unchanged)\n"
                f"}}\n\n"
                f"// All former calls to {name_b}(...) → {name_a}(...)"
            )
        elif pair.clone_type == 2:
            return (
                f"// Extract shared logic; use parameters instead of renamed variables.\n\n"
                f"private ReturnType {name_a}Extracted(Type param1, Type param2) {{\n"
                f"    // Shared logic from both '{name_a}' and '{name_b}'\n"
                f"}}\n\n"
                f"public ReturnType {name_a}(...) {{\n"
                f"    return {name_a}Extracted(aVar1, aVar2);\n"
                f"}}\n\n"
                f"public ReturnType {name_b}(...) {{\n"
                f"    return {name_a}Extracted(bVar1, bVar2);\n"
                f"}}"
            )
        else:
            return (
                f"// Extract the common sub-logic into a private helper.\n\n"
                f"private void sharedCore(...) {{\n"
                f"    // Common logic identified between '{name_a}' and '{name_b}'\n"
                f"}}\n\n"
                f"public ReturnType {name_a}(...) {{\n"
                f"    sharedCore(...);\n"
                f"    // {name_a}-specific logic\n"
                f"}}\n\n"
                f"public ReturnType {name_b}(...) {{\n"
                f"    sharedCore(...);\n"
                f"    // {name_b}-specific logic\n"
                f"}}"
            )


def generate_refactoring_suggestions(
    clone_pairs: list,
    max_suggestions: int = 5,
) -> list:
    sorted_pairs = sorted(clone_pairs, key=lambda p: p.fusion_score, reverse=True)
    suggestions  = []
    for rank, pair in enumerate(sorted_pairs[:max_suggestions], start=1):
        if pair.clone_type not in _REFACTOR_RULES:
            raise ValueError(
                f"Unknown clone_type {pair.clone_type!r} in ClonePair {pair.clone_id}. "
                f"Expected one of {list(_REFACTOR_RULES)}."
            )
        rule = _REFACTOR_RULES[pair.clone_type]
        cmt = "#" if pair.block_a.language == "python" else "//"
        lines_a = pair.block_a.source.splitlines()
        lines_b = pair.block_b.source.splitlines()
        snippet_a = "\n".join(lines_a[:MAX_SNIPPET_LINES])
        if len(lines_a) > MAX_SNIPPET_LINES:
            snippet_a += f"\n{cmt} ... ({len(lines_a) - MAX_SNIPPET_LINES} more lines)"
        snippet_b = "\n".join(lines_b[:MAX_SNIPPET_LINES])
        if len(lines_b) > MAX_SNIPPET_LINES:
            snippet_b += f"\n{cmt} ... ({len(lines_b) - MAX_SNIPPET_LINES} more lines)"
        suggestions.append({
            "suggestion_id":     str(uuid.uuid4()),
            "priority":          rank,
            "priority_score":    pair.fusion_score,
            "refactoring_type":  rule["type"],
            "clone_type":        pair.clone_type,
            "affected_clone_id": pair.clone_id,
            "scores": {
                "token":    pair.token_score,
                "ast":      pair.ast_score,
                "halstead": pair.halstead_score,
                "fusion":   pair.fusion_score,
            },
            "locations": {
                "block_a": {
                    "file": pair.file_a, "function": pair.block_a.name,
                    "start_line": pair.block_a.start_line,
                    "end_line":   pair.block_a.end_line,
                },
                "block_b": {
                    "file": pair.file_b, "function": pair.block_b.name,
                    "start_line": pair.block_b.start_line,
                    "end_line":   pair.block_b.end_line,
                },
            },
            "explanation": rule["explain"],
            "before_code": (f"{cmt} Block A ({pair.block_a.name})\n{snippet_a}\n\n"
                            f"{cmt} Block B ({pair.block_b.name})\n{snippet_b}"),
            "after_code":  _generate_after_code(pair),
        })
    return suggestions


# ===========================================================================
# QUALITY METRICS
# ===========================================================================

def compute_maintainability_index(
    halstead_volume: float,
    cyclomatic_complexity: float,
    lines_of_code: int,
) -> float:
    ln_v   = math.log(max(halstead_volume, 1))
    ln_loc = math.log(max(lines_of_code,   1))
    mi_raw = 171 - 5.2 * ln_v - 0.23 * cyclomatic_complexity - 16.2 * ln_loc
    return round(max(0.0, mi_raw * 100 / 171), 2)


# ===========================================================================
# CODE QUALITY REPORT HELPERS
# ===========================================================================

def _compute_nesting_depth(source: str, language: str,
                            parsed_tree: ast.AST = None) -> int:
    """
    Fix #v115-7: Accept an optional pre-parsed tree (Python only) so callers
    with a cached _ast_tree can avoid a redundant ast.parse() call.
    """
    if language == "python":
        SCOPE_NODES = (
            ast.If, ast.For, ast.While, ast.Try,
            ast.ExceptHandler, ast.AsyncFor, ast.AsyncWith, ast.With,
        )
        max_depth = 0
        try:
            root = parsed_tree if parsed_tree is not None else ast.parse(source)
            stack: list = [(root, 0)]
            while stack:
                node, depth = stack.pop()
                if depth > max_depth:
                    max_depth = depth
                for child in ast.iter_child_nodes(node):
                    child_depth = depth + (1 if isinstance(child, SCOPE_NODES) else 0)
                    stack.append((child, child_depth))
        except SyntaxError:
            for line in source.splitlines():
                stripped = line.lstrip()
                if stripped and not stripped.startswith("#"):
                    depth = (len(line) - len(stripped)) // 4
                    if depth > max_depth:
                        max_depth = depth
        return max_depth
    else:
        src = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
        src = _JAVA_LINE_COMMENT_RE.sub(" ", src)
        depth = 0; max_depth = 0; i = 0; n = len(src)
        while i < n:
            ch = src[i]
            if ch == '"':
                i += 1
                while i < n and src[i] != '"':
                    if src[i] == '\\': i += 1
                    i += 1
            elif ch == "'":
                i += 1
                while i < n and src[i] != "'":
                    if src[i] == '\\': i += 1
                    i += 1
            elif ch == "{":
                depth += 1
                if depth > max_depth: max_depth = depth
            elif ch == "}":
                depth = max(0, depth - 1)
            i += 1
        return max_depth


def _compute_comment_density(source: str, language: str) -> float:
    lines = source.splitlines()
    total = len(lines)
    if total == 0:
        return 0.0
    comment_count = 0
    if language == "python":
        docstring_lines: set = set()
        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef,
                                     ast.ClassDef, ast.Module)):
                    ds = ast.get_docstring(node, clean=False)
                    if ds and node.body:
                        first_stmt = node.body[0]
                        if isinstance(first_stmt, ast.Expr) and isinstance(
                                first_stmt.value, ast.Constant):
                            start = first_stmt.lineno
                            end   = getattr(first_stmt, "end_lineno", start)
                            for ln in range(start, end + 1):
                                docstring_lines.add(ln)
        except SyntaxError:
            pass
        for idx, line in enumerate(lines, start=1):
            stripped = line.strip()
            if idx in docstring_lines or stripped.startswith("#"):
                comment_count += 1
    else:
        in_block = False
        for line in lines:
            stripped = line.strip()
            if in_block:
                comment_count += 1
                if "*/" in stripped:
                    in_block = False
            elif stripped.startswith("//"):
                comment_count += 1
            elif "/*" in stripped:
                comment_count += 1
                idx_s = stripped.index("/*")
                if "*/" not in stripped[idx_s + 2:]:
                    in_block = True
    return round(comment_count / total, 3)


def _detect_unused_functions(blocks: list, source: str) -> dict:
    ENTRY_POINT_RE = re.compile(
        r"^(main|__main__|setUp|tearDown|run|execute|start|stop"
        r"|test\w*|on[A-Z]\w*|handle[A-Z]\w*)$"
    )
    defined = {b.name for b in blocks if b.name not in ("<module>", "<class>")}
    called: set = set()
    if any(getattr(b, "language", "") == "java" for b in blocks):
        searchable = re.sub(r"/\*.*?\*/", " ", source, flags=re.DOTALL)
        searchable = re.sub(r"//[^\n]*", " ", searchable)
    else:
        searchable = re.sub(r"#[^\n]*", " ", source)
    if not defined:
        return {}

    cache_key = frozenset(defined)
    if cache_key not in _UNUSED_PATTERN_CACHE:
        _UNUSED_PATTERN_CACHE[cache_key] = re.compile(
            r"\b(" + "|".join(re.escape(n) for n in sorted(defined, key=len, reverse=True)) + r")\b"
        )
    combined = _UNUSED_PATTERN_CACHE[cache_key]

    for m in combined.finditer(searchable):
        name = m.group(1)
        if name in called:
            continue
        line_start = searchable.rfind("\n", 0, m.start()) + 1
        line_end   = searchable.find("\n", m.start())
        if line_end == -1:
            line_end = len(searchable)
        line_text = searchable[line_start:line_end].lstrip()
        if not (line_text.startswith("def ") or line_text.startswith("public ")
                or line_text.startswith("private ") or line_text.startswith("protected ")):
            called.add(name)
    result = {}
    for name in defined - called:
        is_entry = bool(ENTRY_POINT_RE.match(name))
        result[name] = {
            "unused_in_file": True,
            "unused_scope": "file",
            "confidence": "low" if is_entry else "high",
            "note": (
                "Likely an entry point, callback, or test method — may be called externally."
                if is_entry
                else "Not called anywhere in this file. "
                     "Verify it is not used by other modules before removing."
            ),
        }
    return result


def _compute_quality_report(
    blocks: list, clone_pairs: list, source: str, language: str,
) -> dict:
    cloned_names = {p.block_a.name for p in clone_pairs} | {p.block_b.name for p in clone_pairs}
    unused_info  = _detect_unused_functions(blocks, source)
    func_details = []
    for block in blocks:
        # Fix #v115-7: reuse cached CC and AST tree from block analysis phase
        cc = block._cc_cache if block._cc_cache is not None else compute_cyclomatic_complexity(block.source, language)
        nesting = _compute_nesting_depth(
            block.source, language,
            parsed_tree=block._ast_tree if language == "python" else None
        )
        line_count = block.end_line - block.start_line + 1
        smells = []
        if line_count > 30:                 smells.append("long_function")
        if cc > 10:                         smells.append("high_complexity")
        if block.name in cloned_names:      smells.append("internal_duplication")
        if (block.name in unused_info
                and unused_info[block.name]["confidence"] == "high"):
            smells.append("unused_function")
        func_details.append({
            "name": block.name, "start_line": block.start_line,
            "end_line": block.end_line, "line_count": line_count,
            "cyclomatic_complexity": round(cc, 1),
            "halstead": {
                "volume":     block.halstead.get("volume",     0),
                "difficulty": block.halstead.get("difficulty", 0),
                "effort":     block.halstead.get("effort",     0),
            },
            "nesting_depth": nesting, "smells": smells,
            **({"unused_info": unused_info[block.name]} if block.name in unused_info else {}),
        })
    function_count = len(func_details)
    avg_length = (
        round(sum(f["line_count"] for f in func_details) / function_count, 1)
        if function_count > 0 else 0.0
    )
    return {
        "functions": func_details,
        "structure": {
            "function_count":      function_count,
            "avg_function_length": avg_length,
            "max_nesting_depth":   max((f["nesting_depth"] for f in func_details), default=0),
            "comment_density":     _compute_comment_density(source, language),
        },
    }


# ===========================================================================
# SYNTAX VALIDATION
# ===========================================================================

def validate_syntax(code: str, language: str) -> bool:
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language: {language}")
    if not isinstance(code, str):
        raise ValueError("code must be a string")
    if language == "python":
        ast.parse(code)
    return True


def _detect_language(code: str) -> str:
    has_py   = bool(_PY_SIGNATURE_RE.search(code))
    has_java = bool(_JAVA_SIGNATURE_RE.search(code))
    if not has_java:
        if ("public static void main" in code
                or code.lstrip().startswith("package ")
                or code.lstrip().startswith("import java.")):
            has_java = True
    if has_py and not has_java:
        return "python"
    if has_java and not has_py:
        return "java"
    return None


# ===========================================================================
# PUBLIC API — CodeAnalyzer
# ===========================================================================

class CodeAnalyzer:
    """
    TAHD v1.14.1 drop-in CodeAnalyzer.

    analyze(code)         → single-file analysis with quality report
    analyze_pair(a, b)    → cross-file clone detection between two submissions
    analyze_batch(items)  → pairwise analysis over a submission pool
    """

    def __init__(self, language: str):
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError("Unsupported language")
        self.language = language
        self.code: str = None

    def analyze(self, code: str, max_suggestions: int = 5) -> dict:
        if not isinstance(code, str):
            raise ValueError("code must be a string")
        self.code = code
        lines = code.splitlines()
        loc   = max(1, len(lines))

        _t0 = time.perf_counter()
        blocks      = extract_blocks(code, self.language)
        _t_extract  = time.perf_counter()
        clone_pairs = detect_clones_single_file(blocks)
        _t_detect   = time.perf_counter()

        all_halstead = [b.halstead for b in blocks]
        total_volume = sum(h.get("volume", 0) for h in all_halstead)
        cc = compute_cyclomatic_complexity(code, self.language)
        mi = compute_maintainability_index(total_volume, cc, loc)

        cloned_lines: set = set()
        for pair in clone_pairs:
            cloned_lines.update(range(pair.block_a.start_line, pair.block_a.end_line + 1))
            cloned_lines.update(range(pair.block_b.start_line, pair.block_b.end_line + 1))
        clone_pct = round(len(cloned_lines) / loc * 100, 1)

        clones_out = [
            {
                "clone_id":       p.clone_id,
                "type":           p.clone_type,
                "similarity":     p.fusion_score,
                "token_score":    p.token_score,
                "ast_score":      p.ast_score,
                "halstead_score": p.halstead_score,
                "confidence":     p.confidence,
                "locations": [
                    {"function": p.block_a.name,
                     "start_line": p.block_a.start_line,
                     "end_line": p.block_a.end_line},
                    {"function": p.block_b.name,
                     "start_line": p.block_b.start_line,
                     "end_line": p.block_b.end_line},
                ],
                "code_snippet": p.block_a.source[:200],
                "explanation":  _clone_type_explanation(p.clone_type),
            }
            for p in clone_pairs
        ]

        return {
            "analysis_id":             str(uuid.uuid4()),
            "language":                self.language,
            "lines_of_code":           loc,
            "clone_percentage":        clone_pct,
            "clones":                  clones_out,
            "cyclomatic_complexity":   round(cc, 1),
            "maintainability_index":   mi,
            "refactoring_suggestions": generate_refactoring_suggestions(clone_pairs, max_suggestions),
            "halstead_metrics": {
                "total_volume":   round(total_volume, 2),
                "avg_difficulty": round(
                    sum(h.get("difficulty", 0) for h in all_halstead)
                    / max(len(all_halstead), 1), 2
                ),
            },
            "detection_method": f"TAHD {TAHD_VERSION} (Token + AST + Halstead)",
            "quality_report":   _compute_quality_report(blocks, clone_pairs, code, self.language),
            "audience_guidance": _build_single_audience_guidance(
                clone_percentage=clone_pct,
                cyclomatic_complexity=cc,
                maintainability_index=mi,
                clone_pairs=clone_pairs,
            ),
            "performance_profile": {
                "extract_ms":     round((_t_extract - _t0)          * 1000, 2),
                "detect_ms":      round((_t_detect  - _t_extract)   * 1000, 2),
                "total_ms":       round((_t_detect  - _t0)          * 1000, 2),
                "function_blocks": len(blocks),
                "clone_pairs":    len(clone_pairs),
            },
        }

    def analyze_pair(
        self,
        code_a: str,
        code_b: str,
        file_a: str = "submission_a",
        file_b: str = "submission_b",
        max_suggestions: int = 5,
        corpus_codes: list = None,
        corpus_common_ngram_ratio: float = CORPUS_COMMON_DOC_RATIO,
        confidence_floor: float = DEFAULT_CONFIDENCE_FLOOR,
        enable_pool_suppression: bool = DEFAULT_ENABLE_POOL_SUPPRESSION,
        pool_confidence_floor: float = DEFAULT_POOL_CONFIDENCE_FLOOR,
        pool_confidence_mode: str = DEFAULT_POOL_CONFIDENCE_MODE,
        auto_tune_filters: bool = DEFAULT_AUTO_TUNE_FILTERS,
        type12_confidence_floor: float = DEFAULT_TYPE12_CONFIDENCE_FLOOR,
        type3_confidence_floor: float = DEFAULT_TYPE3_CONFIDENCE_FLOOR,
        preserve_type3_recall: bool = DEFAULT_PRESERVE_TYPE3_RECALL,
    ) -> dict:
        if not isinstance(code_a, str) or not code_a.strip():
            raise ValueError("code_a must be a non-empty string")
        if not isinstance(code_b, str) or not code_b.strip():
            raise ValueError("code_b must be a non-empty string")

        confidence_floor = _validate_unit_interval(
            confidence_floor, "confidence_floor"
        )
        pool_confidence_floor = _validate_unit_interval(
            pool_confidence_floor, "pool_confidence_floor"
        )
        if pool_confidence_mode not in POOL_CONFIDENCE_MODES:
            raise ValueError(
                f"pool_confidence_mode must be one of {sorted(POOL_CONFIDENCE_MODES)}"
            )
        if not isinstance(auto_tune_filters, bool):
            raise ValueError("auto_tune_filters must be boolean")
        type12_confidence_floor = _validate_unit_interval(
            type12_confidence_floor, "type12_confidence_floor"
        )
        type3_confidence_floor = _validate_unit_interval(
            type3_confidence_floor, "type3_confidence_floor"
        )
        if not isinstance(preserve_type3_recall, bool):
            raise ValueError("preserve_type3_recall must be boolean")

        for label, code in ((file_a, code_a), (file_b, code_b)):
            detected = _detect_language(code)
            if detected is not None and detected != self.language:
                raise ValueError(
                    f"{label} appears to be {detected!r} but this analyzer "
                    f"is configured for {self.language!r}. "
                    f"Initialize CodeAnalyzer('{detected}') for that submission."
                )

        _t0 = time.perf_counter()
        blocks_a = extract_blocks(code_a, self.language)
        blocks_b = extract_blocks(code_b, self.language)

        corpus_profile = None
        corpus_submission_count = 2
        corpus_weighting_reason = "disabled_no_corpus_pool"
        corpus_entries: list = []
        if corpus_codes:
            corpus_blocks = [blocks_a, blocks_b]
            for idx, corpus_code in enumerate(corpus_codes):
                if not isinstance(corpus_code, str) or not corpus_code.strip():
                    raise ValueError(
                        f"corpus_codes[{idx}] must be a non-empty string"
                    )
                entry_blocks = extract_blocks(corpus_code, self.language)
                corpus_blocks.append(entry_blocks)
                corpus_entries.append({
                    "file": f"corpus_{idx + 1}",
                    "blocks": entry_blocks,
                })

            corpus_profile = _build_corpus_ngram_profile(
                corpus_blocks,
                common_doc_ratio=corpus_common_ngram_ratio,
            )
            if corpus_profile:
                corpus_submission_count = corpus_profile["doc_count"]
                corpus_weighting_reason = "enabled_with_corpus_pool"
            else:
                corpus_submission_count = len(corpus_blocks)
                corpus_weighting_reason = "disabled_insufficient_corpus_signal"

        _t_extract = time.perf_counter()
        clone_pairs = detect_clones_in_blocks(
            blocks_a,
            blocks_b,
            file_a,
            file_b,
            corpus_profile=corpus_profile,
            confidence_floor=confidence_floor,
        )

        effective_confidence_floor = confidence_floor
        effective_pool_confidence_floor = pool_confidence_floor
        effective_type12_confidence_floor = type12_confidence_floor
        if auto_tune_filters:
            clone_confidences = [p.confidence for p in clone_pairs]
            pair_confidences = [
                _aggregate_clone_confidence(clone_pairs, pool_confidence_mode)
            ] if clone_pairs else []

            # Build a larger confidence distribution from pair-with-corpus
            # comparisons so auto calibration is meaningful in pair mode.
            for entry in corpus_entries:
                pair_a = detect_clones_in_blocks(
                    blocks_a,
                    entry["blocks"],
                    file_a,
                    entry["file"],
                    corpus_profile=corpus_profile,
                    confidence_floor=confidence_floor,
                )
                if pair_a:
                    pair_confidences.append(
                        _aggregate_clone_confidence(pair_a, pool_confidence_mode)
                    )
                    clone_confidences.extend(p.confidence for p in pair_a)

                pair_b = detect_clones_in_blocks(
                    blocks_b,
                    entry["blocks"],
                    file_b,
                    entry["file"],
                    corpus_profile=corpus_profile,
                    confidence_floor=confidence_floor,
                )
                if pair_b:
                    pair_confidences.append(
                        _aggregate_clone_confidence(pair_b, pool_confidence_mode)
                    )
                    clone_confidences.extend(p.confidence for p in pair_b)

            effective_confidence_floor, effective_pool_confidence_floor = _derive_auto_filter_thresholds(
                clone_confidences,
                pair_confidences,
                confidence_floor,
                pool_confidence_floor,
            )
            effective_type12_confidence_floor = max(
                type12_confidence_floor, effective_confidence_floor
            )

        clone_pairs, suppressed_type12_clones, suppressed_type3_clones = _filter_clone_pairs_for_precision(
            clone_pairs,
            effective_confidence_floor,
            effective_type12_confidence_floor,
            type3_confidence_floor,
        )

        suppressed_by_pool = 0
        pool_confidence, effective_pool_confidence_mode = _pool_confidence_for_suppression(
            clone_pairs,
            pool_confidence_mode,
            preserve_type3_recall,
        )
        has_type3_clones = _contains_clone_type(clone_pairs, 3)
        should_apply_pool_suppression = bool(corpus_codes) and bool(enable_pool_suppression)
        can_suppress_pair = not (preserve_type3_recall and has_type3_clones)
        if (should_apply_pool_suppression
                and can_suppress_pair
                and pool_confidence < effective_pool_confidence_floor):
            suppressed_by_pool = len(clone_pairs)
            clone_pairs = []

        _t_detect = time.perf_counter()

        if clone_pairs and blocks_a and blocks_b:
            matched_a = {(p.block_a.name, p.block_a.start_line) for p in clone_pairs}
            matched_b = {(p.block_b.name, p.block_b.start_line) for p in clone_pairs}
            sim_a = len(matched_a) / len(blocks_a)
            sim_b = len(matched_b) / len(blocks_b)
            overall_sim = round(max(sim_a, sim_b), 4)
        else:
            overall_sim = 0.0

        clones_out = [
            {
                "clone_id":       p.clone_id,
                "type":           p.clone_type,
                "similarity":     p.fusion_score,
                "token_score":    p.token_score,
                "ast_score":      p.ast_score,
                "halstead_score": p.halstead_score,
                "confidence":     p.confidence,
                "locations": [
                    {"file": p.file_a, "function": p.block_a.name,
                     "start_line": p.block_a.start_line,
                     "end_line": p.block_a.end_line},
                    {"file": p.file_b, "function": p.block_b.name,
                     "start_line": p.block_b.start_line,
                     "end_line": p.block_b.end_line},
                ],
                "explanation": _clone_type_explanation(p.clone_type),
            }
            for p in clone_pairs
        ]

        type_counts   = collections.Counter(p.clone_type for p in clone_pairs)
        dominant_type = type_counts.most_common(1)[0][0] if type_counts else None

        return {
            "analysis_id":             str(uuid.uuid4()),
            "language":                self.language,
            "file_a":                  file_a,
            "file_b":                  file_b,
            "overall_similarity":      overall_sim,
            "clone_count":             len(clone_pairs),
            "clones":                  clones_out,
            "refactoring_suggestions": generate_refactoring_suggestions(clone_pairs, max_suggestions),
            "detection_method":        f"TAHD {TAHD_VERSION} (Token + AST + Halstead)",
            "dominant_clone_type":     dominant_type,
            "clone_type_breakdown":    dict(type_counts),
            "corpus_weighting": {
                "enabled": bool(corpus_profile),
                "submission_count": corpus_submission_count,
                "common_ngram_ratio": (
                    corpus_profile["common_doc_ratio"]
                    if corpus_profile else float(corpus_common_ngram_ratio)
                ),
                "requested_common_ngram_ratio": float(corpus_common_ngram_ratio),
                "reason": corpus_weighting_reason,
            },
            "audience_guidance":       _build_pair_audience_guidance(overall_sim, clone_pairs),
            "filters_applied": {
                "confidence_floor": confidence_floor,
                "effective_confidence_floor": effective_confidence_floor,
                "type12_confidence_floor": type12_confidence_floor,
                "effective_type12_confidence_floor": effective_type12_confidence_floor,
                "suppressed_type12_clones": suppressed_type12_clones,
                "type3_confidence_floor": type3_confidence_floor,
                "suppressed_type3_clones": suppressed_type3_clones,
                "pool_suppression": should_apply_pool_suppression,
                "pool_confidence_floor": pool_confidence_floor,
                "effective_pool_confidence_floor": effective_pool_confidence_floor,
                "pool_confidence_mode": pool_confidence_mode,
                "effective_pool_confidence_mode": effective_pool_confidence_mode,
                "pool_confidence": round(pool_confidence, 4),
                "suppressed_by_pool": suppressed_by_pool,
                "auto_tune_filters": auto_tune_filters,
                "preserve_type3_recall": preserve_type3_recall,
            },
            "performance_profile": {
                "extract_ms":  round((_t_extract - _t0)        * 1000, 2),
                "detect_ms":   round((_t_detect  - _t_extract) * 1000, 2),
                "total_ms":    round((_t_detect  - _t0)        * 1000, 2),
                "blocks_a":    len(blocks_a),
                "blocks_b":    len(blocks_b),
                "clone_pairs": len(clone_pairs),
            },
        }

    def analyze_batch(
        self,
        submissions: list,
        max_suggestions: int = 5,
        corpus_common_ngram_ratio: float = CORPUS_COMMON_DOC_RATIO,
        confidence_floor: float = DEFAULT_CONFIDENCE_FLOOR,
        enable_pool_suppression: bool = DEFAULT_BATCH_ENABLE_POOL_SUPPRESSION,
        pool_confidence_floor: float = DEFAULT_POOL_CONFIDENCE_FLOOR,
        pool_confidence_mode: str = DEFAULT_POOL_CONFIDENCE_MODE,
        auto_tune_filters: bool = DEFAULT_BATCH_AUTO_TUNE_FILTERS,
        type12_confidence_floor: float = DEFAULT_TYPE12_CONFIDENCE_FLOOR,
        type3_confidence_floor: float = DEFAULT_TYPE3_CONFIDENCE_FLOOR,
        preserve_type3_recall: bool = DEFAULT_PRESERVE_TYPE3_RECALL,
    ) -> dict:
        """
        Batch pairwise analysis with one shared corpus profile.

        submissions must be a list of dicts:
          {"file": "optional_name", "code": "source code"}
        """
        if not isinstance(submissions, list) or len(submissions) < 2:
            raise ValueError("submissions must contain at least two items")

        confidence_floor = _validate_unit_interval(
            confidence_floor, "confidence_floor"
        )
        pool_confidence_floor = _validate_unit_interval(
            pool_confidence_floor, "pool_confidence_floor"
        )
        if pool_confidence_mode not in POOL_CONFIDENCE_MODES:
            raise ValueError(
                f"pool_confidence_mode must be one of {sorted(POOL_CONFIDENCE_MODES)}"
            )
        if not isinstance(auto_tune_filters, bool):
            raise ValueError("auto_tune_filters must be boolean")
        type12_confidence_floor = _validate_unit_interval(
            type12_confidence_floor, "type12_confidence_floor"
        )
        type3_confidence_floor = _validate_unit_interval(
            type3_confidence_floor, "type3_confidence_floor"
        )
        if not isinstance(preserve_type3_recall, bool):
            raise ValueError("preserve_type3_recall must be boolean")

        prepared: list = []
        for idx, item in enumerate(submissions):
            if not isinstance(item, dict):
                raise ValueError(f"submissions[{idx}] must be an object")
            code = item.get("code")
            if not isinstance(code, str) or not code.strip():
                raise ValueError(f"submissions[{idx}].code must be a non-empty string")
            file_name = item.get("file", f"submission_{idx + 1}")

            detected = _detect_language(code)
            if detected is not None and detected != self.language:
                raise ValueError(
                    f"{file_name} appears to be {detected!r} but this analyzer "
                    f"is configured for {self.language!r}. "
                    f"Initialize CodeAnalyzer('{detected}') for that submission."
                )

            prepared.append({
                "file": file_name,
                "code": code,
                "blocks": extract_blocks(code, self.language),
            })

        _t0 = time.perf_counter()
        corpus_blocks = [entry["blocks"] for entry in prepared]
        corpus_profile = _build_corpus_ngram_profile(
            corpus_blocks,
            common_doc_ratio=corpus_common_ngram_ratio,
        )
        corpus_weighting_reason = (
            "enabled_with_submission_pool"
            if corpus_profile else
            "disabled_insufficient_submission_signal"
        )
        _t_extract = time.perf_counter()

        pair_candidates: list = []
        pair_confidences: list = []
        clone_confidences: list = []
        suppressed_pairs = 0
        suppressed_clones = 0
        for i in range(len(prepared)):
            for j in range(i + 1, len(prepared)):
                a = prepared[i]
                b = prepared[j]
                clone_pairs = detect_clones_in_blocks(
                    a["blocks"],
                    b["blocks"],
                    a["file"],
                    b["file"],
                    corpus_profile=corpus_profile,
                    confidence_floor=confidence_floor,
                )

                pair_confidence = _aggregate_clone_confidence(
                    clone_pairs, pool_confidence_mode
                )
                if clone_pairs:
                    pair_confidences.append(pair_confidence)
                    clone_confidences.extend(p.confidence for p in clone_pairs)

                pair_candidates.append({
                    "a": a,
                    "b": b,
                    "clone_pairs": clone_pairs,
                    "pair_confidence": pair_confidence,
                })

        effective_confidence_floor = confidence_floor
        effective_pool_confidence_floor = pool_confidence_floor
        effective_type12_confidence_floor = type12_confidence_floor
        if auto_tune_filters:
            effective_confidence_floor, effective_pool_confidence_floor = _derive_auto_filter_thresholds(
                clone_confidences,
                pair_confidences,
                confidence_floor,
                pool_confidence_floor,
            )
            effective_type12_confidence_floor = max(
                type12_confidence_floor, effective_confidence_floor
            )

        pair_results: list = []
        suppressed_type12_clones = 0
        suppressed_type3_clones = 0
        suppressed_template_type12_clones = 0
        suppressed_template_type3_clones = 0
        type12_fanout_map = _build_type12_fanout_map(pair_candidates)
        type12_keep_edges = _build_type12_template_keep_set(
            pair_candidates,
            type12_fanout_map,
            top_k=TYPE12_TEMPLATE_KEEP_TOP_K,
            fanout_threshold=TYPE12_TEMPLATE_FANOUT_THRESHOLD,
        )
        type3_fanout_map = _build_type3_fanout_map(pair_candidates)
        for item in pair_candidates:
            a = item["a"]
            b = item["b"]
            clone_pairs = item["clone_pairs"]

            clone_pairs, suppressed_type12_now, suppressed_type3_now = _filter_clone_pairs_for_precision(
                clone_pairs,
                effective_confidence_floor,
                effective_type12_confidence_floor,
                type3_confidence_floor,
            )
            suppressed_type12_clones += suppressed_type12_now
            suppressed_type3_clones += suppressed_type3_now

            clone_pairs, suppressed_template_type12_now = _suppress_template_type12_pairs(
                clone_pairs,
                a["file"],
                b["file"],
                type12_fanout_map,
                type12_keep_edges,
                fanout_threshold=TYPE12_TEMPLATE_FANOUT_THRESHOLD,
            )
            suppressed_template_type12_clones += suppressed_template_type12_now

            clone_pairs, suppressed_template_now = _suppress_template_type3_pairs(
                clone_pairs,
                a["file"],
                b["file"],
                type3_fanout_map,
            )
            suppressed_template_type3_clones += suppressed_template_now

            pair_confidence, effective_pair_conf_mode = _pool_confidence_for_suppression(
                clone_pairs,
                pool_confidence_mode,
                preserve_type3_recall,
            )
            has_type3_clones = _contains_clone_type(clone_pairs, 3)
            can_suppress_pair = not (preserve_type3_recall and has_type3_clones)
            if (enable_pool_suppression
                    and can_suppress_pair
                    and pair_confidence < effective_pool_confidence_floor):
                suppressed_pairs += 1
                suppressed_clones += len(clone_pairs)
                continue

            if clone_pairs and a["blocks"] and b["blocks"]:
                matched_a = {(p.block_a.name, p.block_a.start_line) for p in clone_pairs}
                matched_b = {(p.block_b.name, p.block_b.start_line) for p in clone_pairs}
                sim_a = len(matched_a) / len(a["blocks"])
                sim_b = len(matched_b) / len(b["blocks"])
                overall_sim = round(max(sim_a, sim_b), 4)
            else:
                overall_sim = 0.0

            clones_out = [
                {
                    "clone_id":       p.clone_id,
                    "type":           p.clone_type,
                    "similarity":     p.fusion_score,
                    "token_score":    p.token_score,
                    "ast_score":      p.ast_score,
                    "halstead_score": p.halstead_score,
                    "confidence":     p.confidence,
                    "locations": [
                        {"file": p.file_a, "function": p.block_a.name,
                         "start_line": p.block_a.start_line,
                         "end_line": p.block_a.end_line},
                        {"file": p.file_b, "function": p.block_b.name,
                         "start_line": p.block_b.start_line,
                         "end_line": p.block_b.end_line},
                    ],
                    "explanation": _clone_type_explanation(p.clone_type),
                }
                for p in clone_pairs
            ]

            type_counts = collections.Counter(p.clone_type for p in clone_pairs)
            dominant_type = type_counts.most_common(1)[0][0] if type_counts else None

            pair_results.append({
                "pair_id": str(uuid.uuid4()),
                "file_a": a["file"],
                "file_b": b["file"],
                "overall_similarity": overall_sim,
                "clone_count": len(clone_pairs),
                "clones": clones_out,
                "refactoring_suggestions": generate_refactoring_suggestions(
                    clone_pairs, max_suggestions
                ),
                "dominant_clone_type": dominant_type,
                "clone_type_breakdown": dict(type_counts),
                "audience_guidance": _build_pair_audience_guidance(overall_sim, clone_pairs),
                "pair_confidence": round(pair_confidence, 4),
                "effective_pool_confidence_mode": effective_pair_conf_mode,
            })

        _t_detect = time.perf_counter()

        return {
            "analysis_id": str(uuid.uuid4()),
            "language": self.language,
            "submission_count": len(prepared),
            "pair_count": len(pair_results),
            "pairs": pair_results,
            "detection_method": f"TAHD {TAHD_VERSION} (Token + AST + Halstead)",
            "corpus_weighting": {
                "enabled": bool(corpus_profile),
                "submission_count": (
                    corpus_profile["doc_count"] if corpus_profile else len(prepared)
                ),
                "common_ngram_ratio": (
                    corpus_profile["common_doc_ratio"]
                    if corpus_profile else float(corpus_common_ngram_ratio)
                ),
                "requested_common_ngram_ratio": float(corpus_common_ngram_ratio),
                "reason": corpus_weighting_reason,
            },
            "filters_applied": {
                "confidence_floor": confidence_floor,
                "effective_confidence_floor": effective_confidence_floor,
                "type12_confidence_floor": type12_confidence_floor,
                "effective_type12_confidence_floor": effective_type12_confidence_floor,
                "suppressed_type12_clones": suppressed_type12_clones,
                "type3_confidence_floor": type3_confidence_floor,
                "suppressed_type3_clones": suppressed_type3_clones,
                "suppressed_template_type12_clones": suppressed_template_type12_clones,
                "suppressed_template_type3_clones": suppressed_template_type3_clones,
                "pool_suppression": bool(enable_pool_suppression),
                "pool_confidence_floor": pool_confidence_floor,
                "effective_pool_confidence_floor": effective_pool_confidence_floor,
                "pool_confidence_mode": pool_confidence_mode,
                "suppressed_pairs": suppressed_pairs,
                "suppressed_clones": suppressed_clones,
                "auto_tune_filters": auto_tune_filters,
                "preserve_type3_recall": preserve_type3_recall,
            },
            "performance_profile": {
                "extract_ms": round((_t_extract - _t0) * 1000, 2),
                "detect_ms": round((_t_detect - _t_extract) * 1000, 2),
                "total_ms": round((_t_detect - _t0) * 1000, 2),
            },
        }


# ===========================================================================
# HELPERS
# ===========================================================================

def _clone_type_explanation(clone_type: int) -> dict:
    return {
        1: {
            "type_name":   "Type 1 — Exact Clone",
            "description": "These blocks are identical except for whitespace, "
                           "comment, or literal constant differences.",
            "why_flagged": "Raw or literal-normalized token sequences are "
                           "identical; structural signatures match perfectly.",
        },
        2: {
            "type_name":   "Type 2 — Renamed Clone",
            "description": "These blocks are structurally identical but use "
                           "different variable or method names.",
            "why_flagged": "Normalized token profile and/or Halstead complexity "
                           "signature match strongly despite identifier renaming.",
        },
        3: {
            "type_name":   "Type 3 — Near-Miss Clone",
            "description": "These blocks share significant structural and "
                           "computational similarity despite modifications.",
            "why_flagged": "Fusion of token, AST, and Halstead complexity "
                           "signatures exceeds the Type-3 threshold, suggesting "
                           "copied code that was partially modified.",
        },
    }.get(clone_type, {
        "type_name": "Unknown", "description": "", "why_flagged": "",
    })


def _risk_level_from_ratio(score_ratio: float) -> str:
    if score_ratio >= 0.45:
        return "high"
    if score_ratio >= 0.20:
        return "medium"
    return "low"


def _build_single_audience_guidance(
    clone_percentage: float,
    cyclomatic_complexity: float,
    maintainability_index: float,
    clone_pairs: list,
) -> dict:
    risk_level = _risk_level_from_ratio(clone_percentage / 100.0)
    type_counts = collections.Counter(p.clone_type for p in clone_pairs)
    dominant_type = type_counts.most_common(1)[0][0] if type_counts else None

    if dominant_type == 1:
        type_focus = "exact-copy patterns"
    elif dominant_type == 2:
        type_focus = "renamed structural duplicates"
    elif dominant_type == 3:
        type_focus = "near-miss shared logic"
    else:
        type_focus = "duplicate logic patterns"

    instructor_actions = [
        f"Prioritize review of {type_focus}; current risk is {risk_level.upper()} ({clone_percentage:.1f}% cloned lines).",
        "Validate flagged blocks with short oral walkthroughs and ask students to explain intent for the matched regions.",
        "Use clone evidence to target a short remediation lesson on abstraction and decomposition for the next class.",
    ]

    student_actions = [
        "Rewrite duplicated regions into one helper function and call it from each usage site.",
        "Rename variables to reflect intent only after logic is uniquely authored, not as a post-copy change.",
    ]
    if cyclomatic_complexity >= 12:
        student_actions.append("Reduce branching with guard clauses or smaller functions to lower complexity.")
    if maintainability_index < 60:
        student_actions.append("Improve readability with clearer function boundaries and comments for non-obvious decisions.")

    return {
        "risk_level": risk_level,
        "clone_type_breakdown": dict(type_counts),
        "teaching_focus": type_focus,
        "for_instructor": instructor_actions,
        "for_student": student_actions,
    }


def _build_pair_audience_guidance(
    overall_similarity: float,
    clone_pairs: list,
) -> dict:
    risk_level = _risk_level_from_ratio(overall_similarity)
    type_counts = collections.Counter(p.clone_type for p in clone_pairs)
    dominant_type = type_counts.most_common(1)[0][0] if type_counts else None

    if dominant_type == 1:
        type_focus = "exact-copy overlap"
    elif dominant_type == 2:
        type_focus = "renamed structural overlap"
    elif dominant_type == 3:
        type_focus = "near-miss overlap"
    else:
        type_focus = "structural overlap"

    return {
        "risk_level": risk_level,
        "clone_type_breakdown": dict(type_counts),
        "teaching_focus": type_focus,
        "for_instructor": [
            f"Treat this pair as {risk_level.upper()} risk ({overall_similarity * 100:.1f}% overall similarity, {type_focus}).",
            "Review the highest-confidence clone blocks first, then ask both students to independently explain algorithm choices.",
            "Document whether overlap is assignment-template reuse or unauthorized collaboration before escalation.",
        ],
        "for_student": [
            "Refactor repeated logic into original, task-specific functions with distinct control-flow decisions.",
            "Submit a short design note describing how your approach differs from common class solutions.",
        ],
    }