#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
# Usage: ./ralph.sh [--tool amp|claude|codex] [max_iterations]

set -e

# Parse arguments
TOOL="amp"  # Default to amp for backwards compatibility
MAX_ITERATIONS=10
CODEX_MODEL=""
CODEX_REASONING_EFFORT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    --model)
      CODEX_MODEL="$2"
      shift 2
      ;;
    --model=*)
      CODEX_MODEL="${1#*=}"
      shift
      ;;
    --reasoning-effort)
      CODEX_REASONING_EFFORT="$2"
      shift 2
      ;;
    --reasoning-effort=*)
      CODEX_REASONING_EFFORT="${1#*=}"
      shift
      ;;
    *)
      # Assume it's max_iterations if it's a number
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

# Validate tool choice
if [[ "$TOOL" != "amp" && "$TOOL" != "claude" && "$TOOL" != "codex" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp', 'claude', or 'codex'."
  exit 1
fi

if [[ -n "$CODEX_REASONING_EFFORT" && "$CODEX_REASONING_EFFORT" != "low" && "$CODEX_REASONING_EFFORT" != "medium" && "$CODEX_REASONING_EFFORT" != "high" && "$CODEX_REASONING_EFFORT" != "xhigh" ]]; then
  echo "Error: Invalid reasoning effort '$CODEX_REASONING_EFFORT'. Must be low, medium, high, or xhigh."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
LOG_DIR="$SCRIPT_DIR/tmp/ralph"
CODEX_PROMPT_FILE="$SCRIPT_DIR/CODEX.md"

resolve_codex_bin() {
  if command -v codex >/dev/null 2>&1; then
    command -v codex
    return 0
  fi

  local app_bin="/Applications/Codex.app/Contents/Resources/codex"
  if [ -x "$app_bin" ]; then
    echo "$app_bin"
    return 0
  fi

  return 1
}

pending_story_count() {
  if [ ! -f "$PRD_FILE" ]; then
    echo ""
    return 1
  fi

  jq '[.userStories[] | select(.passes == false)] | length' "$PRD_FILE" 2>/dev/null || return 1
}

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")
  
  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    # Archive the previous run
    DATE=$(date +%Y-%m-%d)
    # Strip "ralph/" prefix from branch name for folder
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"
    
    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"
    
    # Reset progress file for new run
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

mkdir -p "$LOG_DIR"

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"
if [[ -n "$CODEX_MODEL" ]]; then
  echo "Codex model override: $CODEX_MODEL"
fi
if [[ -n "$CODEX_REASONING_EFFORT" ]]; then
  echo "Codex reasoning effort override: $CODEX_REASONING_EFFORT"
fi

for i in $(seq 1 $MAX_ITERATIONS); do
  TIMESTAMP=$(date +"%Y%m%d-%H%M%S-%Z")
  ITERATION_LABEL=$(printf "%03d" "$i")
  LOG_FILE="$LOG_DIR/${TIMESTAMP}.iter-${ITERATION_LABEL}.${TOOL}.log"

  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="
  echo "  Log file: $LOG_FILE"

  # Run the selected tool with the ralph prompt
  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cat "$SCRIPT_DIR/prompt.md" | amp --dangerously-allow-all 2>&1 | tee "$LOG_FILE" /dev/stderr) || true
  elif [[ "$TOOL" == "claude" ]]; then
    # Claude Code: use --dangerously-skip-permissions for autonomous operation, --print for output
    OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/CLAUDE.md" 2>&1 | tee "$LOG_FILE" /dev/stderr) || true
  else
    if ! CODEX_BIN=$(resolve_codex_bin); then
      echo "Error: Could not find codex executable in PATH or at /Applications/Codex.app/Contents/Resources/codex" | tee "$LOG_FILE"
      exit 1
    fi

    if [ ! -f "$CODEX_PROMPT_FILE" ]; then
      echo "Error: Missing Codex prompt file at $CODEX_PROMPT_FILE" | tee "$LOG_FILE"
      exit 1
    fi

    CODEX_CMD=( "$CODEX_BIN" exec -C "$SCRIPT_DIR" --dangerously-bypass-approvals-and-sandbox )
    if [[ -n "$CODEX_MODEL" ]]; then
      CODEX_CMD+=( -m "$CODEX_MODEL" )
    fi
    if [[ -n "$CODEX_REASONING_EFFORT" ]]; then
      CODEX_CMD+=( -c "model_reasoning_effort=\"$CODEX_REASONING_EFFORT\"" )
    fi

    OUTPUT=$("${CODEX_CMD[@]}" < "$CODEX_PROMPT_FILE" 2>&1 | tee "$LOG_FILE" /dev/stderr) || true
  fi

  if [ ! -f "$LOG_FILE" ]; then
    echo "Error: Expected iteration log was not created: $LOG_FILE"
    exit 1
  fi
  
  # Primary completion check: the source of truth is prd.json, not a raw log grep.
  if REMAINING_STORIES="$(pending_story_count)"; then
    if [ "$REMAINING_STORIES" -eq 0 ]; then
      echo ""
      echo "Ralph completed all tasks!"
      echo "Completed at iteration $i of $MAX_ITERATIONS"
      exit 0
    fi
  fi

  # Fallback completion signal: only trust the log marker if prd.json says nothing remains.
  if grep -q "<promise>COMPLETE</promise>" "$LOG_FILE" && REMAINING_STORIES="$(pending_story_count)" && [ "$REMAINING_STORIES" -eq 0 ]; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi
  
  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
