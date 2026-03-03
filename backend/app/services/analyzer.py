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

# Per-layer thresholds
THRESH_TOKEN_PREFILTER = 0.40   # minimum token Jaccard to proceed to Layer 2
THRESH_TYPE1           = 0.95   # both token AND ast must reach this for Type 1
THRESH_TYPE2           = 0.75   # both token AND ast must reach this for Type 2
THRESH_FUSION_TYPE3    = 0.60   # fusion score threshold for Type 3

# N-gram size for token fingerprinting
NGRAM_SIZE = 3

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
    token_spec = [
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
    pattern = re.compile(
        "|".join(f"(?P<{name}>{regex})" for name, regex in token_spec),
        re.DOTALL
    )

    tokens = []
    for mo in pattern.finditer(source):
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
    token_spec = [
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
    pattern = re.compile(
        "|".join(f"(?P<{name}>{regex})" for name, regex in token_spec),
        re.DOTALL
    )

    tokens = []
    for mo in pattern.finditer(source):
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

    We identify structural constructs (control flow, declarations,
    expressions) and emit a normalized symbol for each.  This is not a
    full AST but captures enough structural information for similarity
    scoring at function level.
    """
    constructs = [
        (r"\bif\s*\(",          "IF"),
        (r"\belse\s*\{",        "ELSE"),
        (r"\bfor\s*\(",         "FOR"),
        (r"\bwhile\s*\(",       "WHILE"),
        (r"\bdo\s*\{",          "DO"),
        (r"\bswitch\s*\(",      "SWITCH"),
        (r"\bcase\b",           "CASE"),
        (r"\breturn\b",         "RETURN"),
        (r"\bthrow\b",          "THROW"),
        (r"\btry\s*\{",         "TRY"),
        (r"\bcatch\s*\(",       "CATCH"),
        (r"\bfinally\s*\{",     "FINALLY"),
        (r"\bnew\s+\w+",        "NEW"),
        (r"\binstanceof\b",     "INSTANCEOF"),
        (r"[A-Za-z_]\w*\s*\(", "CALL"),
        (r"[A-Za-z_]\w*\s*=(?!=)", "ASSIGN"),
        (r"\bint\b|\blong\b|\bdouble\b|\bfloat\b|"
         r"\bboolean\b|\bString\b|\bchar\b|\bbyte\b|\bshort\b",
         "TYPEDECL"),
        (r"\{", "BLOCK_OPEN"),
        (r"\}", "BLOCK_CLOSE"),
    ]

    # Strip comments and strings first
    source = re.sub(r"/\*.*?\*/", " ", source, flags=re.DOTALL)
    source = re.sub(r"//[^\n]*",  " ", source)
    source = re.sub(r'"(?:\\.|[^"\\])*"', "STR", source)
    source = re.sub(r"'(?:\\.|[^'\\])'",  "STR", source)

    # Collect (position, symbol) pairs so we respect source order
    hits = []
    for pattern, symbol in constructs:
        for m in re.finditer(pattern, source):
            hits.append((m.start(), symbol))

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

    # Diagonal band optimization: length ratio > 2:1 → can't be clones
    if la > 2 * lb or lb > 2 * la:
        return 0.0

    # Cap sequence length to avoid O(n²) blowup on very large files
    MAX_LEN = 300
    seq_a = seq_a[:MAX_LEN]
    seq_b = seq_b[:MAX_LEN]
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
    source = re.sub(r"/\*.*?\*/", " ", source, flags=re.DOTALL)
    source = re.sub(r"//[^\n]*",  " ", source)

    operators = []
    operands  = []

    op_pattern  = re.compile(
        r">>>=|<<=|>>=|==|!=|<=|>=|&&|\|\||<<|>>>|>>"
        r"|[+\-*/%&|^]=|\+\+|--|[+\-*/%&|^~!<>=?:]"
    )
    num_pattern = re.compile(r"\b\d+(?:\.\d+)?[lLfFdD]?\b")
    str_pattern = re.compile(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])\'')
    id_pattern  = re.compile(r"\b[A-Za-z_]\w*\b")

    # Collect operators
    for m in op_pattern.finditer(source):
        operators.append(m.group())

    # Remove strings before scanning identifiers/numbers
    clean = str_pattern.sub("STR_LIT ", source)

    for m in num_pattern.finditer(clean):
        operands.append(m.group())

    for m in id_pattern.finditer(clean):
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
    Return a 5-dimensional feature vector from a Halstead dict for
    cosine-similarity comparison.

    Dimension layout
    ----------------
    0  operator_density  = n1 / (n1 + n2 + 1)   ∈ [0, 1]
       Fraction of the vocabulary that consists of operators.
       Using a ratio rather than the raw count keeps this dimension
       on the same scale as the log-scaled metrics below.

    1  operand_density   = n2 / (n1 + n2 + 1)   ∈ [0, 1]
       Fraction of the vocabulary that consists of operands.

    2  log1p(volume)     ≈ log(N · log2(n))      ≈ 2–12 typical range
    3  log1p(difficulty) ≈ log((n1/2)·(N2/n2))   ≈ 0–5  typical range
    4  log1p(effort)     ≈ log(D · V)             ≈ 3–12 typical range

    Rationale: the original vector used raw n1 / n2 (5–60 range) mixed
    with log-scaled metrics (0–12 range), causing cosine similarity to
    be dominated by the raw counts.  Normalising to density ratios
    keeps all five dimensions at comparable magnitudes.
    """
    n1 = h.get("n1", 0)
    n2 = h.get("n2", 0)
    vocab = n1 + n2 + 1          # +1 avoids division by zero

    return [
        n1 / vocab,                               # operator density
        n2 / vocab,                               # operand density
        math.log1p(h.get("volume",     0)),
        math.log1p(h.get("difficulty", 0)),
        math.log1p(h.get("effort",     0)),
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
                   raw_token_score: float = None) -> int | None:
    """
    Return clone type (1, 2, 3) or None if not a clone.

    Type 1 : near-perfect *raw* token AND structural match (exact copy)
    Type 2 : strong *normalized* token AND structural match (renamed identifiers)
    Type 3 : fusion score passes threshold (near-miss / modified)

    The raw_token_score distinguishes Type-1 from Type-2: a renamed clone
    will score highly on normalized tokens but poorly on raw tokens.
    """
    if raw_token_score is None:
        raw_token_score = token_score

    if raw_token_score >= THRESH_TYPE1 and ast_score >= THRESH_TYPE1:
        return 1
    if token_score >= THRESH_TYPE2 and ast_score >= THRESH_TYPE2:
        return 2
    if fusion_score >= THRESH_FUSION_TYPE3:
        return 3
    return None


# ===========================================================================
# BLOCK EXTRACTION — split source into function-level units
# ===========================================================================

def _extract_python_blocks(source: str) -> list[FunctionBlock]:
    """
    Use Python's ast module to find all function definitions and extract
    their source lines as individual FunctionBlocks.
    """
    blocks = []
    lines  = source.splitlines()

    try:
        tree = ast.parse(source)
    except SyntaxError:
        # Treat entire file as one block if unparseable
        fb = FunctionBlock(
            name="<module>",
            start_line=1,
            end_line=len(lines),
            source=source,
            language="python",
        )
        fb.tokens       = _normalize_python_tokens(source)
        fb.raw_tokens   = _raw_python_tokens(source)
        fb.halstead     = _extract_halstead_python(source)
        fb._ngrams_norm = _make_ngrams(fb.tokens)
        fb._ngrams_raw  = _make_ngrams(fb.raw_tokens)
        fb._halstead_vec = _halstead_vector(fb.halstead)
        return [fb]

    func_nodes = [
        n for n in ast.walk(tree)
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]

    if not func_nodes:
        # No functions found — treat whole file as one block
        fb = FunctionBlock(
            name="<module>",
            start_line=1,
            end_line=len(lines),
            source=source,
            language="python",
        )
        fb.tokens       = _normalize_python_tokens(source)
        fb.raw_tokens   = _raw_python_tokens(source)
        fb.halstead     = _extract_halstead_python(source)
        fb._ngrams_norm = _make_ngrams(fb.tokens)
        fb._ngrams_raw  = _make_ngrams(fb.raw_tokens)
        fb._halstead_vec = _halstead_vector(fb.halstead)
        return [fb]

    for node in func_nodes:
        start = node.lineno
        end   = getattr(node, "end_lineno", start + 1)
        func_src = "\n".join(lines[start - 1: end])

        fb = FunctionBlock(
            name=node.name,
            start_line=start,
            end_line=end,
            source=func_src,
            language="python",
        )
        fb.tokens       = _normalize_python_tokens(func_src)
        fb.raw_tokens   = _raw_python_tokens(func_src)
        fb.halstead     = _extract_halstead_python(func_src)
        fb._ngrams_norm = _make_ngrams(fb.tokens)
        fb._ngrams_raw  = _make_ngrams(fb.raw_tokens)
        fb._halstead_vec = _halstead_vector(fb.halstead)
        blocks.append(fb)

    return blocks


def _extract_java_blocks(source: str) -> list[FunctionBlock]:
    """
    Extract method-level blocks from Java source using a brace-counting
    approach.  Finds method signatures and captures their bodies.
    """
    blocks = []
    lines  = source.splitlines()

    # Strip comments before scanning for method signatures
    clean = re.sub(r"/\*.*?\*/", " ", source, flags=re.DOTALL)
    clean = re.sub(r"//[^\n]*",  " ", clean)

    # Pattern: optional modifiers + return type + name + (params) + {
    method_pattern = re.compile(
        r"(?:(?:public|private|protected|static|final|synchronized|"
        r"abstract|native|strictfp)\s+)*"
        r"(?:\w+(?:<[^>]*>)?)\s+"        # return type (with optional generics)
        r"(\w+)\s*"                       # method name  (capture group 1)
        r"\([^)]*\)\s*"                   # parameters
        r"(?:throws\s+\w+(?:\s*,\s*\w+)*\s*)?"  # optional throws
        r"\{"                             # opening brace
    )

    for m in method_pattern.finditer(clean):
        method_name = m.group(1)
        start_pos   = m.start()

        # Count lines to start_pos
        start_line  = clean[:start_pos].count("\n") + 1

        # Walk forward counting braces to find the matching close
        depth     = 0
        end_pos   = start_pos
        in_string = False
        i = m.start()

        while i < len(clean):
            ch = clean[i]
            if ch == '"' and (i == 0 or clean[i-1] != "\\"):
                in_string = not in_string
            if not in_string:
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end_pos = i
                        break
            i += 1

        end_line = clean[:end_pos].count("\n") + 1
        func_src = "\n".join(lines[start_line - 1: end_line])

        fb = FunctionBlock(
            name=method_name,
            start_line=start_line,
            end_line=end_line,
            source=func_src,
            language="java",
        )
        fb.tokens       = _normalize_java_tokens(func_src)
        fb.raw_tokens   = _raw_java_tokens(func_src)
        fb.halstead     = _extract_halstead_java(func_src)
        fb._ngrams_norm = _make_ngrams(fb.tokens)
        fb._ngrams_raw  = _make_ngrams(fb.raw_tokens)
        fb._halstead_vec = _halstead_vector(fb.halstead)
        blocks.append(fb)

    if not blocks:
        # No methods found — treat whole file as one block
        fb = FunctionBlock(
            name="<class>",
            start_line=1,
            end_line=len(lines),
            source=source,
            language="java",
        )
        fb.tokens       = _normalize_java_tokens(source)
        fb.raw_tokens   = _raw_java_tokens(source)
        fb.halstead     = _extract_halstead_java(source)
        fb._ngrams_norm = _make_ngrams(fb.tokens)
        fb._ngrams_raw  = _make_ngrams(fb.raw_tokens)
        fb._halstead_vec = _halstead_vector(fb.halstead)
        blocks.append(fb)

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
      1. Token Jaccard prefilter  (skip pairs below THRESH_TOKEN_PREFILTER)
      2. AST structural similarity  (lazy — only reached when token passes)
      3. Halstead cosine similarity
      4. Fusion score + clone classification
    """
    pairs = []
    for block_a, block_b in pair_iter:
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
                                    raw_token_score)

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

        # Build a simple before/after illustration using the actual snippets
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
            "after_code":   f"# Extract shared logic from both blocks into a "
                            f"single reusable function.",
        })

    return suggestions


# ===========================================================================
# QUALITY METRICS
# ===========================================================================

def compute_cyclomatic_complexity(source: str, language: str) -> float:
    """
    McCabe's Cyclomatic Complexity  M = E - N + 2P
    Approximated by counting decision points + 1.
    Decision points: if, elif, else, for, while, case, except, and, or, ?
    """
    if language == "python":
        keywords = ["if ", "elif ", "else:", "for ", "while ",
                    "except", " and ", " or "]
    else:
        keywords = ["if ", "else ", "for ", "while ", "case ",
                    "catch ", " && ", " || ", " ? "]

    count = 1  # base complexity
    for kw in keywords:
        count += source.count(kw)

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
    Python: counts indent levels (assumed 4-space indentation).
    Java  : counts brace depth.
    """
    if language == "python":
        max_depth = 0
        for line in source.splitlines():
            stripped = line.lstrip()
            if stripped and not stripped.startswith("#"):
                indent = len(line) - len(stripped)
                depth = indent // 4
                if depth > max_depth:
                    max_depth = depth
        return max_depth
    else:
        depth = 0
        max_depth = 0
        in_string = False
        for ch in source:
            if ch == '"':
                in_string = not in_string
            if not in_string:
                if ch == "{":
                    depth += 1
                    if depth > max_depth:
                        max_depth = depth
                elif ch == "}":
                    depth = max(0, depth - 1)
        return max_depth


def _compute_comment_density(source: str, language: str) -> float:
    """Compute ratio of comment lines to total source lines."""
    lines = source.splitlines()
    total = len(lines)
    if total == 0:
        return 0.0
    comment_count = 0
    if language == "python":
        in_docstring = False
        for line in lines:
            stripped = line.strip()
            if not in_docstring and (stripped.startswith('"""') or stripped.startswith("'''")):
                in_docstring = True
                comment_count += 1
                # single-line docstring closes on the same line if it has 2+ delimiters
                if stripped.count('"""') >= 2 or stripped.count("'''") >= 2:
                    in_docstring = False
            elif in_docstring:
                comment_count += 1
                if '"""' in stripped or "'''" in stripped:
                    in_docstring = False
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


def _detect_unused_functions(blocks: list, source: str) -> set:
    """
    Return the set of function names that are defined but never called
    within the same file (simple name-based heuristic).
    A function is considered "called" if its name appears as `name(` somewhere
    other than its own definition line.
    """
    defined = {b.name for b in blocks if b.name not in ("<module>", "<class>")}
    called = set()
    for name in defined:
        pattern = re.compile(r"\b" + re.escape(name) + r"\s*\(")
        for m in pattern.finditer(source):
            # Check if this occurrence is NOT on a definition line
            line_start = source.rfind("\n", 0, m.start()) + 1
            line_end   = source.find("\n", m.start())
            if line_end == -1:
                line_end = len(source)
            line_text = source[line_start:line_end].lstrip()
            if not (line_text.startswith("def ") or line_text.startswith("public ")
                    or line_text.startswith("private ") or line_text.startswith("protected ")):
                called.add(name)
                break
    return defined - called


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
    # Identify functions involved in internal clones
    cloned_names: set = set()
    for pair in clone_pairs:
        cloned_names.add(pair.block_a.name)
        cloned_names.add(pair.block_b.name)

    # Detect unused functions
    unused_names = _detect_unused_functions(blocks, source)

    func_details = []
    for block in blocks:
        cc        = compute_cyclomatic_complexity(block.source, language)
        nesting   = _compute_nesting_depth(block.source, language)
        line_count = block.end_line - block.start_line + 1

        smells = []
        if line_count > 30:
            smells.append("long_function")
        if cc > 10:
            smells.append("high_complexity")
        if block.name in cloned_names:
            smells.append("internal_duplication")
        if block.name in unused_names:
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
        })

    function_count = len(func_details)
    avg_length = (
        round(sum(f["line_count"] for f in func_details) / function_count, 1)
        if function_count > 0 else 0.0
    )
    max_nesting = max((f["nesting_depth"] for f in func_details), default=0)
    comment_density = _compute_comment_density(source, language)

    return {
        "functions": func_details,
        "structure": {
            "function_count":    function_count,
            "avg_function_length": avg_length,
            "max_nesting_depth": max_nesting,
            "comment_density":   comment_density,
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
        ast.parse(code)   # raises SyntaxError if invalid
        return True

    return True  # Java stub


# ===========================================================================
# PUBLIC API — CodeAnalyzer  (drop-in replacement for the mock)
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

    def analyze(self, code: str) -> dict:
        """
        Analyse a single submission.

        Returns the same key structure as the original mock so existing
        API routes continue to work without changes.
        """
        if not isinstance(code, str):
            raise ValueError("code must be a string")

        self.code = code
        lines     = code.splitlines()
        loc       = max(1, len(lines))

        # Extract function blocks
        blocks = extract_blocks(code, self.language)

        # Detect internal clones (within this one file)
        clone_pairs = detect_clones_single_file(blocks)

        # Aggregate quality metrics across all blocks
        all_halstead = [b.halstead for b in blocks]
        total_volume = sum(h.get("volume", 0) for h in all_halstead)
        cc           = compute_cyclomatic_complexity(code, self.language)
        mi           = compute_maintainability_index(total_volume, cc, loc)

        # Clone percentage: fraction of lines inside a detected clone
        cloned_lines = set()
        for pair in clone_pairs:
            for ln in range(pair.block_a.start_line, pair.block_a.end_line + 1):
                cloned_lines.add(ln)
            for ln in range(pair.block_b.start_line, pair.block_b.end_line + 1):
                cloned_lines.add(ln)
        clone_pct = round(len(cloned_lines) / loc * 100, 1) if loc > 0 else 0.0

        # Serialize clone pairs for the API response
        clones_out = []
        for pair in clone_pairs:
            clones_out.append({
                "clone_id":   pair.clone_id,
                "type":       pair.clone_type,
                "similarity": pair.fusion_score,
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

        suggestions = generate_refactoring_suggestions(clone_pairs)

        # Build the Code Quality Report (new — backward compatible, under "quality_report" key)
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
                "total_volume":     round(total_volume, 2),
                "avg_difficulty":   round(
                    sum(h.get("difficulty", 0) for h in all_halstead)
                    / max(len(all_halstead), 1), 2
                ),
            },
            "detection_method": "TAHD v1.1 (Token + AST + Halstead)",
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
    ) -> dict:
        """
        Compare two student submissions against each other.
        This is the primary entry point for plagiarism / clone detection
        between students.
        """
        blocks_a = extract_blocks(code_a, self.language)
        blocks_b = extract_blocks(code_b, self.language)

        clone_pairs = detect_clones_in_blocks(
            blocks_a, blocks_b, file_a, file_b
        )

        suggestions = generate_refactoring_suggestions(clone_pairs)

        # Overall similarity = average fusion score of detected pairs
        if clone_pairs:
            overall_sim = round(
                sum(p.fusion_score for p in clone_pairs) / len(clone_pairs), 4
            )
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

        return {
            "analysis_id":       str(uuid.uuid4()),
            "language":          self.language,
            "file_a":            file_a,
            "file_b":            file_b,
            "overall_similarity": overall_sim,
            "clone_count":       len(clone_pairs),
            "clones":            clones_out,
            "refactoring_suggestions": suggestions,
            "detection_method":  "TAHD v1.1 (Token + AST + Halstead)",
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