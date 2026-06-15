<img width="200" src="./docs/icon.png" />

# 将棋定跡暗記アプリ

本アプリは、オープンソースの将棋 GUI アプリである[ShogiHome](https://github.com/sunfish-shogi/shogihome) をベースに、将棋の定跡を効率よく暗記・学習できるようにカスタマイズしたアプリケーションです。

## 主な変更点

### 1. 定跡問題を解く
- YAML形式の問題集ファイルを読み込み、盤面上で実際に指しながら定跡を記憶するモードです。
- 指した手が正解手であれば次の手順に進みます。相手の手番は自動的に進行します。
- 分からない場合は次の手を見れます。
- 棋譜コメントを設定していれば、ヒントとしてコメントも読めます。
- 各問題・全問題を解く際の持ち時間・秒読み・フィッシャーも設定できます。
- 各問題・全問題を解いた際は正解数・不正解数・正解率、次の手・ヒント使用回数が統計として表示されます。

### 2. 定跡問題を作る
- YAML形式の問題集ファイルを作成でき、問題集名・手番、各問題では手順と問題名を設定できます。
- GUIを動かして各分岐を問題として登録可能です。
- 棋譜ファイルを読み込み、そこから問題の追加・編集もできます。

### 3. その他
- 定跡暗記に不要な機能（対局・検討・USIなど）はプロジェクトをシンプルにするために削除しています。

---

## 開発と実行方法

### 必要な環境
- Node.js (推奨: v18以上)

### セットアップ
```bash
git clone https://github.com/<YOUR_ACCOUNT>/shogi_memory.git
cd shogi_memory
npm ci
```

### 起動方法
```bash
# Electron デスクトップアプリの起動（開発モード）
npm run electron:serve

# Web版の起動
npm run serve
# ブラウザで http://localhost:5173 を開いてください。
# モバイル表示: http://localhost:5173/?mobile
```

### ビルド
```bash
# デスクトップアプリのビルド（インストーラー生成）
npm run electron:build

# Web版アプリのビルド
npm run build
```

### コードチェック (Lint)
```bash
npm run lint
```

## ライセンス

### アプリ

[MIT License](LICENSE)（Shogihomeのライセンスに帰属します）

### アイコン画像

[/public/icon](https://github.com/sunfish-shogi/shogihome/tree/main/public/icon) 配下のアイコン画像は [Material Icons](https://google.github.io/material-design-icons/) を使用しています。
これには [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) が適用されます。