# コントリビューション・Gitワークフロー

このプロジェクトでの共同開発・ドキュメントの更新ルールを記載します。

## 一、ブランチ戦略
- main: リリース用。安定版のみマージ。
- develop: 日々の開発・統合用ブランチ。feature/* をこのブランチへマージ。
- feature/<name>: 機能追加用。1機能につき1ブランチ。PRを作成し、レビューの上でdevelopにマージ。
- release/*: リリース準備

## 二、コミットメッセージ規約
- 日本語でOKだが、最初に英語の短いヘッダを付けるとよい。
- 例: "feat(balancer): バランスチャレンジの閾値を調整"
- プレフィックス候補:
  - feat: 新機能
  - fix: バグ修正
  - docs: ドキュメント更新
  - chore: ビルド/設定/雑多
  - refactor: リファクタ
  - perf: パフォーマンス改善

## 三、DEV_STATUS.mdの更新ルール（必須）
- 各スプリントの完成時に `docs/スプリント記録テンプレート.md` をコピーして、`docs/sprints/YYYY-MM-DD_<short-name>.md` というファイル名で追加する。
- もしくは `docs/開発状況.md` の末尾に要約を追加して、コミットメッセージは `docs: update DEV_STATUS for sprint X` としてください。
- 実機テスト結果は `docs/開発状況.md` の "実機テスト" セクションへ日付/デバイス/結果を追記してください。

## 四、プルリクエストとレビュー
- Pull Request のタイトルは English/Japan の簡潔な要約をつける。
- レビューコメントが出たら、ファイルを更新して push してください。
- マージは少なくとも1名の承認を得た後に行う。

## 五、スタイルとLint
- JavaScript は `'use strict'` で実装。ESLint を導入予定（次スプリント）

## 六、便利なGitコマンド（Mac/Zsh）
- ステージング全部:

```bash
git add -A
```

- コミット(例) :

```bash
git commit -m "feat: add balance UI and sensor handling"
```

- プルリク用ブランチ例:

```bash
git checkout -b feature/balance-ui
```

- push:

```bash
git push origin feature/balance-ui
```

## DEV_STATUS自動追記スクリプト（簡易）
スプリント完了時に `scripts/update_dev_status.sh` を実行するとテンプレートで `docs/sprints/` にファイルを作ってコミットを準備します。

---
