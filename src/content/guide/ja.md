CrowfootはブラウザでERDを描き、チームで一緒に編集し、データベースに反映するツールです。このガイドでは、画面のどこに何があるかから始めて、すべての機能を順に説明します。画面の図にあるデータは、説明のために作った例です。

## 1. 画面構成をひと目で見る

Crowfootの画面は大きく3種類あります。

| 画面 | 開き方 | できること |
|---|---|---|
| アプリ画面 | ログインすると開きます | ワークスペース、ドキュメント一覧、メンバー、データベース、チーム、コミュニティ |
| エディタ | ドキュメント一覧でドキュメントを押すと新しいウィンドウで開きます | ERDの作図、標準の管理、SQL生成、共有、バージョン履歴 |
| データブラウザ | 接続のデータを見るボタンを押すと新しいウィンドウで開きます | 実際のデータの参照、行の編集、SQLの実行 |

### 1.1 アプリ画面の上部メニュー

![アプリ画面の上部メニュー](/guide-assets/ja/shell-header.webp)

左から順に次のように並んでいます。

| 位置 | 名前 | 説明 |
|---|---|---|
| 左 | ロゴ | ダッシュボードに移動します |
| 左 | **{{shell.nav.workspaces}}** | ワークスペースとその中のERDドキュメント |
| 左 | **{{shell.nav.teams}}** | チームを作り、メンバーを管理します |
| 左 | **{{shell.nav.community}}** | リリースノート、フィードバック、自分のコメント、いいねしたドキュメント、通知 |
| 左 | **{{shell.nav.admin}}** | 管理者アカウントにだけ表示されます |
| 左 | **{{guide.title}}** | このガイドを新しいウィンドウで開きます |
| 右 | **{{shell.nav.home}}** | スタートページ(紹介画面)に移動します |
| 右 | 太陽のアイコン | ライト表示とダーク表示を切り替えます |
| 右 | 地球のアイコン | 言語を切り替えます({{common.language.ko}}, {{common.language.en}}, {{common.language.ja}}, {{common.language.zh}}) |
| 右 | ベルのアイコン | 通知。未読の通知数が赤い数字で付きます |
| 右 | 自分の名前 | マイプロフィール、言語、ログアウト |

### 1.2 左のサイドバー

上部メニューで選んだ項目に応じて、左のサイドバーの内容が変わります。

| 上部メニュー | サイドバーに出るもの |
|---|---|
| **{{shell.nav.workspaces}}** | **{{shell.sidebar.newWorkspace}}** ボタン、**{{shell.sidebar.mine}}**、**{{shell.sidebar.shared}}** |
| **{{shell.nav.teams}}** | **{{shell.sidebar.newTeam}}** ボタン、**{{shell.sidebar.ownedTeams}}**、**{{shell.sidebar.joinedTeams}}** |
| **{{shell.nav.community}}** | **{{shell.sidebar.communityReleaseNotes}}**、**{{shell.sidebar.communityFeedback}}**、**{{shell.sidebar.communityMyComments}}**、**{{shell.sidebar.communityMyLikes}}**、**{{shell.sidebar.communityNotifications}}** |
| **{{shell.nav.admin}}** | **{{shell.sidebar.adminUsers}}**、**{{shell.sidebar.adminCodes}}**、**{{shell.sidebar.adminManaged}}**、**{{shell.sidebar.adminSystemTerms}}**、**{{shell.sidebar.adminAuditLogs}}**、**{{shell.sidebar.adminTraffic}}** |

### 1.3 エディタウィンドウ

![エディタの全体画面](/guide-assets/ja/editor-overview.webp)

| 位置 | 内容 |
|---|---|
| 最上部 | ドキュメント名、対象DBMS、バージョン番号、最後に保存した人と時刻、**{{model.viewer.close}}** |
| ツールバー | エクスプローラー、用語辞書、検証、元に戻す、保存、自動レイアウト、SQL生成、共有、書き出し、ツール、表示、拡大と縮小 |
| 中央 | キャンバス。テーブル、リレーション線、メモ、グループが置かれます |
| 右下 | ミニマップとドキュメントチャットのボタン |
| 最下部 | **ERD** タブと **{{shareViewer.tab.comments}}** タブ |

ツールバーのボタンは5 節で1つずつ説明します。

### 1.4 データブラウザウィンドウ

![データブラウザ](/guide-assets/ja/data-tab.webp)

| 位置 | 内容 |
|---|---|
| 最上部 | 接続名、DBMS、接続先アドレス、テーマと言語、**{{database.close}}** |
| 左 | テーブルとビューの一覧、検索欄、再読み込み |
| 右上 | 選んだテーブルの名前と **{{database.tabs.data}}**、**{{database.tabs.structure}}**、**{{database.tabs.sql}}** タブ |
| 右 | タブの内容 |

## 2. はじめに

### 2.1 ログイン

![ログイン画面](/guide-assets/ja/login.webp)

1. スタートページでログインボタンを押します。
2. 利用規約を読み、同意欄にチェックを入れます。チェックを入れるとログインボタンが有効になります。
3. GitHubまたはGoogleアカウントで続行します。別途の登録手続きはありません。

しばらく使わないでいると **{{auth.sessionExpired.title}}** ウィンドウが表示されます。**{{auth.sessionExpired.loginAgain}}** を押してください。

### 2.2 ダッシュボード

![ダッシュボード](/guide-assets/ja/dashboard.webp)

ログインするとダッシュボードが開きます。

* 上の数字カードは、自分のワークスペース数、自分のチーム数、メンバーとして参加しているワークスペース数です。
* **{{dashboard.shortcuts}}** のカードを押すと、そのワークスペースに移動します。
* **{{dashboard.myTeams}}** のカードを押すと、そのチームに移動します。
* **{{community.recent.title}}** には、リリースノートとフィードバックの投稿が新しい順に出ます。
* 右上の **{{dashboard.newWorkspace}}** ボタンでワークスペースを作ります。

### 2.3 マイプロフィール、言語、テーマ

![ユーザーメニュー](/guide-assets/ja/shell-user-menu.webp)

右上の自分の名前を押すと、名前、メールアドレス、連携アカウント、登録日が表示されます。同じメニューで言語を切り替え、ログアウトします。言語は地球のアイコンでも切り替えられます。選んだ言語は、次に開いたときもそのままです。

## 3. ワークスペース

ワークスペースは、ERDドキュメント、データベース接続、用語辞書、ドメインタイプを入れる場所です。メンバーと権限もワークスペース単位で決めます。

### 3.1 作成する

![新規ワークスペース](/guide-assets/ja/workspace-create.webp)

サイドバーの **{{shell.sidebar.newWorkspace}}** を押して名前を入力します。作った人がオーナーになります。

### 3.2 ワークスペースのタブ

ワークスペースを開くと、名前の下にタブが5つあります。

| タブ | 内容 |
|---|---|
| **{{workspace.detail.tabs.erd}}** | ERDドキュメントの一覧。ドキュメントを作り、開き、削除します |
| **{{workspace.detail.tabs.database}}** | サービス提供データベースとデータベース接続 |
| **{{workspace.detail.tabs.overview}}** | 名前、説明、作成者、メンバー数、作成日 |
| **{{workspace.detail.tabs.members}}** | メンバーとロール |
| **{{workspace.detail.tabs.settings}}** | 名前と説明の編集、ワークスペースの削除。オーナーにだけ表示されます |

### 3.3 ERDタブ — ドキュメント一覧

![ドキュメント一覧](/guide-assets/ja/workspace-erd.webp)

* 検索欄にドキュメントの名前や説明を入力して探します。
* ドキュメント名を押すと、エディタが新しいウィンドウで開きます。
* 一覧の列は、ドキュメント名、DBの種類、バージョン、作成者、最終更新です。
* 上の5つのボタンでドキュメントを作ります。4 節で説明します。

![ドキュメント行のメニュー](/guide-assets/ja/document-row-menu.webp)

行の右端にある3点ボタンを押すと、**{{model.list.menu.edit}}** と **{{model.list.menu.delete}}** が出ます。データベースに接続していないドキュメントには **{{model.list.menu.connect}}** も出ます。削除したドキュメントは元に戻せません。

### 3.4 メンバータブ — メンバーとロール

![メンバータブ](/guide-assets/ja/workspace-members.webp)

ロールは4種類です。

| ロール | できること |
|---|---|
| {{common.role.OWNER}} (OWNER) | すべての操作。メンバー管理、ワークスペースの設定と削除 |
| {{common.role.EDITOR}} (EDITOR) | ドキュメントの作成と編集、辞書とドメインタイプの編集 |
| {{common.role.COMMENTER}} (COMMENTER) | ドキュメントの閲覧とコメント |
| {{common.role.VIEWER}} (VIEWER) | ドキュメントの閲覧 |

![メンバーを追加](/guide-assets/ja/member-add.webp)

**{{workspace.members.addButton}}** を押すと、ユーザー1人またはチームを選べます。

* **{{workspace.members.addDialog.targetUser}}**: 名前またはメールアドレスを2文字以上入力して探します。
* **{{workspace.members.addDialog.targetTeam}}**: チームにロールを与えると、そのチームの全メンバーが同じロールになります。
* オーナーのロールは与えられません。
* 一覧でロールを変えるか、**{{workspace.members.revoke}}** で権限を取り消します。

### 3.5 概要タブと設定タブ

![概要タブ](/guide-assets/ja/workspace-overview.webp)

概要タブには、ワークスペースの基本情報が表示されます。

![設定タブ](/guide-assets/ja/workspace-settings.webp)

設定タブで名前と説明を編集します。**{{workspace.detail.settings.dangerZone}}** の **{{workspace.detail.settings.deleteButton}}** は、ワークスペースとその中のドキュメントをすべて削除します。元に戻せません。

## 4. ERDドキュメントを作る

ドキュメントを作る方法は5つあります。どれもERDタブの上にあるボタンです。

| ボタン | 使う場面 |
|---|---|
| **{{model.list.newDocument}}** | 空のドキュメントから自分で描くとき |
| **{{model.templates.openButton}}** | 例のドキュメントをコピーして始めるとき |
| **{{sqlImport.openButton}}** | CREATE TABLEスクリプトがあるとき |
| **{{reverse.openButton}}** | 既存のデータベースの構造を読み込むとき |
| **{{model.import.button}}** | 書き出したドキュメントファイル(.crown)を取り込み直すとき |

### 4.1 新規ERDドキュメント

![新規ERDドキュメント](/guide-assets/ja/document-create.webp)

名前とデータベースの種類を選びます。データベースの種類はドキュメントを作るときに決まり、あとから変更できません。別の種類に移すには、エディタの **{{model.editor.toolbar.dbmsConvert}}** を使います(10.5 節)。

### 4.2 テンプレートから始める

![テンプレートから始める](/guide-assets/ja/document-template.webp)

用意された例のドキュメントから1つ選び、自分のワークスペースにコピーします。**{{model.templates.preview}}** で先に開いて確認できます。

### 4.3 SQLを取り込む

![SQLを取り込む](/guide-assets/ja/document-sql-import.webp)

1. データベースの種類とドキュメント名を入力します。
2. CREATE TABLEスクリプトを貼り付けるか、**{{sqlImport.readFile}}** でファイルを読み込みます。ファイルは1MBまでです。
3. **{{sqlImport.preview}}** を押すと、読み取ったテーブル数とリレーション数、読み取れなかった文が表示されます。
4. **{{sqlImport.submit}}** を押します。

データベースに接続せず、スクリプトだけでドキュメントを作る方法です。

### 4.4 DBから取り込む

![DBから取り込む](/guide-assets/ja/document-reverse.webp)

登録した接続を選ぶと、そのデータベースのテーブル、カラム、キー、リレーション、コメントを読み取ってドキュメントを作ります。カラムのコメントは論理名として入ります。こうして作ったドキュメントはその接続に紐付けられ、**{{model.editor.toolbar.sync}}** を使えます。接続は先にデータベースタブで登録します(10.1 節)。

### 4.5 ドキュメントファイル(.crown)を取り込む

エディタの **{{model.editor.toolbar.export}}** › **{{model.editor.toolbar.crown}}** でダウンロードしたファイルを、もう一度ドキュメントにします。別のワークスペースにドキュメントを移すときや、バックアップから復元するときに使います。

## 5. エディタ画面とツールバー

![エディタのツールバー](/guide-assets/ja/editor-toolbar.webp)

### 5.1 ツールバーのボタン

左から順に説明します。

| ボタン | 説明 |
|---|---|
| **{{model.editor.explorer.toggle}}** | 左側のモデルエクスプローラーを開閉します(5.2 節) |
| **{{model.editor.termDictionary.toggle}}** | 用語辞書とドメインタイプのパネルを開閉します(9 節) |
| **{{model.validation.toggle}}** | 設計検証パネルを開閉します。問題の件数が数字で付きます(12 節) |
| {{model.editor.toolbar.undo}}、{{model.editor.toolbar.redo}} | 編集を1段階ずつ元に戻し、やり直します |
| **{{model.editor.toolbar.save}}** | 今すぐ保存します。編集すると、少しあとに自動でも保存されます |
| **{{model.editor.toolbar.autoLayoutLayered}}** | テーブルを自動で並べ直します。横の矢印で方式と向きを選びます(5.3 節) |
| **{{model.editor.toolbar.ddl}}** | ドキュメントをSQLスクリプトにします(10.2 節) |
| **{{model.editor.toolbar.share}}** | 読み取り専用の共有リンクを作ります(13 節) |
| **{{model.editor.toolbar.export}}** | 画像とドキュメントファイルとしてダウンロードします(5.4 節) |
| **{{model.editor.toolbar.tools}}** | 論理名推論、DB同期、データを見る、別のDBMSに複製、ドメインタイプ、バージョン履歴(5.5 節) |
| DBMSバッジ | ドキュメントの対象DBMS。押すと **{{model.editor.toolbar.dbmsConvert}}** ウィンドウが開きます |
| **{{model.editor.toolbar.view}}** | カラム名の表示、カラム表示、グループ表示を選びます(5.6 節) |
| − 数字 + | 縮小、現在の倍率、拡大 |
| 四隅のアイコン | **{{model.editor.toolbar.fit}}**。ドキュメント全体が画面に収まるように合わせます |
| キーボードのアイコン | **{{model.editor.shortcuts.open}}** (19 節) |
| はてなマークのアイコン | この利用ガイドを新しいウィンドウで開きます |
| 太陽のアイコン | ライト表示とダーク表示を切り替えます |

読み取り専用のロールで開くと、編集ボタンが無効になり、**{{model.editor.toolbar.readOnly}}** の表示が付きます。

### 5.2 エクスプローラー(モデルエクスプローラー)

![エクスプローラー](/guide-assets/ja/editor-explorer.webp)

* ドキュメントのテーブル、リレーション、メモをツリー形式の一覧で表示します。テーブルはグループごとにまとまります。
* 検索欄に入力すると、テーブル、カラム、リレーション、メモから探します。`Ctrl/Cmd+F` ですぐ検索欄に移動します。
* 項目を押すと、キャンバスがそのオブジェクトに移動し、オブジェクトが選択されます。
* グループ行の目のアイコンはそのグループだけを表示、鉛筆のアイコンはグループの編集、ごみ箱のアイコンはグループの削除です。

### 5.3 自動レイアウト

![自動レイアウトのメニュー](/guide-assets/ja/editor-menu-layout.webp)

ボタンを押すと、選んだ方式でテーブルを並べ直します。矢印を押すと方式と向きを選べます。選ぶとすぐに実行されます。

| 項目 | 説明 |
|---|---|
| **{{model.editor.toolbar.autoLayoutLayered}}** | 親から子へ層に分けて並べます。ほとんどのドキュメントに合います |
| **{{model.editor.toolbar.autoLayoutHub}}** | リレーションの多いテーブルを中央に置き、その周りに並べます |
| **{{model.editor.toolbar.autoLayoutHybrid}}** | 2つの方式を組み合わせます |
| **{{model.editor.toolbar.autoLayoutDown}}** | 親が上、子が下 |
| **{{model.editor.toolbar.autoLayoutRight}}** | 親が左、子が右 |

* 大きなドキュメントは計算に数秒かかります。計算中も画面は止まらず、**{{model.editor.toolbar.autoLayoutCancel}}** で中止できます。
* 結果が気に入らなければ、元に戻す1回で元の位置に戻ります。
* メモは関連テーブルの近くに置かれます。

### 5.4 書き出しメニュー

![書き出しメニュー](/guide-assets/ja/editor-menu-export.webp)

| 項目 | 説明 |
|---|---|
| **{{model.editor.image.viewport}}** | 今画面に見えている部分をPNG画像としてダウンロードします |
| **{{model.editor.image.document}}** | ドキュメント全体を1枚のPNG画像としてダウンロードします |
| **{{model.editor.toolbar.crown}}** | ドキュメントを.crownファイルとしてダウンロードします。**{{model.import.button}}** で取り込み直せます |

### 5.5 ツールメニュー

![ツールメニュー](/guide-assets/ja/editor-menu-tools.webp)

| 項目 | 説明 | 詳しくは |
|---|---|---|
| **{{model.editor.toolbar.logicalNames}}** | 空の論理名を辞書で埋めます | 9.7 節 |
| **{{model.editor.toolbar.sync}}** | 接続されたデータベースとドキュメントを比較して合わせます。接続されたドキュメントにだけ表示されます | 10.4 節 |
| **{{database.openShort}}** | 接続されたデータベースのデータブラウザを新しいウィンドウで開きます | 11 節 |
| **{{model.editor.toolbar.dbmsConvert}}** | 対象DBMSだけが異なる新しいドキュメントを作ります | 10.5 節 |
| **{{model.editor.domainType.menu}}** | ドメインタイプの一覧を開きます | 9.3 節 |
| **{{model.editor.toolbar.history}}** | 保存履歴を見て、比較し、元に戻します | 14 節 |

### 5.6 表示メニュー

![表示メニュー](/guide-assets/ja/editor-menu-view.webp)

| まとまり | 項目 | 説明 |
|---|---|---|
| **{{model.editor.toolbar.nameMode.label}}** | {{model.editor.toolbar.nameMode.physical}}、{{model.editor.toolbar.nameMode.logical}}、{{model.editor.toolbar.nameMode.both}} | カラム名をどの名前で表示するかを選びます |
| **{{model.editor.toolbar.columnMode.label}}** | {{model.editor.toolbar.columnMode.all}}、{{model.editor.toolbar.columnMode.keys}} | キーのみを選ぶとPKとFKのカラムだけが表示され、大きなドキュメントをひと目で見渡せます |
| **{{model.editor.toolbar.areaFilter.label}}** | {{model.editor.toolbar.areaFilter.all}}、グループ名 | 選んだグループのテーブルだけが表示されます |

表示の設定は画面の見え方だけを変えます。ドキュメントは変わりません。

### 5.7 キャンバスを動かす

* 空いている場所をドラッグするか、`Space` を押したままドラッグすると画面が動きます。
* マウスホイールまたはツールバーの − + で拡大・縮小します。
* 右下のミニマップを押すと、その位置に移動します。
* `Shift` を押したままオブジェクトを押すと、複数のオブジェクトを一緒に選べます。`Ctrl/Cmd+A` はすべて選択です。

## 6. テーブルとカラム

### 6.1 テーブルを作る

![空いている場所の右クリックメニュー](/guide-assets/ja/editor-context-canvas.webp)

キャンバスの空いている場所を右クリックして **{{model.editor.contextMenu.createTable}}** を選びます。クリックした位置にテーブルができます。

### 6.2 テーブルの見た目

![テーブル](/guide-assets/ja/editor-table.webp)

| 位置 | 説明 |
|---|---|
| 色の帯 | テーブルの論理名。帯をドラッグするとテーブルが動きます |
| 名前の行 | テーブルの物理名。押してその場で編集します。右の ⓘ は **{{model.editor.table.info}}** です |
| カラムの行 | 左の6つの点をドラッグして順番を変えます。鍵のアイコンは主キーの印です |
| カラム名 | 上が物理名、下が論理名。押してその場で編集します |
| 型、長さ | データ型と長さ(または精度とスケール)。押して編集します |
| **NN** | NOT NULL。押してオン・オフを切り替えます。主キーのカラムは常にオンです |
| **AI** | 自動採番。主キーで、かつ整数型のときだけオンにできます |
| **FK** | 外部キーのカラム。リレーションが作ったカラムです |
| **D** | ドメインタイプを使うカラム(9.4 節) |
| × | カラムの削除 |
| **{{model.editor.table.addColumn}}** | いちばん下にカラムを追加します |
| **{{model.editor.key.addUnique}}**、**{{model.editor.key.addIndex}}** | ユニークキーとインデックスを作ります(6.5 節) |
| 枠の点 | リレーションを始めるハンドル(7.1 節) |

主キーのカラムは常にいちばん上に集まります。

### 6.3 カラム情報

![カラム情報](/guide-assets/ja/editor-column-info.webp)

カラム名をダブルクリックすると **{{model.editor.columnInfo.title}}** ウィンドウが開きます。テーブル上では直接編集できない属性まで、1か所で編集できます。

| 項目 | 説明 |
|---|---|
| {{model.editor.columnInfo.physicalName}} | データベースに作られるカラム名 |
| {{model.editor.columnInfo.logicalName}} | 人が読む名前。SQLを生成するときにCOMMENTとして出力されます |
| {{model.editor.columnInfo.pk}} | オンにするとNOT NULLになり、カラムがいちばん上に移動します |
| {{model.editor.columnInfo.nullable}} | NULLを受け付けるかを決めます |
| {{model.editor.columnInfo.autoIncrement}} | 主キーで、かつINT、BIGINT、SMALLINTのときだけオンにできます |
| {{model.editor.domainType.label}} | ドメインタイプを選ぶと、型、長さ、NULL許可、デフォルト値がその値で埋まります(9.4 節) |
| {{model.editor.columnInfo.dataType}}、{{model.editor.columnInfo.length}} | 型に応じて、長さ、または精度とスケールの欄が表示されます |
| {{model.editor.columnInfo.defaultValue}} | 例: `0`、`NOW()` |
| {{model.editor.columnInfo.comment}} | カラムの説明 |

型の名前はDBMSに合わせて表示されます。たとえば日時の型は、PostgreSQLのドキュメントではTIMESTAMP、MySQLのドキュメントではDATETIMEと表示されます。

### 6.4 テーブル情報

![テーブル情報](/guide-assets/ja/editor-table-info.webp)

テーブルの ⓘ を押すか、右クリックメニューで **{{model.editor.contextMenu.tableInfo}}** を選びます。物理名、論理名、説明、色を決めます。グループに属するテーブルは、グループの色が優先されます。

### 6.5 ユニークキーとインデックス

![インデックスを追加](/guide-assets/ja/editor-key-dialog.webp)

1. テーブルの下にある **{{model.editor.key.addUnique}}** または **{{model.editor.key.addIndex}}** を押します。
2. 名前を入力してカラムを選びます。選んだ順番が複合キーのカラム順になります。矢印で順番を変えます。
3. インデックスは、カラムごとに並び順(ASC、DESC)を決められます。

作ったキーは、テーブルの下に **UK**、**IX** の行として表示されます。行を押すと編集や削除ができます。リレーションを作ると、外部キーカラムのインデックスが自動で作られます。

## 7. リレーション

### 7.1 リレーションを作る

![リレーションを開始](/guide-assets/ja/editor-relation-picker.webp)

1. 親になるテーブルの枠にある点を押します。
2. **{{model.editor.relation.startMenu}}** ウィンドウで、リレーション種別、多重度、リレーションの種類を選びます。
3. 子になるテーブルを押します。自己参照の場合は同じテーブルを押します。`Esc` で中止します。

子テーブルに外部キーのカラムが自動で作られます。親テーブルに主キーがないと、リレーションは作れません。

| 選ぶもの | 選択肢 | 説明 |
|---|---|---|
| {{model.editor.relation.pickType}} | 1:N、1:1 | 1:1では、外部キーのカラムにユニークキーも一緒に作られます |
| {{model.editor.relation.childSide}} | {{model.editor.relationship.multiplicity_ZERO_OR_MORE}}、{{model.editor.relationship.multiplicity_ONE_OR_MORE}} | リレーション線の端の表記を決めます |
| {{model.editor.relation.parentSide}} | {{model.editor.relationship.multiplicity_EXACTLY_ONE}}、{{model.editor.relationship.multiplicity_ZERO_OR_ONE}} | ちょうど1なら外部キーがNOT NULL、0または1ならNULL許可 |
| {{model.editor.relation.pickKind}} | {{model.editor.relation.nonIdentifying}}、{{model.editor.relation.identifying}} | 識別関係では、外部キーが子の主キーに含まれます。実線で描かれます |

### 7.2 リレーションを編集する

![リレーションの右クリックメニュー](/guide-assets/ja/editor-context-relationship.webp)

リレーション線を右クリックすると、**{{model.editor.contextMenu.editRelationship}}** と **{{model.editor.contextMenu.removeRelationship}}** が出ます。リレーション線をダブルクリックしても編集ウィンドウが開きます。

![リレーションを編集](/guide-assets/ja/editor-relationship-dialog.webp)

| 項目 | 説明 |
|---|---|
| {{model.editor.relationship.mappingTitle}} | 親カラムごとに、つなぐ子カラムを選びます(7.3 節) |
| {{model.editor.relationship.type}} | 1:Nまたは1:1 |
| {{model.editor.relationship.fkName}} | 外部キー制約の名前 |
| {{model.editor.relationship.identifying}} | オンにすると、外部キーが子の主キーに含まれ、NOT NULLになります |
| {{model.editor.relationship.parentMultiplicity}}、{{model.editor.relationship.childMultiplicity}} | リレーション線の両端の表記 |
| ON DELETE、ON UPDATE | {{model.editor.relationship.action_NO_ACTION}}、{{model.editor.relationship.action_RESTRICT}}、{{model.editor.relationship.action_CASCADE}}、{{model.editor.relationship.action_SET_NULL}}、{{model.editor.relationship.action_SET_DEFAULT}} |
| **{{model.editor.relationship.remove}}** | リレーションを削除します |

### 7.3 カラムマッピングを変える

![カラムマッピング](/guide-assets/ja/editor-relationship-mapping.webp)

リレーションを作ると、外部キーのカラムが新しく作られます。既存のカラムを外部キーとして使いたいときは、カラムマッピングでそのカラムを選びます。

* 一覧から子テーブルの別のカラムを選ぶか、**{{model.editor.relationship.mappingNewColumn}}** を選びます。
* 選んだカラムの型が親カラムと異なる場合は、**{{model.editor.relationship.mappingAlignType}}** のチェック欄が表示されます。
* 使われなくなった以前の外部キーカラムは、**{{model.editor.relationship.mappingRemoveReleased}}** で一緒に削除できます。
* 同じ子カラムを2回選ぶことはできません。

## 8. メモ、グループ、コピー

### 8.1 メモ

![メモ](/guide-assets/ja/editor-note.webp)

* 空いている場所の右クリックメニューで **{{model.editor.contextMenu.createNote}}** を選びます。
* メモをダブルクリックすると内容を編集できます。上の帯をドラッグすると動きます。
* メモの編集ウィンドウで、タイトル、色、**{{model.editor.note.linkedTable}}** を決めます。メモをテーブルの上にドラッグ＆ドロップしても関連テーブルが決まります。
* 関連テーブルのあるメモは、自動レイアウトのときにそのテーブルの近くに置かれます。

### 8.2 グループ

![グループを編集](/guide-assets/ja/editor-group-dialog.webp)

グループはテーブルをテーマごとにまとめます。グループに属するテーブルには、グループの色の帯が付きます。

* テーブルを選び、右クリックメニューで **{{model.editor.contextMenu.createGroup}}** を押します。複数のテーブルを一緒に選んでもかまいません。
* **{{model.editor.contextMenu.addToGroup}}**、**{{model.editor.contextMenu.removeFromGroup}}** で出し入れします。
* **{{model.editor.contextMenu.editGroup}}** で、名前、説明、色、メンバーのテーブルを編集します。
* **{{model.editor.toolbar.view}}** メニューまたはエクスプローラーで、グループを1つだけ選んで表示できます。

### 8.3 テーブルの右クリックメニュー

![テーブルの右クリックメニュー](/guide-assets/ja/editor-context-table.webp)

| 項目 | 説明 |
|---|---|
| **{{model.editor.contextMenu.tableInfo}}** | テーブル情報ウィンドウを開きます |
| **{{model.editor.contextMenu.viewTableData}}** | 接続されたデータベースで、このテーブルのデータを見ます。接続されたドキュメントにだけ表示されます |
| **{{model.editor.contextMenu.copy}}** | 選んだオブジェクトをコピーします |
| **{{model.editor.contextMenu.duplicate}}** | すぐ隣に複製を作ります |
| **{{model.editor.contextMenu.createGroup}}**、**{{model.editor.contextMenu.addToGroup}}**、**{{model.editor.contextMenu.removeFromGroup}}**、**{{model.editor.contextMenu.editGroup}}** | グループの管理 |
| **{{model.editor.contextMenu.removeTable}}** | テーブルと、そのテーブルのリレーションを削除します |

### 8.4 コピー、貼り付け、複製

* `Ctrl/Cmd+C` でコピーし、`Ctrl/Cmd+V` で貼り付けます。`Ctrl/Cmd+D` は複製です。
* 複数のテーブルを一緒にコピーすると、その間のリレーションも一緒にコピーされます。
* 貼り付けたテーブルには、名前が重ならないように別の名前が自動で付きます。
* 同じブラウザで開いた別のドキュメントにも貼り付けられます。内容がとても大きい場合は、同じドキュメント内にだけ貼り付けられます。
* 空いている場所の右クリックメニューで **{{model.editor.contextMenu.paste}}** を選ぶと、クリックした位置に貼り付けられます。

## 9. 標準 — 単語、用語、ドメインタイプ

カラムの名前と型がドキュメントごとにばらばらにならないよう、ワークスペースで標準を決めておきます。標準は3種類です。

| 標準 | 決めること | 例 |
|---|---|---|
| 単語 | 名前の部分1つとその意味 | `user` → 会員、`email` → メール |
| 用語 | カラム名全体とその意味、使う型 | `user_email` → 会員 メール、ドメインタイプ「メール」 |
| ドメインタイプ | 複数のカラムが共通で使う型の定義 | メール = VARCHAR(191)、NOT NULL |

単語と用語は同じ辞書に登録します。ドメインタイプを指しているか、型を書いた項目が用語で、そうでない項目が単語です。標準は、ワークスペースのすべてのドキュメントが共通で使います。

### 9.1 標準パネルを開く

ツールバーの **{{model.editor.termDictionary.toggle}}** を押すと、左側にパネルが開きます。タブは3つです。

| タブ | 内容 |
|---|---|
| **{{model.editor.termDictionary.tabStandard}}** | このワークスペースの単語と用語 |
| **{{model.editor.domainType.menu}}** | このワークスペースのドメインタイプ |
| **{{model.editor.termDictionary.tabSystem}}** | 管理者が登録した共用の辞書。閲覧のみできます |

### 9.2 単語と用語を登録する

![ワークスペース辞書](/guide-assets/ja/standard-terms.webp)

* 検索欄でトークンやラベルを探します。
* **{{model.editor.termDictionary.add}}** を押すと登録ウィンドウが開きます。一覧の項目を押すと編集できます。
* 用語には、指しているドメインタイプの名前が紫色のバッジで付きます。バッジを押すと、ドメインタイプタブのその項目に移動します。

![用語を編集](/guide-assets/ja/standard-term-dialog.webp)

| 項目 | 説明 |
|---|---|
| {{model.editor.termDictionary.term}} | カラム名に使う文字。単語なら `email`、用語なら `user_email` のように名前全体を入力します |
| {{model.editor.termDictionary.label}} | 論理名として使う文字 |
| {{model.editor.domainType.label}} | 選ぶと用語になります。型はドメインタイプが決めます |
| **{{model.editor.termDictionary.promote}}** | 入力してある型でドメインタイプを新しく作り、紐付けます。同じ名前があればそれを選びます |

同じトークンをもう一度登録すると上書きされます。名前全体を登録した用語は、単語をつなげた結果より優先されます。

### 9.3 ドメインタイプを作る

![ドメインタイプタブ](/guide-assets/ja/standard-domain-types.webp)

ドメインタイプタブは **{{model.editor.toolbar.tools}}** › **{{model.editor.domainType.menu}}** からも開けます。

* 項目ごとに、型とNULL許可の有無、今のドキュメントで使っているカラム数、指している用語数が表示されます。
* 用語数を押すと、辞書タブにそのドメインタイプを指す用語だけが表示されます。
* カラム数は、今開いているドキュメントでの数です。

![ドメインタイプを追加](/guide-assets/ja/standard-domain-dialog.webp)

**{{model.editor.domainType.add}}** を押し、名前、型、長さ(または精度とスケール)、NULL許可、デフォルト値、説明を入力します。1つのワークスペースに200個まで作れ、名前は重複できません。

### 9.4 カラムでドメインタイプを使う

![カラム情報のドメインタイプ](/guide-assets/ja/standard-column.webp)

1. カラム名をダブルクリックしてカラム情報ウィンドウを開きます。
2. **{{model.editor.domainType.label}}** でドメインタイプを選びます。型、長さ、NULL許可、デフォルト値が埋まります。
3. 保存します。テーブルのカラム名の横に **D** バッジが付きます。

カラムごとに異なる値を使うこともできます。ドメインタイプを選んだあとで長さを直接変えると「ドメインタイプと異なる」の表示が付き、その属性はドメインタイプが変わっても追従しません。**{{model.editor.domainType.revert}}** で元に戻します。

外部キーカラムの型は親カラムに従うため、ドメインタイプは使えません。

### 9.5 カラム名を入力すると出る候補

![辞書の候補](/guide-assets/ja/standard-suggest.webp)

テーブルでカラム名を入力すると、辞書で見つかった項目が下に表示されます。

* いちばん上の行は、今入力した名前から作られる論理名です。
* **{{model.editor.table.termGroupTerms}}**: 選ぶと名前全体がその用語に置き換わり、論理名とドメインタイプも一緒に入ります。
* **{{model.editor.table.termGroupWords}}**: 選ぶと、今入力している部分だけがその単語に置き換わります。続けて次の部分を入力できます。
* 矢印キーで選び、`Enter` で入力します。`Esc` で閉じます。

カラム情報ウィンドウでは、カラム名が辞書の用語と同じ場合に **辞書の標準** の案内が表示されます。**{{model.editor.domainType.standardApply}}** を押すと、その用語のドメインタイプが入ります。

### 9.6 ドメインタイプを変更したとき

ドメインタイプの値を変更しても、ドキュメントのカラムは自動では変わりません。ドキュメントを開くと知らせが出て、どのカラムに反映するかを確認します。

![ドメインタイプ変更の案内](/guide-assets/ja/standard-banner.webp)

**{{model.editor.domainType.banner.review}}** を押すと、反映ウィンドウが開きます。

![反映ウィンドウ](/guide-assets/ja/standard-propagation.webp)

* カラムごとに、変わる属性と値が表示されます。
* チェックを入れたカラムだけが新しい値に変わります。チェックを入れなかったカラムは値をそのままにして、「一部の属性が異なる」状態で残ります。
* カラムで直接変更してある属性はスキップします。
* **{{model.editor.domainType.propagation.skipAll}}** を押すと、どのカラムも変更しません。

ドメインタイプを削除しても、カラムの値はそのままです。カラムには「リンク切れ」の表示だけが残ります。

### 9.7 論理名の自動推論

![論理名の自動推論](/guide-assets/ja/editor-logical-names.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.logicalNames}}** は、論理名が空か、物理名と同じになっているテーブルとカラムを探し、辞書で埋めます。

* 名前を `_` で区切り、部分ごとに辞書で探します。ワークスペース辞書がシステム辞書より優先されます。
* **{{model.editor.logicalNames.languageLabel}}** で、システム辞書のどの言語の表記を使うかを選びます。
* 埋める項目を選んで適用します。すでにある論理名には手を加えません。
* 適用したあと、元に戻す1回ですべて元の状態に戻せます。

### 9.8 システム辞書

![システム辞書](/guide-assets/ja/standard-system.webp)

システム辞書は、管理者が登録した共用の単語です。複数の言語のラベルを持ち、すべてのワークスペースで閲覧できます。頭文字の行で文字を選んで探します。同じトークンをワークスペース辞書に登録するとワークスペース側が優先され、**{{model.editor.termDictionary.overridden}}** の表示が付きます。

## 10. SQLとデータベース

### 10.1 データベースタブ — 接続

![データベースタブ](/guide-assets/ja/workspace-database.webp)

ワークスペースの **{{workspace.detail.tabs.database}}** タブには2つのものがあります。

**{{managed.sectionTitle}}** — 練習や試験に使うデータベースがないときに、Crowfootが1つ用意します。

* **{{managed.issue}}** を押すと専用のスキーマが作られ、接続として自動で登録されます。
* PostgreSQLとMySQLから選べ、1アカウントにつき5個まで無料です。
* 鍵のアイコンを押すと、接続先アドレス、ユーザー名、パスワードが表示されます。DBeaverなどの外部ツールでそのまま使えます。
* ごみ箱のアイコンは発行の取り消しです。スキーマとその中のデータがすべて削除され、元に戻せません。

**接続一覧** — 自分のデータベースの接続情報を登録します。

![接続を追加](/guide-assets/ja/connection-dialog.webp)

* **{{connection.list.newConnection}}** を押し、名前、DBMS、ホスト、ポート、データベース、ユーザー、パスワードを入力します。パスワードは暗号化して保存されます。
* 一覧の各行に、接続テスト、DBからドキュメントとして取り込む、データを見る、編集、削除のボタンがあります。
* 接続テストに成功すると、かかった時間も一緒に表示されます。
* 接続を削除しても、その接続で作ったドキュメントは残ります。

### 10.2 SQL生成

![SQLスクリプト](/guide-assets/ja/editor-sql.webp)

エディタの **{{model.editor.toolbar.ddl}}** を押すと、ドキュメント全体を対象DBMSの文法で書いたスクリプトが表示されます。

* テーブル、主キー、ユニークキー、インデックス、外部キー、コメントが含まれます。論理名はCOMMENTとして出力されます。
* **{{model.editor.ddl.copy}}** でコピーし、**{{model.editor.ddl.download}}** で.sqlファイルを取得します。
* スクリプトは最後に保存した内容をもとにしています。保存していない変更があると案内が表示されます。
* 注意すべき点があれば、**{{model.editor.ddl.warningTitle}}** に表示されます。

### 10.3 デプロイ

![データベースにデプロイ](/guide-assets/ja/editor-deploy.webp)

SQLスクリプトウィンドウの **{{model.editor.deploy.button}}** を押すと、スクリプトを接続先のデータベースでそのまま実行します。

1. **{{model.editor.deploy.connection}}** を選びます。ドキュメントと同じDBMSの接続だけが表示されます。
2. **{{model.editor.deploy.run}}** を押します。
3. 文ごとに成功と失敗が表示されます。既存のオブジェクトとぶつかった文は失敗として記録され、残りは続けて実行されます。

空のデータベースに初めて作るときに使う機能です。すでに作ったデータベースを変更するときは、マイグレーションDDLを使います(10.4 節、14.3 節)。

### 10.4 DB同期

![データベースとの同期](/guide-assets/ja/editor-sync.webp)

ドキュメントと実際のデータベースに差が出たときに使います。**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.sync}}** で開きます。データベースに接続されたドキュメントにだけ表示されます。

| ボタン | 方向 | 説明 |
|---|---|---|
| **{{model.editor.sync.compare}}** → **{{model.editor.sync.apply}}** | データベース → ドキュメント | データベースの現在の構造とドキュメントを比較して違いを表示し、ドキュメントをデータベースに合わせます |
| **{{model.editor.migration.button}}** | ドキュメント → データベース | ドキュメントとデータベースの差分をALTER文にします。**{{model.editor.migration.apply}}** でそのまま実行できます |

* ドキュメントを合わせるとき、テーブルの色、位置、メモなどドキュメントだけの属性はそのまま残ります。元に戻す1回ですべて元の状態に戻せます。
* マイグレーションDDLをデータベースで実行すると、元に戻せません。カラムやテーブルを削除する文があると警告が表示されます。

接続していないドキュメントは、ドキュメント一覧の行メニューにある **{{model.list.menu.connect}}** で接続します。

### 10.5 別のDBMSに複製

![別のDBMSに複製](/guide-assets/ja/editor-convert.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}** は、対象DBMSだけが異なる新しいドキュメントを作ります。元のドキュメントは変わりません。

* 作る前に、表記が変わる型と、対象DBMSに合わない型を表示します。
* 合わない型は、新しいドキュメントに元の値のまま残ります。作ったあとで自分で直します。

## 11. データブラウザ

データブラウザは、接続先の実際のデータを見て編集するウィンドウです。開く場所は3か所あります。

* データベースタブの接続行にあるデータを見るボタン
* エディタの **{{model.editor.toolbar.tools}}** › **{{database.openShort}}**
* エディタでテーブルを右クリック › **{{model.editor.contextMenu.viewTableData}}**

編集者以上のロールが必要です。実際にできることは、接続に登録したデータベースアカウントの権限に従います。アカウントに書き込み権限がないと、行の編集と書き込みのSQLは失敗します。

### 11.1 データタブ — 参照

![データタブ](/guide-assets/ja/data-tab.webp)

* 左の一覧からテーブルまたはビューを選びます。名前の横の数字は、おおよその行数です。
* **{{database.data.addFilter}}** でカラム、演算子、値を決め、**{{database.data.apply}}** を押します。条件は複数入れられます。
* 演算子は `=`、`≠`、`<`、`≤`、`>`、`≥`、{{database.data.op.CONTAINS}}、{{database.data.op.STARTS_WITH}}、{{database.data.op.IN}}、{{database.data.op.IS_NULL}}、{{database.data.op.IS_NOT_NULL}} です。
* 列の見出しを押すと、そのカラムで並べ替えます。
* 下部でページを切り替えます。**{{database.data.countExact}}** を押すと、全体の行数を正確に数えます。
* **{{database.data.downloadCsv}}** は、今の条件の結果をファイルとして取得します。
* 接続に紐付いたERDドキュメントがあると、列の見出しにそのドキュメントの論理名も一緒に表示されます。
* 長い値は省略して表示されます。セルを押すと値全体を確認できます。

### 11.2 データタブ — 行を編集する

![行の編集](/guide-assets/ja/data-edit.webp)

編集した内容はすぐには反映されません。ためておいて、一度にまとめて適用します。

| すること | 方法 | 表示 |
|---|---|---|
| 値を編集する | セルをダブルクリックして値を入力し、`Enter` | セルがオレンジ色 |
| NULLにする | 編集中に **{{database.edit.setNull}}** ボタン | セルがオレンジ色 |
| 行を追加する | **{{database.edit.addRow}}** | 行が緑色 |
| 行を削除する | 行の左にあるごみ箱のアイコン | 行が赤色、文字に取り消し線 |
| 取り消す | 行の左にある元に戻すアイコン、または **{{database.edit.discard}}** | 表示が消える |

下部の帯に、追加、編集、削除の件数が表示されます。**{{database.edit.apply}}** を押すと確認ウィンドウが表示されます。

![適用の確認](/guide-assets/ja/data-apply-confirm.webp)

* 適用は1つのまとまりとして実行されます。1件でも失敗すると、すべて取り消されます。
* 削除が含まれていると警告が表示されます。適用したあとは元に戻せません。
* ビューと、主キーのないテーブルは編集できません。

### 11.3 構造タブ

![構造タブ](/guide-assets/ja/data-structure.webp)

選んだテーブルのカラム(名前、型、NULL許可、デフォルト値、コメント)、インデックス、外部キーを表示します。構造はここでは変更できません。ERDで変更してから、マイグレーションDDLで反映します。

### 11.4 SQLタブ

![SQLタブ](/guide-assets/ja/data-sql.webp)

* SQLを入力して **{{database.sql.run}}** を押すか、`Ctrl/Cmd+Enter` を押します。カーソルのある文、または選択した部分だけを実行します。
* テーブル名とカラム名は自動で補完されます。
* 参照の結果は下の表に表示されます。結果が多いときは先頭の部分だけを表示し、その旨を知らせます。
* データを変更する文では、変更された行数が表示されます。
* 履歴ボタンで、以前に実行した文を呼び出せます。
* テーブルの構造を変える文を実行すると、ERDドキュメントと差が出ることがあります。**{{model.editor.toolbar.sync}}** でドキュメントに反映します。

## 12. 検証

![設計検証](/guide-assets/ja/editor-validation.webp)

ツールバーの **{{model.validation.toggle}}** を押すと、左側に **{{model.validation.title}}** パネルが開きます。ドキュメントを編集するたびに検査し直します。

* 上の深刻度ボタンで、エラー、警告、参考を選んで表示します。
* 項目を押すと、キャンバスがそのテーブルに移動します。
* 問題のあるテーブルには、キャンバス上でも印が付きます。

| 深刻度 | ルール | 意味 |
|---|---|---|
| エラー | {{model.validation.rules.DUPLICATE_TABLE_NAME}} | 同じ物理名のテーブルが2つ以上ある |
| エラー | {{model.validation.rules.DUPLICATE_COLUMN_NAME}} | 1つのテーブルに同じ名前のカラムが2つ以上ある |
| エラー | {{model.validation.rules.DUPLICATE_KEY_NAME}} | ユニークキーやインデックスの名前が重複している |
| エラー | {{model.validation.rules.COMPOSITE_KEY_DUPLICATE_COLUMN}} | 1つのキーに同じカラムが2回入っている |
| エラー | {{model.validation.rules.FK_TYPE_MISMATCH}} | 外部キーカラムと親カラムの型が異なる |
| エラー | {{model.validation.rules.FK_TARGET_NOT_KEY}} | 外部キーが指すカラムが主キーでもユニークキーでもない |
| エラー | {{model.validation.rules.FK_NULLABILITY_MISMATCH}} | リレーションの多重度と外部キーのNULL許可が合っていない |
| エラー | {{model.validation.rules.ONE_TO_ONE_MISSING_UK}} | 1:1リレーションなのに外部キーにユニークキーがない |
| 警告 | {{model.validation.rules.MISSING_PK}} | 主キーのないテーブル |
| 警告 | {{model.validation.rules.EMPTY_TABLE}} | カラムのないテーブル |
| 警告 | {{model.validation.rules.FK_MAPPING_EMPTY}} | リレーションにつながるカラムがない |
| 警告 | {{model.validation.rules.ORPHAN_TABLE}} | どのテーブルともリレーションがない |
| 警告 | {{model.validation.rules.CIRCULAR_REFERENCE}} | 外部キーをたどると自分自身に戻ってくる |
| 警告 | {{model.validation.rules.NAMING_CONVENTION}} | 物理名が命名規則に合っていない |
| 警告 | {{model.validation.rules.MISSING_LOGICAL_NAME}} | 論理名が空になっている |
| 参考 | {{model.validation.rules.FK_WITHOUT_INDEX}} | 外部キーカラムで始まるインデックスがない |
| 参考 | {{model.validation.rules.WIDE_TABLE}} | カラムが30個を超えている |

## 13. 共有とコメント

### 13.1 共有リンク

![ドキュメントを共有](/guide-assets/ja/editor-share.webp)

**{{model.editor.toolbar.share}}** を押し、**{{model.share.issue}}** を押すとリンクが作られます。リンクを知っている人は、ログインしなくてもドキュメントを閲覧できます。編集はできません。

* **{{model.share.period.unlimited}}** または **{{model.share.period.custom}}** を選びます。期間を指定すると、開始と終了の日時の外では開けません。
* リンクごとに、閲覧数、いいね数、コメント数が表示されます。
* コピーのアイコンでアドレスをコピーし、ごみ箱のアイコンでリンクを取り消します。取り消したリンクは、すぐに開けなくなります。
* 共有したドキュメントは、スタートページの共有ギャラリーにも表示されます。

共有画面では、ERDを見て、SQLスクリプトを取得し、いいねとコメントを残せます。いいねはログインした人だけが残せます。ログインしていない人は、ニックネームとパスワードを入力してコメントを残します。

### 13.2 コメントタブ

エディタ最下部の **{{shareViewer.tab.comments}}** タブに、共有リンクから届いたいいねとコメントが集まります。コメント投稿者以上のロールなら、ここで返信できます。コメントが付くと、ベルのアイコンに通知が届きます。

## 14. バージョン履歴

### 14.1 保存履歴を見る

![バージョン履歴](/guide-assets/ja/editor-history.webp)

ドキュメントは、保存するたびにバージョンが1つずつ残ります。**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.history}}** で開きます。

* バージョンごとに、保存した人、時刻、変更内容の要約(追加、変更、削除、移動)が表示されます。
* **{{model.editor.history.editMemo}}** でバージョンにメモを残します。検索欄はメモの中から探します。
* **{{model.editor.history.view}}** は、そのバージョンのドキュメントを読み取り専用で開きます。
* **{{model.editor.history.restore}}** は、そのバージョンの内容を新しいバージョンとして保存します。今のドキュメントも履歴にそのまま残ります。

### 14.2 バージョン比較

**{{model.editor.history.compare}}** を押すと、2つのバージョンの違いを確認できます。

* キャンバスは比較バージョンをもとに描かれ、変わったテーブルに `+`(追加)と `~`(変更)の印が付きます。
* なくなったテーブルは、別に一覧で表示されます。
* **{{model.editor.compare.exit}}** でドキュメントに戻ります。

### 14.3 マイグレーションDDL

バージョン比較画面の **{{model.editor.compare.migrationDdl}}** は、2つのバージョンの差分をALTER文にします。前回のデプロイ以降に変わった部分だけをデータベースに反映するときに使います。スクリプトをコピーしてデータベースで実行します。データが消える可能性のある文には警告が付きます。データベースでそのまま実行したいときは、DB同期のマイグレーションDDLを使います(10.4 節)。

## 15. 一緒に編集する

複数の人が同じドキュメントを同時に開いて編集できます。

* ツールバーに今一緒に見ている人が表示され、キャンバス上でほかの人のカーソルが動きます。
* ほかの人が編集した内容は、すぐ自分の画面に反映されます。
* ほかの人が編集している項目はロックされます。誰が編集しているか、名前が表示されます。
* 2人が同じ属性を編集すると、あとから編集した値が残ります。自分の値が変わると通知が表示され、**{{model.editor.collab.lwwRestore}}** で元に戻せます。
* 右下の吹き出しボタンは **{{model.editor.chat.label}}** です。ドキュメントを一緒に見ている人と会話します。

保存するときに、ほかの人が先に保存していると **{{model.editor.conflict.title}}** ウィンドウが表示されます。

* 互いに重ならない変更は、自動でマージされます。
* 重なる項目ごとに、**{{model.editor.conflict.keepMine}}** または **{{model.editor.conflict.useServer}}** を選びます。
* **{{model.editor.conflict.resolve}}** を押すと、選んだとおりにマージして保存します。

保存できないままウィンドウが閉じても、編集内容はブラウザに残ります。ドキュメントをもう一度開くと復元されます。

## 16. チーム

![チーム画面](/guide-assets/ja/team-detail.webp)

チームは、人をまとめておく単位です。ワークスペースにチームをメンバーとして入れると、チームの全員が一度に権限を得ます。

* 上部メニューの **{{shell.nav.teams}}** から移動します。サイドバーの **{{shell.sidebar.newTeam}}** でチームを作ります。チームを作っても、ワークスペースは一緒には作られません。
* **{{team.members.addButton}}** で人を探して追加し、**{{team.members.remove}}** で外します。
* チームのオーナーは、名前と説明を編集し、**{{team.detail.settings.dissolveButton}}** を実行できます。チームを解散すると、チームに与えたワークスペースの権限も一緒に取り消されます。

## 17. コミュニティと通知

### 17.1 リリースノート

![リリースノート](/guide-assets/ja/community-release-notes.webp)

新しいバージョンで変わった点を知らせる記事です。記事を押すと本文が開き、本文の言語を選べます。

### 17.2 フィードバック

![フィードバック](/guide-assets/ja/community-feedback.webp)

改善してほしい点や、見つけたバグを書く掲示板です。**{{community.board.newPost}}** で投稿を書き、画像を添付できます。投稿ごとにコメントをやり取りします。

### 17.3 自分のコメント、いいねしたドキュメント

![自分のコメント](/guide-assets/ja/community-my-comments.webp)

**{{shell.sidebar.communityMyComments}}** は、共有ドキュメントに自分が残したコメントをまとめて表示します。**{{shell.sidebar.communityMyLikes}}** は、自分がいいねした共有ドキュメントです。行を押すと、そのドキュメントに移動します。

### 17.4 通知

![通知](/guide-assets/ja/shell-notifications.webp)

ベルのアイコンを押すと、最近の通知が表示されます。通知は3種類です。

* 自分のドキュメントにコメントが付いたとき
* 自分のドキュメントにいいねが付いたとき
* 自分のコメントにドキュメントのオーナーが返信したとき

**{{shell.notifications.markAll}}** ですべて既読にし、**{{shell.notifications.viewAll}}** で全体の一覧に移動します。

![通知一覧](/guide-assets/ja/community-notifications.webp)

## 18. 管理者

![管理者画面](/guide-assets/ja/admin-users.webp)

管理者アカウントには、上部メニューに **{{shell.nav.admin}}** が表示されます。

| メニュー | 内容 |
|---|---|
| **{{shell.sidebar.adminUsers}}** | ユーザー一覧、管理者権限、アカウントの状態 |
| **{{shell.sidebar.adminCodes}}** | データベースの種類などのコード値 |
| **{{shell.sidebar.adminManaged}}** | サービス提供データベースのインスタンスと発行状況 |
| **{{shell.sidebar.adminSystemTerms}}** | システム辞書の単語の登録と削除 |
| **{{shell.sidebar.adminAuditLogs}}** | 主な操作の記録 |
| **{{shell.sidebar.adminTraffic}}** | 訪問統計 |

## 19. ショートカット

![キーボードショートカット](/guide-assets/ja/editor-shortcuts.webp)

エディタで `Ctrl/Cmd+/` を押すか、ツールバーのキーボードのアイコンを押すと、ショートカットのウィンドウが開きます。

| ショートカット | すること |
|---|---|
| `Ctrl/Cmd+Z` | {{model.editor.shortcuts.row.undo}} |
| `Ctrl/Cmd+Shift+Z`、`Ctrl/Cmd+Y` | {{model.editor.shortcuts.row.redo}} |
| `Ctrl/Cmd+S` | {{model.editor.shortcuts.row.save}} |
| `Ctrl/Cmd+C` | {{model.editor.shortcuts.row.copy}} |
| `Ctrl/Cmd+V` | {{model.editor.shortcuts.row.paste}} |
| `Ctrl/Cmd+D` | {{model.editor.shortcuts.row.duplicate}} |
| `Delete`、`Backspace` | {{model.editor.shortcuts.row.delete}} |
| `Ctrl/Cmd+F` | {{model.editor.shortcuts.row.search}} |
| `Ctrl/Cmd+A` | {{model.editor.shortcuts.row.selectAll}} |
| `Esc` | {{model.editor.shortcuts.row.deselect}} |
| `Shift+Click` | {{model.editor.shortcuts.row.rangeSelect}} |
| 矢印キー | {{model.editor.shortcuts.row.nudge}} |
| `Shift+` 矢印キー | {{model.editor.shortcuts.row.nudgeFast}} |
| `Space+Drag` | {{model.editor.shortcuts.row.pan}} |
| マウスの右ボタン | {{model.editor.shortcuts.row.contextMenu}} |
| `Ctrl/Cmd+/` | {{model.editor.shortcuts.row.help}} |
| `Ctrl/Cmd+Enter` | データブラウザのSQLタブで実行 |

文字を入力する欄にカーソルがあるときは、ヘルプ以外のショートカットは動作しません。編集権限がないと、編集、移動、削除のショートカットは動作しません。

## 20. よくある質問

**ドキュメントのデータベースの種類は変えられますか？**
変えられません。**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}** で、別の種類の新しいドキュメントを作ります。

**保存はいつされますか？**
編集すると、少しあとに自動で保存されます。**{{model.editor.toolbar.save}}** ボタンや `Ctrl/Cmd+S` ですぐに保存することもできます。保存するたびにバージョンが残ります。

**間違えて編集した内容を元に戻すには？**
直前の編集は `Ctrl/Cmd+Z` で元に戻します。すでに保存した内容は、バージョン履歴で以前のバージョンに戻します。

**単語と用語はどう違いますか？**
単語は名前の部分1つで、用語はカラム名全体です。用語はドメインタイプを指せるので、カラムに用語を使うと型まで一緒に決まります。

**ドメインタイプを変更すると、カラムはすぐに変わりますか？**
変わりません。ドキュメントを開くと変更があったことを知らせ、どのカラムに反映するかを選べます。

**データベースがなくても使えますか？**
使えます。ERDだけを描いて、SQLスクリプトを持ち帰ってもかまいません。実行してみたいときは、データベースタブでサービス提供データベースを発行します。

**データブラウザで構造を変えられますか？**
データタブと構造タブでは変えられません。ERDで変更してから、マイグレーションDDLで反映します。

**共有リンクを受け取った人はドキュメントを編集できますか？**
編集できません。一緒に編集するには、ワークスペースのメンバーに追加して編集者のロールを与えます。

**改善してほしい点はどこに書けばよいですか？**
**{{shell.nav.community}}** › **{{shell.sidebar.communityFeedback}}** に書いてください。
