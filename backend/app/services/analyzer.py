"""
TAHD — Token-AST-Halstead Detection Pipeline
=============================================
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

  Type 2 — Renamed clone (three paths, checked in order):
      STRICT   : token >= 0.75 AND ast >= 0.75
      HALSTEAD : token >= 0.75 AND ast >= 0.55 AND halstead >= 0.85
      RELAXED  : token >= 0.82 AND ast >= 0.60

  Type 3 — Near-miss clone (two paths):
      STANDARD : fusion >= 0.60 AND ast >= 0.35 AND token >= 0.35 AND max(ast,token) >= 0.40
      HALSTEAD : fusion >= 0.60 AND ast >= 0.45 AND halstead >= 0.80 AND token >= 0.25

Improvements over v1.7 (v1.8)
------------------------------
Fix #v18-1  Iterative AST traversal — _python_ast_sequence() replaced recursive
            DFS with an explicit stack to prevent RecursionError on adversarially
            deep submissions (deeply nested comprehensions, 100+ level nesting).

Fix #v18-2  Cached sampled AST sequences — _ensure_ast_sequence() now also
            computes and caches _ast_sampled on FunctionBlock so that
            _edit_distance_normalized() never re-samples the same sequence.
            For N×M pair comparisons this converts N+M sampling operations
            from O(N*M) to O(N+M).

Fix #v18-3  Cached bag magnitudes — _bag_magnitude is pre-computed once per
            block in _ensure_ast_sequence() so compute_ast_similarity() does
            not re-sum squares for every pair that involves the same block.

Fix #v18-4  Token floor on Halstead-only Type-3 path — added token >= 0.25
            guard to the Halstead-substituted Type-3 route to prevent two
            structurally unrelated functions with similar complexity profiles
            (e.g. two sorting routines, two parsers) from triggering false
            positives.

Fix #v18-5  Symmetric overall_similarity — analyze_pair() now reports
            max(matched_a/len_a, matched_b/len_b) so that a student who
            copied all of their own functions from a subset of the reference
            solution is correctly flagged regardless of which file is A/B.

Fix #v18-6  Per-type fusion weights — classify_clone() selects fusion weight
            vectors per clone type rather than applying the global 0.30/0.40/0.30
            to everything. Type-1 is token-heavy; Type-2 is AST-heavy; Type-3
            is Halstead-heavy.

Fix #v18-7  Type-2 relaxed path confidence floor raised 0.40 → 0.50 — pairs
            clearing token >= 0.82 AND ast >= 0.60 are more certain than a
            bare fusion-threshold Type-3; starting confidence at 0.40
            undersold them.

Fix #v18-8  Calibrated lit-token Type-1 confidence — lit-token exact match
            now blends the fixed 0.97 base with AST evidence rather than
            returning a hardcoded scalar, giving more accurate confidence
            on the full [0.94, 0.99] range.

Fix #v18-9  Cross-language guard in analyze_pair() — validates that both
            code_a and code_b are parseable as self.language rather than
            only checking for non-empty strings. Raises ValueError with a
            descriptive message when language mismatch is detected.

Fix #v18-10 Abstract/interface method handling — _extract_java_blocks()
            now detects method signatures ending in ';' (abstract/interface
            methods) and skips them cleanly instead of falling through to
            the whole-file <class> fallback.

Fix #v18-11 Line-count floor added alongside MIN_TOKENS — blocks with fewer
            than MIN_LINES (5) physical lines are skipped even if they pass
            the token count guard. Catches trivially short constructors and
            one-liner setters that produce noisy clone results.

Fix #v18-12 Per-pair timeout guard — _compare_block_pairs() enforces a
            per-pair wall-clock budget (MAX_PAIR_SECONDS). Pairs that exceed
            the budget (e.g. pathologically large Levenshtein inputs) are
            skipped and logged, preventing a single large submission from
            blocking the analysis worker.

Fix #v18-13 Max-pairs cap — _compare_block_pairs() stops after MAX_PAIRS
            comparisons to bound worst-case O(N²) growth on submissions with
            many functions.

Fix #v18-14 Nested FunctionDef stripping — _python_ast_sequence() strips
            FunctionDef/AsyncFunctionDef wrapper nodes at any nesting depth,
            not just the outermost one, so closures and inner helpers no
            longer contribute Module/args wrapper inflation.

Fix #v18-15 ScoredPair dataclass — classify_clone() now accepts a ScoredPair
            instead of 9 positional/keyword arguments. Cleaner signature,
            extensible for future scoring dimensions.

Fix #v18-16 _REFACTOR_RULES strict key guard — generate_refactoring_suggestions()
            raises ValueError for unknown clone types instead of silently
            applying Type-3 advice.

Fix #v18-17 Java string placeholder width-preserving substitution — string
            literals are replaced with equal-length whitespace in
            _java_ast_sequence() so that regex match positions remain stable
            and partial token boundary issues are eliminated.

Authors : Fusion Logic — FEU Institute of Technology, 2026

Changelog
---------
v1.8 (2026-03-04)
  - Fix #v18-1  : Iterative AST DFS — no more RecursionError on deep nesting.
  - Fix #v18-2  : Cached sampled AST sequences on FunctionBlock.
  - Fix #v18-3  : Cached bag magnitudes on FunctionBlock.
  - Fix #v18-4  : Token floor (>= 0.25) on Halstead-only Type-3 path.
  - Fix #v18-5  : Symmetric overall_similarity in analyze_pair().
  - Fix #v18-6  : Per-type fusion weight vectors.
  - Fix #v18-7  : Type-2 relaxed confidence floor raised to 0.50.
  - Fix #v18-8  : Calibrated lit-token Type-1 confidence.
  - Fix #v18-9  : Cross-language guard in analyze_pair().
  - Fix #v18-10 : Abstract/interface method detection in Java extractor.
  - Fix #v18-11 : MIN_LINES floor (5 lines) alongside MIN_TOKENS guard.
  - Fix #v18-12 : Per-pair wall-clock timeout (MAX_PAIR_SECONDS).
  - Fix #v18-13 : MAX_PAIRS cap on pairwise comparisons.
  - Fix #v18-14 : Nested FunctionDef stripping at any depth in Python AST.
  - Fix #v18-15 : ScoredPair dataclass replaces 9-argument classify_clone().
  - Fix #v18-16 : _REFACTOR_RULES strict key guard — ValueError on unknown type.
  - Fix #v18-17 : Width-preserving string placeholder in Java AST sequence.

v1.7 (2026-03-04)
  - Fix #v17-1  : Dual prefilter (token OR halstead) for Type-3 recall.
  - Fix #v17-2  : Body-only Python AST sequence strips Module/FunctionDef wrapper.
  - Fix #v17-3  : Non-semantic Python statement filter (print/assert/logging).
  - Fix #v17-4  : Halstead-assisted Type-2 path (token>=0.75, ast>=0.55, hal>=0.85).
  - Fix #v17-5  : Relaxed Type-2 path (token>=0.82, ast>=0.60).
  - Fix #v17-6  : Halstead-substituted Type-3 guard (ast>=0.45, hal>=0.80).
  - Fix #v17-7  : 3-segment (head+middle+tail) AST sequence sampling for len>500.
  - Fix #v17-8  : Type-1 exact raw-token match → confidence always 1.0.
  - Fix #v17-9  : MIN_TOKENS raised from 10 to 15.
  - Fix #v17-10 : Java System.out/err print filter in AST sequence builder.

References
----------
- Roy, C.K. & Cordy, J.R. (2007). "A Survey on Software Clone Detection
  Research." Queen's University, Technical Report 2007-541.
- Baxter, I.D. et al. (1998). "Clone Detection Using Abstract Syntax Trees."
  ICSM '98, pp. 368–377.
- Kamiya, T. et al. (2002). "CCFinder." IEEE TSE, 28(7).
- Halstead, M.H. (1977). "Elements of Software Science." Elsevier.
- Svajlenko, J. & Roy, C.K. (2015). "Evaluating Clone Detection Tools with
  BigCloneBench." ICSME '15, pp. 131–140.
"""

import ast
import io
import itertools
import logging
import math
import re
import time
import tokenize
import uuid
import collections
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = {"python", "java"}

# ---------------------------------------------------------------------------
# Fix #v18-6: Per-type fusion weight vectors
# Each tuple is (W_TOKEN, W_AST, W_HALSTEAD).
# Type-1: token-heavy (exact match is primarily a token signal)
# Type-2: AST-heavy   (structure preservation is the key signal)
# Type-3: Halstead-heavy (near-miss clones preserve complexity more than tokens)
# Default weights used for the prefilter fusion estimate before type is known.
# ---------------------------------------------------------------------------
FUSION_WEIGHTS = {
    1: (0.50, 0.30, 0.20),
    2: (0.25, 0.50, 0.25),
    3: (0.20, 0.35, 0.45),
    "default": (0.30, 0.40, 0.30),
}

# Global weights (default) — kept for backward-compat and prefilter use
W_TOKEN    = FUSION_WEIGHTS["default"][0]
W_AST      = FUSION_WEIGHTS["default"][1]
W_HALSTEAD = FUSION_WEIGHTS["default"][2]

assert abs(W_TOKEN + W_AST + W_HALSTEAD - 1.0) < 1e-9
for _k, _w in FUSION_WEIGHTS.items():
    if isinstance(_k, int):
        assert abs(sum(_w) - 1.0) < 1e-9, f"Fusion weights for type {_k} must sum to 1.0"

# Pre-filter thresholds
THRESH_TOKEN_PREFILTER    = 0.30
THRESH_HALSTEAD_PREFILTER = 0.80

# Type-1 thresholds
THRESH_TYPE1          = 0.95
THRESH_TYPE1_FALLBACK = 0.88

# Type-2 thresholds
THRESH_TYPE2               = 0.75
THRESH_TYPE2_HAL_AST       = 0.55
THRESH_TYPE2_HAL_HALSTEAD  = 0.85
THRESH_TYPE2_RELAXED_TOKEN = 0.82
THRESH_TYPE2_RELAXED_AST   = 0.60

# Type-3 thresholds
THRESH_FUSION_TYPE3    = 0.60   # standard path (default weights)
# Fix #v18-6: Halstead path uses per-type weights; its effective fusion score
# is lower for weak-token pairs, so a dedicated lower threshold is used.
THRESH_FUSION_TYPE3_HAL = 0.55  # Halstead-substituted path fusion floor
THRESH_TYPE3_AST_MIN   = 0.35
THRESH_TYPE3_TOKEN_MIN = 0.35
THRESH_TYPE3_PEAK      = 0.40
THRESH_TYPE3_HAL_AST   = 0.45
THRESH_TYPE3_HAL_MIN   = 0.80
# Fix #v18-4: token floor on Halstead-only Type-3 path
THRESH_TYPE3_HAL_TOKEN = 0.25

# AST blend weights
W_AST_EDIT = 0.60
W_AST_BAG  = 0.40

# Adaptive n-gram boundaries
NGRAM_SHORT_BOUND  = 20
NGRAM_LONG_BOUND   = 60
NGRAM_SIZE_SHORT   = 2
NGRAM_SIZE_DEFAULT = 3
NGRAM_SIZE_LONG    = 4

# Fix #v17-9 / #v18-11: token AND line-count floors
MIN_TOKENS = 15
MIN_LINES  = 5      # Fix #v18-11: skip trivially short blocks

# AST sequence sampling
MAX_AST_LEN = 500

# Refactoring snippet cap
MAX_SNIPPET_LINES = 15

# Fix #v18-12/13: safety caps for pairwise comparison
MAX_PAIR_SECONDS = 2.0   # wall-clock budget per pair (seconds)
MAX_PAIRS        = 5000  # hard cap on total pair comparisons per call

TAHD_VERSION = "v1.8"

# ---------------------------------------------------------------------------
# Java token/keyword tables (unchanged from v1.7)
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

_JAVA_AST_CONSTRUCTS = [
    (re.compile(r"\bSystem\s*\.\s*(?:out|err)\s*\.\s*print(?:ln|f)?\s*\("), None),
    (re.compile(r"\bif\s*\("),          "IF"),
    (re.compile(r"\belse\s*\{"),        "ELSE"),
    (re.compile(r"\bfor\s*\("),         "FOR"),
    (re.compile(r"\bwhile\s*\("),       "WHILE"),
    (re.compile(r"\bdo\s*\{"),          "DO"),
    (re.compile(r"\bswitch\s*\("),      "SWITCH"),
    (re.compile(r"\bcase\b"),           "CASE"),
    (re.compile(r"\breturn\b"),         "RETURN"),
    (re.compile(r"\bthrow\b"),          "THROW"),
    (re.compile(r"\btry\s*\{"),         "TRY"),
    (re.compile(r"\bcatch\s*\("),       "CATCH"),
    (re.compile(r"\bfinally\s*\{"),     "FINALLY"),
    (re.compile(r"\bnew\s+\w+"),        "NEW"),
    (re.compile(r"\binstanceof\b"),     "INSTANCEOF"),
    (re.compile(r"\bint\b|\blong\b|\bdouble\b|\bfloat\b|"
                r"\bboolean\b|\bString\b|\bchar\b|\bbyte\b|\bshort\b"),
     "TYPEDECL"),
    (re.compile(r"\b(?!(?:if|else|for|while|do|switch|case|return|throw|"
                r"try|catch|finally|new|instanceof)\b)"
                r"[A-Za-z_]\w*\s*\("), "CALL"),
]

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

# Fix #v18-9: heuristic patterns to detect likely-wrong-language submissions
_PY_SIGNATURE_RE   = re.compile(r"\bdef\s+\w+\s*\(")
_JAVA_SIGNATURE_RE = re.compile(r"\b(?:public|private|protected|class|void)\b")


# ===========================================================================
# Fix #v18-15: ScoredPair dataclass — replaces 9-argument classify_clone()
# ===========================================================================

@dataclass
class ScoredPair:
    """All scores computed for a block pair, passed as one unit to classify_clone."""
    token_score:     float
    ast_score:       float
    halstead_score:  float
    fusion_score:    float          # pre-computed with default weights
    raw_token_score: float = 0.0
    raw_tokens_a:    list  = field(default_factory=list)
    raw_tokens_b:    list  = field(default_factory=list)
    lit_tokens_a:    list  = field(default_factory=list)
    lit_tokens_b:    list  = field(default_factory=list)


# ===========================================================================
# Data classes
# ===========================================================================

@dataclass
class FunctionBlock:
    """A single function / method extracted from source code."""
    name: str
    start_line: int
    end_line: int
    source: str
    language: str = ""
    tokens:     list = field(default_factory=list)
    raw_tokens: list = field(default_factory=list)
    lit_tokens: list = field(default_factory=list)
    ast_sequence: list = field(default_factory=list)
    halstead:   dict = field(default_factory=dict)
    # Caches
    _ngrams_norm:   object = field(default=None, init=False, repr=False, compare=False)
    _ngrams_raw:    object = field(default=None, init=False, repr=False, compare=False)
    _ngrams_lit:    object = field(default=None, init=False, repr=False, compare=False)
    _halstead_vec:  object = field(default=None, init=False, repr=False, compare=False)
    _ast_ready:     bool   = field(default=False, init=False, repr=False, compare=False)
    _bag_vec:       object = field(default=None,  init=False, repr=False, compare=False)
    # Fix #v18-2: cached sampled sequence (avoid re-sampling per pair)
    _ast_sampled:   object = field(default=None,  init=False, repr=False, compare=False)
    # Fix #v18-3: cached bag magnitude (avoid re-summing squares per pair)
    _bag_magnitude: float  = field(default=0.0,   init=False, repr=False, compare=False)


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


# ===========================================================================
# LAYER 1 — TOKEN PREFILTER
# ===========================================================================

def _normalize_python_tokens(source: str) -> list[str]:
    PY_KEYWORDS = {
        "def", "class", "return", "if", "else", "elif", "for", "while",
        "import", "from", "try", "except", "finally", "with", "as", "pass",
        "break", "continue", "raise", "yield", "lambda", "True", "False",
        "None", "and", "or", "not", "in", "is", "del", "global", "nonlocal",
        "assert", "async", "await",
    }
    tokens = []
    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype, tval = tok.type, tok.string
            if ttype == tokenize.NAME:
                tokens.append(tval if tval in PY_KEYWORDS else "ID")
            elif ttype == tokenize.NUMBER:
                tokens.append("NUM")
            elif ttype == tokenize.STRING:
                tokens.append("STR")
            elif ttype == tokenize.OP:
                tokens.append(tval)
    except tokenize.TokenError:
        pass
    return tokens


def _raw_python_tokens(source: str) -> list[str]:
    tokens = []
    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            if tok.type in (tokenize.NAME, tokenize.NUMBER,
                            tokenize.STRING, tokenize.OP):
                tokens.append(tok.string)
    except tokenize.TokenError:
        pass
    return tokens


def _literal_normalize_python_tokens(source: str) -> list[str]:
    tokens = []
    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype, tval = tok.type, tok.string
            if ttype == tokenize.NAME:
                tokens.append(tval)
            elif ttype == tokenize.NUMBER:
                tokens.append("NUM")
            elif ttype == tokenize.STRING:
                tokens.append("STR")
            elif ttype == tokenize.OP:
                tokens.append(tval)
    except tokenize.TokenError:
        pass
    return tokens


def _normalize_java_tokens(source: str) -> list[str]:
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
            tokens.append(val if val in JAVA_KEYWORDS else "ID")
        elif kind in ("OP1", "OP2", "OP3"):
            tokens.append(val)
    return tokens


def _raw_java_tokens(source: str) -> list[str]:
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(source):
        kind, val = mo.lastgroup, mo.group()
        if kind not in ("COMMENT_ML", "COMMENT_SL", "SKIP", "MISMATCH"):
            tokens.append(val)
    return tokens


def _literal_normalize_java_tokens(source: str) -> list[str]:
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(source):
        kind, val = mo.lastgroup, mo.group()
        if kind in ("COMMENT_ML", "COMMENT_SL", "SKIP", "MISMATCH"):
            continue
        elif kind in ("STRING", "CHAR"):
            tokens.append("STR")
        elif kind == "NUMBER":
            tokens.append("NUM")
        else:
            tokens.append(val)
    return tokens


def _adaptive_ngram_size(token_count: int) -> int:
    if token_count < NGRAM_SHORT_BOUND:
        return NGRAM_SIZE_SHORT
    elif token_count >= NGRAM_LONG_BOUND:
        return NGRAM_SIZE_LONG
    return NGRAM_SIZE_DEFAULT


def _make_ngrams(tokens: list[str], n: int | None = None) -> dict:
    if n is None:
        n = _adaptive_ngram_size(len(tokens))
    if len(tokens) < n:
        return {tuple(tokens): 1} if tokens else {}
    counts: dict = {}
    for i in range(len(tokens) - n + 1):
        gram = tuple(tokens[i:i+n])
        counts[gram] = counts.get(gram, 0) + 1
    return counts


def _jaccard(counter_a: dict, counter_b: dict) -> float:
    if not counter_a and not counter_b:
        return 1.0
    if not counter_a or not counter_b:
        return 0.0
    all_keys = set(counter_a) | set(counter_b)
    inter = sum(min(counter_a.get(k, 0), counter_b.get(k, 0)) for k in all_keys)
    union = sum(max(counter_a.get(k, 0), counter_b.get(k, 0)) for k in all_keys)
    return inter / union if union else 1.0


def compute_token_similarity(block_a: FunctionBlock,
                              block_b: FunctionBlock) -> float:
    na = block_a._ngrams_norm if block_a._ngrams_norm is not None else _make_ngrams(block_a.tokens)
    nb = block_b._ngrams_norm if block_b._ngrams_norm is not None else _make_ngrams(block_b.tokens)
    return _jaccard(na, nb)


def compute_raw_token_similarity(block_a: FunctionBlock,
                                  block_b: FunctionBlock) -> float:
    na = block_a._ngrams_raw if block_a._ngrams_raw is not None else _make_ngrams(block_a.raw_tokens)
    nb = block_b._ngrams_raw if block_b._ngrams_raw is not None else _make_ngrams(block_b.raw_tokens)
    return _jaccard(na, nb)


# ===========================================================================
# LAYER 2 — AST STRUCTURAL SIMILARITY
# ===========================================================================

def _is_non_semantic_py(node: ast.AST) -> bool:
    """Return True for non-semantic Python nodes (print, logging, assert)."""
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


def _python_ast_sequence(source: str) -> list[str]:
    """
    Linearized pre-order AST sequence for Python source.

    Fix #v18-1: Iterative DFS — no recursion limit on deep submissions.
    Fix #v18-14: Strips FunctionDef/AsyncFunctionDef wrapper nodes at ANY
                 nesting depth (not just outermost), so closures and inner
                 helpers don't re-inject Module/args inflation.
    Fix #v17-3: Non-semantic statements (print, logging, assert) skipped.
    """
    sequence: list[str] = []

    # Nodes whose *wrapper* we strip but whose *body* we still emit.
    _FUNC_WRAPPERS = (ast.FunctionDef, ast.AsyncFunctionDef)
    # Node types never emitted (structural boilerplate identical in every func).
    _SKIP_TYPES = frozenset({
        "Module", "FunctionDef", "AsyncFunctionDef", "arguments", "arg",
    })

    try:
        tree = ast.parse(source)
        func_node = None
        for node in ast.walk(tree):
            if isinstance(node, _FUNC_WRAPPERS):
                func_node = node
                break

        root_stmts = func_node.body if func_node else [tree]

        # Fix #v18-1: explicit stack-based DFS (no recursion)
        # Each stack item: (ast_node, emit_this_node)
        # When we reach a nested FunctionDef we suppress the wrapper but
        # still push its body children (Fix #v18-14).
        stack: list[tuple[ast.AST, bool]] = []
        for stmt in reversed(root_stmts):
            stack.append((stmt, True))

        while stack:
            node, should_emit = stack.pop()

            if _is_non_semantic_py(node):
                continue

            node_type = type(node).__name__

            # Fix #v18-14: strip nested FunctionDef wrappers but visit body
            if isinstance(node, _FUNC_WRAPPERS):
                for child in reversed(list(ast.iter_child_nodes(node))):
                    # Only push body children, skip the arguments/arg wrappers
                    if not isinstance(child, (ast.arguments, ast.arg)):
                        stack.append((child, True))
                continue

            if should_emit and node_type not in _SKIP_TYPES:
                name = node_type
                if name == "Constant" and hasattr(node, "value"):
                    name = f"Constant_{type(node.value).__name__}"
                sequence.append(name)

            for child in reversed(list(ast.iter_child_nodes(node))):
                stack.append((child, True))

    except SyntaxError:
        pass

    return sequence


def _width_preserving_replace(source: str, pattern: re.Pattern,
                               replacement_char: str = " ") -> str:
    """
    Fix #v18-17: Replace all matches of pattern with spaces of equal length,
    preserving character positions so that subsequent regex match offsets
    remain valid.
    """
    result = list(source)
    for m in pattern.finditer(source):
        for i in range(m.start(), m.end()):
            result[i] = replacement_char
    return "".join(result)


def _java_ast_sequence(source: str) -> list[str]:
    """
    Structural node-type sequence for Java source.

    Fix #v18-17: String/char literals replaced with equal-width whitespace
    so regex match positions stay stable.
    Fix #v17-10: System.out/err print patterns skipped (symbol=None).
    """
    source = _JAVA_BLOCK_COMMENT_RE.sub(
        lambda m: " " * len(m.group()), source)
    source = _JAVA_LINE_COMMENT_RE.sub(
        lambda m: " " * len(m.group()), source)
    # Fix #v18-17: width-preserving string/char replacement
    source = _width_preserving_replace(source, _JAVA_STRING_LIT_RE)
    source = _width_preserving_replace(source, _JAVA_CHAR_LIT_RE)

    hits = []
    for pattern, symbol in _JAVA_AST_CONSTRUCTS:
        for m in pattern.finditer(source):
            hits.append((m.start(), m.end(), symbol))

    hits.sort(key=lambda x: x[0])
    merged = []
    max_end = 0
    for start, end, symbol in hits:
        if start >= max_end:
            if symbol is not None:
                merged.append((start, symbol))
            max_end = end

    return [sym for _, sym in merged]


def _sample_sequence(seq: list, max_len: int = MAX_AST_LEN) -> list:
    """
    3-segment (head + middle + tail) sampling for long AST sequences.
    (Fix #v17-7 — unchanged from v1.7)
    """
    if len(seq) <= max_len:
        return seq
    seg = max_len // 3
    mid = len(seq) // 2
    half_mid = seg // 2
    head   = seq[:seg]
    middle = seq[max(0, mid - half_mid): mid + half_mid]
    tail   = seq[-(max_len - 2 * seg):]
    return head + middle + tail


def _edit_distance_normalized(seq_a: list, seq_b: list) -> float:
    """
    Normalized Levenshtein similarity [0, 1].
    Fix #v18-2: Caller is expected to pass pre-sampled sequences (_ast_sampled),
    so this function no longer calls _sample_sequence() internally.
    """
    la, lb = len(seq_a), len(seq_b)
    if la == 0 and lb == 0:
        return 1.0
    if la == 0 or lb == 0:
        return 0.0
    if seq_a == seq_b:
        return 1.0
    if la > 2 * lb or lb > 2 * la:
        return 0.0

    max_len = max(la, lb)
    prev = list(range(lb + 1))
    curr = [0] * (lb + 1)
    for i in range(1, la + 1):
        curr[0] = i
        for j in range(1, lb + 1):
            cost = 0 if seq_a[i-1] == seq_b[j-1] else 1
            curr[j] = min(prev[j]+1, curr[j-1]+1, prev[j-1]+cost)
        if curr[0] >= max_len:
            return 0.0
        prev, curr = curr, prev
    return 1.0 - (prev[lb] / max_len)


def _bag_of_nodes_similarity(seq_a: list, seq_b: list) -> float:
    if not seq_a and not seq_b:
        return 1.0
    if not seq_a or not seq_b:
        return 0.0
    ca = collections.Counter(seq_a)
    cb = collections.Counter(seq_b)
    all_keys = set(ca) | set(cb)
    dot   = sum(ca.get(k, 0) * cb.get(k, 0) for k in all_keys)
    mag_a = math.sqrt(sum(v * v for v in ca.values()))
    mag_b = math.sqrt(sum(v * v for v in cb.values()))
    if mag_a == 0 or mag_b == 0:
        return 1.0 if mag_a == mag_b else 0.0
    return dot / (mag_a * mag_b)


def _ensure_ast_sequence(block: FunctionBlock) -> None:
    """
    Lazily compute and cache:
      - ast_sequence  (full sequence)
      - _ast_sampled  (Fix #v18-2: sampled once, reused across all pairs)
      - _bag_vec      (Counter for bag-of-nodes)
      - _bag_magnitude (Fix #v18-3: sqrt(sum of squares), cached)
    """
    if not block._ast_ready and block.source:
        if block.language == "java":
            block.ast_sequence = _java_ast_sequence(block.source)
        else:
            block.ast_sequence = _python_ast_sequence(block.source)

        # Fix #v18-2: sample once
        block._ast_sampled = _sample_sequence(block.ast_sequence)

        # Bag vector and magnitude
        block._bag_vec = collections.Counter(block.ast_sequence)
        # Fix #v18-3: cache magnitude
        block._bag_magnitude = math.sqrt(
            sum(v * v for v in block._bag_vec.values())
        ) if block._bag_vec else 0.0

        block._ast_ready = True


def compute_ast_similarity(block_a: FunctionBlock,
                            block_b: FunctionBlock) -> float:
    """
    Blended AST similarity = W_AST_EDIT * edit_sim + W_AST_BAG * bag_sim.

    Fix #v18-2: Uses pre-sampled _ast_sampled sequences.
    Fix #v18-3: Uses pre-cached _bag_magnitude values.
    """
    _ensure_ast_sequence(block_a)
    _ensure_ast_sequence(block_b)

    # Fix #v18-2: use cached sampled sequences
    edit_sim = _edit_distance_normalized(
        block_a._ast_sampled, block_b._ast_sampled
    )

    # Fix #v18-3: use cached magnitudes
    ca = block_a._bag_vec
    cb = block_b._bag_vec
    mag_a = block_a._bag_magnitude
    mag_b = block_b._bag_magnitude

    if ca is not None and cb is not None:
        all_keys = set(ca) | set(cb)
        dot = sum(ca.get(k, 0) * cb.get(k, 0) for k in all_keys)
        bag_sim = (dot / (mag_a * mag_b)
                   if mag_a > 0 and mag_b > 0
                   else (1.0 if mag_a == mag_b else 0.0))
    else:
        bag_sim = _bag_of_nodes_similarity(
            block_a.ast_sequence, block_b.ast_sequence
        )

    return W_AST_EDIT * edit_sim + W_AST_BAG * bag_sim


# ===========================================================================
# LAYER 3 — HALSTEAD COMPLEXITY FINGERPRINT
# ===========================================================================

def _extract_halstead_python(source: str) -> dict:
    OP_KEYWORDS = {
        "and", "or", "not", "in", "is", "del",
        "return", "yield", "lambda", "raise",
        "assert", "pass", "break", "continue",
    }
    SKIP_KEYWORDS = {
        "def", "class", "if", "else", "elif", "for", "while",
        "import", "from", "try", "except", "finally", "with",
        "as", "True", "False", "None", "async", "await",
        "global", "nonlocal",
    }
    operators, operands = [], []
    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype, tval = tok.type, tok.string
            if ttype == tokenize.OP:
                operators.append(tval)
            elif ttype == tokenize.NAME:
                if tval in OP_KEYWORDS:
                    operators.append(tval)
                elif tval not in SKIP_KEYWORDS:
                    operands.append(tval)
            elif ttype == tokenize.NUMBER:
                operands.append(tok.string)
            elif ttype == tokenize.STRING:
                operands.append("STR")
    except tokenize.TokenError:
        pass
    return _halstead_metrics(operators, operands)


def _extract_halstead_java(source: str) -> dict:
    source = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    source = _JAVA_LINE_COMMENT_RE.sub(" ", source)
    operators, operands = [], []
    for m in _JAVA_HALSTEAD_OP_RE.finditer(source):
        operators.append(m.group())
    clean = _JAVA_HALSTEAD_STR_RE.sub("STR_LIT ", source)
    for m in _JAVA_HALSTEAD_NUM_RE.finditer(clean):
        operands.append(m.group())
    for m in _JAVA_HALSTEAD_ID_RE.finditer(clean):
        val = m.group()
        if val in JAVA_OPERATORS:
            operators.append(val)
        elif val not in JAVA_KEYWORDS:
            operands.append(val)
    return _halstead_metrics(operators, operands)


def _halstead_metrics(operators: list, operands: list) -> dict:
    op_counts  = collections.Counter(operators)
    opd_counts = collections.Counter(operands)
    n1 = len(op_counts);   n2 = len(opd_counts)
    N1 = sum(op_counts.values()); N2 = sum(opd_counts.values())
    n = n1 + n2;  N = N1 + N2
    volume     = N * math.log2(n)      if n  > 1 else 0.0
    difficulty = (n1 / 2) * (N2 / n2)  if n2 > 0 else 0.0
    effort     = difficulty * volume
    return {
        "n1": n1, "n2": n2, "N1": N1, "N2": N2,
        "vocabulary": n, "length": N,
        "volume":     round(volume,     4),
        "difficulty": round(difficulty, 4),
        "effort":     round(effort,     4),
    }


def _halstead_vector(h: dict) -> list[float]:
    n1 = h.get("n1", 0); n2 = h.get("n2", 0)
    N1 = h.get("N1", 0); N2 = h.get("N2", 0)
    vocab = n1 + n2 + 1;  N = N1 + N2
    return [
        n1 / vocab,
        n2 / vocab,
        math.log1p(h.get("volume",     0)),
        math.log1p(h.get("difficulty", 0)),
        math.log1p(h.get("effort",     0)),
        math.log1p(N1 / (N2 + 1)),
        math.log1p(N / vocab),
        math.log1p(N2 / (N1 + 1)),
    ]


def _cosine_similarity(va: list[float], vb: list[float]) -> float:
    dot   = sum(a * b for a, b in zip(va, vb))
    mag_a = math.sqrt(sum(a * a for a in va))
    mag_b = math.sqrt(sum(b * b for b in vb))
    if mag_a == 0 or mag_b == 0:
        return 1.0 if mag_a == mag_b else 0.0
    return dot / (mag_a * mag_b)


def compute_halstead_similarity(block_a: FunctionBlock,
                                 block_b: FunctionBlock) -> float:
    va = block_a._halstead_vec if block_a._halstead_vec is not None else _halstead_vector(block_a.halstead)
    vb = block_b._halstead_vec if block_b._halstead_vec is not None else _halstead_vector(block_b.halstead)
    return _cosine_similarity(va, vb)


# ===========================================================================
# FUSION
# ===========================================================================

def compute_fusion_score(token_score: float,
                          ast_score: float,
                          halstead_score: float,
                          clone_type: int | None = None) -> float:
    """
    Weighted fusion of the three layer scores.
    Fix #v18-6: Uses per-type weight vector when clone_type is known.
    Falls back to default weights for prefilter estimates.
    """
    wt, wa, wh = FUSION_WEIGHTS.get(clone_type, FUSION_WEIGHTS["default"])
    return wt * token_score + wa * ast_score + wh * halstead_score


# ===========================================================================
# CLASSIFICATION
# ===========================================================================

def classify_clone(sp: ScoredPair) -> tuple[int | None, float]:
    """
    Fix #v18-15: Accepts ScoredPair instead of 9 positional arguments.
    Fix #v18-6:  Fusion score is recomputed per-type inside confidence calc.
    Fix #v18-7:  Type-2 relaxed path confidence floor raised to 0.50.
    Fix #v18-8:  Lit-token Type-1 confidence blended with AST evidence.
    Fix #v18-4:  Halstead-only Type-3 path requires token >= 0.25.

    Returns (clone_type, confidence) or (None, 0.0).
    """
    token_score    = sp.token_score
    ast_score      = sp.ast_score
    halstead_score = sp.halstead_score
    raw_token_score = sp.raw_token_score or token_score

    # ------------------------------------------------------------------ Type 1
    if sp.raw_tokens_a and sp.raw_tokens_b:
        # (a) Exact raw token match — always confidence 1.0
        if sp.raw_tokens_a == sp.raw_tokens_b:
            return 1, 1.0

        # (b) Exact literal-normalized match
        # Fix #v18-8: blend fixed base with AST evidence
        if sp.lit_tokens_a and sp.lit_tokens_b:
            if sp.lit_tokens_a == sp.lit_tokens_b:
                conf = min(0.99, 0.94 + 0.05 * ast_score)
                return 1, round(conf, 4)

        # (c) Near-exact threshold fallback
        if raw_token_score >= THRESH_TYPE1_FALLBACK and ast_score >= THRESH_TYPE1:
            return 1, 0.92

    elif raw_token_score >= THRESH_TYPE1 and ast_score >= THRESH_TYPE1:
        return 1, 0.92

    # ------------------------------------------------------------------ Type 2
    # Strict path
    if token_score >= THRESH_TYPE2 and ast_score >= THRESH_TYPE2:
        margin = min(token_score, ast_score) - THRESH_TYPE2
        conf = min(1.0, margin / max(1.0 - THRESH_TYPE2, 1e-9) + 0.5)
        return 2, round(conf, 4)

    # Halstead-assisted path
    if (token_score >= THRESH_TYPE2
            and ast_score >= THRESH_TYPE2_HAL_AST
            and halstead_score >= THRESH_TYPE2_HAL_HALSTEAD):
        margin = min(token_score, halstead_score) - THRESH_TYPE2
        conf = min(1.0, margin / max(1.0 - THRESH_TYPE2, 1e-9) * 0.8 + 0.4)
        return 2, round(conf, 4)

    # Fix #v18-7: Relaxed path — confidence floor raised from 0.40 → 0.50
    if token_score >= THRESH_TYPE2_RELAXED_TOKEN and ast_score >= THRESH_TYPE2_RELAXED_AST:
        margin = token_score - THRESH_TYPE2_RELAXED_TOKEN
        conf = min(1.0, margin / max(1.0 - THRESH_TYPE2_RELAXED_TOKEN, 1e-9) + 0.50)
        return 2, round(conf, 4)

    # ------------------------------------------------------------------ Type 3
    # Use per-type fusion score for Type-3 evaluation
    fusion_t3 = compute_fusion_score(token_score, ast_score, halstead_score, clone_type=3)

    # Standard guard (needs full fusion >= 0.60)
    if fusion_t3 >= THRESH_FUSION_TYPE3:
        both_baseline = (ast_score >= THRESH_TYPE3_AST_MIN
                         and token_score >= THRESH_TYPE3_TOKEN_MIN)
        has_peak      = max(ast_score, token_score) >= THRESH_TYPE3_PEAK
        if both_baseline and has_peak:
            margin = fusion_t3 - THRESH_FUSION_TYPE3
            conf = min(1.0, margin / max(1.0 - THRESH_FUSION_TYPE3, 1e-9) + 0.5)
            return 3, round(conf, 4)

    # Fix #v18-4: Halstead-substituted path — uses a LOWER dedicated threshold
    # (THRESH_FUSION_TYPE3_HAL=0.55) because per-type weights depress the score
    # for weak-token pairs. Also requires token >= 0.25 to avoid false positives.
    if (fusion_t3 >= THRESH_FUSION_TYPE3_HAL
            and ast_score >= THRESH_TYPE3_HAL_AST
            and halstead_score >= THRESH_TYPE3_HAL_MIN
            and token_score >= THRESH_TYPE3_HAL_TOKEN):
        conf = min(1.0, halstead_score * 0.7 + 0.1)
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


def _make_block(name, start_line, end_line, source, language) -> FunctionBlock:
    fb = FunctionBlock(
        name=name, start_line=start_line, end_line=end_line,
        source=source, language=language,
    )
    clean = _strip_decorators(_strip_imports(source, language), language)
    if language == "python":
        fb.tokens     = _normalize_python_tokens(clean)
        fb.raw_tokens = _raw_python_tokens(clean)
        fb.lit_tokens = _literal_normalize_python_tokens(clean)
        fb.halstead   = _extract_halstead_python(clean)
    else:
        fb.tokens     = _normalize_java_tokens(clean)
        fb.raw_tokens = _raw_java_tokens(clean)
        fb.lit_tokens = _literal_normalize_java_tokens(clean)
        fb.halstead   = _extract_halstead_java(clean)
    fb._ngrams_norm  = _make_ngrams(fb.tokens)
    fb._ngrams_raw   = _make_ngrams(fb.raw_tokens)
    fb._ngrams_lit   = _make_ngrams(fb.lit_tokens)
    fb._halstead_vec = _halstead_vector(fb.halstead)
    return fb


def _extract_python_blocks(source: str) -> list[FunctionBlock]:
    lines = source.splitlines()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return [_make_block("<module>", 1, len(lines), source, "python")]

    func_nodes = [n for n in ast.walk(tree)
                  if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
    if not func_nodes:
        return [_make_block("<module>", 1, len(lines), source, "python")]

    blocks = []
    for node in func_nodes:
        start    = node.lineno
        end      = node.end_lineno
        func_src = "\n".join(lines[start - 1: end])
        blocks.append(_make_block(node.name, start, end, func_src, "python"))
    return blocks


def _extract_java_blocks(source: str) -> list[FunctionBlock]:
    """
    Extract method/constructor-level blocks from Java source.

    Fix #v18-10: Detects abstract/interface method signatures (ending in ';')
    and skips them cleanly rather than falling through to the <class> fallback.
    """
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
    # Fix #v18-10: abstract/interface method signatures end with ';'
    abstract_pattern = re.compile(
        r"(?:(?:public|private|protected|abstract|static|final)\s+)*"
        r"(?:\w+(?:<(?:[^<>]|<[^<>]*>)*>)?)\s+"
        r"\w+\s*\([^)]*\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?;"
    )
    abstract_positions: set[int] = {m.start() for m in abstract_pattern.finditer(clean)}

    all_matches: dict[int, str] = {}
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


def extract_blocks(source: str, language: str) -> list[FunctionBlock]:
    if language == "python":
        return _extract_python_blocks(source)
    elif language == "java":
        return _extract_java_blocks(source)
    return []


# ===========================================================================
# PAIRWISE DETECTION
# ===========================================================================

def _compare_block_pairs(pair_iter, file_a: str, file_b: str) -> list[ClonePair]:
    """
    Core TAHD pipeline over (block_a, block_b) pairs.

    Fix #v18-11: MIN_LINES floor in addition to MIN_TOKENS.
    Fix #v18-12: Per-pair wall-clock budget (MAX_PAIR_SECONDS).
    Fix #v18-13: Hard cap on total comparisons (MAX_PAIRS).
    Fix #v18-15: classify_clone() now accepts ScoredPair.
    """
    pairs = []
    pair_count = 0

    for block_a, block_b in pair_iter:
        # Fix #v18-13: stop after MAX_PAIRS comparisons
        if pair_count >= MAX_PAIRS:
            logger.warning(
                "TAHD: MAX_PAIRS (%d) reached — remaining pairs skipped.", MAX_PAIRS
            )
            break
        pair_count += 1

        # Guard 0: token floor
        if len(block_a.tokens) < MIN_TOKENS or len(block_b.tokens) < MIN_TOKENS:
            continue

        # Fix #v18-11: line-count floor
        lines_a = block_a.end_line - block_a.start_line + 1
        lines_b = block_b.end_line - block_b.start_line + 1
        if lines_a < MIN_LINES or lines_b < MIN_LINES:
            continue

        # Guard 0b: length ratio
        len_a, len_b = len(block_a.tokens), len(block_b.tokens)
        if max(len_a, len_b) > 3 * min(len_a, len_b):
            continue

        # Fix #v18-12: per-pair timeout
        _pair_start = time.perf_counter()

        # ---- Layer 1 ----
        token_score = compute_token_similarity(block_a, block_b)

        # Dual prefilter (Fix #v17-1)
        if token_score < THRESH_TOKEN_PREFILTER:
            hal_pre = compute_halstead_similarity(block_a, block_b)
            if hal_pre < THRESH_HALSTEAD_PREFILTER:
                continue

        raw_token_score = compute_raw_token_similarity(block_a, block_b)

        # ---- Layer 2 ----
        ast_score = compute_ast_similarity(block_a, block_b)

        # Fix #v18-12: check budget after most expensive step
        if time.perf_counter() - _pair_start > MAX_PAIR_SECONDS:
            logger.warning(
                "TAHD: pair (%s, %s) exceeded %.1fs budget — skipped.",
                block_a.name, block_b.name, MAX_PAIR_SECONDS,
            )
            continue

        # ---- Layer 3 ----
        halstead_score = compute_halstead_similarity(block_a, block_b)

        # ---- Fusion (default weights for initial estimate) ----
        fusion = compute_fusion_score(token_score, ast_score, halstead_score)

        # ---- Fix #v18-15: build ScoredPair and classify ----
        sp = ScoredPair(
            token_score    = token_score,
            ast_score      = ast_score,
            halstead_score = halstead_score,
            fusion_score   = fusion,
            raw_token_score = raw_token_score,
            raw_tokens_a   = block_a.raw_tokens,
            raw_tokens_b   = block_b.raw_tokens,
            lit_tokens_a   = block_a.lit_tokens,
            lit_tokens_b   = block_b.lit_tokens,
        )
        clone_type, confidence = classify_clone(sp)

        if clone_type is not None:
            # Recompute fusion with per-type weights for the output score
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
                confidence     = round(max(0.0, confidence), 4),
            ))
    return pairs


def _deduplicate_clone_pairs(pairs: list, mode: str = "strict") -> list:
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
    blocks_a: list[FunctionBlock],
    blocks_b: list[FunctionBlock],
    file_a: str = "file_a",
    file_b: str = "file_b",
) -> list[ClonePair]:
    pairs = _compare_block_pairs(itertools.product(blocks_a, blocks_b), file_a, file_b)
    return _deduplicate_clone_pairs(pairs, mode="cross_file")


def detect_clones_single_file(
    blocks: list[FunctionBlock],
    filename: str = "submission",
) -> list[ClonePair]:
    pairs = _compare_block_pairs(itertools.combinations(blocks, 2), filename, filename)
    return _deduplicate_clone_pairs(pairs, mode="strict")


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
    clone_pairs: list[ClonePair],
    max_suggestions: int = 5,
) -> list[dict]:
    sorted_pairs = sorted(clone_pairs, key=lambda p: p.fusion_score, reverse=True)
    suggestions  = []
    for rank, pair in enumerate(sorted_pairs[:max_suggestions], start=1):
        # Fix #v18-16: strict key guard — fail loudly on unknown clone type
        if pair.clone_type not in _REFACTOR_RULES:
            raise ValueError(
                f"Unknown clone_type {pair.clone_type!r} in ClonePair {pair.clone_id}. "
                f"Expected one of {list(_REFACTOR_RULES)}."
            )
        rule = _REFACTOR_RULES[pair.clone_type]
        lines_a = pair.block_a.source.splitlines()
        lines_b = pair.block_b.source.splitlines()
        snippet_a = "\n".join(lines_a[:MAX_SNIPPET_LINES])
        if len(lines_a) > MAX_SNIPPET_LINES:
            snippet_a += f"\n# ... ({len(lines_a) - MAX_SNIPPET_LINES} more lines)"
        snippet_b = "\n".join(lines_b[:MAX_SNIPPET_LINES])
        if len(lines_b) > MAX_SNIPPET_LINES:
            snippet_b += f"\n# ... ({len(lines_b) - MAX_SNIPPET_LINES} more lines)"
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
            "before_code": (f"# Block A ({pair.block_a.name})\n{snippet_a}\n\n"
                            f"# Block B ({pair.block_b.name})\n{snippet_b}"),
            "after_code":  _generate_after_code(pair),
        })
    return suggestions


# ===========================================================================
# QUALITY METRICS (unchanged from v1.7)
# ===========================================================================

def compute_cyclomatic_complexity(source: str, language: str) -> float:
    if language == "python":
        try:
            tree = ast.parse(source)
            count = 1
            for node in ast.walk(tree):
                if isinstance(node, (ast.If, ast.For, ast.While,
                                      ast.ExceptHandler, ast.With,
                                      ast.AsyncFor, ast.AsyncWith)):
                    count += 1
                elif isinstance(node, ast.BoolOp):
                    count += len(node.values) - 1
            return float(count)
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
# CODE QUALITY REPORT HELPERS (unchanged from v1.7)
# ===========================================================================

def _compute_nesting_depth(source: str, language: str) -> int:
    if language == "python":
        SCOPE_NODES = (
            ast.If, ast.For, ast.While, ast.With, ast.Try,
            ast.ExceptHandler, ast.AsyncFor, ast.AsyncWith,
        )
        max_depth = 0
        def _walk_depth(node: ast.AST, depth: int) -> None:
            nonlocal max_depth
            if depth > max_depth:
                max_depth = depth
            for child in ast.iter_child_nodes(node):
                _walk_depth(child, depth + (1 if isinstance(child, SCOPE_NODES) else 0))
        try:
            _walk_depth(ast.parse(source), 0)
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
        docstring_lines: set[int] = set()
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


def _detect_unused_functions(blocks: list, source: str) -> dict[str, dict]:
    ENTRY_POINT_RE = re.compile(
        r"^(main|__main__|setUp|tearDown|run|execute|start|stop"
        r"|test\w*|on[A-Z]\w*|handle[A-Z]\w*)$"
    )
    defined = {b.name for b in blocks if b.name not in ("<module>", "<class>")}
    called: set[str] = set()
    if any(getattr(b, "language", "") == "java" for b in blocks):
        searchable = re.sub(r"/\*.*?\*/", " ", source, flags=re.DOTALL)
        searchable = re.sub(r"//[^\n]*", " ", searchable)
    else:
        searchable = re.sub(r"#[^\n]*", " ", source)
    if not defined:
        return {}
    combined = re.compile(
        r"\b(" + "|".join(re.escape(n) for n in sorted(defined, key=len, reverse=True)) + r")\b"
    )
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
        cc         = compute_cyclomatic_complexity(block.source, language)
        nesting    = _compute_nesting_depth(block.source, language)
        line_count = block.end_line - block.start_line + 1
        smells = []
        if line_count > 30:       smells.append("long_function")
        if cc > 10:               smells.append("high_complexity")
        if block.name in cloned_names: smells.append("internal_duplication")
        if block.name in unused_info and unused_info[block.name]["confidence"] == "high":
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
    if language == "python":
        if not isinstance(code, str):
            raise SyntaxError("Code must be a string")
        ast.parse(code)
    return True


def _detect_language(code: str) -> str | None:
    """
    Fix #v18-9: Heuristic language detection for cross-language guard.
    Returns 'python', 'java', or None (ambiguous / unknown).
    """
    has_py   = bool(_PY_SIGNATURE_RE.search(code))
    has_java = bool(_JAVA_SIGNATURE_RE.search(code))
    if has_py and not has_java:
        return "python"
    if has_java and not has_py:
        return "java"
    return None   # ambiguous — caller decides


# ===========================================================================
# PUBLIC API — CodeAnalyzer
# ===========================================================================

class CodeAnalyzer:
    """
    TAHD v1.8 drop-in CodeAnalyzer.

    analyze(code)         → single-file analysis with quality report
    analyze_pair(a, b)    → cross-file clone detection between two submissions
    """

    def __init__(self, language: str):
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError("Unsupported language")
        self.language = language
        self.code: str | None = None

    def analyze(self, code: str, max_suggestions: int = 5) -> dict:
        if not isinstance(code, str):
            raise ValueError("code must be a string")
        self.code = code
        lines = code.splitlines()
        loc   = max(1, len(lines))

        blocks      = extract_blocks(code, self.language)
        clone_pairs = detect_clones_single_file(blocks)

        all_halstead = [b.halstead for b in blocks]
        total_volume = sum(h.get("volume", 0) for h in all_halstead)
        cc = compute_cyclomatic_complexity(code, self.language)
        mi = compute_maintainability_index(total_volume, cc, loc)

        cloned_lines: set[int] = set()
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
        }

    def analyze_pair(
        self,
        code_a: str,
        code_b: str,
        file_a: str = "submission_a",
        file_b: str = "submission_b",
        max_suggestions: int = 5,
    ) -> dict:
        """
        Fix #v18-9: Language guard — warns when submitted code doesn't match
                    self.language, rather than silently producing garbage.
        Fix #v18-5: Symmetric overall_similarity.
        """
        if not isinstance(code_a, str) or not code_a.strip():
            raise ValueError("code_a must be a non-empty string")
        if not isinstance(code_b, str) or not code_b.strip():
            raise ValueError("code_b must be a non-empty string")

        # Fix #v18-9: heuristic cross-language guard
        for label, code in ((file_a, code_a), (file_b, code_b)):
            detected = _detect_language(code)
            if detected is not None and detected != self.language:
                raise ValueError(
                    f"{label} appears to be {detected!r} but this analyzer "
                    f"is configured for {self.language!r}. "
                    f"Initialize CodeAnalyzer('{detected}') for that submission."
                )

        blocks_a = extract_blocks(code_a, self.language)
        blocks_b = extract_blocks(code_b, self.language)
        clone_pairs = detect_clones_in_blocks(blocks_a, blocks_b, file_a, file_b)

        # Fix #v18-5: symmetric overall_similarity
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