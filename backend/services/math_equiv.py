from sympy.parsing.latex import parse_latex
from sympy import simplify, sympify, SympifyError
import re

def are_mathematically_equivalent(expr_a: str, expr_b: str) -> bool:
    """
    Check if two mathematical expressions are equivalent.
    Handles both LaTeX and plain math strings.
    Returns True if equivalent, False if not or if parsing fails.
    """
    try:
        sym_a = _parse_expr(expr_a)
        sym_b = _parse_expr(expr_b)
        if sym_a is None or sym_b is None:
            return False
        diff = simplify(sym_a - sym_b)
        return diff == 0
    except Exception:
        return False

def _parse_expr(expr: str):
    expr = expr.strip()

    # Try LaTeX first
    if any(c in expr for c in ['\\', '^', '_', '{', '}']):
        try:
            return parse_latex(expr)
        except Exception:
            pass

    # Normalize plain math (x bar → xbar, etc.)
    expr = _normalize_plain(expr)
    try:
        return sympify(expr)
    except SympifyError:
        return None

def _normalize_plain(expr: str) -> str:
    # Remove spaces around operators to help sympify
    expr = re.sub(r'\s*\+\s*', '+', expr)
    expr = re.sub(r'\s*\-\s*', '-', expr)
    expr = re.sub(r'\s*\*\s*', '*', expr)
    expr = re.sub(r'\s*\/\s*', '/', expr)
    # Replace common text representations
    expr = expr.replace('x-bar', 'xbar').replace('x̄', 'xbar')
    expr = expr.replace('mu', 'mu').replace('μ', 'mu')
    expr = expr.replace('sigma', 'sigma').replace('σ', 'sigma')
    return expr

def extract_latex_expressions(text: str) -> list[str]:
    """Pull all LaTeX math expressions from a text string."""
    patterns = [
        r'\$\$(.+?)\$\$',   # display math
        r'\$(.+?)\$',        # inline math
        r'\\[(.+?)\\]',      # bracket notation
        r'\\((.+?)\\)',      # paren notation
    ]
    results = []
    for pattern in patterns:
        results.extend(re.findall(pattern, text, re.DOTALL))
    return [r.strip() for r in results]
