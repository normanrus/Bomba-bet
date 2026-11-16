#!/usr/bin/env python3
"""Tiny JSON path extractor: reads JSON on stdin, prints the value at the dotted path.

Usage:  ... | python3 scripts/jget.py user.stats.won
        ... | python3 scripts/jget.py events.0.id
Prints an empty string when the path is missing (so shell tests can compare).
"""
import json
import sys


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        data = json.load(sys.stdin)
    except Exception:
        print("")
        return 0

    cur = data
    for part in [p for p in path.split(".") if p != ""]:
        try:
            if isinstance(cur, list):
                cur = cur[int(part)]
            elif isinstance(cur, dict):
                cur = cur[part]
            else:
                print("")
                return 0
        except (KeyError, IndexError, ValueError, TypeError):
            print("")
            return 0

    if isinstance(cur, bool):
        print("true" if cur else "false")
    elif cur is None:
        print("")
    else:
        print(cur)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
