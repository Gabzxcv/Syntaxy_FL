"""
Performance benchmark for TAHD optimizations.
Measures execution time on the ground_truth_extended dataset.
"""
import time
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.analyzer import CodeAnalyzer

# Sample code pairs for benchmarking
test_cases = [
    # Type-1: Exact clone
    ("""
def compute_sum(numbers):
    total = 0
    for num in numbers:
        total += num
    return total
""", """
def compute_sum(numbers):
    total = 0
    for num in numbers:
        total += num
    return total
"""),
    # Type-2: Renamed clone
    ("""
def compute_total(items):
    total = 0
    for value in items:
        total += value
    return total
""", """
def aggregate_numbers(nums):
    result = 0
    for n in nums:
        result += n
    return result
"""),
    # Type-3: Near-miss clone
    ("""
def summarize(nums):
    total = 0
    for n in nums:
        if n > 0:
            total += n
    return total
""", """
def summarize(data):
    total = 0
    for item in data:
        if item > 0:
            total += item
        else:
            total += 0
    return total
"""),
    # Non-clone
    ("""
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
""", """
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
"""),
]

def run_benchmark(iterations=10):
    analyzer = CodeAnalyzer("python")
    
    total_time = 0
    for _ in range(iterations):
        start = time.perf_counter()
        for code_a, code_b in test_cases:
            _ = analyzer.analyze_pair(code_a, code_b)
        elapsed = time.perf_counter() - start
        total_time += elapsed
    
    avg_time = total_time / iterations
    pairs_per_sec = (len(test_cases) * iterations) / total_time
    
    print("Performance Benchmark Results")
    print("=" * 50)
    print(f"Iterations: {iterations}")
    print(f"Test cases: {len(test_cases)}")
    print(f"Total time: {total_time:.4f}s")
    print(f"Average time per iteration: {avg_time:.4f}s")
    print(f"Pairs analyzed per second: {pairs_per_sec:.2f}")
    print(f"Time per pair: {(avg_time / len(test_cases)) * 1000:.2f}ms")

if __name__ == "__main__":
    run_benchmark(iterations=20)
