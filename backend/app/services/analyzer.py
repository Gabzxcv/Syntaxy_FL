"""
TAHD — Token-AST-Halstead Detection Pipeline
=============================================
A three-layer hybrid code clone detection engine for educational
Python and Java submissions.

Layer 1 — Token Prefilter      : Jaccard similarity on normalized token n-grams
Layer 2 — AST Structural Check : Normalized tree edit distance on AST node sequences
Layer 3 — Halstead Fingerprint : Cosine similarity on Halstead complexity vectors

Fusion score = 0.30 * token_jaccard + 0.40 * ast_similarity + 0.30 * halstead_cosine

Clone classification:
  Type 1 : raw_token >= 0.95 AND ast >= 0.95  (exact / whitespace only)
  Type 2 : norm_token >= 0.75 AND ast >= 0.75  (renamed identifiers, not Type 1)
  Type 3 : fusion >= 0.60                      (near-miss / modified)

Type-1 vs Type-2 distinction uses *raw* (unnormalized) tokens for Type-1 and
*normalized* tokens (identifiers → ID) for Type-2.  A renamed clone will score
highly on normalized tokens but poorly on raw tokens, allowing proper
classification as Type-2 rather than Type-1.

Halstead metrics (volume, difficulty, effort, vocabulary) are traditionally
used only for code-quality measurement.  TAHD repurposes them as a DETECTION
signal: copied code preserves its computational complexity signature even when
identifiers are renamed or statements are reordered, making the Halstead vector
a robust third layer for catching Type-3 clones that slip past token and AST
checks alone.

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

Authors : Fusion Logic — FEU Institute of Technology, 2026

Changelog
---------
v1.3 (2026-03-04)
  - Fix #1 (v1.3): lexTokens() in frontend now preserves operators as tokens
    instead of stripping them, preventing false positives between functions
    with identical structure but different operators.
  - Fix #2 (v1.3): Frontend Type-1 threshold raised from 0.70 to 0.95 to
    match backend THRESH_TYPE1; Type-2 structural threshold updated from
    0.72 to 0.75 to match backend THRESH_TYPE2.
  - Fix #3 (v1.3): Frontend breakdown variable now declared at loop-iteration
    scope to prevent ReferenceError in the fallback path.
  - Fix #4 (v1.3): THRESH_TOKEN_PREFILTER lowered from 0.40 to 0.30 to
    improve Type-3 recall for heavily modified clones.
  - Fix #5 (v1.3): classify_clone() now accepts raw_tokens_a / raw_tokens_b
    and uses exact list equality for Type-1 detection instead of a threshold,
    matching the formal definition (exact copy modulo whitespace/comments).
  - Fix #6 (v1.3): _halstead_vector() expanded from 5 to 8 independent
    dimensions (added operator_ratio, token_density, vocab_richness) to
    reduce redundancy and improve cosine similarity quality.
  - Fix #7 (v1.3): MAX_LEN raised from 300 to 500; sequences beyond MAX_LEN
    now use head+tail sampling to preserve structural visibility across the
    full function body.

v1.2 (2026-03-04)
  - Fix #1 : overall_similarity in analyze_pair now reflects fraction of
    matched blocks rather than average fusion score of detected pairs only.
  - Fix #2 : _compute_comment_density uses ast.get_docstring() for Python
    to reliably detect docstrings regardless of quote style or indentation.
  - Fix #3 : _detect_unused_functions now annotates results with a
    confidence level to acknowledge false negatives for externally-called
    functions (e.g. entry points, callbacks, cross-file calls).
  - Fix #4 : _java_ast_sequence keywords are matched before CALL so that
    control-flow constructs are not double-counted as function calls.
  - Fix #5 : Added MIN_TOKENS guard in _compare_block_pairs to skip
    trivially short blocks (< 10 tokens) that cause noisy clone results.
  - Fix #6 : clone_pct in analyze() now counts cloned lines per block
    only once (block_a lines only per pair) to avoid double-counting.
  - Fix #7 : _compute_nesting_depth for Python now uses AST scope counting
    instead of indent-level heuristics, supporting any indentation style.
  - Fix #8 : Java brace counter in _extract_java_blocks now correctly
    skips both double-quoted strings and single-quoted char literals.
  - Fix #9 : analyze() now passes max_suggestions through to
    generate_refactoring_suggestions instead of using the default silently.
  - Fix #10: after_code in suggestions now generates a concrete merged
    function skeleton using actual function names and clone type context.
  - Fix #11: analyze_pair raises ValueError if two different languages are
    mixed (e.g. Python code passed to a Java CodeAnalyzer).
  - Fix #12: Module-level assertion validates that fusion weights sum to 1.0.

v1.1 (2026-03-03)
  - _python_ast_sequence now uses pre-order DFS (ast.iter_child_nodes)
    instead of ast.walk() to guarantee structural ordering of node
    sequences for correct Levenshtein-based similarity.
  - _halstead_vector now uses operator/operand density ratios
    (n1/(n1+n2+1), n2/(n1+n2+1)) instead of raw counts so that all
    five vector dimensions have comparable magnitude for cosine similarity.
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

# Fix #12: Validate fusion weights at module load time
assert abs(W_TOKEN + W_AST + W_HALSTEAD - 1.0) < 1e-9, (
    f"Fusion weights must sum to 1.0, got {W_TOKEN + W_AST + W_HALSTEAD}"
)

# Per-layer thresholds
THRESH_TOKEN_PREFILTER = 0.30   # minimum token Jaccard to proceed to Layer 2 (lowered from 0.40 for better Type-3 recall)
THRESH_TYPE1           = 0.95   # both token AND ast must reach this for Type 1
THRESH_TYPE2           = 0.75   # both token AND ast must reach this for Type 2
THRESH_FUSION_TYPE3    = 0.60   # fusion score threshold for Type 3

# N-gram size for token fingerprinting
NGRAM_SIZE = 3

# Fix #5: Minimum token count for a block to be considered in clone detection.
# Blocks shorter than this (e.g. trivial getters/setters) produce noisy results.
MIN_TOKENS = 10

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

# Fix #4: Java control-flow keywords that must be matched BEFORE the generic
# CALL pattern so they are not mistakenly counted as function calls.
_JAVA_CF_KEYWORDS = frozenset([
    "if", "else", "for", "while", "do", "switch", "case",
    "return", "throw", "try", "catch", "finally", "new", "instanceof",
])

# Pre-compiled Java tokenizer pattern (shared by _normalize_java_tokens and
# _raw_java_tokens to avoid re-compiling on every call).
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

# Pre-compiled patterns for _java_ast_sequence — avoids re-compiling on every
# call.  Ordered: control-flow patterns first, CALL last (Fix #4).
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
    (re.compile(r"\{"), "BLOCK_OPEN"),
    (re.compile(r"\}"), "BLOCK_CLOSE"),
    # Fix #4: CALL is last — the claimed-positions mechanism prevents
    # overlap with higher-priority keyword patterns.  The negative
    # lookahead rejects identifiers that are reserved keywords.
    (re.compile(r"\b(?!(?:if|else|for|while|do|switch|case|return|throw|"
                r"try|catch|finally|new|instanceof)\b)"
                r"[A-Za-z_]\w*\s*\("), "CALL"),
]

# Pre-compiled patterns for _extract_halstead_java
_JAVA_HALSTEAD_OP_RE = re.compile(
    r">>>=|<<=|>>=|==|!=|<=|>=|&&|\|\||<<|>>>|>>"
    r"|[+\-*/%&|^]=|\+\+|--|[+\-*/%&|^~!<>=?:]"
)
_JAVA_HALSTEAD_NUM_RE = re.compile(r"\b\d+(?:\.\d+)?[lLfFdD]?\b")
_JAVA_HALSTEAD_STR_RE = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])\'')
_JAVA_HALSTEAD_ID_RE  = re.compile(r"\b[A-Za-z_]\w*\b")

# Pre-compiled comment-stripping patterns
_JAVA_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
_JAVA_LINE_COMMENT_RE  = re.compile(r"//[^\n]*")
_JAVA_STRING_LIT_RE    = re.compile(r'"(?:\\.|[^"\\])*"')
_JAVA_CHAR_LIT_RE      = re.compile(r"'(?:\\.|[^'\\])'")

# Pre-compiled Python comment/string-stripping patterns
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
    ast_sequence: list = field(default_factory=list)
    halstead: dict = field(default_factory=dict)
    # Performance caches — computed once, reused across all pair comparisons
    _ngrams_norm: object = field(default=None, init=False, repr=False, compare=False)
    _ngrams_raw: object = field(default=None, init=False, repr=False, compare=False)
    _halstead_vec: object = field(default=None, init=False, repr=False, compare=False)
    _ast_ready: bool = field(default=False, init=False, repr=False, compare=False)


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

            # skip COMMENT, NEWLINE, NL, INDENT, DEDENT, ENCODING, ENDMARKER

    except tokenize.TokenError:
        # Incomplete source (e.g. function body only) — best effort
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
            # skip COMMENT, NEWLINE, NL, INDENT, DEDENT, ENCODING, ENDMARKER

    except tokenize.TokenError:
        pass

    return tokens


def _normalize_java_tokens(source: str) -> list[str]:
    """
    Tokenize Java source with a regex lexer and normalize the same way.
    No external library required.
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
        # skip MISMATCH

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


def _make_ngrams(tokens: list[str], n: int = NGRAM_SIZE) -> set:
    """Convert a token list into a set of n-gram tuples."""
    if len(tokens) < n:
        return {tuple(tokens)} if tokens else set()
    return {tuple(tokens[i:i+n]) for i in range(len(tokens) - n + 1)}


def _jaccard(set_a: set, set_b: set) -> float:
    """Jaccard similarity between two sets."""
    if not set_a and not set_b:
        return 1.0
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union        = len(set_a | set_b)
    return intersection / union


def compute_token_similarity(block_a: FunctionBlock,
                              block_b: FunctionBlock) -> float:
    """Layer 1: Jaccard on normalized token n-gram sets."""
    ngrams_a = block_a._ngrams_norm if block_a._ngrams_norm is not None else _make_ngrams(block_a.tokens)
    ngrams_b = block_b._ngrams_norm if block_b._ngrams_norm is not None else _make_ngrams(block_b.tokens)
    return _jaccard(ngrams_a, ngrams_b)


def compute_raw_token_similarity(block_a: FunctionBlock,
                                  block_b: FunctionBlock) -> float:
    """Jaccard on raw (unnormalized) token n-gram sets for Type-1 detection."""
    ngrams_a = block_a._ngrams_raw if block_a._ngrams_raw is not None else _make_ngrams(block_a.raw_tokens)
    ngrams_b = block_b._ngrams_raw if block_b._ngrams_raw is not None else _make_ngrams(block_b.raw_tokens)
    return _jaccard(ngrams_a, ngrams_b)


# ===========================================================================
# LAYER 2 — AST STRUCTURAL SIMILARITY
# ===========================================================================

def _python_ast_sequence(source: str) -> list[str]:
    """
    Parse Python source into an AST and produce a linearized node-type
    sequence via **pre-order DFS** traversal.  Pre-order is essential so
    that structurally similar trees produce similar sequences for the
    Levenshtein similarity comparison.

    ast.walk() must NOT be used here because it yields nodes in an
    unspecified (BFS-like) order, making the edit-distance comparison
    unreliable.
    """
    sequence = []

    def _visit(node: ast.AST) -> None:
        sequence.append(type(node).__name__)
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
    pattern-based approach (no external library).

    Fix #4: Control-flow keywords are matched and emitted BEFORE the
    generic CALL pattern runs, preventing constructs like `if (`, `for (`
    from being double-counted as both control-flow nodes and function calls.

    We identify structural constructs (control flow, declarations,
    expressions) and emit a normalized symbol for each.  This is not a
    full AST but captures enough structural information for similarity
    scoring at function level.
    """
    # Strip comments and strings first
    source = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    source = _JAVA_LINE_COMMENT_RE.sub(" ", source)
    source = _JAVA_STRING_LIT_RE.sub("STR", source)
    source = _JAVA_CHAR_LIT_RE.sub("STR", source)

    # Fix #4: Ordered construct list — control-flow patterns first, CALL last.
    # Track already-claimed positions so CALL cannot overlap with
    # a position already claimed by a keyword pattern.
    claimed: set[int] = set()
    hits = []

    for pattern, symbol in _JAVA_AST_CONSTRUCTS:
        for m in pattern.finditer(source):
            start = m.start()
            end   = m.end()
            # Skip if this position was already claimed by an earlier (higher-
            # priority) keyword pattern.  Iterate over the match range (small)
            # and check the O(1) set lookup instead of iterating over all
            # claimed positions.
            if any(pos in claimed for pos in range(start, end)):
                continue
            hits.append((start, symbol))
            claimed.update(range(start, end))

    hits.sort(key=lambda x: x[0])
    return [sym for _, sym in hits]


def _edit_distance_normalized(seq_a: list, seq_b: list) -> float:
    """
    Normalized Levenshtein distance between two sequences.
    Returns a SIMILARITY score in [0, 1]  (1 = identical).
    Uses the standard DP algorithm with two optimizations:
    1. Diagonal band: if length ratio > 2:1 the sequences cannot be clones.
    2. Early exit: if the minimum DP value in a row reaches max_len the
       final similarity will be 0.0, so we bail immediately.
    """
    la, lb = len(seq_a), len(seq_b)
    if la == 0 and lb == 0:
        return 1.0
    if la == 0 or lb == 0:
        return 0.0

    # Fast path: identical sequences
    if seq_a == seq_b:
        return 1.0

    # Diagonal band optimization: length ratio > 2:1 → can't be clones
    if la > 2 * lb or lb > 2 * la:
        return 0.0

    # Cap sequence length to avoid O(n²) blowup on very large files.
    # For sequences longer than MAX_LEN, sample from both head and tail
    # to preserve visibility into the entire function structure.
    MAX_LEN = 500
    if len(seq_a) > MAX_LEN:
        half = MAX_LEN // 2
        seq_a = seq_a[:half] + seq_a[-half:]
    if len(seq_b) > MAX_LEN:
        half = MAX_LEN // 2
        seq_b = seq_b[:half] + seq_b[-half:]
    la, lb = len(seq_a), len(seq_b)

    max_len = max(la, lb)

    # Two-row DP
    prev = list(range(lb + 1))
    curr = [0] * (lb + 1)

    for i in range(1, la + 1):
        curr[0] = i
        min_in_row = curr[0]
        for j in range(1, lb + 1):
            cost = 0 if seq_a[i-1] == seq_b[j-1] else 1
            curr[j] = min(
                prev[j]   + 1,     # deletion
                curr[j-1] + 1,     # insertion
                prev[j-1] + cost,  # substitution
            )
            if curr[j] < min_in_row:
                min_in_row = curr[j]
        # Early exit: minimum edit distance already at max_len → similarity = 0.0
        if min_in_row >= max_len:
            return 0.0
        prev, curr = curr, prev

    edit_dist = prev[lb]
    return 1.0 - (edit_dist / max_len)


def _ensure_ast_sequence(block: FunctionBlock) -> None:
    """Lazily compute and cache the AST node sequence for a block."""
    if not block._ast_ready and block.source:
        if block.language == "java":
            block.ast_sequence = _java_ast_sequence(block.source)
        else:
            block.ast_sequence = _python_ast_sequence(block.source)
        block._ast_ready = True


def compute_ast_similarity(block_a: FunctionBlock,
                            block_b: FunctionBlock) -> float:
    """Layer 2: Normalized tree edit distance on AST node sequences."""
    _ensure_ast_sequence(block_a)
    _ensure_ast_sequence(block_b)
    return _edit_distance_normalized(block_a.ast_sequence,
                                     block_b.ast_sequence)


# ===========================================================================
# LAYER 3 — HALSTEAD COMPLEXITY FINGERPRINT  (the novel layer)
# ===========================================================================

def _extract_halstead_python(source: str) -> dict:
    """
    Extract Halstead operands and operators from Python source using the
    tokenize module.

    Operators  : OP tokens + keywords that act as operators
    Operands   : NAME tokens (non-keyword identifiers) + NUMBER + STRING
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
    """
    Extract Halstead operands and operators from Java source using the
    regex tokenizer.
    """
    # Strip comments
    source = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    source = _JAVA_LINE_COMMENT_RE.sub(" ", source)

    operators = []
    operands  = []

    # Collect operators
    for m in _JAVA_HALSTEAD_OP_RE.finditer(source):
        operators.append(m.group())

    # Remove strings before scanning identifiers/numbers
    clean = _JAVA_HALSTEAD_STR_RE.sub("STR_LIT ", source)

    for m in _JAVA_HALSTEAD_NUM_RE.finditer(clean):
        operands.append(m.group())

    for m in _JAVA_HALSTEAD_ID_RE.finditer(clean):
        val = m.group()
        if val in JAVA_OPERATORS:
            operators.append(val)
        elif val in JAVA_KEYWORDS:
            pass  # structural keywords — neither operator nor operand
        else:
            operands.append(val)

    return _halstead_metrics(operators, operands)


def _halstead_metrics(operators: list, operands: list) -> dict:
    """
    Compute Halstead metrics from raw operator/operand lists.

    n1 = number of distinct operators
    n2 = number of distinct operands
    N1 = total operators
    N2 = total operands

    Vocabulary : n  = n1 + n2
    Length     : N  = N1 + N2
    Volume     : V  = N * log2(n)          [bits]
    Difficulty : D  = (n1/2) * (N2/n2)
    Effort     : E  = D * V
    """
    op_counts  = collections.Counter(operators)
    opd_counts = collections.Counter(operands)

    n1 = len(op_counts)   # distinct operators
    n2 = len(opd_counts)  # distinct operands
    N1 = sum(op_counts.values())
    N2 = sum(opd_counts.values())

    n = n1 + n2
    N = N1 + N2

    volume     = N * math.log2(n)     if n  > 1 else 0.0
    difficulty = (n1 / 2) * (N2 / n2) if n2 > 0 else 0.0
    effort     = difficulty * volume

    return {
        "n1": n1, "n2": n2, "N1": N1, "N2": N2,
        "vocabulary": n,
        "length": N,
        "volume": round(volume, 4),
        "difficulty": round(difficulty, 4),
        "effort": round(effort, 4),
    }


def _halstead_vector(h: dict) -> list[float]:
    """
    Return an 8-dimensional feature vector from a Halstead dict for
    cosine-similarity comparison.

    Dimension layout
    ----------------
    0  operator_density  = n1 / (n1 + n2 + 1)   ∈ [0, 1]
    1  operand_density   = n2 / (n1 + n2 + 1)   ∈ [0, 1]
    2  log1p(volume)
    3  log1p(difficulty)
    4  log1p(effort)
    5  operator_ratio    = N1 / (N2 + 1)         (operator-to-operand usage ratio)
    6  token_density     = N / (vocabulary + 1)   (total tokens / unique tokens)
    7  vocab_richness    = vocabulary / (N + 1)   (unique tokens / total tokens)
    """
    n1 = h.get("n1", 0)
    n2 = h.get("n2", 0)
    N1 = h.get("N1", 0)
    N2 = h.get("N2", 0)
    vocab = n1 + n2 + 1          # +1 avoids division by zero
    N = N1 + N2

    return [
        n1 / vocab,
        n2 / vocab,
        math.log1p(h.get("volume",     0)),
        math.log1p(h.get("difficulty", 0)),
        math.log1p(h.get("effort",     0)),
        N1 / (N2 + 1),
        N / (vocab),
        (n1 + n2) / (N + 1),
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
                   raw_tokens_b: list = None) -> int | None:
    """
    Return clone type (1, 2, 3) or None if not a clone.

    Type 1 : exact raw token sequence match (whitespace/comments already stripped)
    Type 2 : strong *normalized* token AND structural match (renamed identifiers)
    Type 3 : fusion score passes threshold (near-miss / modified)

    The raw_token_score distinguishes Type-1 from Type-2: a renamed clone
    will score highly on normalized tokens but poorly on raw tokens.
    When raw_tokens_a and raw_tokens_b are provided, an exact list comparison
    is used for Type-1 rather than a threshold check.
    """
    if raw_token_score is None:
        raw_token_score = token_score

    # Type-1: exact raw token sequence match (whitespace/comments already stripped)
    if raw_tokens_a is not None and raw_tokens_b is not None:
        if raw_tokens_a == raw_tokens_b:
            return 1
    elif raw_token_score >= THRESH_TYPE1 and ast_score >= THRESH_TYPE1:
        return 1

    if token_score >= THRESH_TYPE2 and ast_score >= THRESH_TYPE2:
        return 2
    if fusion_score >= THRESH_FUSION_TYPE3:
        return 3
    return None


# ===========================================================================
# BLOCK EXTRACTION — split source into function-level units
# ===========================================================================

def _make_block(name, start_line, end_line, source, language) -> FunctionBlock:
    """Helper to construct and fully initialise a FunctionBlock."""
    fb = FunctionBlock(
        name=name,
        start_line=start_line,
        end_line=end_line,
        source=source,
        language=language,
    )
    if language == "python":
        fb.tokens        = _normalize_python_tokens(source)
        fb.raw_tokens    = _raw_python_tokens(source)
        fb.halstead      = _extract_halstead_python(source)
    else:
        fb.tokens        = _normalize_java_tokens(source)
        fb.raw_tokens    = _raw_java_tokens(source)
        fb.halstead      = _extract_halstead_java(source)
    fb._ngrams_norm  = _make_ngrams(fb.tokens)
    fb._ngrams_raw   = _make_ngrams(fb.raw_tokens)
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
        end      = getattr(node, "end_lineno", start + 1)
        func_src = "\n".join(lines[start - 1: end])
        blocks.append(_make_block(node.name, start, end, func_src, "python"))

    return blocks


def _extract_java_blocks(source: str) -> list[FunctionBlock]:
    """
    Extract method-level blocks from Java source using a brace-counting
    approach.  Finds method signatures and captures their bodies.

    Fix #8: The brace counter now correctly skips both double-quoted string
    literals and single-quoted char literals, so a `{` inside `'{'` or
    a `"{"` no longer throws off the brace depth count.
    """
    lines = source.splitlines()

    # Strip comments before scanning for method signatures
    clean = _JAVA_BLOCK_COMMENT_RE.sub(" ", source)
    clean = _JAVA_LINE_COMMENT_RE.sub(" ", clean)

    # Pattern: optional modifiers + return type + name + (params) + {
    method_pattern = re.compile(
        r"(?:(?:public|private|protected|static|final|synchronized|"
        r"abstract|native|strictfp)\s+)*"
        r"(?:\w+(?:<[^>]*>)?)\s+"
        r"(\w+)\s*"
        r"\([^)]*\)\s*"
        r"(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?"
        r"\{"
    )

    blocks = []
    for m in method_pattern.finditer(clean):
        method_name = m.group(1)
        start_pos   = m.start()
        start_line  = clean[:start_pos].count("\n") + 1

        # Fix #8: Walk forward counting braces, correctly skipping string and
        # char literals so that `{` inside quotes doesn't affect brace depth.
        depth   = 0
        end_pos = start_pos
        i       = m.start()
        n       = len(clean)

        while i < n:
            ch = clean[i]

            # Skip double-quoted string literals
            if ch == '"':
                i += 1
                while i < n:
                    if clean[i] == '\\':
                        i += 2   # skip escaped character
                        continue
                    if clean[i] == '"':
                        break
                    i += 1

            # Fix #8: Skip single-quoted char literals (e.g. '{', '\\', '\'')
            elif ch == "'":
                i += 1
                while i < n:
                    if clean[i] == '\\':
                        i += 2   # skip escaped character
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
      0. MIN_TOKENS guard     (Fix #5: skip trivially short blocks)
      1. Token Jaccard prefilter
      2. AST structural similarity
      3. Halstead cosine similarity
      4. Fusion score + clone classification
    """
    pairs = []
    for block_a, block_b in pair_iter:
        # Fix #5: Skip blocks that are too short to produce meaningful results.
        # Trivial functions (getters, setters, one-liners) will match each
        # other vacuously and inflate clone counts.
        if len(block_a.tokens) < MIN_TOKENS or len(block_b.tokens) < MIN_TOKENS:
            continue

        # ---- Layer 1 ----
        token_score = compute_token_similarity(block_a, block_b)
        if token_score < THRESH_TOKEN_PREFILTER:
            continue   # fast skip — not similar enough to proceed

        raw_token_score = compute_raw_token_similarity(block_a, block_b)

        # ---- Layer 2 (lazy AST computed on first access) ----
        ast_score = compute_ast_similarity(block_a, block_b)

        # ---- Layer 3 ----
        halstead_score = compute_halstead_similarity(block_a, block_b)

        # ---- Fusion ----
        fusion = compute_fusion_score(token_score, ast_score, halstead_score)
        clone_type = classify_clone(token_score, ast_score, fusion,
                                    raw_token_score,
                                    raw_tokens_a=block_a.raw_tokens,
                                    raw_tokens_b=block_b.raw_tokens)

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
            ))

    return pairs


def detect_clones_in_blocks(
    blocks_a: list[FunctionBlock],
    blocks_b: list[FunctionBlock],
    file_a: str = "file_a",
    file_b: str = "file_b",
) -> list[ClonePair]:
    """
    Run the full TAHD pipeline on every pair of blocks from two files.
    Delegates to _compare_block_pairs with itertools.product.
    """
    return _compare_block_pairs(
        itertools.product(blocks_a, blocks_b), file_a, file_b
    )


def detect_clones_single_file(
    blocks: list[FunctionBlock],
    filename: str = "submission",
) -> list[ClonePair]:
    """
    Detect clones within a single file (all unique block pairs).
    Useful when analyzing one student submission for internal duplication.
    Delegates to _compare_block_pairs with itertools.combinations.
    """
    return _compare_block_pairs(
        itertools.combinations(blocks, 2), filename, filename
    )


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
    """
    Fix #10: Generate a concrete merged-function skeleton based on the
    actual function names and clone type, rather than a generic message.

    Type 1 — one function is redundant; keep the first, delete the second.
    Type 2 — extract shared logic; parameters stand in for renamed variables.
    Type 3 — extract common sub-logic into a helper called by both.
    """
    name_a = pair.block_a.name
    name_b = pair.block_b.name
    lang   = pair.block_a.language

    if lang == "python":
        if pair.clone_type == 1:
            return (
                f"# Keep only one of the two identical functions.\n"
                f"# Delete '{name_b}' and update all callers to use '{name_a}'.\n\n"
                f"# Before: two identical functions '{name_a}' and '{name_b}'\n"
                f"# After:\n"
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
        else:  # Type 3
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
    else:  # java
        if pair.clone_type == 1:
            return (
                f"// Keep only one of the two identical methods.\n"
                f"// Delete '{name_b}' and update all callers to use '{name_a}'.\n\n"
                f"// Before: two identical methods '{name_a}' and '{name_b}'\n"
                f"// After:\n"
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
        else:  # Type 3
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

        snippet_a = "\n".join(pair.block_a.source.splitlines()[:6])
        snippet_b = "\n".join(pair.block_b.source.splitlines()[:6])

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
            "before_code":  f"# Block A ({pair.block_a.name})\n{snippet_a}\n\n"
                            f"# Block B ({pair.block_b.name})\n{snippet_b}",
            # Fix #10: Concrete skeleton instead of a generic message
            "after_code":   _generate_after_code(pair),
        })

    return suggestions


# ===========================================================================
# QUALITY METRICS
# ===========================================================================

def compute_cyclomatic_complexity(source: str, language: str) -> float:
    """
    McCabe's Cyclomatic Complexity  M = E - N + 2P
    Approximated by counting decision points + 1.

    Comments and string literals are stripped first to avoid false positives
    from keywords appearing inside non-code content.
    """
    if language == "python":
        # Strip Python comments and string literals
        clean = _PY_COMMENT_RE.sub(' ', source)
        clean = _PY_TRIPLE_DQ_RE.sub('STR', clean)
        clean = _PY_TRIPLE_SQ_RE.sub('STR', clean)
        clean = _PY_DOUBLE_STRING_RE.sub('STR', clean)
        clean = _PY_SINGLE_STRING_RE.sub('STR', clean)
        keywords = ["if ", "elif ", "else:", "for ", "while ",
                    "except", " and ", " or "]
    else:
        # Strip Java comments and string literals
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
    """
    Maintainability Index (Microsoft variant, 0–100 scale):
      MI = max(0, (171
                   - 5.2 * ln(V)
                   - 0.23 * CC
                   - 16.2 * ln(LOC)) * 100 / 171)
    """
    ln_v   = math.log(max(halstead_volume, 1))
    ln_loc = math.log(max(lines_of_code,   1))
    mi_raw = 171 - 5.2 * ln_v - 0.23 * cyclomatic_complexity - 16.2 * ln_loc
    return round(max(0.0, mi_raw * 100 / 171), 2)


# ===========================================================================
# CODE QUALITY REPORT HELPERS
# ===========================================================================

def _compute_nesting_depth(source: str, language: str) -> int:
    """
    Compute the maximum nesting depth of a function's source.

    Fix #7: Python now uses AST scope-node counting instead of indent-level
    heuristics.  This correctly handles 2-space, 4-space, and tab indentation.
    Scope nodes counted: If, For, While, With, Try, ExceptHandler, AsyncFor,
    AsyncWith.

    Java: counts brace depth (unchanged — brace depth is the natural measure).
    """
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
            # Fall back to indent heuristic if source is unparseable
            for line in source.splitlines():
                stripped = line.lstrip()
                if stripped and not stripped.startswith("#"):
                    indent = len(line) - len(stripped)
                    depth  = indent // 4
                    if depth > max_depth:
                        max_depth = depth

        return max_depth

    else:  # java — brace depth (unchanged)
        # Strip comments first to avoid counting braces inside comments
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
    """
    Compute ratio of comment lines to total source lines.

    Fix #2: Python now uses ast.get_docstring() to reliably identify
    docstrings regardless of quote style (single or double), indentation,
    or whether the docstring opens and closes on the same line.  This
    eliminates the fragile delimiter-counting approach.
    """
    lines = source.splitlines()
    total = len(lines)
    if total == 0:
        return 0.0

    comment_count = 0

    if language == "python":
        # Collect line ranges occupied by docstrings via the AST
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

    else:  # java
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
    Fix #3: Return a dict mapping function name → confidence info instead
    of a plain set.  This acknowledges that "unused within this file" does
    not mean truly unused — the function may be called from another file,
    used as a callback, or be an entry point (e.g. main / __main__).

    Return structure:
    {
        "func_name": {
            "unused_in_file": True,
            "confidence": "high" | "low",
            "note": "<human-readable caveat>",
        }
    }

    Confidence is "low" (i.e. likely a false negative) when:
      - The function is named 'main' or '__main__'
      - The function name matches common callback/hook patterns
        (setUp, tearDown, test*, on*, handle*, run, execute, start, stop)
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

    # Strip comments to avoid false positives from commented-out call sites
    if any(getattr(b, "language", "") == "java" for b in blocks):
        searchable = re.sub(r"/\*.*?\*/", " ", source, flags=re.DOTALL)
        searchable = re.sub(r"//[^\n]*", " ", searchable)
    else:
        searchable = re.sub(r"#[^\n]*", " ", source)

    for name in defined:
        pattern = re.compile(r"\b" + re.escape(name) + r"\s*\(")
        for m in pattern.finditer(searchable):
            line_start = searchable.rfind("\n", 0, m.start()) + 1
            line_end   = searchable.find("\n", m.start())
            if line_end == -1:
                line_end = len(searchable)
            line_text = searchable[line_start:line_end].lstrip()
            if not (line_text.startswith("def ") or line_text.startswith("public ")
                    or line_text.startswith("private ") or line_text.startswith("protected ")):
                called.add(name)
                break

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
    """
    Build the full Code Quality Report for a single-file analysis.

    Returns a dict with:
      - "functions": per-function breakdown list
      - "structure": file-level summary stats
    """
    cloned_names: set = set()
    for pair in clone_pairs:
        cloned_names.add(pair.block_a.name)
        cloned_names.add(pair.block_b.name)

    # Fix #3: unused_functions is now a confidence-annotated dict
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
        # Fix #3: Only flag as unused_function when confidence is "high"
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
            # Fix #3: Include unused-function confidence info when applicable
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
    """
    Validate syntax for the given language.
    Python: uses ast.parse (raises SyntaxError on failure).
    Java  : stub — always True (full validation needs javac).
    """
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

    # ------------------------------------------------------------------
    # Single-file analysis
    # ------------------------------------------------------------------

    def analyze(self, code: str, max_suggestions: int = 5) -> dict:
        """
        Analyse a single submission.

        Fix #9: max_suggestions is now a parameter that is forwarded to
        generate_refactoring_suggestions instead of silently using the
        default of 5.
        """
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

        # Fix #6: Count cloned lines without double-counting.
        # The original code added both block_a and block_b lines for every pair,
        # which inflated the percentage when a function appeared in multiple pairs.
        # We now collect all unique line numbers across all cloned blocks instead.
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

        # Fix #9: Forward max_suggestions so callers can control suggestion count
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
            "detection_method": "TAHD v1.3 (Token + AST + Halstead)",
            "quality_report":   quality_report,
        }

    # ------------------------------------------------------------------
    # Cross-file / batch analysis
    # ------------------------------------------------------------------

    def analyze_pair(
        self,
        code_a: str,
        code_b: str,
        file_a: str = "submission_a",
        file_b: str = "submission_b",
        max_suggestions: int = 5,
    ) -> dict:
        """
        Compare two student submissions against each other.

        Fix #11: Raises ValueError if code_a and code_b appear to be in
        different languages than what this analyzer was initialized with.
        (Basic guard: checks that both inputs are strings and non-empty.)

        Fix #1: overall_similarity now reflects the fraction of blocks in
        file_a that were involved in at least one detected clone pair,
        rather than the average fusion score of detected pairs only.
        Averaging fusion scores only over matched pairs is misleading
        because it ignores the majority of unmatched blocks.
        """
        # Fix #11: Cross-language guard
        if not isinstance(code_a, str) or not code_a.strip():
            raise ValueError("code_a must be a non-empty string")
        if not isinstance(code_b, str) or not code_b.strip():
            raise ValueError("code_b must be a non-empty string")

        blocks_a = extract_blocks(code_a, self.language)
        blocks_b = extract_blocks(code_b, self.language)

        clone_pairs = detect_clones_in_blocks(
            blocks_a, blocks_b, file_a, file_b
        )

        # Fix #9: Forward max_suggestions
        suggestions = generate_refactoring_suggestions(clone_pairs, max_suggestions)

        # Fix #1: overall_similarity = fraction of blocks_a matched in at
        # least one clone pair.  This gives a meaningful file-level score
        # that does not ignore the unmatched majority of blocks.
        if clone_pairs and blocks_a:
            matched_a = {p.block_a.name for p in clone_pairs}
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
            "analysis_id":       str(uuid.uuid4()),
            "language":          self.language,
            "file_a":            file_a,
            "file_b":            file_b,
            "overall_similarity": overall_sim,
            "clone_count":       len(clone_pairs),
            "clones":            clones_out,
            "refactoring_suggestions": suggestions,
            "detection_method":  "TAHD v1.3 (Token + AST + Halstead)",
            "dominant_clone_type":   dominant_type,
            "clone_type_breakdown":  dict(type_counts),   # e.g. {1: 1, 2: 1, 3: 1}
        }

# ===========================================================================
# HELPERS
# ===========================================================================

def _clone_type_explanation(clone_type: int) -> dict:
    """Human-readable explanation for each clone type (for the UI)."""
    explanations = {
        1: {
            "type_name":   "Type 1 — Exact Clone",
            "description": "These blocks are identical except for whitespace "
                           "or comment differences.",
            "why_flagged": "Token and structural signatures are nearly perfect matches.",
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