# 妖怪大福帳 公開・更新ガイド

## おすすめ構成

`GitHub + Netlify` で公開するのがおすすめです。

- GitHub: アプリのファイルを保管する場所
- Netlify: HTTPSの正式URLを作って公開する場所
- Supabase: PC/スマホ同期を使う場合のデータ保管場所

このアプリは静的ファイルだけで動くので、ビルド作業は不要です。

`GitHub Pages` でも公開できます。GitHubだけで完結したい場合はGitHub Pagesが向いています。

## 初回公開手順

1. GitHubで新しいリポジトリを作る
2. このフォルダ内のファイルをGitHubへアップロードする
3. Netlifyで `Add new site` からGitHubリポジトリを選ぶ
4. Build settingsは次の通りにする
   - Build command: 空欄
   - Publish directory: `.`
5. Deployする
6. Netlifyで発行された `https://xxxxx.netlify.app` をスマホで開く
7. スマホの共有メニューからホーム画面に追加する

## GitHub Pagesで公開する場合

1. GitHubで新しいリポジトリを作る
2. このフォルダ内のファイルをGitHubへアップロードする
3. リポジトリの `Settings` を開く
4. `Pages` を開く
5. Sourceを `Deploy from a branch` にする
6. Branchを `main`、folderを `/root` にする
7. 保存すると `https://ユーザー名.github.io/リポジトリ名/` のURLが発行される

GitHub上でファイルを編集してCommitすると、GitHub Pagesにも更新が反映されます。

## メンバーに共有するとき

メンバーにはNetlifyのURLだけ共有します。

各メンバーは自分のスマホで自分の分だけ入力します。データは基本的にそのスマホのブラウザ内に保存されます。

Supabase同期を使う場合は、各メンバーが別々の `自分専用同期ID` を使います。同じ同期IDを使うと、同じデータとして同期されます。

管理者とユーザーを分けて運用する詳しいルールは `ADMIN_OPERATIONS.md` にまとめています。

## 自分のPCとスマホを同期する場合

1. PC側で `データ` タブを開く
2. Supabase URL / anon key / 自分専用同期IDを保存する
3. `クラウドへ保存` を押す
4. スマホ側でも同じ設定を入れる
5. スマホで `クラウドから読み込み` を押す

同じ人のPCとスマホは同じ同期IDを使います。別メンバーとは同期IDを分けます。

## 更新方法

軽い文言修正ならGitHub上で直接ファイルを編集できます。

- 画面の文字: `index.html`
- 見た目や色: `style.css`
- 計算や保存処理: `app.js`
- ホーム画面アイコン: `icon.svg`

GitHubで編集して `Commit changes` すると、Netlifyが自動で新しいURLへ反映します。

## 更新時の注意

画面やJSを変更したのにスマホで古い表示が残るときは、キャッシュ対策として次の2つを同じ番号に上げます。

1. `index.html` の `?v=8` の数字
2. `sw.js` の `CACHE_NAME` の数字

例:

```html
<link rel="stylesheet" href="style.css?v=9" />
<script src="app.js?v=9"></script>
```

```js
const CACHE_NAME = "hyakki-ledger-v9";
```

## データを消さないために

アプリのファイルを更新しても、スマホ内の売上データは基本的に消えません。ただし、念のため大きな変更前には `データ` タブから `JSONバックアップ` を保存してください。

## 公開に向けて最後に決めること

- Netlifyのサイト名
- GitHubリポジトリ名
- Supabase同期を全員に使わせるか、自分だけ使うか
- 各メンバーの同期IDの命名ルール
