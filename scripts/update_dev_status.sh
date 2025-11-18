#!/usr/bin/env bash
# スプリント終了時に DEV_STATUS を起票する簡易スクリプト
# usage: ./scripts/update_dev_status.sh "スプリント名"

set -e
SPRINT_NAME="$1"
if [ -z "$SPRINT_NAME" ]; then
  echo "Usage: $0 \"Sprint name\""
  exit 1
fi
DATE=$(date +%F)
DIR="docs/sprints"
mkdir -p "$DIR"
FILE="$DIR/$DATE-$(echo $SPRINT_NAME | tr ' ' '_' | tr -cd '[:alnum:]_').md"
cp "docs/スプリント記録テンプレート.md" "$FILE"
# Replace header
sed -i.bak "s/Sprint name:/Sprint name: $SPRINT_NAME/" "$FILE"
sed -i.bak "s/期間: yyyy-mm-dd ～ yyyy-mm-dd/期間: $DATE/" "$FILE"
rm -f "$FILE.bak"

git add "$FILE"
git commit -m "docs: add sprint notes $SPRINT_NAME"

echo "Created $FILE and committed. Please push your branch."
