CrowfootはブラウザでERDを描き、チームで共同編集し、データベースに反映できるツールです。このガイドでは、画面構成から始めて、すべての機能を順に説明します。画面の図に表示されているデータは、説明用のサンプルです。

## 1. 画面構成をひと目で見る

Crowfootの画面は大きく3種類あります。

| 画面 | 開き方 | できること |
|---|---|---|
| アプリ画面 | ログインすると開きます | ワークスペース、ドキュメント一覧、メンバー、データベース、チーム、コミュニティ |
| エディタ | ドキュメント一覧でドキュメントをクリックすると、新しいウィンドウで開きます | ERDの作図、標準の管理、SQL生成、共有、バージョン履歴 |
| データブラウザ | 接続の「データを見る」ボタンを押すと、新しいウィンドウで開きます。エディタでは最下部の **{{shareViewer.tab.data}}** タブで開きます | 実際のデータの参照、行の編集、SQLの実行 |

### 1.1 アプリ画面の上部メニュー

![アプリ画面の上部メニュー](/guide-assets/ja/shell-header.webp)

左から順に、次の項目が並んでいます。

| 位置 | 名前 | 説明 |
|---|---|---|
| 左 | ロゴ | ダッシュボードに移動します |
| 左 | **{{shell.nav.workspaces}}** | ワークスペースと、その中のERDドキュメント |
| 左 | **{{shell.nav.teams}}** | チームの作成とメンバーの管理 |
| 左 | **{{shell.nav.community}}** | リリースノート、フィードバック、自分のコメント、いいねしたドキュメント、通知 |
| 左 | **{{shell.nav.admin}}** | 管理者アカウントにのみ表示されます |
| 左 | **{{guide.title}}** | このガイドを新しいウィンドウで開きます |
| 右 | **{{shell.nav.home}}** | スタートページ（紹介画面）に移動します |
| 右 | 太陽のアイコン | ライトテーマとダークテーマを切り替えます |
| 右 | 地球のアイコン | 言語を切り替えます（{{common.language.ko}}、{{common.language.en}}、{{common.language.ja}}、{{common.language.zh}}） |
| 右 | ベルのアイコン | 通知を表示します。未読の件数が赤い数字で表示されます |
| 右 | 自分の名前 | マイプロフィール、言語、ログアウト |

### 1.2 左のサイドバー

上部メニューで選んだ項目に応じて、左のサイドバーの内容が変わります。

| 上部メニュー | サイドバーに表示されるもの |
|---|---|
| **{{shell.nav.workspaces}}** | **{{shell.sidebar.newWorkspace}}** ボタン、**{{shell.sidebar.mine}}**、**{{shell.sidebar.shared}}** |
| **{{shell.nav.teams}}** | **{{shell.sidebar.newTeam}}** ボタン、**{{shell.sidebar.ownedTeams}}**、**{{shell.sidebar.joinedTeams}}** |
| **{{shell.nav.community}}** | **{{shell.sidebar.communityReleaseNotes}}**、**{{shell.sidebar.communityFeedback}}**、**{{shell.sidebar.communityMyComments}}**、**{{shell.sidebar.communityMyLikes}}**、**{{shell.sidebar.communityNotifications}}** |
| **{{shell.nav.admin}}** | **{{shell.sidebar.adminUsers}}**、**{{shell.sidebar.adminCodes}}**、**{{shell.sidebar.adminManaged}}**、**{{shell.sidebar.adminSystemTerms}}**、**{{shell.sidebar.adminAuditLogs}}**、**{{shell.sidebar.adminTraffic}}** |

### 1.3 エディタウィンドウ

![エディタの全体画面](/guide-assets/ja/editor-overview.webp)

| 位置 | 内容 |
|---|---|
| 最上部 | ドキュメント名、対象DBMS、バージョン番号、最後に保存した人と日時、**{{model.viewer.close}}** |
| ツールバー | エクスプローラー、用語辞書、検証、元に戻す・やり直し、保存、自動レイアウト、SQL生成、共有、書き出し、ツール、表示、拡大・縮小 |
| 中央 | キャンバス。テーブル、リレーション線、メモ、グループが配置されます |
| 右下 | ミニマップとドキュメントチャットのボタン |
| 最下部 | **ERD** タブ、**{{shareViewer.tab.requirements}}** タブ、**{{shareViewer.tab.data}}** タブ、**{{shareViewer.tab.comments}}** タブ |

ツールバーの各ボタンは5節で説明します。

### 1.4 データブラウザウィンドウ

![データブラウザ](/guide-assets/ja/data-browser.webp)

| 位置 | 内容 |
|---|---|
| 最上部 | 接続名、DBMS、接続先アドレス、テーマと言語、**{{database.close}}** |
| 左 | テーブルとビューの一覧、検索欄、再読み込み。ERDドキュメントと一緒に開くと、テーブルをドキュメントのグループごとに分けます |
| 右上 | 選んだテーブルの名前と、**{{database.tabs.data}}**、**{{database.tabs.structure}}**、**{{database.tabs.sql}}** タブ |
| 右 | 選んだタブの内容 |

エディタの **{{shareViewer.tab.data}}** タブでは、最上部の行がありません。接続名、DBMS、接続先アドレスは右上の行の右端に表示されます。

## 2. はじめに

### 2.1 ログイン

![ログイン画面](/guide-assets/ja/login.webp)

1. スタートページでログインボタンを押します。
2. 利用規約を読み、同意欄にチェックを入れます。チェックを入れるとログインボタンが有効になります。
3. GitHubまたはGoogleアカウントで続行します。別途の会員登録は不要です。

しばらく操作しないでいると、**{{auth.sessionExpired.title}}** ウィンドウが表示されます。**{{auth.sessionExpired.loginAgain}}**を押してください。

### 2.2 ダッシュボード

![ダッシュボード](/guide-assets/ja/dashboard.webp)

ログインするとダッシュボードが開きます。

* 上部のカードには、自分のワークスペース数、自分のチーム数、メンバーとして参加しているワークスペース数が表示されます。
* **{{dashboard.shortcuts}}**のカードをクリックすると、そのワークスペースに移動します。
* **{{dashboard.myTeams}}**のカードをクリックすると、そのチームに移動します。
* **{{community.recent.title}}**には、リリースノートとフィードバックの投稿が新しい順に表示されます。
* 右上の **{{dashboard.newWorkspace}}** ボタンでワークスペースを作成します。

### 2.3 マイプロフィール、言語、テーマ

![ユーザーメニュー](/guide-assets/ja/shell-user-menu.webp)

右上の自分の名前を押すと、名前、メールアドレス、連携アカウント、登録日が表示されます。同じメニューから言語の切り替えとログアウトができます。言語は地球のアイコンからも切り替えられます。選んだ言語は次回以降も維持されます。

## 3. ワークスペース

ワークスペースは、ERDドキュメント、データベース接続、用語辞書、ドメインタイプをまとめて管理する場所です。メンバーと権限もワークスペース単位で設定します。

### 3.1 作成する

![新規ワークスペース](/guide-assets/ja/workspace-create.webp)

サイドバーの **{{shell.sidebar.newWorkspace}}**を押して名前を入力します。作成した人がオーナーになります。

### 3.2 ワークスペースのタブ

ワークスペースを開くと、名前の下に6つのタブが表示されます。

| タブ | 内容 |
|---|---|
| **{{workspace.detail.tabs.erd}}** | ERDドキュメントの一覧。ドキュメントの作成、表示、削除を行います |
| **{{workspace.detail.tabs.database}}** | サービス提供データベースとデータベース接続 |
| **{{workspace.detail.tabs.overview}}** | 名前、説明、作成者、メンバー数、作成日 |
| **{{workspace.detail.tabs.members}}** | メンバーとロール |
| **{{workspace.detail.tabs.mcp}}** | ClaudeなどのMCPクライアントを接続するためのトークンを発行・破棄します（20節） |
| **{{workspace.detail.tabs.settings}}** | 名前と説明の編集、ワークスペースの削除。オーナーにのみ表示されます |

### 3.3 ERDタブ — ドキュメント一覧

![ドキュメント一覧](/guide-assets/ja/workspace-erd.webp)

* 検索欄にドキュメント名や説明を入力して検索します。
* ドキュメント名をクリックすると、エディタが新しいウィンドウで開きます。
* 一覧には、ドキュメント名、DBの種類、バージョン、作成者、最終更新の列があります。
* ドキュメントが20件を超えると、一覧の下に総件数と「前へ」「次へ」ボタンが表示されます。
* 上部の5つのボタンでドキュメントを作成します（4節で説明します）。

![ドキュメント行のメニュー](/guide-assets/ja/document-row-menu.webp)

行の右端にある3点ボタンを押すと、**{{model.list.menu.edit}}**と **{{model.list.menu.delete}}**が表示されます。データベースに接続していないドキュメントには、**{{model.list.menu.connect}}**も表示されます。

* **{{model.list.menu.edit}}**で変更できるのは名前と説明だけです。データベースの種類とバージョンは変更できません。
* **{{model.list.menu.connect}}**には、ドキュメントと同じDBMSの接続だけが表示されます。接続すると、エディタでDB同期を使えるようになります（10.4節）。
* ドキュメントを削除できるのはオーナーだけです。削除したドキュメントは元に戻せません。

### 3.4 メンバータブ — メンバーとロール

![メンバータブ](/guide-assets/ja/workspace-members.webp)

ロールは4種類です。

| ロール | できること |
|---|---|
| {{common.role.OWNER}}（OWNER） | すべての操作。メンバー管理、ワークスペースの設定と削除 |
| {{common.role.EDITOR}}（EDITOR） | ドキュメントの作成と編集、辞書とドメインタイプの編集 |
| {{common.role.COMMENTER}}（COMMENTER） | ドキュメントの閲覧とコメント |
| {{common.role.VIEWER}}（VIEWER） | ドキュメントの閲覧 |

![メンバーを追加](/guide-assets/ja/member-add.webp)

**{{workspace.members.addButton}}**を押すと、追加する対象としてユーザー1人またはチームを選べます。

* **{{workspace.members.addDialog.targetUser}}**：名前またはメールアドレスを2文字以上入力して検索します。
* **{{workspace.members.addDialog.targetTeam}}**：チームにロールを付与すると、そのチームの全メンバーが同じロールを持ちます。
* オーナーのロールは付与できません。
* 一覧では、ロールの変更や、**{{workspace.members.revoke}}**による権限の取り消しができます。
* メンバーの追加、ロールの変更、取り消しができるのはオーナーだけです。ほかのメンバーは一覧を見ることだけができます。
* すでにメンバーになっている人は、検索結果に表示されません。
* 個人として付与されたロールとチームとして付与されたロールが異なる場合は、上位のロールが適用されます。
* オーナーが1人しかいない場合、そのオーナーは自分のロールを下げたり取り消したりできません。
* 変更した権限は、再ログインしなくてもすぐに反映されます。

### 3.5 概要タブと設定タブ

![概要タブ](/guide-assets/ja/workspace-overview.webp)

概要タブには、ワークスペースの基本情報が表示されます。

![設定タブ](/guide-assets/ja/workspace-settings.webp)

設定タブでは名前と説明を編集します。**{{workspace.detail.settings.dangerZone}}**の **{{workspace.detail.settings.deleteButton}}**を押すと、ワークスペースとその中のドキュメントがすべて削除されます。この操作は元に戻せません。

## 4. ERDドキュメントを作る

ドキュメントの作成方法は5つあり、いずれもERDタブ上部のボタンから始めます。

| ボタン | 使う場面 |
|---|---|
| **{{model.list.newDocument}}** | 空のドキュメントから自分で描くとき |
| **{{model.templates.openButton}}** | サンプルドキュメントをコピーして始めるとき |
| **{{sqlImport.openButton}}** | CREATE TABLEスクリプトがあるとき |
| **{{reverse.openButton}}** | 既存のデータベースの構造を読み込むとき |
| **{{model.import.button}}** | 書き出したドキュメントファイル（.crown）を再度取り込むとき |

### 4.1 新規ERDドキュメント

![新規ERDドキュメント](/guide-assets/ja/document-create.webp)

名前を入力し、データベースの種類を選びます。データベースの種類はドキュメントの作成時に決まり、あとから変更できません。別の種類に移すには、エディタの **{{model.editor.toolbar.dbmsConvert}}**を使います（10.5節）。

### 4.2 テンプレートから始める

![テンプレートから始める](/guide-assets/ja/document-template.webp)

用意されたサンプルドキュメントから1つ選び、自分のワークスペースにコピーします。**{{model.templates.preview}}**で事前に内容を確認できます。コピーするときにドキュメント名を指定でき、既定値はテンプレート名です。

テンプレートのドキュメントで使われている単語と用語は、ワークスペースの辞書にも一緒に取り込まれます。そのため、コピー直後から論理名の推論やカラム名の候補にその用語が使われます（9節）。

### 4.3 SQLを取り込む

![SQLを取り込む](/guide-assets/ja/document-sql-import.webp)

1. データベースの種類を選び、ドキュメント名を入力します。
2. CREATE TABLEスクリプトを貼り付けるか、**{{sqlImport.readFile}}**でファイルを読み込みます。ファイルは1MBまでです。
3. **{{sqlImport.preview}}**を押すと、読み取ったテーブル数とリレーション数、読み取れなかった文が表示されます。
4. **{{sqlImport.submit}}**を押します。

データベースに接続せずに、スクリプトだけでドキュメントを作成する方法です。

* 読み取る文は`CREATE TABLE`、`ALTER TABLE ... ADD CONSTRAINT`、`CREATE [UNIQUE|FULLTEXT] INDEX`です。カラム、型（小数秒の桁数を含む）、NOT NULL、デフォルト値、自動採番、主キー、ユニークキー、インデックス（FULLTEXT・SPATIAL、PostgreSQLのGINなどのアクセスメソッド、式インデックス、`WHERE`付きの部分インデックス、`INCLUDE`、演算子クラスを含む）、外部キー、CHECK制約、生成列、`ON UPDATE`、コメントを読み取ります。PostgreSQLの`COMMENT ON`、`GENERATED ALWAYS AS IDENTITY`、pg_dumpが出力する`ALTER TABLE ONLY`文も読み取ります。
* `CREATE VIEW`、`INSERT`など読み取れない文はスキップし、スキップした文をプレビューに表示します。
* 読み込んだが縮小・破棄した項目は、その下の「読み込んだが縮小・破棄した項目」の一覧に別に表示されます。たとえば Crowfoot の型に縮小した型、カタログにない型、破棄したカラム属性（`UNSIGNED`、`COLLATE`、`CHARACTER SET`など）、読み取らないセッション文（`SET FOREIGN_KEY_CHECKS`、`USE`）です。ドキュメントを作成する前にこの一覧を確認してください。
* `CREATE TABLE`が1つもない場合は、ドキュメントを作成できません。
* ドキュメント名を空欄のままにすると、「SQL ERD」という名前で作成されます。
* この方法で作成したドキュメントは、データベースに接続されていません。DB同期を使うには、ドキュメント一覧で **{{model.list.menu.connect}}**を選びます。

### 4.4 DBから取り込む

![DBから取り込む](/guide-assets/ja/document-reverse.webp)

登録済みの接続を選ぶと、そのデータベースのテーブル、カラム、キー、リレーション、コメントを読み取ってドキュメントを作成します。カラムのコメントは論理名として取り込まれます。この方法で作成したドキュメントはその接続に紐付けられ、**{{model.editor.toolbar.sync}}**を使えます。接続は事前にデータベースタブで登録しておきます（10.1節）。

* ドキュメントのデータベースの種類は、接続の種類に合わせて決まります。
* ドキュメント名の既定値は「接続名 ERD」です。
* あとで接続を削除してもドキュメントは残ります。ただし、そのドキュメントではDB同期のメニューが表示されなくなります。

### 4.5 ドキュメントファイル(.crown)を取り込む

エディタの **{{model.editor.toolbar.export}}** › **{{model.editor.toolbar.crown}}**でダウンロードしたファイルを取り込み、ドキュメントとして復元します。ドキュメントを別のワークスペースに移すときや、バックアップから復元するときに使います。取り込むと常に新しいドキュメントが作成され、既存のドキュメントが上書きされることはありません。ファイルの形式が正しくない場合は、その理由が表示されます。

## 5. エディタ画面とツールバー

![エディタのツールバー](/guide-assets/ja/editor-toolbar.webp)

### 5.1 ツールバーのボタン

左から順に説明します。

| ボタン | 説明 |
|---|---|
| **{{model.editor.explorer.toggle}}** | 左側のモデルエクスプローラーを開閉します（5.2節） |
| **{{model.editor.termDictionary.toggle}}** | 用語辞書とドメインタイプのパネルを開閉します（9節） |
| **{{model.validation.toggle}}** | 設計検証パネルを開閉します。問題の件数が数字で表示されます（12節） |
| {{model.editor.toolbar.undo}}、{{model.editor.toolbar.redo}} | 編集を1段階ずつ元に戻したり、やり直したりします |
| **{{model.editor.toolbar.save}}** | すぐに保存します。編集後しばらくすると自動でも保存されます |
| **{{model.editor.toolbar.autoLayoutLayered}}** | テーブルを自動で並べ直します。横の矢印で方式と向きを選びます（5.3節） |
| **{{model.editor.toolbar.ddl}}** | ドキュメントからSQLスクリプトを生成します（10.2節） |
| **{{model.editor.toolbar.share}}** | 読み取り専用の共有リンクを作成します（13節） |
| **{{model.editor.toolbar.export}}** | 画像またはドキュメントファイルとしてダウンロードします（5.4節） |
| **{{model.editor.toolbar.tools}}** | 論理名推論、DB同期、データを見る、別のDBMSに複製、ドメインタイプ、バージョン履歴（5.5節） |
| DBMSバッジ | ドキュメントの対象DBMSです。押すと **{{model.editor.toolbar.dbmsConvert}}** ウィンドウが開きます |
| **{{model.editor.toolbar.view}}** | カラム名の表示、カラム表示、グループ表示を選びます（5.6節） |
| − 数字 + | 縮小、現在の倍率、拡大 |
| 四隅のアイコン | **{{model.editor.toolbar.fit}}**。ドキュメント全体が画面に収まるように表示倍率を調整します |
| キーボードのアイコン | **{{model.editor.shortcuts.open}}**を開きます（19節） |
| はてなマークのアイコン | この利用ガイドを新しいウィンドウで開きます |
| 太陽のアイコン | ライトテーマとダークテーマを切り替えます |

読み取り専用のロールで開くと、編集用のボタンが無効になり、**{{model.editor.toolbar.readOnly}}**と表示されます。

### 5.2 エクスプローラー(モデルエクスプローラー)

![エクスプローラー](/guide-assets/ja/editor-explorer.webp)

* ドキュメントのテーブル、リレーション、メモをツリー形式で一覧表示します。テーブルはグループごとにまとめて表示されます。
* 検索欄に入力すると、テーブル、カラム、リレーション、メモを対象に検索します。`Ctrl/Cmd+F`で検索欄にすぐ移動できます。
* 項目をクリックすると、キャンバスがそのオブジェクトの位置に移動し、オブジェクトが選択されます。
* グループ行の目のアイコンでそのグループだけを表示し、鉛筆のアイコンでグループを編集、ごみ箱のアイコンでグループを削除します。

### 5.3 自動レイアウト

![自動レイアウトのメニュー](/guide-assets/ja/editor-menu-layout.webp)

ボタンを押すと、選んだ方式でテーブルを並べ直します。矢印を押すと方式と向きを選べ、選ぶとすぐに実行されます。

| 項目 | 説明 |
|---|---|
| **{{model.editor.toolbar.autoLayoutLayered}}** | 親から子へ階層に分けて並べます。ほとんどのドキュメントに適しています |
| **{{model.editor.toolbar.autoLayoutHub}}** | リレーションの多いテーブルを中央に置き、その周りにほかのテーブルを並べます |
| **{{model.editor.toolbar.autoLayoutHybrid}}** | 2つの方式を組み合わせます |
| **{{model.editor.toolbar.autoLayoutDown}}** | 親が上、子が下 |
| **{{model.editor.toolbar.autoLayoutRight}}** | 親が左、子が右 |

* 大きなドキュメントでは、計算に数秒かかることがあります。計算中も画面が固まることはなく、**{{model.editor.toolbar.autoLayoutCancel}}**で中止できます。
* どの方式も複数の配置を試し、リレーション線の重なりと交差が最も少ない配置を選びます。
* リレーション線は上下左右の4面に均等に付きます。リレーションが多いテーブルでも線が1面に集中しません。
* 結果が気に入らない場合は、1回の元に戻す操作で元の配置に戻せます。
* メモは関連テーブルの近くに配置されます。

### 5.4 書き出しメニュー

![書き出しメニュー](/guide-assets/ja/editor-menu-export.webp)

| 項目 | 説明 |
|---|---|
| **{{model.editor.image.viewport}}** | 現在画面に表示されている範囲をPNG画像としてダウンロードします |
| **{{model.editor.image.document}}** | ドキュメント全体を1枚のPNG画像としてダウンロードします |
| **{{model.editor.toolbar.crown}}** | ドキュメントを.crownファイルとしてダウンロードします。**{{model.import.button}}**で再度取り込めます |

* 画像の作成中は進行状況が画面に表示され、完了するまでキャンバスを操作できません。
* テーブルとメモが1つもない空のドキュメントでは、画像の項目は使えません。
* 読み取り専用のドキュメントでも書き出せます。

### 5.5 ツールメニュー

![ツールメニュー](/guide-assets/ja/editor-menu-tools.webp)

| 項目 | 説明 | 参照 |
|---|---|---|
| **{{model.editor.toolbar.logicalNames}}** | 空の論理名を辞書で埋めます | 9.7節 |
| **{{model.editor.toolbar.sync}}** | 接続されたデータベースとドキュメントを比較して同期します。データベースに接続されたドキュメントにのみ表示されます | 10.4節 |
| **{{database.openShort}}** | 最下部の **{{shareViewer.tab.data}}** タブに切り替え、接続されたデータベースのデータブラウザを表示します | 11節 |
| **{{model.editor.toolbar.dbmsConvert}}** | 対象DBMSだけが異なる新しいドキュメントを作成します | 10.5節 |
| **{{model.editor.domainType.menu}}** | ドメインタイプの一覧を開きます | 9.3節 |
| **{{model.editor.toolbar.history}}** | 保存履歴の確認、比較、復元を行います | 14節 |

### 5.6 表示メニュー

![表示メニュー](/guide-assets/ja/editor-menu-view.webp)

| 区分 | 項目 | 説明 |
|---|---|---|
| **{{model.editor.toolbar.nameMode.label}}** | {{model.editor.toolbar.nameMode.physical}}、{{model.editor.toolbar.nameMode.logical}}、{{model.editor.toolbar.nameMode.both}} | カラム名をどの名前で表示するかを選びます |
| **{{model.editor.toolbar.columnMode.label}}** | {{model.editor.toolbar.columnMode.all}}、{{model.editor.toolbar.columnMode.keys}} | キーのみを選ぶとPKとFKのカラムだけが表示され、大きなドキュメントでも全体をひと目で見渡せます |
| **{{model.editor.toolbar.areaFilter.label}}** | {{model.editor.toolbar.areaFilter.all}}、グループ名 | 選んだグループのテーブルだけが表示されます |

表示設定は画面上の見え方だけを変えるもので、ドキュメントの内容は変わらず、元に戻す履歴にも残りません。キーのみを表示している間は、**{{model.editor.table.addColumn}}**ボタンが非表示になります。

### 5.7 キャンバスを動かす

* 空いている場所をドラッグするか、`Space`を押しながらドラッグすると、表示位置を移動できます。
* マウスホイールまたはツールバーの − + で拡大・縮小します。
* 右下のミニマップをクリックすると、その位置に移動します。
* `Shift`を押しながらオブジェクトをクリックすると、複数のオブジェクトをまとめて選択できます。`Ctrl/Cmd+A`ですべて選択します。

## 6. テーブルとカラム

### 6.1 テーブルを作る

![空いている場所の右クリックメニュー](/guide-assets/ja/editor-context-canvas.webp)

キャンバスの空いている場所を右クリックして **{{model.editor.contextMenu.createTable}}**を選びます。クリックした位置にテーブルが作成されます。

### 6.2 テーブルの見た目

![テーブル](/guide-assets/ja/editor-table.webp)

| 位置 | 説明 |
|---|---|
| 色の帯 | テーブルの論理名。帯をドラッグするとテーブルを移動できます |
| 名前の行 | テーブルの物理名。クリックするとその場で編集できます。右の ⓘ は **{{model.editor.table.info}}**です |
| カラムの行 | 左端の6つの点をドラッグすると順番を変更できます。鍵のアイコンは主キーを表します |
| カラム名 | 上が物理名、下が論理名。クリックするとその場で編集できます |
| 型、長さ | データ型と長さ（または精度とスケール）。クリックして編集します |
| **NN** | NOT NULL。クリックでオン・オフを切り替えます。主キーのカラムは常にオンです |
| **AI** | 自動採番。主キーかつ整数型のカラムでのみオンにできます |
| **FK** | 外部キーのカラム。リレーションによって作成されたカラムです |
| **D** | ドメインタイプを使用しているカラム（9.4節） |
| × | カラムを削除します |
| **{{model.editor.table.addColumn}}** | 末尾にカラムを追加します |
| **{{model.editor.key.addUnique}}**、**{{model.editor.key.addIndex}}**、**{{model.editor.check.add}}** | ユニークキー、インデックス、CHECK制約を作成します（6.5節） |
| **ƒ** | 生成列です。マウスを乗せると生成式が表示されます（6.3節） |
| 枠の点 | リレーションを作成するためのハンドル（7.1節） |

主キーのカラムは常に先頭にまとめて表示されます。

### 6.3 カラム情報

![カラム情報](/guide-assets/ja/editor-column-info.webp)

カラム名をダブルクリックすると、**{{model.editor.columnInfo.title}}** ウィンドウが開きます。テーブル上では直接編集できない属性も含めて、まとめて編集できます。

| 項目 | 説明 |
|---|---|
| {{model.editor.columnInfo.physicalName}} | データベースに作成されるカラム名 |
| {{model.editor.columnInfo.logicalName}} | 人が読むための名前。SQL生成時にCOMMENTとして出力されます |
| {{model.editor.columnInfo.pk}} | オンにするとNOT NULLになり、カラムが先頭に移動します |
| {{model.editor.columnInfo.nullable}} | NULLを許可するかどうかを指定します |
| {{model.editor.columnInfo.autoIncrement}} | 主キーかつINT、BIGINT、SMALLINTのカラムでのみオンにできます。PostgreSQL・Oracleのドキュメントでは **{{model.editor.columnInfo.identityAlways}}** も選べます — オンで`GENERATED ALWAYS AS IDENTITY`（値を直接入れられない）、オフで`GENERATED BY DEFAULT AS IDENTITY`です |
| {{model.editor.domainType.label}} | ドメインタイプを選ぶと、型、長さ、NULL許可、デフォルト値がその値で設定されます（9.4節） |
| {{model.editor.columnInfo.dataType}}、{{model.editor.columnInfo.length}} | 型に応じて、長さ、または精度とスケールの欄が表示されます |
| {{model.editor.columnInfo.defaultValue}} | 例：`0`、`NOW()` |
| {{model.editor.columnInfo.onUpdate}} | 行を更新するときに自動で入れる値です。例：`CURRENT_TIMESTAMP(6)`。MySQLのドキュメントでのみ表示されます |
| {{model.editor.columnInfo.generated}} | オンにすると{{model.editor.columnInfo.generatedExpression}}を入力し、STORED（値を保存）とVIRTUAL（読み取り時に計算）から選びます。生成列にはデフォルト値、自動採番、ON UPDATEを設定できないため、それらの欄はオフになり空になります |
| {{model.editor.columnInfo.comment}} | ドキュメント内でのみ使うカラムの説明。SQLのCOMMENTには含まれません |

型の名前はDBMSに合わせて表示されます。たとえば日時の型は、PostgreSQLのドキュメントではTIMESTAMP、MySQLのドキュメントではDATETIMEと表示されます。

### 6.4 テーブル情報

![テーブル情報](/guide-assets/ja/editor-table-info.webp)

テーブルの ⓘ を押すか、右クリックメニューで **{{model.editor.contextMenu.tableInfo}}**を選びます。物理名、論理名、説明、色を設定します。グループに属するテーブルでは、グループの色が優先されます。要件にリンクされたテーブルではその要件もあわせて表示され、クリックすると要件パネルでその項目が開きます（20.3節）。

### 6.5 ユニークキーとインデックス

![インデックスを追加](/guide-assets/ja/editor-key-dialog.webp)

1. テーブルの下にある **{{model.editor.key.addUnique}}** または **{{model.editor.key.addIndex}}**を押します。
2. 名前を入力してカラムを選びます。選んだ順番が複合キーのカラム順になります。順番は矢印で変更できます。
3. インデックスでは、カラムごとに並び順（ASC、DESC）を指定できます。
4. インデックスは **{{model.editor.key.indexType}}**を選びます。MySQLはBTREE、FULLTEXT、SPATIAL、HASH、PostgreSQLはBTREE、HASH、GIN、GIST、BRIN、SPGISTです。BTREE以外のインデックスには並び順がありません。FULLTEXTではMySQLの全文検索パーサー（例：`ngram`）を指定できます。
5. DBMSが対応していれば、インデックスに次を追加できます。**{{model.editor.key.uniqueIndex}}**（部分・式のユニークのようにユニークキーで表せない場合）、**{{model.editor.key.keyMode}}**の**{{model.editor.key.keyModeExpression}}**（例：`lower(nickname)` — PostgreSQL・MySQL・Oracle）、カラムごとの**{{model.editor.key.opclass}}**（例：`gin_trgm_ops` — PostgreSQL）、**{{model.editor.key.where}}**（例：`deleted_at IS NULL` — PostgreSQL・SQL Server）、**{{model.editor.key.include}}**（PostgreSQL・SQL Server）。ドキュメントのDBMSが対応していない値は消えずに残りますが、DDLには含まれません。

作成したキーは、テーブルの下に **UK**、**IX**、**CK** の行として表示されます。FULLTEXTインデックスには **FT**、SPATIALインデックスには **SP**、GINなどその他の種類にはその名前、ユニークインデックスには **UQ** が付きます。式インデックスは式を、部分インデックスは条件を併せて表示します。行をクリックすると編集や削除ができます。リレーションを作成すると、外部キーカラムのインデックスが自動で作成されます。

**{{model.editor.check.add}}**を押すとCHECK制約を作成します。名前は`ck_テーブル_1`のように入力され、式は括弧の中の内容をそのまま書きます（例：`price >= 0`）。式は解釈しないため、カラム名を変えたら式も自分で直してください。カラムを削除すると、そのカラムを使うCHECK制約と、式や条件がそのカラムを使うインデックスも一緒に削除されます。

## 7. リレーション

### 7.1 リレーションを作る

![リレーションを開始](/guide-assets/ja/editor-relation-picker.webp)

1. 親テーブルの枠にある点をクリックします。
2. **{{model.editor.relation.startMenu}}** ウィンドウで、リレーション種別、多重度、リレーションの種類を選びます。
3. 子テーブルをクリックします。自己参照の場合は同じテーブルをクリックします。`Esc`で中止します。

子テーブルに外部キーのカラムが自動で作成されます。親テーブルに主キーがない場合、リレーションは作成できません。

| 項目 | 選択肢 | 説明 |
|---|---|---|
| {{model.editor.relation.pickType}} | 1:N、1:1 | 1:1の場合、外部キーのカラムにユニークキーも作成されます |
| {{model.editor.relation.childSide}} | {{model.editor.relationship.multiplicity_ZERO_OR_MORE}}、{{model.editor.relationship.multiplicity_ONE_OR_MORE}} | リレーション線の端の表記を決めます |
| {{model.editor.relation.parentSide}} | {{model.editor.relationship.multiplicity_EXACTLY_ONE}}、{{model.editor.relationship.multiplicity_ZERO_OR_ONE}} | 「ちょうど1」なら外部キーはNOT NULL、「0または1」ならNULL許可になります |
| {{model.editor.relation.pickKind}} | {{model.editor.relation.nonIdentifying}}、{{model.editor.relation.identifying}} | 識別関係では外部キーが子テーブルの主キーに含まれ、リレーション線は実線で描かれます |

### 7.2 リレーションを編集する

![リレーションの右クリックメニュー](/guide-assets/ja/editor-context-relationship.webp)

リレーション線を右クリックすると、**{{model.editor.contextMenu.editRelationship}}**と **{{model.editor.contextMenu.removeRelationship}}**が表示されます。リレーション線をダブルクリックしても編集ウィンドウが開きます。

![リレーションを編集](/guide-assets/ja/editor-relationship-dialog.webp)

| 項目 | 説明 |
|---|---|
| {{model.editor.relationship.mappingTitle}} | 親カラムごとに、対応させる子カラムを選びます（7.3節） |
| {{model.editor.relationship.type}} | 1:Nまたは1:1 |
| {{model.editor.relationship.fkName}} | 外部キー制約の名前 |
| {{model.editor.relationship.identifying}} | オンにすると、外部キーが子テーブルの主キーに含まれ、NOT NULLになります |
| {{model.editor.relationship.parentMultiplicity}}、{{model.editor.relationship.childMultiplicity}} | リレーション線の両端の表記 |
| ON DELETE、ON UPDATE | {{model.editor.relationship.action_NO_ACTION}}、{{model.editor.relationship.action_RESTRICT}}、{{model.editor.relationship.action_CASCADE}}、{{model.editor.relationship.action_SET_NULL}}、{{model.editor.relationship.action_SET_DEFAULT}} |
| **{{model.editor.relationship.remove}}** | リレーションを削除します |

### 7.3 カラムマッピングを変える

![カラムマッピング](/guide-assets/ja/editor-relationship-mapping.webp)

リレーションを作成すると、外部キーのカラムが新しく作成されます。既存のカラムを外部キーとして使う場合は、カラムマッピングでそのカラムを選びます。

* 一覧から子テーブルの別のカラムを選ぶか、**{{model.editor.relationship.mappingNewColumn}}**を選びます。
* 選んだカラムの型が親カラムと異なる場合は、**{{model.editor.relationship.mappingAlignType}}**のチェックボックスが表示されます。
* 使われなくなった以前の外部キーカラムは、**{{model.editor.relationship.mappingRemoveReleased}}**であわせて削除できます。
* 同じ子カラムを2回選ぶことはできません。

## 8. メモ、グループ、コピー

### 8.1 メモ

![メモ](/guide-assets/ja/editor-note.webp)

* 空いている場所の右クリックメニューで **{{model.editor.contextMenu.createNote}}**を選びます。
* メモをダブルクリックすると内容を編集できます。上部の帯をドラッグすると移動できます。
* メモの編集ウィンドウで、タイトル、色、**{{model.editor.note.linkedTable}}**を設定します。メモをテーブルの上にドラッグ＆ドロップして関連テーブルを設定することもできます。
* 関連テーブルが設定されたメモは、自動レイアウト時にそのテーブルの近くに配置されます。
* メモを削除するには、メモの右クリックメニューで **{{model.editor.contextMenu.removeNote}}**を選びます。

### 8.2 グループ

![グループを編集](/guide-assets/ja/editor-group-dialog.webp)

グループは、テーブルをテーマごとにまとめる機能です。グループに属するテーブルには、グループの色の帯が表示されます。

* テーブルを選び、右クリックメニューで **{{model.editor.contextMenu.createGroup}}**を選びます。複数のテーブルをまとめて選択してもかまいません。
* **{{model.editor.contextMenu.addToGroup}}**、**{{model.editor.contextMenu.removeFromGroup}}**で、テーブルをグループに出し入れします。
* **{{model.editor.contextMenu.editGroup}}**で、名前、説明、色、所属するテーブルを編集します。
* **{{model.editor.toolbar.view}}** メニューまたはエクスプローラーで、1つのグループだけを選んで表示できます。
* グループを1つだけ表示しているときは、右クリックメニューの **{{model.editor.contextMenu.exitGroupView}}**でドキュメント全体の表示に戻ります。

### 8.3 テーブルの右クリックメニュー

![テーブルの右クリックメニュー](/guide-assets/ja/editor-context-table.webp)

| 項目 | 説明 |
|---|---|
| **{{model.editor.contextMenu.tableInfo}}** | テーブル情報ウィンドウを開きます |
| **{{model.editor.contextMenu.viewTableData}}** | **{{shareViewer.tab.data}}** タブに切り替え、このテーブルのデータを表示します。データベースに接続されたドキュメントにのみ表示されます |
| **{{model.editor.contextMenu.copy}}** | 選んだオブジェクトをコピーします |
| **{{model.editor.contextMenu.duplicate}}** | すぐ隣に複製を作成します |
| **{{model.editor.contextMenu.createGroup}}**、**{{model.editor.contextMenu.addToGroup}}**、**{{model.editor.contextMenu.removeFromGroup}}**、**{{model.editor.contextMenu.editGroup}}** | グループを管理します |
| **{{model.editor.contextMenu.removeTable}}** | テーブルと、そのテーブルのリレーションを削除します |

### 8.4 コピー、貼り付け、複製

* `Ctrl/Cmd+C`でコピーし、`Ctrl/Cmd+V`で貼り付けます。`Ctrl/Cmd+D`で複製します。
* 複数のテーブルをまとめてコピーすると、テーブル間のリレーションもコピーされます。
* 貼り付けたテーブルには、名前が重複しないように自動で別の名前が付きます。
* 同じブラウザで開いている別のドキュメントにも貼り付けられます。内容が非常に大きい場合は、同じドキュメント内にのみ貼り付けられます。
* 空いている場所の右クリックメニューで **{{model.editor.contextMenu.paste}}**を選ぶと、クリックした位置に貼り付けられます。

## 9. 標準 — 単語、用語、ドメインタイプ

カラム名や型がドキュメントごとにばらばらにならないよう、ワークスペース単位で標準を定めます。標準には3種類あります。

| 標準 | 定めるもの | 例 |
|---|---|---|
| 単語 | 名前を構成する1つの部分とその意味 | `user` → 会員、`email` → メール |
| 用語 | カラム名全体とその意味、使用する型 | `user_email` → 会員 メール、ドメインタイプ「メール」 |
| ドメインタイプ | 複数のカラムで共通して使う型の定義 | メール = VARCHAR(191)、NOT NULL |

単語と用語は同じ辞書に登録します。ドメインタイプを紐付けたか型を記入した項目が用語、それ以外の項目が単語として扱われます。標準は、ワークスペース内のすべてのドキュメントで共通して使われます。

### 9.1 標準パネルを開く

ツールバーの **{{model.editor.termDictionary.toggle}}**を押すと、左側にパネルが開きます。パネルには3つのタブがあります。

| タブ | 内容 |
|---|---|
| **{{model.editor.termDictionary.tabStandard}}** | このワークスペースの単語と用語 |
| **{{model.editor.domainType.menu}}** | このワークスペースのドメインタイプ |
| **{{model.editor.termDictionary.tabSystem}}** | 管理者が登録した共通の辞書。閲覧のみ可能です |

### 9.2 単語と用語を登録する

![ワークスペース辞書](/guide-assets/ja/standard-terms.webp)

* 検索欄でトークンやラベルを検索します。
* **{{model.editor.termDictionary.add}}**を押すと登録ウィンドウが開きます。一覧の項目をクリックすると編集できます。
* 用語には、紐付けたドメインタイプの名前が紫色のバッジで表示されます。バッジをクリックすると、ドメインタイプタブのその項目に移動します。

![用語を編集](/guide-assets/ja/standard-term-dialog.webp)

| 項目 | 説明 |
|---|---|
| {{model.editor.termDictionary.term}} | カラム名に使う文字列。単語なら`email`、用語なら`user_email`のように名前全体を入力します |
| {{model.editor.termDictionary.label}} | 論理名として使う文字列 |
| {{model.editor.domainType.label}} | 選ぶと用語になります。型はドメインタイプによって決まります |
| **{{model.editor.termDictionary.promote}}** | 入力済みの型でドメインタイプを新規作成し、紐付けます。同じ名前のドメインタイプがあれば、それを選びます |

同じトークンをもう一度登録すると上書きされます。名前全体として登録した用語は、単語を組み合わせた結果より優先されます。

### 9.3 ドメインタイプを作る

![ドメインタイプタブ](/guide-assets/ja/standard-domain-types.webp)

ドメインタイプタブは、**{{model.editor.toolbar.tools}}** › **{{model.editor.domainType.menu}}**からも開けます。

* 項目ごとに、型とNULL許可の有無、現在のドキュメントで使用しているカラム数、紐付いている用語数が表示されます。
* 用語数をクリックすると、そのドメインタイプに紐付いた用語だけが辞書タブに表示されます。
* カラム数は、現在開いているドキュメント内の数です。

![ドメインタイプを追加](/guide-assets/ja/standard-domain-dialog.webp)

**{{model.editor.domainType.add}}**を押し、名前、型、長さ（または精度とスケール）、NULL許可、デフォルト値、説明を入力します。1つのワークスペースに200個まで作成でき、名前の重複はできません。

### 9.4 カラムでドメインタイプを使う

![カラム情報のドメインタイプ](/guide-assets/ja/standard-column.webp)

1. カラム名をダブルクリックして、カラム情報ウィンドウを開きます。
2. **{{model.editor.domainType.label}}**でドメインタイプを選びます。型、長さ、NULL許可、デフォルト値が自動で入力されます。
3. 保存します。テーブルのカラム名の横に **D** バッジが付きます。

カラムごとに異なる値を使うこともできます。ドメインタイプを選んだあとで長さを直接変更すると「ドメインタイプと異なる」と表示され、その属性はドメインタイプを変更しても追従しなくなります。**{{model.editor.domainType.revert}}**で元の値に戻せます。

外部キーカラムの型は親カラムに従うため、ドメインタイプは使えません。

### 9.5 カラム名を入力すると出る候補

![辞書の候補](/guide-assets/ja/standard-suggest.webp)

テーブルでカラム名を入力すると、辞書に一致する項目が候補として下に表示されます。

* いちばん上の行は、入力中の名前から作成される論理名です。
* **{{model.editor.table.termGroupTerms}}**：選ぶと名前全体がその用語に置き換わり、論理名とドメインタイプも入力されます。
* **{{model.editor.table.termGroupWords}}**：選ぶと、入力中の部分だけがその単語に置き換わります。続けて次の部分を入力できます。
* 矢印キーで選び、`Enter`で確定します。`Esc`で閉じます。

カラム情報ウィンドウでは、カラム名が辞書の用語と一致する場合に「辞書の標準」の案内が表示されます。**{{model.editor.domainType.standardApply}}**を押すと、その用語のドメインタイプが設定されます。

### 9.6 ドメインタイプを変更したとき

ドメインタイプの値を変更しても、ドキュメントのカラムは自動では変わりません。ドキュメントを開くと案内が表示され、どのカラムに反映するかを確認できます。

![ドメインタイプ変更の案内](/guide-assets/ja/standard-banner.webp)

**{{model.editor.domainType.banner.review}}**を押すと、反映ウィンドウが開きます。

![反映ウィンドウ](/guide-assets/ja/standard-propagation.webp)

* カラムごとに、変更される属性と値が表示されます。
* チェックを入れたカラムだけが新しい値に変わります。チェックを入れなかったカラムは値が変わらず、「一部の属性が異なる」状態になります。
* カラムで直接変更した属性はスキップされます。
* **{{model.editor.domainType.propagation.skipAll}}**を押すと、どのカラムも変更されません。

ドメインタイプを削除しても、カラムの値はそのままです。カラムには「リンク切れ」と表示されるだけです。

### 9.7 論理名の自動推論

![論理名の自動推論](/guide-assets/ja/editor-logical-names.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.logicalNames}}**は、論理名が空、または物理名と同じになっているテーブルとカラムを探し、辞書で論理名を埋めます。

* 名前を`_`で区切り、部分ごとに辞書を検索します。ワークスペース辞書がシステム辞書より優先されます。
* **{{model.editor.logicalNames.languageLabel}}**で、システム辞書のどの言語の表記を使うかを選びます。
* 埋める項目を選んで適用します。既存の論理名は変更されません。
* 適用後も、1回の元に戻す操作ですべて元の状態に戻せます。

### 9.8 システム辞書

![システム辞書](/guide-assets/ja/standard-system.webp)

システム辞書は、管理者が登録した共通の単語集です。複数の言語のラベルを持ち、すべてのワークスペースで閲覧できます。頭文字の行で文字を選んで絞り込めます。同じトークンをワークスペース辞書に登録するとワークスペース側が優先され、**{{model.editor.termDictionary.overridden}}**と表示されます。

## 10. SQLとデータベース

### 10.1 データベースタブ — 接続

![データベースタブ](/guide-assets/ja/workspace-database.webp)

ワークスペースの **{{workspace.detail.tabs.database}}** タブには、次の2つがあります。

**{{managed.sectionTitle}}** — 練習やテストに使えるデータベースがない場合に、Crowfootが用意するデータベースです。管理者がサービス提供データベースを用意している場合にのみ、この区画が表示されます。

* **{{managed.issue}}**を押すと専用のスキーマが作成され、接続として自動で登録されます。
* PostgreSQLとMySQLから選択できます。1人がワークスペースごとに発行できる数は管理者が設定し、既定値は5個です。区画には現在の使用数と上限が表示されます。
* 発行ごとに専用のアカウントが作成されます。このアカウントでは自分のスキーマにのみアクセスできます。
* 鍵のアイコンを押すと、接続先アドレス、ユーザー名、パスワードが表示されます。DBeaverなどの外部ツールでそのまま使えます。接続情報は発行した本人だけが確認できます。
* ごみ箱のアイコンで発行を取り消します。スキーマとその中のデータはすべて削除され、元に戻せません。取り消しは発行した本人だけが行えます。
* 発行によって作成された接続は、名前だけを変更できます。接続情報は編集できません。
* 接続一覧で発行によって作成された接続の削除ボタンを押すと、発行の取り消しの確認ウィンドウが開きます。取り消すと、接続とスキーマが一緒に削除されます。

**接続一覧** — 自分のデータベースの接続情報を登録します。

![接続を追加](/guide-assets/ja/connection-dialog.webp)

* **{{connection.list.newConnection}}**を押し、名前、DBMS、ホスト、ポート、データベース、ユーザー、パスワードを入力します。DBMSを選ぶと、ポートの既定値（MySQLは3306、PostgreSQLは5432）が入力されます。パスワードは暗号化されて保存され、画面に再表示されることはありません。
* 接続を編集するときにパスワード欄を空欄のままにすると、既存のパスワードがそのまま維持されます。
* 接続の登録、編集、削除、接続テストは編集者以上が行えます。一覧はすべてのメンバーが閲覧できます。
* 一覧の各行には、接続テスト、DBからドキュメントとして取り込む、データを見る、編集、削除のボタンがあります。
* 登録時に接続テストは自動では行われません。登録後に接続テストのボタンで確認してください。成功すると所要時間が、失敗すると原因（ホストに到達できない、認証失敗、タイムアウト）が表示されます。
* 接続を登録すると、編集者以上のメンバーはデータブラウザでそのデータベースのデータを参照・編集できます（11節）。本番環境のデータベースを登録するときは、この点に注意してください。
* 接続を削除しても、その接続で作成したドキュメントは残ります。
* **{{connection.dialog.mcpApply}}**は、ClaudeがMCPを通じてこのデータベースの構造を変更することを許可するスイッチです。既定ではオフです（20.4節）。

### 10.2 SQL生成

![SQLスクリプト](/guide-assets/ja/editor-sql.webp)

エディタの **{{model.editor.toolbar.ddl}}**を押すと、ドキュメント全体を対象DBMSの文法で記述したスクリプトが表示されます。

* テーブル、主キー、ユニークキー、インデックス、外部キー、コメントが含まれます。論理名はCOMMENTとして出力されます。
* **{{model.editor.ddl.copy}}**でコピーし、**{{model.editor.ddl.download}}**で.sqlファイルとして保存します。
* スクリプトは最後に保存した内容をもとに生成されます。保存していない変更がある場合は案内が表示されます。
* 注意すべき点がある場合は、**{{model.editor.ddl.warningTitle}}**に表示されます。

### 10.3 デプロイ

![データベースにデプロイ](/guide-assets/ja/editor-deploy.webp)

SQLスクリプトウィンドウの **{{model.editor.deploy.button}}**を押すと、スクリプトを接続先のデータベースでそのまま実行します。

1. **{{model.editor.deploy.connection}}**を選びます。ドキュメントと同じDBMSの接続だけが表示されます。
2. **{{model.editor.deploy.run}}**を押します。
3. 文ごとに成功・失敗が表示されます。既存のオブジェクトと競合する文は失敗として記録され、残りの文は引き続き実行されます。

空のデータベースに初めてテーブルを作成するときに使う機能です。作成済みのデータベースを変更するときは、マイグレーションDDLを使います（10.4節、14.3節）。

### 10.4 DB同期

![データベースとの同期](/guide-assets/ja/editor-sync.webp)

ドキュメントと実際のデータベースの間に差異が生じたときに使います。**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.sync}}**で開きます。データベースに接続されたドキュメントにのみ表示されます。

| ボタン | 方向 | 説明 |
|---|---|---|
| **{{model.editor.sync.compare}}** → **{{model.editor.sync.apply}}** | データベース → ドキュメント | データベースの現在の構造とドキュメントを比較して差分を表示し、ドキュメントをデータベースに合わせます |
| **{{model.editor.migration.button}}** | ドキュメント → データベース | ドキュメントとデータベースの差分からALTER文を生成します。**{{model.editor.migration.apply}}**でそのまま実行できます |

* ドキュメントをデータベースに合わせても、テーブルの色、位置、メモなどドキュメント固有の属性はそのまま残ります。1回の元に戻す操作ですべて元の状態に戻せます。
* データベースで実行したマイグレーションDDLは元に戻せません。カラムやテーブルを削除する文は既定では実行されず、追加と変更だけが反映されます。削除する文も実行するには、**{{model.editor.migration.destructiveToggle}}**をオンにします。運用中のデータベースに新しいドキュメントを接続すると、ドキュメントにない既存のテーブルがすべて削除対象として表示されるため、必ず内容を確認してください。
* ドキュメントでテーブルやカラムの名前を変更すると、マイグレーションDDLは名前を変更する文（RENAME）を作成します。削除して作り直さないため、データは残ります。
* 既存のテーブルに追加したインデックスも、マイグレーションDDLに含まれます。

データベースに接続していないドキュメントは、ドキュメント一覧の行メニューにある **{{model.list.menu.connect}}**で接続します。

### 10.5 別のDBMSに複製

![別のDBMSに複製](/guide-assets/ja/editor-convert.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}**は、対象DBMSだけが異なる新しいドキュメントを作成します。元のドキュメントは変更されません。

* 作成前に、表記が変わる型と、対象DBMSに対応しない型が表示されます。
* 対応しない型は元の値のまま新しいドキュメントに残るため、作成後に手動で修正してください。
* 保存していない編集も、新しいドキュメントに含まれます。
* 対象DBMSが外部キーのインデックスを自動で作成しない場合は、インデックスのない外部キーカラムにインデックスを追加します。追加されるインデックスも作成前に表示されます。
* 新しいドキュメント名の既定値は「元の名前 (対象DBMS)」で、変更できます。

## 11. データブラウザ

データブラウザは、接続先データベースの実際のデータを参照・編集するウィンドウです。次の3か所から開けます。

* データベースタブの接続行にある「データを見る」ボタン
* エディタの **{{model.editor.toolbar.tools}}** › **{{database.openShort}}**
* エディタでテーブルを右クリック › **{{model.editor.contextMenu.viewTableData}}**

エディタからの2つは新しいウィンドウを開きません。エディタ最下部の **{{shareViewer.tab.data}}** タブに切り替え、ドキュメントの接続を表示します。タブは **ERD**、**{{shareViewer.tab.requirements}}**、**{{shareViewer.tab.data}}**、**{{shareViewer.tab.comments}}** の順です。ほかのタブに移っても、選んだテーブルと条件は残ります。データベースに接続されていないドキュメントでは、タブに **{{model.connect.toolbar}}** ボタンが表示されます。

タブの中では、接続名、DBMS、接続先アドレスが、テーブル名と **{{database.tabs.data}}**、**{{database.tabs.structure}}**、**{{database.tabs.sql}}** タブのある行の右端に表示されます。別のヘッダー行はありません。

ERDドキュメントと一緒に開くと、左の一覧のテーブルをドキュメントのグループごとに分けます。グループはドキュメントの順に並び、エディタと同じ色が付きます。どのグループにもないテーブルは **{{database.objects.ungrouped}}** に、ドキュメントにないテーブルは **{{database.objects.notInDocument}}** にまとまります。グループ名を押すと折りたたまれます。検索中は、一致するテーブルがないグループは隠れます。

編集者以上のロールが必要です。閲覧者とコメント投稿者には「データを見る」ボタンが表示されません。実際に可能な操作は、接続に登録したデータベースアカウントの権限によって決まります。アカウントに書き込み権限がない場合、行の編集や書き込み系のSQLは失敗します。

1つの文は8秒以内に終わる必要があります。8秒を過ぎると実行が取り消されるため、条件を絞って再度実行してください。1人が同時に実行できるリクエストは2つまでです。

### 11.1 データタブ — 参照

![データタブ](/guide-assets/ja/data-tab.webp)

* 左の一覧からテーブルまたはビューを選びます。名前の横の数字は、おおよその行数です。
* **{{database.data.addFilter}}**でカラム、演算子、値を指定し、**{{database.data.apply}}**を押します。条件は10個まで指定でき、すべての条件を満たす行だけが表示されます。値の入力中は照会されず、**{{database.data.apply}}**を押したときに照会されます。
* 演算子は次のとおりです：`=`、`≠`、`<`、`≤`、`>`、`≥`、{{database.data.op.CONTAINS}}、{{database.data.op.STARTS_WITH}}、{{database.data.op.IN}}、{{database.data.op.IS_NULL}}、{{database.data.op.IS_NOT_NULL}}。
* 列の見出しをクリックすると、そのカラムで並べ替えます。もう一度クリックすると、並べ替えの向きが切り替わります。
* 1ページに100行ずつ表示され、下部でページを切り替えます。**{{database.data.countExact}}**を押す前はおおよその行数が表示され、押すと全体の行数を正確に数えます。
* **{{database.data.downloadCsv}}**を押すと、現在画面に表示されている行をCSVファイルとしてダウンロードします。ほかのページの行は含まれません。
* 接続に紐付いたERDドキュメントがある場合は、列の見出しにそのドキュメントの論理名もあわせて表示されます。論理名に `-----` で付けた説明は、見出しにマウスを乗せると表示されます。
* 列は見出しと型に合った幅で始まります。見出しの右端をドラッグすると幅が変わり、ダブルクリックすると最初の幅に戻ります。
* キーボードでも幅を変えられます。見出しの右端にフォーカスを置いて `←`、`→` を押します。`Shift` を一緒に押すと大きく変わり、`Enter` を押すと最初の幅に戻ります。
* 変えた幅は、このブラウザに接続とテーブルごとに記憶されます。
* 長い値は省略して表示され、末尾に全体の文字数が付きます。セルをクリックすると値全体を確認できます。
* NULLは薄い文字の`NULL`、空文字列は空欄で表示されます。バイナリ値はサイズだけが表示されます。
* インデックスのない列で並べ替えたり条件を付けたり、{{database.data.op.CONTAINS}}・{{database.data.op.STARTS_WITH}}の条件を使うと、条件行の下にオレンジ色の案内が表示されます。大きなテーブルでは照会が遅くなる可能性があるという意味で、照会はそのまま実行されます。主キーやインデックスの先頭列で指定すると案内は消えます。

![遅くなる可能性の案内](/guide-assets/ja/data-slow-hint.webp)

### 11.2 外部キーをたどる

![この行を参照する行を表示](/guide-assets/ja/data-follow-menu.webp)

外部キーでつながった行をすぐに開けます。

* 外部キーのカラムの値の横には、小さな矢印ボタンがあります。押すと親テーブルを開き、その値の行だけを表示します。
* ほかのテーブルから参照されるテーブルでは、行の左に **{{database.follow.references}}** ボタンがあります。押すと、この行を参照するテーブルが「テーブル (外部キーのカラム)」の形で表示されます。1つ選ぶと、そのテーブルを開き、この行を指す行だけを表示します。
* 絞り込みの条件は条件の行に表示されます。条件を変更または削除して **{{database.data.apply}}** を押すと、もう一度照会します。
* 複数のカラムからなる外部キーもたどれます。
* 値がNULL、切り詰められた値、バイナリ値の場合はたどれません。このときボタンは表示されないか、押せません。
* たどる先のテーブルが左の一覧にない場合は、見つからないという通知が表示されます。

![外部キーをたどって開いたテーブル](/guide-assets/ja/data-follow.webp)

### 11.3 データタブ — 行を編集する

![行の編集](/guide-assets/ja/data-edit.webp)

編集内容はすぐには反映されません。変更をためておき、まとめて適用します。

| 操作 | 方法 | 表示 |
|---|---|---|
| 値を編集する | セルをダブルクリックして値を入力し、`Enter`を押す | セルがオレンジ色 |
| NULLにする | 編集中に **{{database.edit.setNull}}** ボタンを押す。NULLを許可するカラムにのみ表示されます | セルがオレンジ色 |
| 行を追加する | **{{database.edit.addRow}}**を押す。表の先頭に空の行が作成されます | 行が緑色 |
| 行を削除する | 行の左にあるごみ箱のアイコンを押す | 行が赤色、文字に取り消し線 |
| 取り消す | 行の左にある元に戻すアイコン、または **{{database.edit.discard}}**を押す | 表示が消える |

下部の帯に、追加、編集、削除の件数が表示されます。**{{database.edit.apply}}**を押すと確認ウィンドウが表示されます。

![適用の確認](/guide-assets/ja/data-apply-confirm.webp)

* 変更は1つのまとまり（トランザクション）として適用されます。1件でも失敗すると、すべて取り消されます。
* 削除が含まれている場合は警告が表示されます。適用後は元に戻せません。
* ビューと、主キーのないテーブルのデータは編集できません。その場合は、タブの上に理由が表示されます。
* 新しい行で空欄のままにしたセルには、データベースのデフォルト値が入ります。
* 生成カラムの値はデータベースが計算します。新しい行では **{{database.edit.generatedPlaceholder}}** と表示され、値の入力や変更はできません。
* セルを空にすると空文字列になります。NULLを入れるには **{{database.edit.setNull}}** ボタンを使います。
* 値を元に戻したセルは、変更の対象から外れます。
* 1回に適用できる変更は100件までです。
* 適用に失敗した場合、変更は画面にそのまま残り、失敗した行にはデータベースのエラーメッセージが表示されます。
* 適用していない変更があるまま、別のテーブルやタブに移動したりウィンドウを閉じたりすると、確認ウィンドウが表示されます。

### 11.4 構造タブ

![構造タブ](/guide-assets/ja/data-structure.webp)

選んだテーブルのカラム（名前、型、NULL許可、デフォルト値、コメント）、インデックス、外部キー、**{{database.structure.referencedBy}}**を表示します。ここでは構造を変更できません。ERDで変更してから、マイグレーションDDLで反映します。

* コメントも `-----` より前の部分だけを表示し、説明はマウスを乗せると表示されます。
* 自動増分のカラムには **{{database.structure.autoIncrement}}**、生成カラムには **{{database.structure.generated}}** の表示が付きます。
* **{{database.structure.referencedBy}}** は、ほかのテーブルからこのテーブルを指す外部キーです。

![ドキュメントとの違い](/guide-assets/ja/data-compare.webp)

エディタの **{{shareViewer.tab.data}}** タブでは、構造タブの最上部に **{{database.compare.title}}** が表示されます。編集者以上のロールにだけ表示されます。新しいウィンドウで開いたデータブラウザにはありません。

* **{{database.compare.run}}** を押すと、選んだテーブルの実際の構造とERDドキュメントを比較します。もう一度読み込むには **{{database.compare.again}}** を押します。
* 違いは、テーブル、カラム、主キー、ユニークキー、リレーションごとに1行ずつ表示されます。データベースにだけあれば「DB にだけある」、ドキュメントにだけあれば「ドキュメントにだけある」、両方にあって異なれば「異なる」が付きます。
* 違いがなければ **{{database.compare.same}}** と表示されます。
* ドキュメントを変更すると、一覧はすぐに変わります。保存していない編集も反映されます。
* **{{database.compare.toDocument}}** はDB同期のウィンドウを開きます。データベースの構造をドキュメントに取り込むときに使います（10.4節）。
* **{{database.compare.toDatabase}}** はマイグレーションDDLのウィンドウを開きます。ドキュメントの構造をデータベースに反映するときに使います（10.4節）。

### 11.5 SQLタブ

![SQLタブ](/guide-assets/ja/data-sql.webp)

* SQLを入力して **{{database.sql.run}}**を押すか、`Ctrl/Cmd+Enter`を押します。カーソル位置の文、または選択した部分だけが実行されます。
* 構文のハイライトは接続先のDBMSに合わせて行われます。SQLのキーワードと、テーブル名・ビュー名は自動で補完されます。カラム名は補完されません。
* 照会の結果は下の表に表示されます。結果が多い場合は先頭の500行だけが表示され、その旨が案内されます。結果の表は見出しで並べ替えられないため、並べ替えるには文に`ORDER BY`を書きます。結果はCSVとしてダウンロードできます。
* データや構造を変更する文は、実行する前に確認ウィンドウが表示されます。実行すると元に戻せません。
* データを変更する文では、変更された行数が表示されます。エラーが発生した場合は、データベースのエラーメッセージがそのまま表示されます。
* 履歴ボタンで、以前に実行した文を呼び出せます。履歴はこのブラウザにのみ、接続ごとに直近50件まで保存されます。
* テーブルの構造を変更する文を実行すると、ERDドキュメントとの間に差異が生じることがあります。その場合は **{{model.editor.toolbar.sync}}**でドキュメントに反映します。

## 12. 検証

![設計検証](/guide-assets/ja/editor-validation.webp)

ツールバーの **{{model.validation.toggle}}**を押すと、左側に **{{model.validation.title}}** パネルが開きます。ドキュメントを編集するたびに自動で再検査されます。

* 上部の深刻度ボタンで、表示するエラー、警告、参考を選びます。
* 項目をクリックすると、キャンバスがそのテーブルの位置に移動します。
* パネルを開いている間は、問題のあるテーブルの枠にも深刻度の色が表示されます。参考はキャンバスには表示されません。
* ツールバーの **{{model.validation.toggle}}**ボタンにはエラーの件数が、エラーがない場合は警告の件数が表示されます。パネルを閉じていても、件数は常に最新の状態に保たれます。
* 警告と参考の項目は、意図したものであれば例外にできます。項目にマウスを乗せ、右側の目のアイコン（**{{model.validation.exception.mark}}**）を押し、理由を1行（200文字以内）で書いて保存します。エラーは例外にできません。
* 例外にした項目は、ボタンの件数、深刻度ボタンの件数、キャンバスの枠の色から除かれます。上部の **{{model.validation.exception.chip}}** ボタンを押すと、例外の一覧が理由、作成者、日付とともに表示され、**{{model.validation.exception.remove}}**で元に戻せます。問題が直って表示されなくなった例外には **{{model.validation.exception.stale}}** が付きます。対象のテーブル、カラム、リレーションを削除すると例外も削除されます。例外はドキュメントに保存されるため、元に戻すや共同編集にも反映され、閲覧権限だけの人は見ることだけができます。
* エラーがあっても保存は妨げられません。エラーはデータベースへの反映時に失敗する可能性のある問題なので、デプロイする前に修正してください。

| 深刻度 | ルール | 意味 |
|---|---|---|
| エラー | {{model.validation.rules.DUPLICATE_TABLE_NAME}} | 同じ物理名のテーブルが2つ以上ある |
| エラー | {{model.validation.rules.DUPLICATE_COLUMN_NAME}} | 1つのテーブルに同じ名前のカラムが2つ以上ある |
| エラー | {{model.validation.rules.DUPLICATE_KEY_NAME}} | ユニークキー、インデックス、CHECK制約の名前が重複している |
| エラー | {{model.validation.rules.COMPOSITE_KEY_DUPLICATE_COLUMN}} | 1つのキーに同じカラムが2回含まれている |
| エラー | {{model.validation.rules.FK_TYPE_MISMATCH}} | 外部キーカラムと親カラムの型が異なる |
| エラー | {{model.validation.rules.FK_TARGET_NOT_KEY}} | 外部キーが参照するカラムが主キーでもユニークキーでもない |
| エラー | {{model.validation.rules.FK_NULLABILITY_MISMATCH}} | リレーションの多重度と外部キーのNULL許可が一致していない |
| エラー | {{model.validation.rules.ONE_TO_ONE_MISSING_UK}} | 1:1リレーションなのに外部キーにユニークキーがない |
| エラー | {{model.validation.rules.UNKNOWN_DATA_TYPE}} | カラムの型がCrowfootの型一覧にない |
| エラー | {{model.validation.rules.MISSING_TYPE_LENGTH}} | VARCHAR、VARBINARYに長さがない（PostgreSQLのドキュメントは検査しない） |
| 警告 | {{model.validation.rules.MISSING_PK}} | 主キーのないテーブル |
| 警告 | {{model.validation.rules.EMPTY_TABLE}} | カラムのないテーブル |
| 警告 | {{model.validation.rules.FK_MAPPING_EMPTY}} | リレーションに対応付けられたカラムがない |
| 警告 | {{model.validation.rules.ORPHAN_TABLE}} | どのテーブルともリレーションがない |
| 警告 | {{model.validation.rules.CIRCULAR_REFERENCE}} | 外部キーをたどると自分自身に戻ってくる |
| 警告 | {{model.validation.rules.NAMING_CONVENTION}} | 物理名が命名規則に合っていない |
| 警告 | {{model.validation.rules.MISSING_LOGICAL_NAME}} | 論理名が空になっている |
| 参考 | {{model.validation.rules.FK_WITHOUT_INDEX}} | 外部キーカラムで始まるインデックスがない |
| 参考 | {{model.validation.rules.WIDE_TABLE}} | カラムが30個を超えている |

## 13. 共有とコメント

### 13.1 共有リンク

![ドキュメントを共有](/guide-assets/ja/editor-share.webp)

**{{model.editor.toolbar.share}}**を押し、続けて **{{model.share.issue}}**を押すと、共有リンクが作成されます。リンクを知っている人は、ログインしなくてもドキュメントを閲覧できます。編集はできません。

* **{{model.share.period.unlimited}}** または **{{model.share.period.custom}}**を選びます。期間を指定した場合、開始日時から終了日時までの間だけ開けます。
* リンクごとに、閲覧数、いいね数、コメント数が表示されます。
* コピーのアイコンでURLをコピーし、ごみ箱のアイコンでリンクを取り消します。取り消したリンクはすぐに開けなくなります。
* リンクの発行と取り消しは編集者以上が行えます。1つのドキュメントに複数のリンクを作成できます。
* 共有リンクには、発行時点のコピーではなく、ドキュメントの最新の内容が表示されます。
* 共有したドキュメントは、スタートページの共有ギャラリーにも表示されます。ギャラリー下部の **{{landing.gallery.more}}**を選ぶと、すべての共有ドキュメントを名前や説明で検索し、ページを切り替えながら閲覧できます。

共有画面では、ERDの閲覧、SQLスクリプトの取得、いいねやコメントができます。いいねはログインしたユーザーのみ可能です。ログインしていない人は、ニックネームとパスワードを入力してコメントを投稿します。

### 13.2 コメントタブ

エディタ最下部の **{{shareViewer.tab.comments}}** タブには、共有リンク経由で寄せられたいいねとコメントがまとめて表示されます。コメントが付くと、ベルのアイコンに通知が届きます。

* コメントはドキュメント単位でまとめられます。同じドキュメントの共有リンクにはすべて同じコメントが表示され、リンクを取り消してもコメントは残ります。
* 共有リンクのないドキュメントでも、このタブでメンバー同士がコメントをやり取りできます。
* コメント投稿者以上のロールがあれば、コメントを書き込めます。閲覧者は閲覧といいねだけができます。
* 返信できるのはドキュメントを作成した人だけで、返信には作成者の印が付きます。返信にさらに返信することはできません。
* ログインせずに投稿したコメントは、投稿時に入力したパスワードで編集・削除します。

## 14. バージョン履歴

### 14.1 保存履歴を見る

![バージョン履歴](/guide-assets/ja/editor-history.webp)

ドキュメントを保存するたびに、バージョンが1つずつ記録されます。**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.history}}**で開きます。

* バージョンごとに、保存した人、日時、変更内容の要約（追加、変更、削除、移動）が表示されます。
* **{{model.editor.history.editMemo}}**でバージョンにメモを残せます。検索欄ではメモの内容を検索します。
* **{{model.editor.history.view}}**を押すと、そのバージョンのドキュメントを読み取り専用で開きます。
* **{{model.editor.history.restore}}**を押すと、そのバージョンの内容が新しいバージョンとして保存されます。現在の内容も履歴にそのまま残ります。

### 14.2 バージョン比較

**{{model.editor.history.compare}}**を押すと、2つのバージョンの違いを確認できます。

* キャンバスは比較対象のバージョンをもとに描画され、変更されたテーブルには`+`（追加）や`~`（変更）の印が付きます。
* 削除されたテーブルは、別の一覧に表示されます。
* **{{model.editor.compare.exit}}**でドキュメントに戻ります。

### 14.3 マイグレーションDDL

バージョン比較画面の **{{model.editor.compare.migrationDdl}}**は、2つのバージョンの差分からALTER文を生成します。前回のデプロイ以降に変更された部分だけをデータベースに反映するときに使います。スクリプトをコピーして、データベースで実行してください。データが失われる可能性のある文には警告が付きます。データベースで直接実行したい場合は、DB同期のマイグレーションDDLを使います（10.4節）。

## 15. 一緒に編集する

複数の人が同じドキュメントを同時に開いて編集できます。

* ツールバーには同じドキュメントを開いている人が表示され、キャンバス上ではほかの人のカーソルの動きが表示されます。
* ほかの人が編集した内容は、すぐに自分の画面にも反映されます。
* ほかの人が編集している項目はロックされ、編集中の人の名前が表示されます。ロックは、その人が編集ウィンドウを閉じるか、ドキュメントから離れると解除されます。
* 閲覧者とコメント投稿者は、ほかの人の編集やカーソルを見ることはできますが、ドキュメントを編集することはできません。
* 2人が同じ属性を編集すると、あとから編集した値が残ります。自分の値が上書きされると通知が表示され、**{{model.editor.collab.lwwRestore}}**で元に戻せます。
* 右下の吹き出しボタンは **{{model.editor.chat.label}}**です。同じドキュメントを開いている人とチャットできます。
  * `Enter`で送信し、`Shift+Enter`で改行します。メッセージは500文字まで入力できます。
  * チャットウィンドウを閉じているときにメッセージが届くと、通知とともにボタンに未読数が表示されます。
  * あとから参加した人も、直近50件のメッセージを見られます。チャットはドキュメントには保存されません。

保存時に、ほかの人が先に保存していた場合は **{{model.editor.conflict.title}}** ウィンドウが表示されます。

* 互いに重ならない変更は、自動でマージされます。
* 重なる項目ごとに、**{{model.editor.conflict.keepMine}}** または **{{model.editor.conflict.useServer}}**を選びます。
* **{{model.editor.conflict.resolve}}**を押すと、選んだ内容でマージして保存します。

保存できないままウィンドウを閉じても、編集内容はブラウザに残ります。ドキュメントを再度開くと復元されます。

## 16. チーム

![チーム画面](/guide-assets/ja/team-detail.webp)

チームは、ユーザーをまとめて管理する単位です。チームをワークスペースのメンバーとして追加すると、チームの全員にまとめて権限が付与されます。

* 上部メニューの **{{shell.nav.teams}}**から移動します。サイドバーの **{{shell.sidebar.newTeam}}**でチームを作成します。チームを作成しても、ワークスペースは作成されません。
* **{{team.members.addButton}}**でユーザーを検索して追加し、**{{team.members.remove}}**でチームから外します。
* チームのオーナーは、名前と説明の編集や、**{{team.detail.settings.dissolveButton}}**ができます。チームを解散すると、チームに付与されていたワークスペースの権限も取り消されます。

## 17. コミュニティと通知

### 17.1 リリースノート

![リリースノート](/guide-assets/ja/community-release-notes.webp)

新しいバージョンでの変更点をお知らせする記事です。記事をクリックすると本文が開き、本文の言語を選べます。

### 17.2 フィードバック

![フィードバック](/guide-assets/ja/community-feedback.webp)

改善要望や見つけたバグを投稿する掲示板です。**{{community.board.newPost}}**で投稿を作成でき、画像も添付できます。投稿ごとにコメントでやり取りできます。

### 17.3 自分のコメント、いいねしたドキュメント

![自分のコメント](/guide-assets/ja/community-my-comments.webp)

**{{shell.sidebar.communityMyComments}}**には、共有ドキュメントに自分が投稿したコメントがまとめて表示されます。**{{shell.sidebar.communityMyLikes}}**には、自分がいいねした共有ドキュメントが表示されます。行をクリックすると、そのドキュメントに移動します。

### 17.4 通知

![通知](/guide-assets/ja/shell-notifications.webp)

ベルのアイコンを押すと、最近の通知が表示されます。通知には次の5種類があります。

* 自分のドキュメントにコメントが付いたとき
* 自分のドキュメントにいいねが付いたとき
* 自分のコメントにドキュメントの作成者が返信したとき
* 自分がフィードバックに書いた投稿に他の人がコメントしたとき。自分のコメントは通知しません
* （管理者のみ）他の人がフィードバックに新しい投稿をしたとき

通知を押すと既読になり、そのドキュメントや投稿に移動します。コメントの通知はそのコメントまでスクロールし、しばらく強調して表示します。

**{{shell.notifications.markAll}}**で通知をすべて既読にでき、**{{shell.notifications.viewAll}}**で通知一覧に移動します。

![通知一覧](/guide-assets/ja/community-notifications.webp)

## 18. 管理者

![管理者画面](/guide-assets/ja/admin-users.webp)

管理者アカウントでは、上部メニューに **{{shell.nav.admin}}**が表示されます。

| メニュー | 内容 |
|---|---|
| **{{shell.sidebar.adminUsers}}** | ユーザー一覧、管理者権限、アカウントの状態 |
| **{{shell.sidebar.adminCodes}}** | データベースの種類などのコード値 |
| **{{shell.sidebar.adminManaged}}** | サービス提供データベースのインスタンスと発行状況 |
| **{{shell.sidebar.adminSystemTerms}}** | システム辞書の単語の登録と削除 |
| **{{shell.sidebar.adminAuditLogs}}** | 主な操作の記録 |
| **{{shell.sidebar.adminTraffic}}** | アクセス統計 |

## 19. ショートカット

![キーボードショートカット](/guide-assets/ja/editor-shortcuts.webp)

エディタで`Ctrl/Cmd+/`を押すか、ツールバーのキーボードのアイコンを押すと、ショートカット一覧のウィンドウが開きます。

| ショートカット | 操作 |
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
| `Shift+`矢印キー | {{model.editor.shortcuts.row.nudgeFast}} |
| `Space+Drag` | {{model.editor.shortcuts.row.pan}} |
| 右クリック | {{model.editor.shortcuts.row.contextMenu}} |
| `Ctrl/Cmd+/` | {{model.editor.shortcuts.row.help}} |
| `Ctrl/Cmd+Enter` | データブラウザのSQLタブで実行 |

テキストの入力欄にカーソルがあるときは、ヘルプ以外のショートカットは動作しません。編集権限がない場合、編集・移動・削除のショートカットは動作しません。

## 20. Claudeと一緒に設計する (MCP)

Claude CodeなどのMCPクライアントをワークスペースに接続すると、対話しながら要件を整理し、ERDを作成・編集できます。Claudeが作成した内容はCrowfootの画面にそのまま表示され、画面で変更した内容はClaudeが読み込み直します。

### 20.1 接続する

![MCPタブ](/guide-assets/ja/workspace-mcp.webp)

ワークスペースの **{{workspace.detail.tabs.mcp}}** タブでトークンを発行します。このタブはメンバー全員に表示されます。

![トークンの発行](/guide-assets/ja/mcp-issue.webp)

* **{{workspace.mcp.issueButton}}**を押して、名前と期間を指定します。期間は無期限、30日、90日、365日から選びます。トークンは1人につき、ワークスペースごとに5個まで発行できます。
* 発行すると、トークンと **{{workspace.mcp.commandLabel}}**が表示されます。コマンドをコピーしてターミナルで実行すると、接続が完了します。
* トークンとコマンドは、タブからいつでも再度コピーできます。一覧でトークンの横にあるコピーボタンは、トークンだけをコピーします。トークンの全文は発行した本人にのみ表示され、ほかのメンバーのトークンはオーナーであっても先頭部分しか表示されません。オーナーにはワークスペースのすべてのトークンが表示され、ほかのメンバーには自分のトークンだけが表示されます。
* 一覧には、トークンごとに名前、発行者、発行日、有効期限、最終使用日時が表示されます。

![発行したトークンと登録コマンド](/guide-assets/ja/mcp-issued.webp)

* トークンは発行した人の権限で、そのワークスペースでのみ動作します。{{common.role.VIEWER}}や{{common.role.COMMENTER}}が発行したトークンは読み取り専用です。
* トークンをClaudeとの会話に貼り付けないでください。登録コマンドはターミナルで実行します。
* 一覧のごみ箱のアイコンでトークンを破棄します。破棄すると、そのトークンで接続したClaudeはすぐにアクセスできなくなります。オーナーはほかのメンバーのトークンも破棄できます。
* Claude CodeとChatGPT（Codex）で使えます。タブの **{{workspace.mcp.connectTitle}}**でクライアントを選ぶと登録方法が表示され、コピーできます。ChatGPTのWeb版・モバイルアプリのコネクタには対応していません。

### 20.2 Claudeに任せられること

![使い方と依頼の例](/guide-assets/ja/mcp-usage.webp)

登録したフォルダでClaude CodeまたはCodexを起動し、やりたいことを言葉で依頼します。タブの **{{workspace.mcp.usage.title}}**に依頼の例があり、コピーして使えます。

* チャットに`/mcp`と入力すると、接続されているかを確認できます。
* 登録は、コマンドを実行したフォルダにのみ適用されます。すべてのフォルダで使うには、登録コマンドに`--scope user`を付けます。
* 依頼の例：「図書レンタルサービスの要件を整理して、MySQL 用の新しい ERD ドキュメントを作って」「このドキュメントを検証して DDL を見せて」

| できること | 説明 |
|---|---|
| ワークスペースの参照 | ドキュメント一覧、用語辞書、ドメインタイプ、設計ルールを読み取ります |
| 要件の整理 | 会話で出た要件をドキュメントに登録し、編集します（20.3節） |
| 要件リストの同期 | 議事録や企画書で整理した要件リスト全体をドキュメントと比べます。追加・変更するもの、抜けたものを先に示し、確認を受けてから一度に反映します。抜けた要件は削除せず除外に変えます |
| 受け入れ基準をデータで確認 | 受け入れ基準に確認 SQL を付け、接続されたデータベースで実行して基準ごとに合否を知らせます（20.3節） |
| ERDの作成と編集 | テーブル、カラム、キー、インデックス、リレーション、グループを作成・編集します。ワークスペースの用語とドメインタイプに従います |
| 検証とSQL | 設計検証の結果とSQLスクリプトを取得します |
| SQLの取り込み | CREATE TABLEスクリプトから新しいドキュメントを作成します |
| データベースへの反映 | サービス提供データベースを発行し、ドキュメントのデプロイや変更分だけの反映を行います。データベースで変わった構造をドキュメントに取り込むこともできます（20.4節） |
| サンプルデータ | テーブル構造に合ったサンプルデータを作成し、デプロイ済みのデータベースに投入します（20.4節） |

* Claudeが変更するたびにバージョンが記録されます。結果が気に入らない場合は、以前のバージョンに戻せます（14節）。
* Claudeはドキュメントを削除できません。テーブルやカラムを削除するときは、何が削除されるかを事前に示します。
* Claudeが行わない操作もあります。ワークスペースとメンバーの管理、接続の登録と変更、サービス提供データベースの取り消し、接続情報の確認、共有リンクの発行、バージョンの復元、辞書とドメインタイプの登録は、画面から直接行います。
* Claudeが作成したテーブルは、ドキュメントを開いたときに自動で配置されます。配置済みのテーブルとメモは移動しません。
* エディタを開いている間にClaudeがドキュメントを変更すると、画面に新しい内容が読み込まれます。保存していない編集がある場合は、先に通知が表示されます。

### 20.3 要件パネル

![要件パネル](/guide-assets/ja/editor-requirements.webp)

エディタ最下部の **{{shareViewer.tab.requirements}}** タブを押すと、要件パネルが開きます。要件はドキュメントと一緒に保存されます。反映待ちの要件がある場合は、タブにその件数が表示されます。

* 要件はドメイン（グループ）ごとに整理されます。左の一覧でドメインを選ぶとそのドメインだけが表示され、ドメインごとに反映済みの数と進捗バーが表示されます。グループに属さない要件は **{{model.requirements.group.unassigned}}**、ドキュメント全体に適用される要件は **{{model.requirements.group.document}}**にまとめられます。
* ドメイン区画のタイトルをクリックすると折りたためます。**{{model.requirements.domains.showOnCanvas}}**を押すと、そのドメインのテーブルを選択した状態でERDタブに表示します。
* 行をクリックすると、内容とリンクされたテーブルが展開されます。テーブル名をクリックすると、ERDタブに戻ってそのテーブルを表示します。展開した行の **{{model.requirements.domains.showOnCanvas}}**を押すと、リンクされたテーブルをすべて選択して1画面に収めます。
* 上部の状態ボタンで絞り込みます。初期状態では **{{model.requirements.state.DROPPED}}**だけが非表示です。検索欄では、コード、タイトル、内容、テーブル名を対象に検索します。
* ドメイン区画の下の **{{model.requirements.untraced.title}}**は、そのドメインのテーブルのうち、どの要件にもリンクされていないテーブルです。
* **{{model.requirements.export.button}}**で、要件仕様をMarkdownまたはCSVファイルとして書き出せます。

| 状態 | 意味 |
|---|---|
| **{{model.requirements.state.APPLIED}}** | 確定した要件がERDに反映されています |
| **{{model.requirements.state.PENDING}}** | 確定しましたが、ERDが最新の内容をまだ反映していません。タイトルや内容を変更するとこの状態になります |
| **{{model.requirements.state.UNLINKED}}** | 反映済みと表示しましたが、リンクされたテーブルがありません |
| **{{model.requirements.state.LEFTOVER}}** | 除外した要件にテーブルがまだリンクされています |
| **{{model.requirements.state.DRAFT}}** | まだ確定していません |
| **{{model.requirements.state.DROPPED}}** | 対象外になりました |

![要件の編集](/guide-assets/ja/editor-requirement-dialog.webp)

編集者以上のロールがあれば、要件を手動で追加・編集できます。

* パネル上部の **{{model.requirements.add}}**、または展開した行の編集ボタンを押します。タイトル、内容、範囲、状態、グループ、リンクするテーブルを指定します。コード（REQ-001）は自動で付与されます。
* 反映待ちの行を開いて **{{model.requirements.changes.show}}** を押すと、最後に反映した内容と現在の内容を比べます。変わったタイトル、内容の追加行(緑の +)と削除行(赤の −)、受け入れ基準と関連テーブルの違いが表示されます。保存されたドキュメントを基準に比べるため、保存していない編集は保存後に表示されます。一度も反映していない要件は **{{model.requirements.changes.isNew}}** と表示されます。
* 同じ行の **{{model.requirements.steps.title}}** に順に従います。**{{model.requirements.steps.tables}}** で関連テーブルを修正し、データベースに接続されたドキュメントなら保存してから **{{model.requirements.steps.database}}** で変更した構造をデータベースに実行します。このボタンはDB同期のマイグレーションDDLウィンドウを開きます。最後に **{{model.requirements.markApplied}}** を押すと、状態が反映済みに変わります。この印もドキュメントの編集なので、元に戻せます。
* **{{model.requirements.criteria.title}}**は、要件が正しく反映されたかを確認するための項目です。編集ウィンドウで1行に1つずつ記入し、展開した行でチェックします。基準ごとに確認 SQL を付けて、データで確認することもできます（下記）。
* 不要になった要件は削除せず、状態を **{{model.requirements.status.dropped}}**に変更します。削除は、誤って登録した要件にのみ使ってください。
* 要件は1つのドキュメントにつき500件まで登録できます。

![変更内容と反映の手順](/guide-assets/ja/editor-requirement-changes.webp)

![受け入れ基準の確認 SQL](/guide-assets/ja/editor-requirement-check-dialog.webp)

データベースに接続されたドキュメントでは、受け入れ基準を実際のデータで確認できます。

* 編集ウィンドウの**{{model.requirements.checks.dialog.title}}**で基準を開き、値を1つ返す SELECT 文と**{{model.requirements.checks.dialog.expect}}**を記入します。期待値を空にすると0です。たとえば「メールが空の会員はいない」には`SELECT COUNT(*) FROM users WHERE email IS NULL`と書きます。SQL を空にすると確認しません。
* 確認 SQL は基準の文言に付きます。文言を変えた行は確認 SQL を書き直します。基準や確認 SQL を変えても反映待ちにはなりません。
* 受け入れ基準は要件ごとに20件、1行200文字まで書けます。確認 SQL は4,000文字までです。
* 確認 SQL のある基準があると、パネル上部に**{{model.requirements.checks.run}}**ボタンが表示されます。押すと接続されたデータベースで確認 SQL を読み取り専用で実行し、結果を期待値と比べます。展開した行の**{{model.requirements.checks.runOne}}**はその要件だけを確認します。編集者以上のロールが必要で、除外した要件は確認しません。
* 基準ごとに**{{model.requirements.checks.PASSED}}**、**{{model.requirements.checks.FAILED}}**、**{{model.requirements.checks.ERROR}}**の表示が付き、ボタンの横に件数が表示されます。不合格なら実際の値と期待値を、エラーなら実行できなかった理由とデータベースが返したメッセージを表示します。確認 SQL は SELECT 文1つだけ使えます。
* 結果はドキュメントに保存されません。確認 SQL を変えると、その基準の結果は消えます。Claude に「受け入れ基準をデータで確認して」と頼んでも同じ確認をします。

![データで確認した結果](/guide-assets/ja/editor-requirement-checks.webp)

### 20.4 データベースに反映する

Claudeがデータベースの構造を変更するには、その接続で許可しておく必要があります。

* 接続を追加または編集するときに、**{{connection.dialog.mcpApply}}**をオンにします。既定ではオフです。オンにした接続には、一覧に印が表示されます。
* サービス提供データベースは最初から許可されています。
* Claudeは実行するSQLを事前に示し、確認済みの計画だけを実行します。計画の確認後にドキュメントやデータベースが変更された場合は、実行せずに計画を立て直します。
* サンプルデータは、まず試しに投入してからロールバックし、制約違反がないことを確認したうえで、確認済みのデータだけを実際に投入します。投入のみを行い、変更や削除はしません。1回につきテーブル20個、1,000行までです。
* 初回のデプロイは空のデータベースにのみ行います。すでにテーブルがあるデータベースには、変更分だけを反映します。
* テーブルやカラムの物理名を変更すると、変更計画には名前を変更する文（RENAME）として表示されます。データはそのまま残ります。
* 削除する文は、別途承認しないと実行されません。承認しない場合は、追加と変更だけが実行されます。
* 許可していない接続では、Claudeは実行するSQLを示すだけです。実行は、エディタのデプロイ（10.3節）またはマイグレーションDDL（14.3節）から手動で行います。

## 21. よくある質問

**ドキュメントのデータベースの種類は変更できますか？**
変更できません。**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}**で、種類の異なる新しいドキュメントを作成してください。

**保存はいつ行われますか？**
編集後しばらくすると、自動で保存されます。**{{model.editor.toolbar.save}}** ボタンや`Ctrl/Cmd+S`ですぐに保存することもできます。保存するたびにバージョンが記録されます。

**間違えて編集した内容を元に戻すには？**
直前の編集は`Ctrl/Cmd+Z`で元に戻せます。保存済みの内容は、バージョン履歴から以前のバージョンに戻せます。

**単語と用語はどう違いますか？**
単語は名前を構成する1つの部分で、用語はカラム名全体です。用語にはドメインタイプを紐付けられるため、カラムに用語を使うと型も一緒に決まります。

**ドメインタイプを変更すると、カラムはすぐに変わりますか？**
すぐには変わりません。ドキュメントを開くと変更があったことが案内され、どのカラムに反映するかを選べます。

**データベースがなくても使えますか？**
使えます。ERDを描いて、SQLスクリプトを取得するだけでもかまいません。実際に実行してみたい場合は、データベースタブでサービス提供データベースを発行します。

**データブラウザで構造を変更できますか？**
データタブと構造タブでは変更できません。ERDで変更してから、マイグレーションDDLで反映します。エディタの **{{shareViewer.tab.data}}** タブでは、構造タブの **{{database.compare.toDatabase}}** からすぐに反映できます。

**共有リンクを受け取った人はドキュメントを編集できますか？**
編集できません。一緒に編集するには、ワークスペースのメンバーとして追加し、編集者のロールを付与してください。

**改善要望はどこに書けばよいですか？**
**{{shell.nav.community}}** › **{{shell.sidebar.communityFeedback}}**に投稿してください。

**Claudeが変更した内容を元に戻せますか？**
戻せます。Claudeが変更するたびにバージョンが記録されるため、バージョン履歴から以前のバージョンに戻せます。

**画面上部に「新しいバージョンがデプロイされました」と表示されたら？**
再読み込みしてください。開いている画面は古いバージョンのため、保存は停止されます。保存していない編集は、再読み込み後にそのまま復元されます。
