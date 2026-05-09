#!/bin/bash
# RGR pre-edit check: reminds Claude to write tests first for source files
FILE=$(jq -r '.tool_input.file_path // .tool_response.filePath // ""')

# Skip test files, config files, non-source files
if echo "$FILE" | grep -qE '\.(test|spec)\.' || ! echo "$FILE" | grep -qE '\.(ts|tsx|js|jsx)$'; then
  exit 0
fi

echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"RGR CHECK: Is there a failing test for this change? If not, write the test FIRST. (1) RED: failing test exists? (2) GREEN: minimum code to pass? (3) REFACTOR: clean up after green?"}}'
