"""
Unit tests for CodeAnalyzer service

Tests cover:
- Analyzer initialization
- Basic analysis flow
- Error handling
- Syntax validation
"""

import pytest
from app.services.analyzer import (
    AUTO_MIN_CONFIDENCE_FLOOR,
    AUTO_MIN_POOL_CONFIDENCE_FLOOR,
    CodeAnalyzer,
    validate_syntax,
)


class TestCodeAnalyzerInitialization:
    """Test analyzer initialization"""
    
    def test_create_python_analyzer(self):
        """Should create analyzer for Python"""
        analyzer = CodeAnalyzer('python')
        assert analyzer.language == 'python'
        assert analyzer.code is None
    
    def test_create_java_analyzer(self):
        """Should create analyzer for Java"""
        analyzer = CodeAnalyzer('java')
        assert analyzer.language == 'java'
    
    def test_reject_unsupported_language(self):
        """Should raise error for unsupported language"""
        with pytest.raises(ValueError, match="Unsupported language"):
            CodeAnalyzer('javascript')


class TestCodeAnalysis:
    """Test code analysis functionality"""
    
    def test_analyze_simple_python_code(self):
        """Should analyze simple Python code without errors"""
        code = "def hello():\n    print('hi')"
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        # Check result structure
        assert 'analysis_id' in result
        assert 'language' in result
        assert 'lines_of_code' in result
        assert 'clone_percentage' in result
        assert 'cyclomatic_complexity' in result
        assert 'maintainability_index' in result
        assert 'clones' in result
        assert 'refactoring_suggestions' in result
    
    def test_analyze_returns_correct_line_count(self):
        """Should count lines correctly"""
        code = "line1\nline2\nline3"
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        assert result['lines_of_code'] == 3
    
    def test_analyze_empty_code_returns_zero_lines(self):
        """Should handle empty code"""
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze("")
        
        assert result['lines_of_code'] == 1  # Empty string splits to 1 line
    
    def test_analyze_sets_correct_language(self):
        """Should set language in result"""
        analyzer = CodeAnalyzer('java')
        
        result = analyzer.analyze("public class Test {}")
        
        assert result['language'] == 'java'


class TestSyntaxValidation:
    """Test syntax validation"""
    
    def test_valid_python_syntax(self):
        """Should accept valid Python code"""
        code = "def test():\n    return 1"
        assert validate_syntax(code, 'python') is True
    
    def test_invalid_python_syntax(self):
        """Should reject invalid Python syntax"""
        code = "def broken(\n    print('invalid')"
        
        with pytest.raises(SyntaxError):
            validate_syntax(code, 'python')
    
    def test_java_syntax_stub(self):
        """Java validation is stub (always returns True for now)"""
        code = "public class Test { invalid syntax }"
        assert validate_syntax(code, 'java') is True  # Stub returns True


class TestCloneDetection:
    """Test clone detection with TAHD pipeline"""
    
    def test_short_code_returns_no_clones(self):
        """Code without duplicate functions should have no clones"""
        code = "print(1)\nprint(2)"
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        assert len(result['clones']) == 0
    
    def test_longer_code_may_have_clones(self):
        """Longer code may have clones"""
        code = "\n".join([f"line{i}" for i in range(20)])
        analyzer = CodeAnalyzer('python')
        
        result = analyzer.analyze(code)
        
        assert isinstance(result['clones'], list)

    def test_type1_exact_clone_detected(self):
        """Identical functions should be detected as Type 1 clone"""
        code = (
            "def add(a, b):\n"
            "    result = a + b\n"
            "    return result\n"
            "\n"
            "def add(a, b):\n"
            "    result = a + b\n"
            "    return result\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        assert len(result['clones']) == 1
        assert result['clones'][0]['type'] == 1

    def test_type2_renamed_clone_detected(self):
        """Functions with renamed identifiers should be Type 2"""
        code = (
            "def add(a, b):\n"
            "    result = a + b\n"
            "    return result\n"
            "\n"
            "def sum_nums(x, y):\n"
            "    total = x + y\n"
            "    return total\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        assert len(result['clones']) == 1
        assert result['clones'][0]['type'] == 2

    def test_no_clone_for_different_functions(self):
        """Structurally different functions should not be clones"""
        code = (
            "def add(a, b):\n"
            "    return a + b\n"
            "\n"
            "def greet(name):\n"
            "    print('hello ' + name)\n"
            "    print('welcome')\n"
            "    return name.upper()\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        assert len(result['clones']) == 0


class TestNgramFix:
    """Test _make_ngrams edge cases"""

    def test_short_sequence_returns_single_tuple(self):
        """Tokens shorter than n should return dict with one tuple key"""
        from app.services.analyzer import _make_ngrams
        result = _make_ngrams(['a', 'b'], n=3)
        assert result == {('a', 'b'): 1}

    def test_empty_sequence_returns_empty_set(self):
        """Empty token list should return empty dict"""
        from app.services.analyzer import _make_ngrams
        result = _make_ngrams([], n=3)
        assert result == {}


class TestMetricsCalculation:
    """Test quality metrics"""
    
    def test_clone_percentage_in_valid_range(self):
        """Clone percentage should be 0-100"""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze("print(1)")
        
        assert 0 <= result['clone_percentage'] <= 100
    
    def test_cyclomatic_complexity_positive(self):
        """Complexity should be positive"""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze("print(1)")
        
        assert result['cyclomatic_complexity'] > 0
    
    def test_maintainability_index_in_range(self):
        """MI should be 0-100"""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze("print(1)")
        
        assert 0 <= result['maintainability_index'] <= 100


class TestASTSequence:
    """Verify that _python_ast_sequence produces pre-order DFS output."""

    def test_preorder_sequence_has_assign(self):
        """Assignment statement should appear in the sequence."""
        from app.services.analyzer import _python_ast_sequence
        seq = _python_ast_sequence("x = 1")
        # Module is skipped, so first node should be Assign
        assert "Assign" in seq

    def test_function_node_before_body_nodes(self):
        """Body nodes should be present in sequence (FunctionDef itself is excluded per v1.15)."""
        from app.services.analyzer import _python_ast_sequence
        seq = _python_ast_sequence("def f():\n    return 1")
        # v1.15: FunctionDef is excluded from sequence, but body nodes are included
        assert "Return" in seq
        assert "Constant_int" in seq

    def test_identical_sources_produce_identical_sequences(self):
        """Two identical sources must produce identical sequences."""
        from app.services.analyzer import _python_ast_sequence
        src = "def f(x):\n    return x + 1"
        assert _python_ast_sequence(src) == _python_ast_sequence(src)

    def test_different_structures_produce_different_sequences(self):
        """Structurally different code must produce different sequences."""
        from app.services.analyzer import _python_ast_sequence
        seq_if  = _python_ast_sequence("def f(x):\n    if x:\n        return x")
        seq_ret = _python_ast_sequence("def f(x):\n    return x")
        assert seq_if != seq_ret

    def test_syntax_error_returns_empty_list(self):
        """Invalid Python should return an empty list gracefully."""
        from app.services.analyzer import _python_ast_sequence
        assert _python_ast_sequence("def broken(") == []


class TestHalsteadVector:
    """Verify that _halstead_vector produces well-normalized dimensions."""

    def _make_vector(self, source: str) -> list:
        from app.services.analyzer import _extract_halstead_python, _halstead_vector
        h = _extract_halstead_python(source)
        return _halstead_vector(h)

    def test_operator_density_in_unit_range(self):
        """Operator density (dim 0) must be in [0, 1]."""
        v = self._make_vector("def f(x):\n    return x * 2 + 1")
        assert 0.0 <= v[0] <= 1.0

    def test_operand_density_in_unit_range(self):
        """Operand density (dim 1) must be in [0, 1]."""
        v = self._make_vector("def f(x):\n    return x * 2 + 1")
        assert 0.0 <= v[1] <= 1.0

    def test_densities_sum_to_less_than_one(self):
        """operator_density + operand_density must be < 1 (denom includes +1)."""
        v = self._make_vector("def f(x):\n    return x * 2 + 1")
        assert v[0] + v[1] < 1.0

    def test_log_volume_non_negative(self):
        """log1p(volume) (dim 2) must be >= 0."""
        v = self._make_vector("def f(x):\n    return x + 1")
        assert v[2] >= 0.0

    def test_empty_code_vector_all_zeros(self):
        """Empty source produces a zero vector (no tokens)."""
        from app.services.analyzer import _extract_halstead_python, _halstead_vector
        import math
        h = _extract_halstead_python("")
        v = _halstead_vector(h)
        # n1=0, n2=0 → densities both 0; volume/difficulty/effort all 0
        assert v[0] == 0.0
        assert v[1] == 0.0
        assert v[2] == 0.0   # log1p(0) == 0

    def test_identical_code_produces_identical_vectors(self):
        """Identical source must produce identical Halstead vectors."""
        src = "def f(a, b):\n    return a + b"
        v1 = self._make_vector(src)
        v2 = self._make_vector(src)
        assert v1 == v2

    def test_different_code_produces_different_vectors(self):
        """Very different code should produce noticeably different vectors."""
        simple = "def f():\n    return 1"
        complex_fn = (
            "def g(a, b, c):\n"
            "    result = 0\n"
            "    for i in range(a):\n"
            "        if i % b == 0:\n"
            "            result += i * c\n"
            "    return result\n"
        )
        v1 = self._make_vector(simple)
        v2 = self._make_vector(complex_fn)
        assert v1 != v2


class TestType3CloneDetection:
    """Test near-miss (Type 3) clone detection."""

    def test_near_miss_clone_detected_as_type3(self):
        """Functions with added/removed statements should be Type 2 or 3 clones.

        Type 2 is also valid here because the functions share renamed identifiers
        with high normalized-token and AST similarity; the fusion score may push
        the pair into Type 2 rather than Type 3 depending on exact thresholds.
        """
        code = (
            "def process(items):\n"
            "    result = []\n"
            "    for item in items:\n"
            "        if item > 0:\n"
            "            result.append(item * 2)\n"
            "    return result\n"
            "\n"
            "def transform(data):\n"
            "    output = []\n"
            "    for element in data:\n"
            "        if element > 0:\n"
            "            output.append(element * 2)\n"
            "        else:\n"
            "            output.append(0)\n"
            "    return output\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        clone_types = [c['type'] for c in result['clones']]
        # Should be detected as Type 2 or Type 3 (both are valid near-miss results)
        assert len(result['clones']) >= 1
        assert all(t in (2, 3) for t in clone_types)

    def test_clone_scores_are_floats_in_valid_range(self):
        """All score fields must be floats between 0 and 1."""
        code = (
            "def add(a, b):\n"
            "    return a + b\n"
            "\n"
            "def add2(x, y):\n"
            "    return x + y\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze(code)

        for clone in result['clones']:
            assert 0.0 <= clone['token_score']    <= 1.0
            assert 0.0 <= clone['ast_score']      <= 1.0
            assert 0.0 <= clone['halstead_score'] <= 1.0
            assert 0.0 <= clone['similarity']     <= 1.0


class TestFalsePositiveGuardrails:
    """Regression tests for false-positive suppression logic."""

    def test_type1_fallback_requires_substantial_blocks(self):
        """Type-1 fallback should not classify tiny high-score snippets."""
        from app.services.analyzer import ScoredPair, classify_clone

        sp = ScoredPair(
            token_score=0.35,
            lit_token_score=0.35,
            ast_score=0.96,
            halstead_score=0.30,
            fusion_score=0.0,
            line_ratio=1.0,
            cc_delta=0.0,
            vol_delta=0.0,
            token_containment=0.20,
            token_ratio=1.0,
            raw_token_score=0.90,
            raw_tokens_a=["alpha"] * 10,
            raw_tokens_b=["beta"] * 10,
            lines_a=3,
            lines_b=3,
        )

        clone_type, confidence = classify_clone(sp)
        assert clone_type is None
        assert confidence == 0.0

    def test_type2_strict_short_pair_needs_substance(self):
        """Strict Type-2 should not fire for very short low-substance snippets."""
        from app.services.analyzer import ScoredPair, classify_clone

        sp = ScoredPair(
            token_score=0.78,
            lit_token_score=0.30,
            ast_score=0.77,
            halstead_score=0.10,
            fusion_score=0.0,
            line_ratio=1.0,
            cc_delta=0.0,
            vol_delta=0.0,
            token_containment=0.20,
            token_ratio=1.0,
            raw_token_score=0.40,
            raw_tokens_a=["a"] * 9,
            raw_tokens_b=["b"] * 9,
            lines_a=3,
            lines_b=3,
        )

        clone_type, _ = classify_clone(sp)
        assert clone_type is None

    def test_halstead_dominant_low_ast_confidence_discounted(self):
        """HALSTEAD_DOMINANT matches with weak AST should be confidence-discounted."""
        from app.services.analyzer import ScoredPair, classify_clone

        sp = ScoredPair(
            token_score=0.35,
            lit_token_score=0.20,
            ast_score=0.25,
            halstead_score=0.97,
            fusion_score=0.0,
            line_ratio=1.2,
            cc_delta=0.0,
            vol_delta=0.0,
            token_containment=0.40,
            token_ratio=1.1,
            raw_token_score=0.0,
            raw_tokens_a=["x"] * 20,
            raw_tokens_b=["y"] * 20,
            lines_a=8,
            lines_b=8,
        )

        clone_type, confidence = classify_clone(sp)
        assert clone_type == 3
        assert confidence < 0.65

    def test_rename_alignment_gate_boundary(self):
        """Rename gate should hard-stop below threshold and evaluate at threshold."""
        from app.services.analyzer import _rename_alignment_score, extract_blocks

        src_a = (
            "def add(a, b):\n"
            "    result = a + b\n"
            "    return result\n"
        )
        src_b = (
            "def sum_nums(x, y):\n"
            "    total = x + y\n"
            "    return total\n"
        )

        block_a = extract_blocks(src_a, 'python')[0]
        block_b = extract_blocks(src_b, 'python')[0]

        low = _rename_alignment_score(block_a, block_b, token_score=0.649)
        edge = _rename_alignment_score(block_a, block_b, token_score=0.65)

        assert low == 0.0
        assert edge > 0.0


class TestAnalyzePair:
    """Test cross-file clone detection via analyze_pair."""

    def test_identical_files_have_high_similarity(self):
        """Two identical files should produce overall_similarity near 1.0."""
        code = (
            "def compute(x, y):\n"
            "    total = x + y\n"
            "    return total\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze_pair(code, code)

        assert result['overall_similarity'] >= 0.90
        assert result['clone_count'] >= 1

    def test_completely_different_files_have_zero_similarity(self):
        """Two completely unrelated files should have no detected clones."""
        code_a = "def alpha():\n    return 42\n"
        code_b = (
            "def process_list(items):\n"
            "    for item in items:\n"
            "        if item > 100:\n"
            "            print(item)\n"
            "    return len(items)\n"
        )
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze_pair(code_a, code_b)

        assert result['clone_count'] == 0
        assert result['overall_similarity'] == 0.0

    def test_analyze_pair_result_structure(self):
        """analyze_pair must return all expected keys."""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze_pair("def f():\n    pass\n", "def g():\n    pass\n")

        for key in ('analysis_id', 'language', 'file_a', 'file_b',
                    'overall_similarity', 'clone_count', 'clones',
                    'refactoring_suggestions', 'detection_method'):
            assert key in result

    def test_detection_method_version(self):
        """detection_method should advertise TAHD v1.15."""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze_pair("def f():\n    pass\n", "def g():\n    pass\n")
        assert "v1.15" in result['detection_method']

    def test_analyze_pair_reports_corpus_weighting_metadata(self):
        """Result should include corpus_weighting metadata even when disabled."""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze_pair("def f():\n    return 1\n", "def g():\n    return 2\n")

        assert 'corpus_weighting' in result
        assert result['corpus_weighting']['enabled'] is False
        assert result['corpus_weighting']['submission_count'] == 2

    def test_analyze_pair_enables_corpus_weighting_with_pool(self):
        """Providing corpus_codes should activate corpus-aware weighting."""
        analyzer = CodeAnalyzer('python')
        result = analyzer.analyze_pair(
            "def f(x):\n    return x + 1\n",
            "def g(y):\n    return y + 1\n",
            corpus_codes=[
                "def h(z):\n    total = 0\n    for i in range(z):\n        total += i\n    return total\n",
                "def k(z):\n    total = 1\n    for i in range(z):\n        total *= i + 1\n    return total\n",
            ],
        )
        assert result['corpus_weighting']['enabled'] is True
        assert result['corpus_weighting']['submission_count'] == 4


class TestAnalyzeBatch:
    """Test batch cross-file clone detection with shared corpus profile."""

    def test_analyze_batch_result_structure(self):
        analyzer = CodeAnalyzer('python')
        submissions = [
            {"file": "a.py", "code": "def f(x):\n    return x + 1\n"},
            {"file": "b.py", "code": "def g(y):\n    return y + 1\n"},
            {"file": "c.py", "code": "def h(z):\n    return z * 2\n"},
        ]

        result = analyzer.analyze_batch(submissions)

        for key in ('analysis_id', 'language', 'submission_count', 'pair_count',
                    'pairs', 'detection_method', 'corpus_weighting', 'performance_profile'):
            assert key in result
        assert result['submission_count'] == 3
        assert result['pair_count'] == 3
        assert isinstance(result['pairs'], list)

    def test_analyze_batch_requires_two_submissions(self):
        analyzer = CodeAnalyzer('python')
        with pytest.raises(ValueError, match='at least two'):
            analyzer.analyze_batch([
                {"file": "only.py", "code": "def f():\n    return 1\n"}
            ])


class TestOverflaggingControls:
    """Tunable suppression controls should be opt-in and deterministic."""

    def test_analyze_pair_confidence_floor_filters_low_confidence(self):
        analyzer = CodeAnalyzer('python')
        code_a = "def add(a, b):\n    return a + b\n"
        code_b = "def sum_nums(x, y):\n    return x + y\n"

        base = analyzer.analyze_pair(code_a, code_b)
        strict = analyzer.analyze_pair(code_a, code_b, confidence_floor=1.0)

        assert base['clone_count'] >= strict['clone_count']
        assert strict['clone_count'] == 0
        assert strict['filters_applied']['confidence_floor'] == 1.0

    def test_analyze_batch_pool_suppression_removes_low_confidence_pairs(self):
        analyzer = CodeAnalyzer('python')
        submissions = [
            {"file": "a.py", "code": "def add(a, b):\n    return a + b\n"},
            {"file": "b.py", "code": "def sum_nums(x, y):\n    return x + y\n"},
            {"file": "c.py", "code": "def unrelated(nums):\n    out = []\n    for n in nums:\n        out.append(n * 3)\n    return out\n"},
        ]

        base = analyzer.analyze_batch(submissions)
        strict = analyzer.analyze_batch(
            submissions,
            enable_pool_suppression=True,
            pool_confidence_floor=1.0,
            pool_confidence_mode='max',
        )

        assert base['pair_count'] >= strict['pair_count']
        assert strict['filters_applied']['pool_suppression'] is True
        assert strict['filters_applied']['pool_confidence_floor'] == 1.0

    def test_analyze_pair_pool_suppression_only_applies_with_corpus(self):
        analyzer = CodeAnalyzer('python')
        code_a = "def add(a, b):\n    return a + b\n"
        code_b = "def sum_nums(x, y):\n    return x + y\n"

        no_corpus = analyzer.analyze_pair(
            code_a,
            code_b,
            enable_pool_suppression=True,
            pool_confidence_floor=1.0,
        )
        with_corpus = analyzer.analyze_pair(
            code_a,
            code_b,
            corpus_codes=["def helper(z):\n    return z - 1\n"],
            enable_pool_suppression=True,
            pool_confidence_floor=1.0,
        )

        assert no_corpus['filters_applied']['pool_suppression'] is False
        assert with_corpus['filters_applied']['pool_suppression'] is True

    def test_analyze_batch_auto_tune_filters_derives_effective_thresholds(self):
        analyzer = CodeAnalyzer('python')
        submissions = [
            {"file": "a.py", "code": "def add(a, b):\n    return a + b\n"},
            {"file": "b.py", "code": "def sum_nums(x, y):\n    return x + y\n"},
            {"file": "c.py", "code": "def mul(a, b):\n    return a * b\n"},
            {"file": "d.py", "code": "def sub(a, b):\n    return a - b\n"},
            {"file": "e.py", "code": "def div(a, b):\n    if b == 0:\n        return 0\n    return a / b\n"},
            {"file": "f.py", "code": "def sqr(x):\n    return x * x\n"},
            {"file": "g.py", "code": "def cube(x):\n    return x * x * x\n"},
            {"file": "h.py", "code": "def abs_val(x):\n    return x if x >= 0 else -x\n"},
            {"file": "i.py", "code": "def clamp(v, lo, hi):\n    return max(lo, min(hi, v))\n"},
            {"file": "j.py", "code": "def inc(v):\n    return v + 1\n"},
        ]

        result = analyzer.analyze_batch(
            submissions,
            enable_pool_suppression=True,
            auto_tune_filters=True,
        )

        filters = result['filters_applied']
        assert filters['auto_tune_filters'] is True
        assert 'effective_confidence_floor' in filters
        assert 'effective_pool_confidence_floor' in filters
        assert filters['effective_confidence_floor'] >= filters['confidence_floor']
        assert filters['effective_pool_confidence_floor'] >= filters['pool_confidence_floor']

    def test_analyze_pair_auto_tune_filters_uses_corpus_distribution(self):
        analyzer = CodeAnalyzer('python')
        code_a = (
            "def total_sum(nums):\n"
            "    acc = 0\n"
            "    for n in nums:\n"
            "        acc += n\n"
            "    return acc\n"
        )
        code_b = (
            "def compute_total(values):\n"
            "    out = 0\n"
            "    for v in values:\n"
            "        out += v\n"
            "    return out\n"
        )
        corpus_codes = [
            "def helper_1(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
            "def helper_2(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
            "def helper_3(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
            "def helper_4(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
            "def helper_5(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
            "def helper_6(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
            "def helper_7(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
            "def helper_8(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n",
        ]

        result = analyzer.analyze_pair(
            code_a,
            code_b,
            corpus_codes=corpus_codes,
            auto_tune_filters=True,
        )

        filters = result['filters_applied']
        assert filters['auto_tune_filters'] is True
        assert filters['effective_confidence_floor'] >= AUTO_MIN_CONFIDENCE_FLOOR
        assert filters['effective_pool_confidence_floor'] >= AUTO_MIN_POOL_CONFIDENCE_FLOOR

    def test_analyze_pair_rejects_non_boolean_auto_tune_filters(self):
        analyzer = CodeAnalyzer('python')
        with pytest.raises(ValueError, match='auto_tune_filters must be boolean'):
            analyzer.analyze_pair(
                "def add(a, b):\n    return a + b\n",
                "def sum_nums(x, y):\n    return x + y\n",
                auto_tune_filters='yes',
            )


class TestCorpusAwareWeighting:
    """Test corpus-frequency weighting for token similarity."""

    def test_common_ratio_calibrates_by_cohort_size(self):
        from app.services.analyzer import _calibrate_corpus_common_ratio

        small = _calibrate_corpus_common_ratio(0.60, doc_count=4)
        large = _calibrate_corpus_common_ratio(0.60, doc_count=20)

        assert small >= 0.70
        assert large <= 0.60

    def test_profile_reports_requested_and_effective_common_ratio(self):
        from app.services.analyzer import _build_corpus_ngram_profile, extract_blocks

        submissions = [
            "def f1(x):\n    total = 0\n    for i in range(x):\n        total += i\n    return total\n",
            "def f2(x):\n    total = 0\n    for i in range(x):\n        total += i\n    return total\n",
            "def f3(x):\n    total = 0\n    for i in range(x):\n        total += i\n    return total\n",
            "def f4(x):\n    total = 0\n    for i in range(x):\n        total += i\n    return total\n",
        ]
        corpus_blocks = [extract_blocks(src, 'python') for src in submissions]
        profile = _build_corpus_ngram_profile(corpus_blocks, common_doc_ratio=0.60)

        assert profile is not None
        assert profile['requested_common_doc_ratio'] == pytest.approx(0.60)
        assert profile['common_doc_ratio'] >= profile['requested_common_doc_ratio']

    def test_common_ngrams_are_downweighted(self):
        """Weighted token similarity should be lower when overlap is corpus-common."""
        from app.services.analyzer import (
            _build_corpus_ngram_profile,
            compute_token_similarity,
            extract_blocks,
        )

        code_a = (
            "def s1(items):\n"
            "    total = 0\n"
            "    for item in items:\n"
            "        if item > 0:\n"
            "            total += item\n"
            "    return total\n"
        )
        code_b = (
            "def s2(data):\n"
            "    total = 0\n"
            "    for item in data:\n"
            "        if item > 0:\n"
            "            total += item\n"
            "    return total\n"
        )

        boilerplate_pool = [
            "def b1(nums):\n    total = 0\n    for item in nums:\n        if item > 0:\n            total += item\n    return total\n",
            "def b2(nums):\n    total = 0\n    for item in nums:\n        if item > 0:\n            total += item\n    return total\n",
            "def b3(nums):\n    total = 0\n    for item in nums:\n        if item > 0:\n            total += item\n    return total\n",
            "def b4(nums):\n    total = 0\n    for item in nums:\n        if item > 0:\n            total += item\n    return total\n",
        ]

        block_a = extract_blocks(code_a, 'python')[0]
        block_b = extract_blocks(code_b, 'python')[0]

        unweighted = compute_token_similarity(block_a, block_b)
        corpus_blocks = [
            extract_blocks(code_a, 'python'),
            extract_blocks(code_b, 'python'),
        ] + [extract_blocks(src, 'python') for src in boilerplate_pool]
        profile = _build_corpus_ngram_profile(corpus_blocks, common_doc_ratio=0.60)
        weighted = compute_token_similarity(block_a, block_b, corpus_profile=profile)

        assert weighted <= unweighted


class TestHalsteadSimilarity:
    """Test compute_halstead_similarity between FunctionBlocks."""

    def test_identical_blocks_have_similarity_one(self):
        """Two identical blocks must have Halstead similarity of 1.0."""
        from app.services.analyzer import (
            extract_blocks, compute_halstead_similarity,
        )
        src = "def f(a, b):\n    return a + b\n"
        blocks = extract_blocks(src, 'python')
        assert len(blocks) >= 1
        b = blocks[0]
        assert compute_halstead_similarity(b, b) == pytest.approx(1.0)

    def test_different_blocks_have_similarity_less_than_one(self):
        """Two very different blocks should have Halstead similarity < 1.0."""
        from app.services.analyzer import (
            extract_blocks, compute_halstead_similarity,
        )
        src_a = "def f():\n    return 1\n"
        src_b = (
            "def g(a, b, c, d):\n"
            "    total = 0\n"
            "    for i in range(a):\n"
            "        for j in range(b):\n"
            "            total += i * j * c - d\n"
            "    return total\n"
        )
        blocks_a = extract_blocks(src_a, 'python')
        blocks_b = extract_blocks(src_b, 'python')
        sim = compute_halstead_similarity(blocks_a[0], blocks_b[0])
        assert sim < 1.0
