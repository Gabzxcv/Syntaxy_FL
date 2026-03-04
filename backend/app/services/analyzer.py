"""
TAHD — Token-AST-Halstead Detection Pipeline
=============================================
A three-layer hybrid code clone detection engine for educational
Python and Java submissions.

Layer 1 — Token Prefilter      : Jaccard similarity on normalized token n-grams
Layer 2 — AST Structural Check : Combined edit-distance + bag-of-nodes similarity
Layer 3 — Halstead Fingerprint : Cosine similarity on Halstead complexity vectors

Fusion score = 0.30 * token_jaccard + 0.40 * ast_similarity + 0.30 * halstead_cosine

Clone classification:
  Type 1 : exact raw match OR literal-normalized match OR (raw >= 0.88 AND ast >= 0.95)
  Type 2 : norm_token >= 0.75 AND ast >= 0.75  (renamed identifiers, not Type 1)
  Type 3 : fusion >= 0.60 AND ast >= 0.35 AND token >= 0.35 AND max(ast,token) >= 0.40

Key algorithmic improvements in v1.6 over v1.5
-----------------------------------------------
Fix #A — Adaptive n-gram size
    _make_ngrams() now accepts an optional n parameter; compute_token_similarity()
    and compute_raw_token_similarity() choose n based on the shorter token list:
      n=2 for < 20 tokens, n=3 for 20–59 tokens, n=4 for >= 60 tokens.
    Motivation: fixed trigrams on short functions (10–19 tokens) are highly
    sensitive to single-token changes, producing noisy Jaccard scores.  Bigrams
    are more stable for short sequences; 4-grams reduce false-positive Jaccard
    on large functions that share common idiom subsequences.

Fix #B — Literal-normalized token stream for Type-1 detection
    _literal_normalize_*() functions produce a token list where NUMBER/STRING
    literals are replaced with NUM/STR but identifier names are preserved
    (unlike full normalization which also replaces identifiers with ID).
    classify_clone() now accepts lit_tokens_a / lit_tokens_b and checks
    exact list equality as a second Type-1 test.  This correctly classifies
    "exact copies with only constant literal changes" as Type 1 instead of
    Type 2, matching the formal clone taxonomy (Roy & Cordy 2007).

Fix #C — Combined AST similarity (edit distance + bag-of-nodes)
    compute_ast_similarity() now returns a weighted blend:
      ast_sim = 0.60 * edit_distance_sim + 0.40 * bag_of_nodes_cosine
    The bag-of-nodes component counts AST node-type frequencies and computes
    cosine similarity.  This makes AST similarity robust to statement reordering
    (a common Type-2/3 obfuscation), which pure edit distance penalises heavily.

Fix #D — Strengthened Type-3 structural guard
    The previous guard (ast >= 0.30 OR token >= 0.35) was too permissive:
    any two functions with shared control-flow keywords (if/for/return) could
    pass on AST alone, causing false positives.  New guard:
      ast >= 0.35 AND token >= 0.35 AND max(ast, token) >= 0.40
    Both layers must show a baseline signal (AND, not OR), and at least one
    must reach a peak threshold, filtering random structural overlap.

Fix #E — Confidence score formula corrected for Type-1
    Previous formula could return confidence > 1.0 for raw_token_score >> 0.95
    because the numerator was unbounded.  The formula is now clamped with
    min(1.0, ...) applied correctly after the division.

Authors : Fusion Logic — FEU Institute of Technology, 2026

References
----------
- Roy, C.K. & Cordy, J.R. (2007). "A Survey on Software Clone Detection
  Research." Queen's University, Technical Report 2007-541.
- Baxter, I.D. et al. (1998). "Clone Detection Using Abstract Syntax Trees."
  Proceedings of ICSM '98, pp. 368–377.
- Kamiya, T. et al. (2002). "CCFinder: A Multilinguistic Token-Based Code
  Clone Detection System for Large Scale Source Code." IEEE TSE, 28(7).
- Halstead, M.H. (1977). "Elements of Software Science." Elsevier.
- Svajlenko, J. & Roy, C.K. (2015). "Evaluating Clone Detection Tools with
  BigCloneBench." Proceedings of ICSME '15, pp. 131–140.

Changelog
---------
v1.6 (2026-03-04)
  - Fix #A : Adaptive n-gram size — n=2 (<20 tokens), n=3 (20–59), n=4 (>=60).
             Reduces noise for short functions; improves precision for large ones.
  - Fix #B : Literal-normalized token stream added. classify_clone() accepts
             lit_tokens_a/lit_tokens_b and uses exact list equality as a second
             Type-1 check, correctly handling copies with only constant changes.
  - Fix #C : AST similarity now blends edit distance (60%) with bag-of-nodes
             cosine similarity (40%), making it robust to statement reordering.
  - Fix #D : Type-3 structural guard tightened: ast>=0.35 AND token>=0.35 AND
             max(ast,token)>=0.40 (was: ast>=0.30 OR token>=0.35).
  - Fix #E : Type-1 confidence clamping corrected; formula is now strictly [0,1].
  - Fix #10: Version bumped to v1.6. TAHD_VERSION module constant updated.

v1.5 (2026-03-04)
  - Fix #1 : _edit_distance_normalized() early-exit now checks curr[0].
  - Fix #2 : _deduplicate_clone_pairs() gains a mode parameter.
  - Fix #3 : _java_ast_sequence() replaces claimed: set[int] with max_claimed_end.
  - Fix #4 : _halstead_vector() dim 7 replaced with log1p(N2/(N1+1)).
  - Fix #5 : THRESH_TYPE1_FALLBACK = 0.88 added.
  - Fix #6 : compute_cyclomatic_complexity() for Python now uses ast.parse().
  - Fix #7 : _extract_java_blocks() adds constructor_pattern.
  - Fix #8 : _detect_unused_functions() uses single combined alternation regex.
  - Fix #9 : generate_refactoring_suggestions() snippet cap raised to 15 lines.
  - Fix #10: Version bumped to v1.5. TAHD_VERSION module constant added.
"""

import ast
import io
import itertools
import math
import re
import tokenize
import uuid
import collections
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_LANGUAGES = {"python", "java"}

# Fusion weights (must sum to 1.0)
W_TOKEN    = 0.30
W_AST      = 0.40
W_HALSTEAD = 0.30

# Fix #12 (v1.2): Validate fusion weights at module load time
assert abs(W_TOKEN + W_AST + W_HALSTEAD - 1.0) < 1e-9, (
    f"Fusion weights must sum to 1.0, got {W_TOKEN + W_AST + W_HALSTEAD}"
)

# Per-layer thresholds
THRESH_TOKEN_PREFILTER = 0.30   # minimum token Jaccard to proceed to Layer 2
THRESH_TYPE1           = 0.95   # both token AND ast must reach this for Type 1
THRESH_TYPE1_FALLBACK  = 0.88   # for near-exact clones with only literal diffs
THRESH_TYPE2           = 0.75   # both token AND ast must reach this for Type 2
THRESH_FUSION_TYPE3    = 0.60   # fusion score threshold for Type 3

# Fix #D (v1.6): Strengthened Type-3 structural guard thresholds.
# All three conditions must be satisfied simultaneously (AND logic).
THRESH_TYPE3_AST_MIN   = 0.35   # was 0.30 — both layers must show baseline signal
THRESH_TYPE3_TOKEN_MIN = 0.35   # unchanged
THRESH_TYPE3_PEAK      = 0.40   # at least one layer must reach this peak value

# Fix #C (v1.6): AST similarity blend weights (edit distance + bag-of-nodes).
W_AST_EDIT = 0.60   # weight for normalized edit distance
W_AST_BAG  = 0.40   # weight for bag-of-nodes cosine similarity

# N-gram size selection boundaries (Fix #A, v1.6)
NGRAM_SHORT_BOUND  = 20   # < 20 tokens  → n=2
NGRAM_LONG_BOUND   = 60   # >= 60 tokens → n=4
NGRAM_SIZE_SHORT   = 2
NGRAM_SIZE_DEFAULT = 3
NGRAM_SIZE_LONG    = 4

# Fix #5 (v1.2): Minimum token count for a block to be considered in detection.
MIN_TOKENS = 10

# Maximum lines to show in refactoring suggestion snippets
MAX_SNIPPET_LINES = 15

# TAHD detection pipeline version
TAHD_VERSION = "v1.6"

# Java operators and keywords used for Halstead extraction
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

_JAVA_CF_KEYWORDS = frozenset([
    "if", "else", "for", "while", "do", "switch", "case",
    "return", "throw", "try", "catch", "finally", "new", "instanceof",
])

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


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class FunctionBlock:
    """A single function / method extracted from source code."""
    name: str
    start_line: int
    end_line: int
    source: str
    language: str = ""
    tokens: list = field(default_factory=list)
    raw_tokens: list = field(default_factory=list)
    lit_tokens: list = field(default_factory=list)   # Fix #B: literal-normalized tokens
    ast_sequence: list = field(default_factory=list)
    halstead: dict = field(default_factory=dict)
    # Performance caches — computed once, reused across all pair comparisons
    _ngrams_norm: object = field(default=None, init=False, repr=False, compare=False)
    _ngrams_raw: object = field(default=None, init=False, repr=False, compare=False)
    _ngrams_lit: object = field(default=None, init=False, repr=False, compare=False)
    _halstead_vec: object = field(default=None, init=False, repr=False, compare=False)
    _ast_ready: bool = field(default=False, init=False, repr=False, compare=False)
    _bag_vec: object = field(default=None, init=False, repr=False, compare=False)


@dataclass
class ClonePair:
    """A detected clone relationship between two function blocks."""
    clone_id: str
    clone_type: int           # 1, 2, or 3
    token_score: float
    ast_score: float
    halstead_score: float
    fusion_score: float
    block_a: FunctionBlock
    block_b: FunctionBlock
    file_a: str = ""
    file_b: str = ""
    confidence: float = 0.0   # how confident the classification is (0.0-1.0)


# ===========================================================================
# LAYER 1 — TOKEN PREFILTER
# ===========================================================================

def _normalize_python_tokens(source: str) -> list[str]:
    """
    Tokenize Python source and normalize:
      - identifiers → ID
      - numbers     → NUM
      - strings     → STR
      - keep operators and keywords as-is
      - strip comments and whitespace tokens
    """
    tokens = []
    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype = tok.type
            tval  = tok.string

            if ttype == tokenize.NAME:
                if tval in {"def", "class", "return", "if", "else", "elif",
                            "for", "while", "import", "from", "try", "except",
                            "finally", "with", "as", "pass", "break",
                            "continue", "raise", "yield", "lambda",
                            "True", "False", "None", "and", "or", "not",
                            "in", "is", "del", "global", "nonlocal",
                            "assert", "async", "await"}:
                    tokens.append(tval)
                else:
                    tokens.append("ID")

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
    """
    Tokenize Python source preserving identifier names and literal values.
    Only strips comments, whitespace, and formatting tokens.
    Used for Type-1 (exact clone) detection.
    """
    tokens = []
    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype = tok.type
            tval  = tok.string

            if ttype in (tokenize.NAME, tokenize.NUMBER,
                         tokenize.STRING, tokenize.OP):
                tokens.append(tval)

    except tokenize.TokenError:
        pass

    return tokens


def _literal_normalize_python_tokens(source: str) -> list[str]:
    """
    Fix #B (v1.6): Literal-normalized tokenization for Python.

    Preserves identifier names (unlike full normalization which maps them to ID),
    but replaces NUMBER and STRING literals with NUM/STR.
    Used as a second Type-1 check: if two functions are identical modulo
    literal constants (e.g. loop bounds, string messages), they are still
    an exact (Type-1) copy per the Roy & Cordy clone taxonomy.
    """
    tokens = []
    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype = tok.type
            tval  = tok.string

            if ttype == tokenize.NAME:
                tokens.append(tval)          # keep real identifier name
            elif ttype == tokenize.NUMBER:
                tokens.append("NUM")         # normalize literals
            elif ttype == tokenize.STRING:
                tokens.append("STR")
            elif ttype == tokenize.OP:
                tokens.append(tval)

    except tokenize.TokenError:
        pass

    return tokens


def _normalize_java_tokens(source: str) -> list[str]:
    """
    Tokenize Java source with a regex lexer and normalize:
      - identifiers → ID, numbers → NUM, strings → STR
      - keep keywords and operators as-is
    """
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(source):
        kind = mo.lastgroup
        val  = mo.group()

        if kind in ("COMMENT_ML", "COMMENT_SL", "SKIP"):
            continue
        elif kind in ("STRING", "CHAR"):
            tokens.append("STR")
        elif kind == "NUMBER":
            tokens.append("NUM")
        elif kind == "IDENT":
            if val in JAVA_KEYWORDS:
                tokens.append(val)
            else:
                tokens.append("ID")
        elif kind in ("OP1", "OP2", "OP3"):
            tokens.append(val)

    return tokens


def _raw_java_tokens(source: str) -> list[str]:
    """
    Tokenize Java source preserving identifier names and literal values.
    Only strips comments and whitespace.
    Used for Type-1 (exact clone) detection.
    """
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(source):
        kind = mo.lastgroup
        val  = mo.group()

        if kind in ("COMMENT_ML", "COMMENT_SL", "SKIP", "MISMATCH"):
            continue
        else:
            tokens.append(val)

    return tokens


def _literal_normalize_java_tokens(source: str) -> list[str]:
    """
    Fix #B (v1.6): Literal-normalized tokenization for Java.

    Preserves identifier names but replaces NUMBER/STRING/CHAR with NUM/STR.
    Used as the second Type-1 check alongside raw token equality.
    """
    tokens = []
    for mo in _JAVA_TOKEN_RE.finditer(source):
        kind = mo.lastgroup
        val  = mo.group()

        if kind in ("COMMENT_ML", "COMMENT_SL", "SKIP", "MISMATCH"):
            continue
        elif kind in ("STRING", "CHAR"):
            tokens.append("STR")
        elif kind == "NUMBER":
            tokens.append("NUM")
        else:
            tokens.append(val)   # keep idents, keywords, ops as-is

    return tokens


def _adaptive_ngram_size(token_count: int) -> int:
    """
    Fix #A (v1.6): Choose n-gram size based on token list length.

    Rationale:
    - Short functions (< 20 tokens) have very few distinct trigrams, making
      Jaccard highly sensitive to single-token changes. Bigrams are more stable.
    - Long functions (>= 60 tokens) benefit from 4-grams, which reduce false
      positives from shared common idiom subsequences (e.g. "for ID in range").
    - Medium functions use the traditional trigram.
    """
    if token_count < NGRAM_SHORT_BOUND:
        return NGRAM_SIZE_SHORT
    elif token_count >= NGRAM_LONG_BOUND:
        return NGRAM_SIZE_LONG
    return NGRAM_SIZE_DEFAULT


def _make_ngrams(tokens: list[str], n: int | None = None) -> dict:
    """
    Convert a token list into a multiset (Counter) of n-gram tuples.

    Fix #A (v1.6): If n is None, the size is chosen adaptively based on
    token list length via _adaptive_ngram_size().
    """
    if n is None:
        n = _adaptive_ngram_size(len(tokens))
    if len(tokens) < n:
        if tokens:
            key = tuple(tokens)
            return {key: 1}
        return {}
    counts = {}
    for i in range(len(tokens) - n + 1):
        gram = tuple(tokens[i:i+n])
        counts[gram] = counts.get(gram, 0) + 1
    return counts


def _jaccard(counter_a: dict, counter_b: dict) -> float:
    """Multiset Jaccard similarity between two Counters."""
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
    """Layer 1: Jaccard on normalized token n-gram multisets."""
    ngrams_a = block_a._ngrams_norm if block_a._ngrams_norm is not None else _make_ngrams(block_a.tokens)
    ngrams_b = block_b._ngrams_norm if block_b._ngrams_norm is not None else _make_ngrams(block_b.tokens)
    return _jaccard(ngrams_a, ngrams_b)


def compute_raw_token_similarity(block_a: FunctionBlock,
                                  block_b: FunctionBlock) -> float:
    """Jaccard on raw (unnormalized) token n-gram multisets for Type-1 detection."""
    ngrams_a = block_a._ngrams_raw if block_a._ngrams_raw is not None else _make_ngrams(block_a.raw_tokens)
    ngrams_b = block_b._ngrams_raw if block_b._ngrams_raw is not None else _make_ngrams(block_b.raw_tokens)
    return _jaccard(ngrams_a, ngrams_b)


# ===========================================================================
# LAYER 2 — AST STRUCTURAL SIMILARITY
# ===========================================================================

def _python_ast_sequence(source: str) -> list[str]:
    """
    Parse Python source into an AST and produce a linearized node-type
    sequence via pre-order DFS traversal.
    """
    sequence = []

    def _visit(node: ast.AST) -> None:
        name = type(node).__name__
        if name == "Constant" and hasattr(node, "value"):
            name = f"Constant_{type(node.value).__name__}"
        sequence.append(name)
        for child in ast.iter_child_nodes(node):
            _visit(child)

    try:
        tree = ast.parse(source)
        _visit(tree)
    except SyntaxError:
        pass

    return sequence


def _java_ast_sequence(source: str) -> list[str]:
    """
    Produce a structural node-type sequence for Java source using a
    pattern-based approach.  Control-flow keywords are matched before the
    generic CALL pattern to prevent double-counting.
    """
    source = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    source = _JAVA_LINE_COMMENT_RE.sub(" ", source)
    source = _JAVA_STRING_LIT_RE.sub("STR", source)
    source = _JAVA_CHAR_LIT_RE.sub("STR", source)

    hits = []
    for pattern, symbol in _JAVA_AST_CONSTRUCTS:
        for m in pattern.finditer(source):
            hits.append((m.start(), m.end(), symbol))

    hits.sort(key=lambda x: x[0])
    merged = []
    max_end = 0
    for start, end, symbol in hits:
        if start >= max_end:
            merged.append((start, symbol))
            max_end = end

    return [sym for _, sym in merged]


def _edit_distance_normalized(seq_a: list, seq_b: list) -> float:
    """
    Normalized Levenshtein distance between two sequences.
    Returns a SIMILARITY score in [0, 1]  (1 = identical).
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

    MAX_LEN = 500
    if len(seq_a) > MAX_LEN:
        half = MAX_LEN // 2
        seq_a = seq_a[:half] + seq_a[-half:]
    if len(seq_b) > MAX_LEN:
        half = MAX_LEN // 2
        seq_b = seq_b[:half] + seq_b[-half:]
    la, lb = len(seq_a), len(seq_b)

    max_len = max(la, lb)

    prev = list(range(lb + 1))
    curr = [0] * (lb + 1)

    for i in range(1, la + 1):
        curr[0] = i
        for j in range(1, lb + 1):
            cost = 0 if seq_a[i-1] == seq_b[j-1] else 1
            curr[j] = min(
                prev[j]   + 1,
                curr[j-1] + 1,
                prev[j-1] + cost,
            )
        if curr[0] >= max_len:
            return 0.0
        prev, curr = curr, prev

    edit_dist = prev[lb]
    return 1.0 - (edit_dist / max_len)


def _bag_of_nodes_similarity(seq_a: list, seq_b: list) -> float:
    """
    Fix #C (v1.6): Cosine similarity on AST node-type frequency vectors.

    Counts how many times each node type appears in each sequence, then
    computes cosine similarity between the two frequency vectors.

    Why this matters: normalized edit distance penalises statement reordering
    heavily (two swapped statements can change edit distance by 2*len(stmt)),
    yet reordering independent statements is a common Type-2/3 obfuscation.
    The bag-of-nodes measure is order-agnostic, so it captures these cases.

    The combined AST similarity blends both signals:
      ast_sim = W_AST_EDIT * edit_sim + W_AST_BAG * bag_sim
    """
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
    """Lazily compute and cache the AST node sequence and bag vector for a block."""
    if not block._ast_ready and block.source:
        if block.language == "java":
            block.ast_sequence = _java_ast_sequence(block.source)
        else:
            block.ast_sequence = _python_ast_sequence(block.source)
        # Fix #C: pre-compute and cache the bag-of-nodes Counter
        block._bag_vec = collections.Counter(block.ast_sequence)
        block._ast_ready = True


def compute_ast_similarity(block_a: FunctionBlock,
                            block_b: FunctionBlock) -> float:
    """
    Layer 2: Combined AST similarity.

    Fix #C (v1.6): Blends normalized edit distance (60%) with bag-of-nodes
    cosine similarity (40%).  The blend makes the score robust to statement
    reordering, which pure edit distance over-penalises.
    """
    _ensure_ast_sequence(block_a)
    _ensure_ast_sequence(block_b)

    edit_sim = _edit_distance_normalized(block_a.ast_sequence,
                                         block_b.ast_sequence)

    # Bag-of-nodes cosine using cached Counters
    ca = block_a._bag_vec
    cb = block_b._bag_vec
    if ca is not None and cb is not None:
        all_keys = set(ca) | set(cb)
        dot   = sum(ca.get(k, 0) * cb.get(k, 0) for k in all_keys)
        mag_a = math.sqrt(sum(v * v for v in ca.values()))
        mag_b = math.sqrt(sum(v * v for v in cb.values()))
        if mag_a > 0 and mag_b > 0:
            bag_sim = dot / (mag_a * mag_b)
        else:
            bag_sim = 1.0 if mag_a == mag_b else 0.0
    else:
        bag_sim = _bag_of_nodes_similarity(block_a.ast_sequence,
                                           block_b.ast_sequence)

    return W_AST_EDIT * edit_sim + W_AST_BAG * bag_sim


# ===========================================================================
# LAYER 3 — HALSTEAD COMPLEXITY FINGERPRINT  (the novel layer)
# ===========================================================================

def _extract_halstead_python(source: str) -> dict:
    """
    Extract Halstead operands and operators from Python source using the
    tokenize module.
    """
    OP_KEYWORDS = {"and", "or", "not", "in", "is", "del",
                   "return", "yield", "lambda", "raise",
                   "assert", "pass", "break", "continue"}

    operators  = []
    operands   = []

    try:
        reader = io.StringIO(source).readline
        for tok in tokenize.generate_tokens(reader):
            ttype = tok.type
            tval  = tok.string

            if ttype == tokenize.OP:
                operators.append(tval)
            elif ttype == tokenize.NAME:
                if tval in OP_KEYWORDS:
                    operators.append(tval)
                elif tval not in {"def", "class", "if", "else", "elif",
                                   "for", "while", "import", "from",
                                   "try", "except", "finally", "with",
                                   "as", "True", "False", "None",
                                   "async", "await", "global", "nonlocal"}:
                    operands.append(tval)
            elif ttype == tokenize.NUMBER:
                operands.append(tok.string)
            elif ttype == tokenize.STRING:
                operands.append("STR")

    except tokenize.TokenError:
        pass

    return _halstead_metrics(operators, operands)


def _extract_halstead_java(source: str) -> dict:
    """Extract Halstead operands and operators from Java source."""
    source = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    source = _JAVA_LINE_COMMENT_RE.sub(" ", source)

    operators = []
    operands  = []

    for m in _JAVA_HALSTEAD_OP_RE.finditer(source):
        operators.append(m.group())

    clean = _JAVA_HALSTEAD_STR_RE.sub("STR_LIT ", source)

    for m in _JAVA_HALSTEAD_NUM_RE.finditer(clean):
        operands.append(m.group())

    for m in _JAVA_HALSTEAD_ID_RE.finditer(clean):
        val = m.group()
        if val in JAVA_OPERATORS:
            operators.append(val)
        elif val in JAVA_KEYWORDS:
            pass
        else:
            operands.append(val)

    return _halstead_metrics(operators, operands)


def _halstead_metrics(operators: list, operands: list) -> dict:
    """Compute Halstead metrics from raw operator/operand lists."""
    op_counts  = collections.Counter(operators)
    opd_counts = collections.Counter(operands)

    n1 = len(op_counts)
    n2 = len(opd_counts)
    N1 = sum(op_counts.values())
    N2 = sum(opd_counts.values())

    n = n1 + n2
    N = N1 + N2

    volume     = N * math.log2(n)      if n  > 1 else 0.0
    difficulty = (n1 / 2) * (N2 / n2)  if n2 > 0 else 0.0
    effort     = difficulty * volume

    return {
        "n1": n1, "n2": n2, "N1": N1, "N2": N2,
        "vocabulary": n,
        "length": N,
        "volume":     round(volume,     4),
        "difficulty": round(difficulty, 4),
        "effort":     round(effort,     4),
    }


def _halstead_vector(h: dict) -> list[float]:
    """
    Return an 8-dimensional feature vector from a Halstead dict for
    cosine-similarity comparison.

    Dimension layout
    ----------------
    0  operator_density  = n1 / (n1 + n2 + 1)
    1  operand_density   = n2 / (n1 + n2 + 1)
    2  log1p(volume)
    3  log1p(difficulty)
    4  log1p(effort)
    5  log1p(N1 / (N2 + 1))     operator-to-operand usage ratio
    6  log1p(N / vocab)          token density
    7  log1p(N2 / (N1 + 1))     operand-to-operator ratio (independent signal)
    """
    n1 = h.get("n1", 0)
    n2 = h.get("n2", 0)
    N1 = h.get("N1", 0)
    N2 = h.get("N2", 0)
    vocab = n1 + n2 + 1
    N = N1 + N2

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


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    dot   = sum(a * b for a, b in zip(vec_a, vec_b))
    mag_a = math.sqrt(sum(a * a for a in vec_a))
    mag_b = math.sqrt(sum(b * b for b in vec_b))
    if mag_a == 0 or mag_b == 0:
        return 1.0 if mag_a == mag_b else 0.0
    return dot / (mag_a * mag_b)


def compute_halstead_similarity(block_a: FunctionBlock,
                                 block_b: FunctionBlock) -> float:
    """Layer 3: Cosine similarity on Halstead feature vectors."""
    vec_a = block_a._halstead_vec if block_a._halstead_vec is not None else _halstead_vector(block_a.halstead)
    vec_b = block_b._halstead_vec if block_b._halstead_vec is not None else _halstead_vector(block_b.halstead)
    return _cosine_similarity(vec_a, vec_b)


# ===========================================================================
# FUSION — combine all three scores
# ===========================================================================

def compute_fusion_score(token_score: float,
                          ast_score: float,
                          halstead_score: float) -> float:
    """Weighted fusion of the three layer scores."""
    return (W_TOKEN    * token_score
          + W_AST      * ast_score
          + W_HALSTEAD * halstead_score)


def classify_clone(token_score: float,
                   ast_score: float,
                   fusion_score: float,
                   raw_token_score: float = None,
                   raw_tokens_a: list = None,
                   raw_tokens_b: list = None,
                   lit_tokens_a: list = None,
                   lit_tokens_b: list = None) -> tuple[int | None, float]:
    """
    Return (clone_type, confidence) or (None, 0.0) if not a clone.

    Fix #B (v1.6): Accepts lit_tokens_a / lit_tokens_b for a second Type-1
    check.  If the literal-normalized token lists are identical, the pair is
    classified as Type 1 even when raw tokens differ (e.g. a loop bound of
    10 was changed to 11 in an otherwise identical copy).

    Fix #D (v1.6): Type-3 structural guard is tightened to AND logic:
      ast >= THRESH_TYPE3_AST_MIN AND token >= THRESH_TYPE3_TOKEN_MIN
      AND max(ast, token) >= THRESH_TYPE3_PEAK
    This prevents random structural overlap (two functions sharing only
    common control-flow keywords) from producing false Type-3 positives.

    Fix #E (v1.6): Type-1 confidence clamped correctly to [0, 1].

    Type classification decision tree
    ----------------------------------
    1. raw_tokens_a == raw_tokens_b                     → Type 1 (exact)
    2. lit_tokens_a == lit_tokens_b                     → Type 1 (literal-exact)
    3. raw_score >= FALLBACK AND ast >= THRESH_TYPE1    → Type 1 (near-exact)
    4. token >= TYPE2 AND ast >= TYPE2                  → Type 2 (renamed)
    5. fusion >= TYPE3 AND structural guard passes      → Type 3 (near-miss)
    """
    if raw_token_score is None:
        raw_token_score = token_score

    # ---- Type 1 ----
    if raw_tokens_a is not None and raw_tokens_b is not None:
        if raw_tokens_a == raw_tokens_b:
            # Fix #E: properly clamped confidence
            margin = min(raw_token_score, ast_score) - THRESH_TYPE1
            conf = min(1.0, max(0.5, margin / max(1.0 - THRESH_TYPE1, 1e-9) + 0.5))
            return 1, round(conf, 4)

        # Fix #B: literal-normalized exact match → still Type 1
        if lit_tokens_a is not None and lit_tokens_b is not None:
            if lit_tokens_a == lit_tokens_b:
                return 1, 0.95

        # Threshold-based fallback for near-exact matches
        if raw_token_score >= THRESH_TYPE1_FALLBACK and ast_score >= THRESH_TYPE1:
            return 1, 0.90

    elif raw_token_score >= THRESH_TYPE1 and ast_score >= THRESH_TYPE1:
        return 1, 0.90

    # ---- Type 2 ----
    if token_score >= THRESH_TYPE2 and ast_score >= THRESH_TYPE2:
        margin = min(token_score, ast_score) - THRESH_TYPE2
        conf = min(1.0, margin / max(1.0 - THRESH_TYPE2, 1e-9) + 0.5)
        return 2, round(conf, 4)

    # ---- Type 3 (Fix #D: tightened structural guard) ----
    if fusion_score >= THRESH_FUSION_TYPE3:
        ast_ok    = ast_score   >= THRESH_TYPE3_AST_MIN
        token_ok  = token_score >= THRESH_TYPE3_TOKEN_MIN
        has_peak  = max(ast_score, token_score) >= THRESH_TYPE3_PEAK
        if ast_ok and token_ok and has_peak:
            margin = fusion_score - THRESH_FUSION_TYPE3
            conf = min(1.0, margin / max(1.0 - THRESH_FUSION_TYPE3, 1e-9) + 0.5)
            return 3, round(conf, 4)

    return None, 0.0


# ===========================================================================
# BLOCK EXTRACTION — split source into function-level units
# ===========================================================================

def _strip_decorators(source: str, language: str) -> str:
    """Strip decorators (Python) and annotations (Java) before tokenization."""
    if language == "python":
        lines = source.splitlines()
        return '\n'.join(l for l in lines if not l.strip().startswith('@'))
    else:
        return re.sub(r'@\w+(?:\([^)]*\))?\s*', '', source)


def _strip_imports(source: str, language: str) -> str:
    """Remove import statements before tokenization — they don't affect logic."""
    if language == "python":
        return '\n'.join(l for l in source.splitlines()
                         if not l.strip().startswith(('import ', 'from ')))
    else:
        return '\n'.join(l for l in source.splitlines()
                         if not l.strip().startswith('import '))


def _make_block(name, start_line, end_line, source, language) -> FunctionBlock:
    """Helper to construct and fully initialise a FunctionBlock."""
    fb = FunctionBlock(
        name=name,
        start_line=start_line,
        end_line=end_line,
        source=source,
        language=language,
    )
    clean_source = _strip_decorators(_strip_imports(source, language), language)
    if language == "python":
        fb.tokens     = _normalize_python_tokens(clean_source)
        fb.raw_tokens = _raw_python_tokens(clean_source)
        fb.lit_tokens = _literal_normalize_python_tokens(clean_source)   # Fix #B
        fb.halstead   = _extract_halstead_python(clean_source)
    else:
        fb.tokens     = _normalize_java_tokens(clean_source)
        fb.raw_tokens = _raw_java_tokens(clean_source)
        fb.lit_tokens = _literal_normalize_java_tokens(clean_source)     # Fix #B
        fb.halstead   = _extract_halstead_java(clean_source)

    # Fix #A: adaptive n-gram size baked into the cached multisets
    fb._ngrams_norm = _make_ngrams(fb.tokens)
    fb._ngrams_raw  = _make_ngrams(fb.raw_tokens)
    fb._ngrams_lit  = _make_ngrams(fb.lit_tokens)
    fb._halstead_vec = _halstead_vector(fb.halstead)
    return fb


def _extract_python_blocks(source: str) -> list[FunctionBlock]:
    """
    Use Python's ast module to find all function definitions and extract
    their source lines as individual FunctionBlocks.
    """
    lines = source.splitlines()

    try:
        tree = ast.parse(source)
    except SyntaxError:
        return [_make_block("<module>", 1, len(lines), source, "python")]

    func_nodes = [
        n for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]

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
    Extract method-level blocks from Java source using a brace-counting
    approach.  Finds method signatures and captures their bodies.
    """
    lines = source.splitlines()

    clean = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    clean = _JAVA_LINE_COMMENT_RE.sub(" ", clean)

    method_pattern = re.compile(
        r"(?:(?:public|private|protected|static|final|synchronized|"
        r"abstract|native|strictfp)\s+)*"
        r"(?:\w+(?:<(?:[^<>]|<[^<>]*>)*>)?)\s+"
        r"(\w+)\s*"
        r"\([^)]*\)\s*"
        r"(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?"
        r"\{"
    )

    constructor_pattern = re.compile(
        r"(?:public|private|protected)\s+"
        r"([A-Z]\w*)\s*"
        r"\([^)]*\)\s*"
        r"(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?"
        r"\{"
    )

    all_matches: dict[int, str] = {}
    for m in method_pattern.finditer(clean):
        all_matches[m.start()] = m.group(1)
    for m in constructor_pattern.finditer(clean):
        start = m.start()
        if start not in all_matches:
            all_matches[start] = m.group(1) + "_constructor"

    blocks = []
    for start_pos in sorted(all_matches):
        method_name = all_matches[start_pos]
        start_line  = clean[:start_pos].count("\n") + 1

        depth   = 0
        end_pos = start_pos
        i       = start_pos
        n       = len(clean)

        while i < n:
            ch = clean[i]

            if ch == '"':
                i += 1
                while i < n:
                    if clean[i] == '\\':
                        i += 2
                        continue
                    if clean[i] == '"':
                        break
                    i += 1

            elif ch == "'":
                i += 1
                while i < n:
                    if clean[i] == '\\':
                        i += 2
                        continue
                    if clean[i] == "'":
                        break
                    i += 1

            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end_pos = i
                    break

            i += 1

        end_line = clean[:end_pos].count("\n") + 1
        func_src = "\n".join(lines[start_line - 1: end_line])
        blocks.append(_make_block(method_name, start_line, end_line, func_src, "java"))

    if not blocks:
        return [_make_block("<class>", 1, len(lines), source, "java")]

    return blocks


def extract_blocks(source: str, language: str) -> list[FunctionBlock]:
    """Dispatch to language-specific block extractor."""
    if language == "python":
        return _extract_python_blocks(source)
    elif language == "java":
        return _extract_java_blocks(source)
    return []


# ===========================================================================
# PAIRWISE DETECTION — compare all block pairs
# ===========================================================================

def _compare_block_pairs(
    pair_iter,
    file_a: str,
    file_b: str,
) -> list[ClonePair]:
    """
    Core TAHD pipeline applied to an iterable of (block_a, block_b) tuples.

    Steps for each pair:
      0.  MIN_TOKENS guard
      0b. Length ratio guard
      1.  Token Jaccard prefilter (Layer 1)
      2.  AST combined similarity  (Layer 2, Fix #C)
      3.  Halstead cosine          (Layer 3)
      4.  Fusion + classify_clone  (Fix #B, #D, #E)
    """
    pairs = []
    for block_a, block_b in pair_iter:
        if len(block_a.tokens) < MIN_TOKENS or len(block_b.tokens) < MIN_TOKENS:
            continue

        len_a, len_b = len(block_a.tokens), len(block_b.tokens)
        if max(len_a, len_b) > 3 * min(len_a, len_b):
            continue

        # ---- Layer 1 ----
        token_score = compute_token_similarity(block_a, block_b)
        if token_score < THRESH_TOKEN_PREFILTER:
            continue

        raw_token_score = compute_raw_token_similarity(block_a, block_b)

        # ---- Layer 2 (combined edit + bag-of-nodes, Fix #C) ----
        ast_score = compute_ast_similarity(block_a, block_b)

        # ---- Layer 3 ----
        halstead_score = compute_halstead_similarity(block_a, block_b)

        # ---- Fusion ----
        fusion = compute_fusion_score(token_score, ast_score, halstead_score)

        # Fix #B: pass lit_tokens for the second Type-1 check
        clone_type, confidence = classify_clone(
            token_score, ast_score, fusion,
            raw_token_score,
            raw_tokens_a=block_a.raw_tokens,
            raw_tokens_b=block_b.raw_tokens,
            lit_tokens_a=block_a.lit_tokens,
            lit_tokens_b=block_b.lit_tokens,
        )

        if clone_type is not None:
            pairs.append(ClonePair(
                clone_id       = str(uuid.uuid4()),
                clone_type     = clone_type,
                token_score    = round(token_score,    4),
                ast_score      = round(ast_score,      4),
                halstead_score = round(halstead_score, 4),
                fusion_score   = round(fusion,         4),
                block_a        = block_a,
                block_b        = block_b,
                file_a         = file_a,
                file_b         = file_b,
                confidence     = round(max(0.0, confidence), 4),
            ))

    return pairs


def _deduplicate_clone_pairs(pairs: list, mode: str = "strict") -> list:
    """
    Keep only the best match for each block to prevent one function
    from appearing in multiple clone pairs.

    mode="strict"     (intra-file): lock both key_a and key_b.
    mode="cross_file" (cross-file): only lock key_a.
    """
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
    """Run the full TAHD pipeline on every pair of blocks from two files."""
    pairs = _compare_block_pairs(
        itertools.product(blocks_a, blocks_b), file_a, file_b
    )
    return _deduplicate_clone_pairs(pairs, mode="cross_file")


def detect_clones_single_file(
    blocks: list[FunctionBlock],
    filename: str = "submission",
) -> list[ClonePair]:
    """Detect clones within a single file (all unique block pairs)."""
    pairs = _compare_block_pairs(
        itertools.combinations(blocks, 2), filename, filename
    )
    return _deduplicate_clone_pairs(pairs, mode="strict")


# ===========================================================================
# REFACTORING ENGINE — rule-based suggestions
# ===========================================================================

_REFACTOR_RULES = {
    1: {
        "type":    "Remove Duplicate",
        "explain": {
            "remember":    "These two blocks are exact copies (Type 1 clone).",
            "understand":  "Exact duplication means any bug fix must be applied "
                           "in every copy, increasing maintenance cost.",
            "apply":       "Delete one copy entirely and update all call sites "
                           "to reference the single remaining version.",
        },
    },
    2: {
        "type":    "Extract Method",
        "explain": {
            "remember":    "These blocks are structurally identical but use "
                           "different variable names (Type 2 clone).",
            "understand":  "Renamed duplicates hide shared logic, making the "
                           "codebase harder to reason about.",
            "apply":       "Extract the shared logic into a new method with "
                           "parameters replacing the renamed variables.",
        },
    },
    3: {
        "type":    "Refactor Near-Miss Clone",
        "explain": {
            "remember":    "These blocks are similar but not identical "
                           "(Type 3 clone — near-miss).",
            "understand":  "Near-miss clones often indicate copied code that "
                           "was partially adapted.  The shared core should live "
                           "in one place.",
            "apply":       "Identify the common sub-logic, extract it into a "
                           "helper method, and adjust each original block to "
                           "call it with the differing parts as arguments.",
        },
    },
}


def _generate_after_code(pair: "ClonePair") -> str:
    """Generate a concrete merged-function skeleton based on the actual
    function names and clone type."""
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
    """
    Generate Bloom-aligned refactoring suggestions for detected clone pairs.
    Sorted by fusion score descending (most severe first).
    """
    sorted_pairs = sorted(clone_pairs,
                          key=lambda p: p.fusion_score,
                          reverse=True)

    suggestions = []
    for rank, pair in enumerate(sorted_pairs[:max_suggestions], start=1):
        rule = _REFACTOR_RULES.get(pair.clone_type, _REFACTOR_RULES[3])

        lines_a = pair.block_a.source.splitlines()
        lines_b = pair.block_b.source.splitlines()
        snippet_a = "\n".join(lines_a[:MAX_SNIPPET_LINES])
        if len(lines_a) > MAX_SNIPPET_LINES:
            snippet_a += f"\n# ... ({len(lines_a) - MAX_SNIPPET_LINES} more lines)"
        snippet_b = "\n".join(lines_b[:MAX_SNIPPET_LINES])
        if len(lines_b) > MAX_SNIPPET_LINES:
            snippet_b += f"\n# ... ({len(lines_b) - MAX_SNIPPET_LINES} more lines)"

        suggestions.append({
            "suggestion_id":    str(uuid.uuid4()),
            "priority":         rank,
            "priority_score":   pair.fusion_score,
            "refactoring_type": rule["type"],
            "clone_type":       pair.clone_type,
            "affected_clone_id": pair.clone_id,
            "scores": {
                "token":    pair.token_score,
                "ast":      pair.ast_score,
                "halstead": pair.halstead_score,
                "fusion":   pair.fusion_score,
            },
            "locations": {
                "block_a": {
                    "file":       pair.file_a,
                    "function":   pair.block_a.name,
                    "start_line": pair.block_a.start_line,
                    "end_line":   pair.block_a.end_line,
                },
                "block_b": {
                    "file":       pair.file_b,
                    "function":   pair.block_b.name,
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
# QUALITY METRICS
# ===========================================================================

def compute_cyclomatic_complexity(source: str, language: str) -> float:
    """McCabe's Cyclomatic Complexity approximated by counting decision points + 1."""
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
        keywords = ["if ", "else ", "for ", "while ", "case ",
                    "catch ", " && ", " || ", " ? "]
        count = 1
        for kw in keywords:
            count += clean.count(kw)
        return float(count)


def compute_maintainability_index(
    halstead_volume: float,
    cyclomatic_complexity: float,
    lines_of_code: int,
) -> float:
    """Maintainability Index (Microsoft variant, 0–100 scale)."""
    ln_v   = math.log(max(halstead_volume, 1))
    ln_loc = math.log(max(lines_of_code,   1))
    mi_raw = 171 - 5.2 * ln_v - 0.23 * cyclomatic_complexity - 16.2 * ln_loc
    return round(max(0.0, mi_raw * 100 / 171), 2)


# ===========================================================================
# CODE QUALITY REPORT HELPERS
# ===========================================================================

def _compute_nesting_depth(source: str, language: str) -> int:
    """Compute the maximum nesting depth of a function's source."""
    if language == "python":
        SCOPE_NODES = (
            ast.If, ast.For, ast.While, ast.With,
            ast.Try, ast.ExceptHandler, ast.AsyncFor, ast.AsyncWith,
        )

        max_depth = 0

        def _walk_depth(node: ast.AST, depth: int) -> None:
            nonlocal max_depth
            if depth > max_depth:
                max_depth = depth
            for child in ast.iter_child_nodes(node):
                new_depth = depth + (1 if isinstance(child, SCOPE_NODES) else 0)
                _walk_depth(child, new_depth)

        try:
            tree = ast.parse(source)
            _walk_depth(tree, 0)
        except SyntaxError:
            for line in source.splitlines():
                stripped = line.lstrip()
                if stripped and not stripped.startswith("#"):
                    indent = len(line) - len(stripped)
                    depth  = indent // 4
                    if depth > max_depth:
                        max_depth = depth

        return max_depth

    else:
        src = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
        src = _JAVA_LINE_COMMENT_RE.sub(" ", src)
        depth = 0
        max_depth = 0
        i = 0
        n = len(src)
        while i < n:
            ch = src[i]
            if ch == '"':
                i += 1
                while i < n and src[i] != '"':
                    if src[i] == '\\':
                        i += 1
                    i += 1
            elif ch == "'":
                i += 1
                while i < n and src[i] != "'":
                    if src[i] == '\\':
                        i += 1
                    i += 1
            elif ch == "{":
                depth += 1
                if depth > max_depth:
                    max_depth = depth
            elif ch == "}":
                depth = max(0, depth - 1)
            i += 1
        return max_depth


def _compute_comment_density(source: str, language: str) -> float:
    """Compute ratio of comment lines to total source lines."""
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
            if idx in docstring_lines:
                comment_count += 1
            elif stripped.startswith("#"):
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
                idx = stripped.index("/*")
                if "*/" not in stripped[idx + 2:]:
                    in_block = True

    return round(comment_count / total, 3)


def _detect_unused_functions(blocks: list, source: str) -> dict[str, dict]:
    """
    Return a dict mapping function name → confidence info.

    Confidence is "low" for entry points, callbacks, and test methods.
    """
    ENTRY_POINT_PATTERNS = re.compile(
        r"^(main|__main__|setUp|tearDown|run|execute|start|stop"
        r"|test\w*|on[A-Z]\w*|handle[A-Z]\w*)$"
    )

    defined = {
        b.name for b in blocks
        if b.name not in ("<module>", "<class>")
    }
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

    unused_in_file = defined - called
    result = {}
    for name in unused_in_file:
        is_entry = bool(ENTRY_POINT_PATTERNS.match(name))
        result[name] = {
            "unused_in_file": True,
            "confidence": "low" if is_entry else "high",
            "note": (
                "Likely an entry point, callback, or test method — "
                "may be called externally."
                if is_entry
                else "Not called anywhere in this file. "
                     "Verify it is not used by other modules before removing."
            ),
        }
    return result


def _compute_quality_report(
    blocks: list,
    clone_pairs: list,
    source: str,
    language: str,
) -> dict:
    """Build the full Code Quality Report for a single-file analysis."""
    cloned_names: set = set()
    for pair in clone_pairs:
        cloned_names.add(pair.block_a.name)
        cloned_names.add(pair.block_b.name)

    unused_info = _detect_unused_functions(blocks, source)

    func_details = []
    for block in blocks:
        cc         = compute_cyclomatic_complexity(block.source, language)
        nesting    = _compute_nesting_depth(block.source, language)
        line_count = block.end_line - block.start_line + 1

        smells = []
        if line_count > 30:
            smells.append("long_function")
        if cc > 10:
            smells.append("high_complexity")
        if block.name in cloned_names:
            smells.append("internal_duplication")
        if block.name in unused_info and unused_info[block.name]["confidence"] == "high":
            smells.append("unused_function")

        func_details.append({
            "name":                  block.name,
            "start_line":            block.start_line,
            "end_line":              block.end_line,
            "line_count":            line_count,
            "cyclomatic_complexity": round(cc, 1),
            "halstead": {
                "volume":     block.halstead.get("volume",     0),
                "difficulty": block.halstead.get("difficulty", 0),
                "effort":     block.halstead.get("effort",     0),
            },
            "nesting_depth": nesting,
            "smells":        smells,
            **({"unused_info": unused_info[block.name]}
               if block.name in unused_info else {}),
        })

    function_count = len(func_details)
    avg_length = (
        round(sum(f["line_count"] for f in func_details) / function_count, 1)
        if function_count > 0 else 0.0
    )
    max_nesting     = max((f["nesting_depth"] for f in func_details), default=0)
    comment_density = _compute_comment_density(source, language)

    return {
        "functions": func_details,
        "structure": {
            "function_count":      function_count,
            "avg_function_length": avg_length,
            "max_nesting_depth":   max_nesting,
            "comment_density":     comment_density,
        },
    }


# ===========================================================================
# SYNTAX VALIDATION
# ===========================================================================

def validate_syntax(code: str, language: str) -> bool:
    """Validate syntax for the given language."""
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language: {language}")

    if language == "python":
        if not isinstance(code, str):
            raise SyntaxError("Code must be a string")
        ast.parse(code)
        return True

    return True  # Java stub


# ===========================================================================
# PUBLIC API — CodeAnalyzer
# ===========================================================================

class CodeAnalyzer:
    """
    Drop-in replacement for the mock CodeAnalyzer.

    analyze(code)         → single-file TAHD analysis
    analyze_pair(a, b)    → cross-file clone detection between two submissions
    """

    def __init__(self, language: str):
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError("Unsupported language")
        self.language = language
        self.code: str | None = None

    def analyze(self, code: str, max_suggestions: int = 5) -> dict:
        """Analyse a single submission."""
        if not isinstance(code, str):
            raise ValueError("code must be a string")

        self.code = code
        lines     = code.splitlines()
        loc       = max(1, len(lines))

        blocks      = extract_blocks(code, self.language)
        clone_pairs = detect_clones_single_file(blocks)

        all_halstead = [b.halstead for b in blocks]
        total_volume = sum(h.get("volume", 0) for h in all_halstead)
        cc           = compute_cyclomatic_complexity(code, self.language)
        mi           = compute_maintainability_index(total_volume, cc, loc)

        cloned_lines: set[int] = set()
        for pair in clone_pairs:
            for ln in range(pair.block_a.start_line, pair.block_a.end_line + 1):
                cloned_lines.add(ln)
            for ln in range(pair.block_b.start_line, pair.block_b.end_line + 1):
                cloned_lines.add(ln)
        clone_pct = round(len(cloned_lines) / loc * 100, 1) if loc > 0 else 0.0

        clones_out = []
        for pair in clone_pairs:
            clones_out.append({
                "clone_id":       pair.clone_id,
                "type":           pair.clone_type,
                "similarity":     pair.fusion_score,
                "token_score":    pair.token_score,
                "ast_score":      pair.ast_score,
                "halstead_score": pair.halstead_score,
                "confidence":     pair.confidence,
                "locations": [
                    {
                        "function":   pair.block_a.name,
                        "start_line": pair.block_a.start_line,
                        "end_line":   pair.block_a.end_line,
                    },
                    {
                        "function":   pair.block_b.name,
                        "start_line": pair.block_b.start_line,
                        "end_line":   pair.block_b.end_line,
                    },
                ],
                "code_snippet": pair.block_a.source[:200],
                "explanation":  _clone_type_explanation(pair.clone_type),
            })

        suggestions    = generate_refactoring_suggestions(clone_pairs, max_suggestions)
        quality_report = _compute_quality_report(blocks, clone_pairs, code, self.language)

        return {
            "analysis_id":            str(uuid.uuid4()),
            "language":               self.language,
            "lines_of_code":          loc,
            "clone_percentage":       clone_pct,
            "clones":                 clones_out,
            "cyclomatic_complexity":  round(cc, 1),
            "maintainability_index":  mi,
            "refactoring_suggestions": suggestions,
            "halstead_metrics": {
                "total_volume":   round(total_volume, 2),
                "avg_difficulty": round(
                    sum(h.get("difficulty", 0) for h in all_halstead)
                    / max(len(all_halstead), 1), 2
                ),
            },
            "detection_method": f"TAHD {TAHD_VERSION} (Token + AST + Halstead)",
            "quality_report":   quality_report,
        }

    def analyze_pair(
        self,
        code_a: str,
        code_b: str,
        file_a: str = "submission_a",
        file_b: str = "submission_b",
        max_suggestions: int = 5,
    ) -> dict:
        """Compare two student submissions against each other."""
        if not isinstance(code_a, str) or not code_a.strip():
            raise ValueError("code_a must be a non-empty string")
        if not isinstance(code_b, str) or not code_b.strip():
            raise ValueError("code_b must be a non-empty string")

        blocks_a = extract_blocks(code_a, self.language)
        blocks_b = extract_blocks(code_b, self.language)

        clone_pairs = detect_clones_in_blocks(
            blocks_a, blocks_b, file_a, file_b
        )

        suggestions = generate_refactoring_suggestions(clone_pairs, max_suggestions)

        if clone_pairs and blocks_a:
            matched_a = {(p.block_a.name, p.block_a.start_line) for p in clone_pairs}
            overall_sim = round(len(matched_a) / len(blocks_a), 4)
        else:
            overall_sim = 0.0

        clones_out = []
        for pair in clone_pairs:
            clones_out.append({
                "clone_id":       pair.clone_id,
                "type":           pair.clone_type,
                "similarity":     pair.fusion_score,
                "token_score":    pair.token_score,
                "ast_score":      pair.ast_score,
                "halstead_score": pair.halstead_score,
                "confidence":     pair.confidence,
                "locations": [
                    {
                        "file":       pair.file_a,
                        "function":   pair.block_a.name,
                        "start_line": pair.block_a.start_line,
                        "end_line":   pair.block_a.end_line,
                    },
                    {
                        "file":       pair.file_b,
                        "function":   pair.block_b.name,
                        "start_line": pair.block_b.start_line,
                        "end_line":   pair.block_b.end_line,
                    },
                ],
                "explanation": _clone_type_explanation(pair.clone_type),
            })

        type_counts = collections.Counter(p.clone_type for p in clone_pairs)
        dominant_type = type_counts.most_common(1)[0][0] if type_counts else None

        return {
            "analysis_id":        str(uuid.uuid4()),
            "language":           self.language,
            "file_a":             file_a,
            "file_b":             file_b,
            "overall_similarity": overall_sim,
            "clone_count":        len(clone_pairs),
            "clones":             clones_out,
            "refactoring_suggestions": suggestions,
            "detection_method":   f"TAHD {TAHD_VERSION} (Token + AST + Halstead)",
            "dominant_clone_type":    dominant_type,
            "clone_type_breakdown":   dict(type_counts),
        }


# ===========================================================================
# HELPERS
# ===========================================================================

def _clone_type_explanation(clone_type: int) -> dict:
    """Human-readable explanation for each clone type (for the UI)."""
    explanations = {
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
            "why_flagged": "AST structure matches but token surface differs due "
                           "to identifier renaming.",
        },
        3: {
            "type_name":   "Type 3 — Near-Miss Clone",
            "description": "These blocks share significant structural and "
                           "computational similarity despite modifications.",
            "why_flagged": "Fusion of token, AST, and Halstead complexity "
                           "signatures exceeds the Type-3 threshold, suggesting "
                           "copied code that was partially modified.",
        },
    }
    return explanations.get(clone_type, explanations[3])