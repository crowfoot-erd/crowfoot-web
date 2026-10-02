Crowfoot 是一款在浏览器中绘制 ERD、与团队一起修改并应用到数据库的工具。本指南从界面上各部分的位置讲起，依次介绍全部功能。截图中的数据是为说明而准备的示例。

## 1. 界面总览

Crowfoot 的界面大致分为三种。

| 界面 | 打开方式 | 用途 |
|---|---|---|
| 应用界面 | 登录后打开 | 工作区、文档列表、成员、数据库、团队、社区 |
| 编辑器 | 在文档列表中点击文档，会在新窗口打开 | 绘制 ERD、管理标准、生成 SQL、共享、版本历史 |
| 数据浏览器 | 点击连接的查看数据按钮，会在新窗口打开 | 查看实际数据、编辑行、执行 SQL |

### 1.1 应用界面的顶部菜单

![应用界面的顶部菜单](/guide-assets/zh/shell-header.webp)

从左到右依次排列如下。

| 位置 | 名称 | 说明 |
|---|---|---|
| 左侧 | 标志 | 前往控制台 |
| 左侧 | **{{shell.nav.workspaces}}** | 工作区及其中的 ERD 文档 |
| 左侧 | **{{shell.nav.teams}}** | 创建团队并管理成员 |
| 左侧 | **{{shell.nav.community}}** | 发布说明、反馈、我的评论、点赞的文档、通知 |
| 左侧 | **{{shell.nav.admin}}** | 仅管理员账号可见 |
| 左侧 | **{{guide.title}}** | 在新窗口打开本文档 |
| 右侧 | **{{shell.nav.home}}** | 前往起始页（介绍页面） |
| 右侧 | 太阳图标 | 切换浅色和深色界面 |
| 右侧 | 地球图标 | 切换语言（{{common.language.ko}}, {{common.language.en}}, {{common.language.ja}}, {{common.language.zh}}） |
| 右侧 | 铃铛图标 | 通知。未读通知数以红色数字显示 |
| 右侧 | 我的名字 | 个人信息、语言、退出登录 |

### 1.2 左侧边栏

左侧边栏的内容会随顶部菜单中选择的项目而变化。

| 顶部菜单 | 侧边栏中显示的内容 |
|---|---|
| **{{shell.nav.workspaces}}** | **{{shell.sidebar.newWorkspace}}** 按钮、**{{shell.sidebar.mine}}**、**{{shell.sidebar.shared}}** |
| **{{shell.nav.teams}}** | **{{shell.sidebar.newTeam}}** 按钮、**{{shell.sidebar.ownedTeams}}**、**{{shell.sidebar.joinedTeams}}** |
| **{{shell.nav.community}}** | **{{shell.sidebar.communityReleaseNotes}}**、**{{shell.sidebar.communityFeedback}}**、**{{shell.sidebar.communityMyComments}}**、**{{shell.sidebar.communityMyLikes}}**、**{{shell.sidebar.communityNotifications}}** |
| **{{shell.nav.admin}}** | **{{shell.sidebar.adminUsers}}**、**{{shell.sidebar.adminCodes}}**、**{{shell.sidebar.adminManaged}}**、**{{shell.sidebar.adminSystemTerms}}**、**{{shell.sidebar.adminAuditLogs}}**、**{{shell.sidebar.adminTraffic}}** |

### 1.3 编辑器窗口

![编辑器整体界面](/guide-assets/zh/editor-overview.webp)

| 位置 | 内容 |
|---|---|
| 最上方 | 文档名称、目标 DBMS、版本号、最后保存的人和时间、**{{model.viewer.close}}** |
| 工具栏 | 资源管理器、术语词典、校验、撤销、保存、自动布局、生成 SQL、共享、导出、工具、视图、放大和缩小 |
| 中间 | 画布。放置表、关系线、备注和分组 |
| 右下角 | 小地图和文档聊天按钮 |
| 最下方 | **ERD** 标签页和 **{{shareViewer.tab.comments}}** 标签页 |

工具栏上的按钮在第 5 节逐一说明。

### 1.4 数据浏览器窗口

![数据浏览器](/guide-assets/zh/data-tab.webp)

| 位置 | 内容 |
|---|---|
| 最上方 | 连接名称、DBMS、连接地址、主题和语言、**{{database.close}}** |
| 左侧 | 表和视图列表、搜索框、刷新 |
| 右上方 | 所选表的名称，以及 **{{database.tabs.data}}**、**{{database.tabs.structure}}**、**{{database.tabs.sql}}** 标签页 |
| 右侧 | 标签页的内容 |

## 2. 开始使用

### 2.1 登录

![登录界面](/guide-assets/zh/login.webp)

1. 在起始页点击登录按钮。
2. 阅读服务条款并勾选同意。勾选后登录按钮才可用。
3. 使用 GitHub 或 Google 账号继续。无需另外注册。

长时间不使用会弹出 **{{auth.sessionExpired.title}}** 窗口。点击 **{{auth.sessionExpired.loginAgain}}** 即可。

### 2.2 控制台

![控制台](/guide-assets/zh/dashboard.webp)

登录后会打开控制台。

* 上方的数字卡片分别是我的工作区数、我的团队数、以成员身份加入的工作区数。
* 点击 **{{dashboard.shortcuts}}** 中的卡片，前往该工作区。
* 点击 **{{dashboard.myTeams}}** 中的卡片，前往该团队。
* **{{community.recent.title}}** 按时间倒序显示发布说明和反馈帖子。
* 用右上角的 **{{dashboard.newWorkspace}}** 按钮创建工作区。

### 2.3 个人信息、语言、主题

![用户菜单](/guide-assets/zh/shell-user-menu.webp)

点击右上角我的名字，会显示姓名、邮箱、关联的账号和注册日期。在同一菜单中可以切换语言和退出登录。语言也可以通过地球图标切换。所选语言在下次进入时保持不变。

## 3. 工作区

工作区是存放 ERD 文档、数据库连接、术语词典和域类型的空间。成员和权限也以工作区为单位设置。

### 3.1 创建

![新建工作区](/guide-assets/zh/workspace-create.webp)

点击侧边栏的 **{{shell.sidebar.newWorkspace}}** 并填写名称。创建者成为所有者。

### 3.2 工作区的标签页

打开工作区后，名称下方有六个标签页。

| 标签页 | 内容 |
|---|---|
| **{{workspace.detail.tabs.erd}}** | ERD 文档列表。创建、打开、删除文档 |
| **{{workspace.detail.tabs.database}}** | 服务方提供的数据库和数据库连接 |
| **{{workspace.detail.tabs.overview}}** | 名称、说明、创建者、成员数、创建日期 |
| **{{workspace.detail.tabs.members}}** | 成员和角色 |
| **{{workspace.detail.tabs.mcp}}** | 签发和吊销用于连接 Claude 等 MCP 客户端的令牌（见第 20 节） |
| **{{workspace.detail.tabs.settings}}** | 修改名称和说明、删除工作区。仅所有者可见 |

### 3.3 ERD 标签页 — 文档列表

![文档列表](/guide-assets/zh/workspace-erd.webp)

* 在搜索框中输入文档名称或说明进行查找。
* 点击文档名称，编辑器会在新窗口打开。
* 列表的列为文档名称、数据库类型、版本、创建者、最近修改。
* 用上方的五个按钮创建文档。详见第 4 节。

![文档行菜单](/guide-assets/zh/document-row-menu.webp)

点击行最右侧的三点按钮，会出现 **{{model.list.menu.edit}}** 和 **{{model.list.menu.delete}}**。尚未连接数据库的文档还会出现 **{{model.list.menu.connect}}**。删除的文档无法恢复。

### 3.4 成员标签页 — 成员和角色

![成员标签页](/guide-assets/zh/workspace-members.webp)

角色有四种。

| 角色 | 可以做的事 |
|---|---|
| {{common.role.OWNER}} (OWNER) | 所有操作。管理成员、设置和删除工作区 |
| {{common.role.EDITOR}} (EDITOR) | 创建和修改文档、修改词典和域类型 |
| {{common.role.COMMENTER}} (COMMENTER) | 阅读文档和发表评论 |
| {{common.role.VIEWER}} (VIEWER) | 阅读文档 |

![添加成员](/guide-assets/zh/member-add.webp)

点击 **{{workspace.members.addButton}}**，可以选择一个人或一个团队。

* **{{workspace.members.addDialog.targetUser}}**：输入姓名或邮箱的至少两个字符进行查找。
* **{{workspace.members.addDialog.targetTeam}}**：给团队分配角色后，该团队的所有成员都获得相同的角色。
* 不能分配所有者角色。
* 在列表中更改角色，或用 **{{workspace.members.revoke}}** 收回权限。

### 3.5 概览标签页和设置标签页

![概览标签页](/guide-assets/zh/workspace-overview.webp)

概览标签页显示工作区的基本信息。

![设置标签页](/guide-assets/zh/workspace-settings.webp)

在设置标签页修改名称和说明。**{{workspace.detail.settings.dangerZone}}** 中的 **{{workspace.detail.settings.deleteButton}}** 会删除工作区及其中的所有文档。无法恢复。

## 4. 创建 ERD 文档

创建文档有五种方式，都是 ERD 标签页上方的按钮。

| 按钮 | 适用场景 |
|---|---|
| **{{model.list.newDocument}}** | 从空白文档开始自己绘制 |
| **{{model.templates.openButton}}** | 复制示例文档来开始 |
| **{{sqlImport.openButton}}** | 已有 CREATE TABLE 脚本 |
| **{{reverse.openButton}}** | 读取已有数据库的结构 |
| **{{model.import.button}}** | 重新导入已导出的文档文件（.crown） |

### 4.1 新建 ERD 文档

![新建 ERD 文档](/guide-assets/zh/document-create.webp)

选择名称和数据库类型。数据库类型在创建文档时确定，之后无法更改。要换成其他类型，请使用编辑器的 **{{model.editor.toolbar.dbmsConvert}}**（见 10.5 节）。

### 4.2 从模板开始

![从模板开始](/guide-assets/zh/document-template.webp)

从准备好的示例文档中选择一个，复制到自己的工作区。可以先用 **{{model.templates.preview}}** 打开查看。

### 4.3 导入 SQL

![导入 SQL](/guide-assets/zh/document-sql-import.webp)

1. 填写数据库类型和文档名称。
2. 粘贴 CREATE TABLE 脚本，或用 **{{sqlImport.readFile}}** 读取文件。文件最大 1MB。
3. 点击 **{{sqlImport.preview}}**，会显示读取到的表数量、关系数量以及未能读取的语句。
4. 点击 **{{sqlImport.submit}}**。

这种方式不连接数据库，仅凭脚本创建文档。

### 4.4 从数据库导入

![从数据库导入](/guide-assets/zh/document-reverse.webp)

选择已登记的连接后，会读取该数据库的表、列、键、关系和注释来创建文档。列注释会作为逻辑名导入。这样创建的文档与该连接相关联，可以使用 **{{model.editor.toolbar.sync}}**。连接需要先在数据库标签页登记（见 10.1 节）。

### 4.5 导入文档文件（.crown）

把通过编辑器的 **{{model.editor.toolbar.export}}** › **{{model.editor.toolbar.crown}}** 下载的文件重新变成文档。用于把文档移到其他工作区或恢复备份。

## 5. 编辑器界面和工具栏

![编辑器工具栏](/guide-assets/zh/editor-toolbar.webp)

### 5.1 工具栏上的按钮

从左到右依次如下。

| 按钮 | 说明 |
|---|---|
| **{{model.editor.explorer.toggle}}** | 在左侧打开或关闭模型资源管理器（见 5.2 节） |
| **{{model.editor.termDictionary.toggle}}** | 打开或关闭术语词典和域类型面板（见第 9 节） |
| **{{model.validation.toggle}}** | 打开或关闭设计校验面板。问题数量以数字显示（见第 12 节） |
| **{{model.editor.toolbar.requirements}}** | 打开或关闭需求面板。待反映的需求数量以数字显示（见第 20.3 节） |
| {{model.editor.toolbar.undo}}、{{model.editor.toolbar.redo}} | 把编辑逐步撤销或重做 |
| **{{model.editor.toolbar.save}}** | 立即保存。编辑后稍等片刻也会自动保存 |
| **{{model.editor.toolbar.autoLayoutLayered}}** | 自动重新排列表。用旁边的箭头选择方式和方向（见 5.3 节） |
| **{{model.editor.toolbar.ddl}}** | 把文档生成为 SQL 脚本（见 10.2 节） |
| **{{model.editor.toolbar.share}}** | 创建只读共享链接（见第 13 节） |
| **{{model.editor.toolbar.export}}** | 下载为图片和文档文件（见 5.4 节） |
| **{{model.editor.toolbar.tools}}** | 逻辑名推断、同步数据库、查看数据、复制为其他 DBMS、域类型、版本历史（见 5.5 节） |
| DBMS 徽标 | 文档的目标 DBMS。点击会打开 **{{model.editor.toolbar.dbmsConvert}}** 窗口 |
| **{{model.editor.toolbar.view}}** | 选择列名显示、列显示和查看分组（见 5.6 节） |
| − 数字 + | 缩小、当前缩放比例、放大 |
| 四角图标 | **{{model.editor.toolbar.fit}}**。让整个文档适应屏幕 |
| 键盘图标 | **{{model.editor.shortcuts.open}}**（见第 19 节） |
| 问号图标 | 在新窗口打开本使用指南 |
| 太阳图标 | 切换浅色和深色界面 |

以只读角色打开时，编辑按钮会被禁用，并显示 **{{model.editor.toolbar.readOnly}}** 标记。

### 5.2 资源管理器（模型资源管理器）

![资源管理器](/guide-assets/zh/editor-explorer.webp)

* 以树形列表显示文档中的表、关系和备注。表按分组归类。
* 在搜索框中输入，会在表、列、关系和备注中查找。按 `Ctrl/Cmd+F` 可直接跳到搜索框。
* 点击条目，画布会移到该对象并将其选中。
* 分组行上的眼睛图标是只查看该分组，铅笔图标是编辑分组，垃圾桶图标是删除分组。

### 5.3 自动布局

![自动布局菜单](/guide-assets/zh/editor-menu-layout.webp)

点击按钮，会按所选方式重新排列表。点击箭头可以选择方式和方向，选择后立即执行。

| 项目 | 说明 |
|---|---|
| **{{model.editor.toolbar.autoLayoutLayered}}** | 从父到子分层排列。适合大多数文档 |
| **{{model.editor.toolbar.autoLayoutHub}}** | 把关系多的表放在中间，其余围绕排列 |
| **{{model.editor.toolbar.autoLayoutHybrid}}** | 混合两种方式 |
| **{{model.editor.toolbar.autoLayoutDown}}** | 父在上，子在下 |
| **{{model.editor.toolbar.autoLayoutRight}}** | 父在左，子在右 |

* 大型文档的计算需要几秒钟。计算期间界面不会卡住，可以用 **{{model.editor.toolbar.autoLayoutCancel}}** 中止。
* 如果对结果不满意，撤销一次即可回到原来的位置。
* 备注会放在关联表附近。

### 5.4 导出菜单

![导出菜单](/guide-assets/zh/editor-menu-export.webp)

| 项目 | 说明 |
|---|---|
| **{{model.editor.image.viewport}}** | 把当前屏幕上可见的部分下载为 PNG 图片 |
| **{{model.editor.image.document}}** | 把整个文档下载为一张 PNG 图片 |
| **{{model.editor.toolbar.crown}}** | 把文档下载为 .crown 文件。可以用 **{{model.import.button}}** 重新导入 |

### 5.5 工具菜单

![工具菜单](/guide-assets/zh/editor-menu-tools.webp)

| 项目 | 说明 | 详见 |
|---|---|---|
| **{{model.editor.toolbar.logicalNames}}** | 用词典填写空着的逻辑名 | 9.7 节 |
| **{{model.editor.toolbar.sync}}** | 比较已连接的数据库和文档并使其一致。仅已连接的文档可见 | 10.4 节 |
| **{{database.openShort}}** | 在新窗口打开已连接数据库的数据浏览器 | 第 11 节 |
| **{{model.editor.toolbar.dbmsConvert}}** | 创建一个仅目标 DBMS 不同的新文档 | 10.5 节 |
| **{{model.editor.domainType.menu}}** | 打开域类型列表 | 9.3 节 |
| **{{model.editor.toolbar.history}}** | 查看、比较和恢复保存记录 | 第 14 节 |

### 5.6 视图菜单

![视图菜单](/guide-assets/zh/editor-menu-view.webp)

| 分类 | 项目 | 说明 |
|---|---|---|
| **{{model.editor.toolbar.nameMode.label}}** | {{model.editor.toolbar.nameMode.physical}}、{{model.editor.toolbar.nameMode.logical}}、{{model.editor.toolbar.nameMode.both}} | 选择列名以哪种名称显示 |
| **{{model.editor.toolbar.columnMode.label}}** | {{model.editor.toolbar.columnMode.all}}、{{model.editor.toolbar.columnMode.keys}} | 选择仅键时只显示 PK 和 FK 列，便于总览大型文档 |
| **{{model.editor.toolbar.areaFilter.label}}** | {{model.editor.toolbar.areaFilter.all}}、分组名称 | 只显示所选分组的表 |

视图设置只改变屏幕显示，不会改变文档。

### 5.7 移动画布

* 拖动空白处，或按住 `Space` 拖动，可以移动画面。
* 用鼠标滚轮或工具栏的 − + 进行放大和缩小。
* 点击右下角的小地图，会跳到相应位置。
* 按住 `Shift` 点击对象，可以同时选择多个对象。`Ctrl/Cmd+A` 是全选。

## 6. 表和列

### 6.1 创建表

![空白处的右键菜单](/guide-assets/zh/editor-context-canvas.webp)

在画布的空白处点击鼠标右键，选择 **{{model.editor.contextMenu.createTable}}**。表会创建在点击的位置。

### 6.2 表的外观

![表](/guide-assets/zh/editor-table.webp)

| 位置 | 说明 |
|---|---|
| 色带 | 表的逻辑名。拖动色带可以移动表 |
| 名称行 | 表的物理名。点击即可直接修改。右侧的 ⓘ 是 **{{model.editor.table.info}}** |
| 列行 | 拖动左侧的六个点可以调整顺序。钥匙图标表示主键 |
| 列名 | 上面是物理名，下面是逻辑名。点击即可直接修改 |
| 类型、长度 | 数据类型和长度（或精度和小数位数）。点击即可修改 |
| **NN** | NOT NULL。点击开启或关闭。主键列始终开启 |
| **AI** | 自增。只有既是主键又是整数类型时才能开启 |
| **FK** | 外键列。由关系创建的列 |
| **D** | 使用域类型的列（见 9.4 节） |
| × | 删除列 |
| **{{model.editor.table.addColumn}}** | 在最下方添加列 |
| **{{model.editor.key.addUnique}}**、**{{model.editor.key.addIndex}}** | 创建唯一键和索引（见 6.5 节） |
| 边框上的点 | 开始创建关系的手柄（见 7.1 节） |

主键列始终集中在最上方。

### 6.3 列信息

![列信息](/guide-assets/zh/editor-column-info.webp)

双击列名，会打开 **{{model.editor.columnInfo.title}}** 窗口。在表上无法直接修改的属性也可以在这里一并修改。

| 项目 | 说明 |
|---|---|
| {{model.editor.columnInfo.physicalName}} | 在数据库中创建的列名 |
| {{model.editor.columnInfo.logicalName}} | 供人阅读的名称。生成 SQL 时作为 COMMENT 输出 |
| {{model.editor.columnInfo.pk}} | 开启后变为 NOT NULL，列会移到最上方 |
| {{model.editor.columnInfo.nullable}} | 设置是否接受 NULL |
| {{model.editor.columnInfo.autoIncrement}} | 只有既是主键又是 INT、BIGINT、SMALLINT 时才能开启 |
| {{model.editor.domainType.label}} | 选择域类型后，类型、长度、是否允许 NULL、默认值会按其值填入（见 9.4 节） |
| {{model.editor.columnInfo.dataType}}、{{model.editor.columnInfo.length}} | 根据类型显示长度或精度和小数位数的输入框 |
| {{model.editor.columnInfo.defaultValue}} | 例如：`0`、`NOW()` |
| {{model.editor.columnInfo.comment}} | 列的说明 |

类型名称会按 DBMS 显示。例如日期时间类型在 PostgreSQL 文档中显示为 TIMESTAMP，在 MySQL 文档中显示为 DATETIME。

### 6.4 表信息

![表信息](/guide-assets/zh/editor-table-info.webp)

点击表的 ⓘ，或在右键菜单中选择 **{{model.editor.contextMenu.tableInfo}}**。可以设置物理名、逻辑名、说明和颜色。属于分组的表优先使用分组颜色。链接到需求的表会在这里列出这些需求，点击后在需求面板中打开该条目（见第 20.3 节）。

### 6.5 唯一键和索引

![添加索引](/guide-assets/zh/editor-key-dialog.webp)

1. 点击表下方的 **{{model.editor.key.addUnique}}** 或 **{{model.editor.key.addIndex}}**。
2. 填写名称并选择列。选择的顺序就是复合键的列顺序。用箭头调整顺序。
3. 索引可以为每个列设置排序顺序（ASC、DESC）。

创建的键会以 **UK**、**IX** 行显示在表的下方。点击该行可以修改或删除。创建关系时，外键列的索引会自动生成。

## 7. 关系

### 7.1 创建关系

![开始创建关系](/guide-assets/zh/editor-relation-picker.webp)

1. 点击将作为父表的表边框上的点。
2. 在 **{{model.editor.relation.startMenu}}** 窗口中选择关系类型、多重性和关系种类。
3. 点击将作为子表的表。自引用则点击自身。按 `Esc` 取消。

子表中会自动创建外键列。父表没有主键时无法创建关系。

| 选择项 | 选项 | 说明 |
|---|---|---|
| {{model.editor.relation.pickType}} | 1:N、1:1 | 1:1 会同时在外键列上创建唯一键 |
| {{model.editor.relation.childSide}} | {{model.editor.relationship.multiplicity_ZERO_OR_MORE}}、{{model.editor.relationship.multiplicity_ONE_OR_MORE}} | 决定关系线末端的标记 |
| {{model.editor.relation.parentSide}} | {{model.editor.relationship.multiplicity_EXACTLY_ONE}}、{{model.editor.relationship.multiplicity_ZERO_OR_ONE}} | 恰好一个时外键为 NOT NULL，零或一时允许 NULL |
| {{model.editor.relation.pickKind}} | {{model.editor.relation.nonIdentifying}}、{{model.editor.relation.identifying}} | 标识关系的外键会成为子表主键的一部分，以实线绘制 |

### 7.2 修改关系

![关系的右键菜单](/guide-assets/zh/editor-context-relationship.webp)

在关系线上点击鼠标右键，会出现 **{{model.editor.contextMenu.editRelationship}}** 和 **{{model.editor.contextMenu.removeRelationship}}**。双击关系线也会打开编辑窗口。

![编辑关系](/guide-assets/zh/editor-relationship-dialog.webp)

| 项目 | 说明 |
|---|---|
| {{model.editor.relationship.mappingTitle}} | 为每个父列选择要关联的子列（见 7.3 节） |
| {{model.editor.relationship.type}} | 1:N 或 1:1 |
| {{model.editor.relationship.fkName}} | 外键约束的名称 |
| {{model.editor.relationship.identifying}} | 开启后外键成为子表主键的一部分，并变为 NOT NULL |
| {{model.editor.relationship.parentMultiplicity}}、{{model.editor.relationship.childMultiplicity}} | 关系线两端的标记 |
| ON DELETE、ON UPDATE | {{model.editor.relationship.action_NO_ACTION}}、{{model.editor.relationship.action_RESTRICT}}、{{model.editor.relationship.action_CASCADE}}、{{model.editor.relationship.action_SET_NULL}}、{{model.editor.relationship.action_SET_DEFAULT}} |
| **{{model.editor.relationship.remove}}** | 删除关系 |

### 7.3 更改列映射

![列映射](/guide-assets/zh/editor-relationship-mapping.webp)

创建关系时会新建外键列。如果想把已有的列用作外键，在列映射中选择该列。

* 在列表中选择子表的其他列，或选择 **{{model.editor.relationship.mappingNewColumn}}**。
* 所选列的类型与父列不同时，会出现 **{{model.editor.relationship.mappingAlignType}}** 复选框。
* 不再使用的旧外键列可以用 **{{model.editor.relationship.mappingRemoveReleased}}** 一并删除。
* 同一个子列不能选择两次。

## 8. 备注、分组、复制

### 8.1 备注

![备注](/guide-assets/zh/editor-note.webp)

* 在空白处的右键菜单中选择 **{{model.editor.contextMenu.createNote}}**。
* 双击备注可以修改内容。拖动上方的色带可以移动。
* 在编辑备注窗口中设置标题、颜色和 **{{model.editor.note.linkedTable}}**。把备注拖放到表上也可以设置关联表。
* 有关联表的备注在自动布局时会放在该表附近。
* 要删除备注，请在备注的右键菜单中选择 **{{model.editor.contextMenu.removeNote}}**。

### 8.2 分组

![编辑分组](/guide-assets/zh/editor-group-dialog.webp)

分组按主题把表归在一起。属于分组的表带有分组颜色的色带。

* 选中表后，在右键菜单中点击 **{{model.editor.contextMenu.createGroup}}**。也可以同时选中多张表。
* 用 **{{model.editor.contextMenu.addToGroup}}**、**{{model.editor.contextMenu.removeFromGroup}}** 加入或移出。
* 在 **{{model.editor.contextMenu.editGroup}}** 中修改名称、说明、颜色和成员表。
* 可以在 **{{model.editor.toolbar.view}}** 菜单或资源管理器中只查看某一个分组。
* 只查看一个分组时，在右键菜单中选择 **{{model.editor.contextMenu.exitGroupView}}** 可回到整个文档。

### 8.3 表的右键菜单

![表的右键菜单](/guide-assets/zh/editor-context-table.webp)

| 项目 | 说明 |
|---|---|
| **{{model.editor.contextMenu.tableInfo}}** | 打开表信息窗口 |
| **{{model.editor.contextMenu.viewTableData}}** | 在已连接的数据库中查看此表的数据。仅已连接的文档可见 |
| **{{model.editor.contextMenu.copy}}** | 复制所选对象 |
| **{{model.editor.contextMenu.duplicate}}** | 在旁边创建一个副本 |
| **{{model.editor.contextMenu.createGroup}}**、**{{model.editor.contextMenu.addToGroup}}**、**{{model.editor.contextMenu.removeFromGroup}}**、**{{model.editor.contextMenu.editGroup}}** | 管理分组 |
| **{{model.editor.contextMenu.removeTable}}** | 删除表及其关系 |

### 8.4 复制、粘贴、创建副本

* 用 `Ctrl/Cmd+C` 复制，用 `Ctrl/Cmd+V` 粘贴。`Ctrl/Cmd+D` 是创建副本。
* 同时复制多张表时，它们之间的关系也会一起复制。
* 粘贴的表会自动改用其他名称，避免重名。
* 也可以粘贴到同一浏览器中打开的其他文档。内容非常大时，只能在同一文档内粘贴。
* 在空白处的右键菜单中选择 **{{model.editor.contextMenu.paste}}**，会粘贴到点击的位置。

## 9. 标准 — 单词、术语、域类型

为了避免各个文档中列名和类型各不相同，可以在工作区中预先定好标准。标准有三种。

| 标准 | 规定的内容 | 示例 |
|---|---|---|
| 单词 | 名称的一个片段及其含义 | `user` → 会员，`email` → 邮箱 |
| 术语 | 完整的列名及其含义、使用的类型 | `user_email` → 会员 邮箱，域类型“邮箱” |
| 域类型 | 多个列共用的类型定义 | 邮箱 = VARCHAR(191)，NOT NULL |

单词和术语登记在同一个词典中。指向域类型或填写了类型的条目是术语，其余是单词。标准由工作区的所有文档共用。

### 9.1 打开标准面板

点击工具栏的 **{{model.editor.termDictionary.toggle}}**，左侧会打开面板。面板有三个标签页。

| 标签页 | 内容 |
|---|---|
| **{{model.editor.termDictionary.tabStandard}}** | 本工作区的单词和术语 |
| **{{model.editor.domainType.menu}}** | 本工作区的域类型 |
| **{{model.editor.termDictionary.tabSystem}}** | 管理员登记的公共词典。只能查看 |

### 9.2 登记单词和术语

![工作区词典](/guide-assets/zh/standard-terms.webp)

* 用搜索框查找标识或标签。
* 点击 **{{model.editor.termDictionary.add}}** 会打开登记窗口。点击列表中的条目可以修改。
* 术语上会以紫色徽标显示它指向的域类型名称。点击徽标会跳到域类型标签页中的该条目。

![修改术语](/guide-assets/zh/standard-term-dialog.webp)

| 项目 | 说明 |
|---|---|
| {{model.editor.termDictionary.term}} | 用于列名的文字。单词填写 `email`，术语则填写 `user_email` 这样的完整名称 |
| {{model.editor.termDictionary.label}} | 用作逻辑名的文字 |
| {{model.editor.domainType.label}} | 选择后即成为术语。类型由域类型决定 |
| **{{model.editor.termDictionary.promote}}** | 用已填写的类型新建域类型并关联。如果已有同名的域类型，则选择它 |

重新登记相同的标识会覆盖原有条目。登记了完整名称的术语优先于由单词拼接出的结果。

### 9.3 创建域类型

![域类型标签页](/guide-assets/zh/standard-domain-types.webp)

域类型标签页也可以通过 **{{model.editor.toolbar.tools}}** › **{{model.editor.domainType.menu}}** 打开。

* 每个条目会显示类型和是否允许 NULL、当前文档中使用它的列数、指向它的术语数。
* 点击术语数，词典标签页会只显示指向该域类型的术语。
* 列数以当前打开的文档为准。

![添加域类型](/guide-assets/zh/standard-domain-dialog.webp)

点击 **{{model.editor.domainType.add}}**，填写名称、类型、长度（或精度和小数位数）、是否允许 NULL、默认值和说明。一个工作区最多可以创建 200 个，名称不能重复。

### 9.4 在列上使用域类型

![列信息中的域类型](/guide-assets/zh/standard-column.webp)

1. 双击列名打开列信息窗口。
2. 在 **{{model.editor.domainType.label}}** 中选择域类型。类型、长度、是否允许 NULL、默认值会自动填入。
3. 保存。表中该列名旁会显示 **D** 徽标。

每个列也可以使用不同的值。选择域类型后直接修改长度，会显示“与域类型不同”的标记，此后即使域类型发生变化，该属性也不会跟随。用 **{{model.editor.domainType.revert}}** 恢复。

外键列的类型跟随父列，因此不能使用域类型。

### 9.5 输入列名时出现的建议

![词典建议](/guide-assets/zh/standard-suggest.webp)

在表中输入列名时，下方会显示在词典中找到的条目。

* 最上面一行是按当前输入的名称将生成的逻辑名。
* **{{model.editor.table.termGroupTerms}}**：选择后整个名称会替换为该术语，并同时填入逻辑名和域类型。
* **{{model.editor.table.termGroupWords}}**：选择后只把正在输入的片段替换为该单词。可以接着输入下一个片段。
* 用方向键选择，按 `Enter` 填入。按 `Esc` 关闭。

在列信息窗口中，如果列名与词典中的术语相同，会显示**词典标准**提示。点击 **{{model.editor.domainType.standardApply}}** 会填入该术语的域类型。

### 9.6 修改域类型之后

修改域类型的值后，文档中的列不会自动改变。打开文档时会给出提示，并询问要应用到哪些列。

![域类型变更提示](/guide-assets/zh/standard-banner.webp)

点击 **{{model.editor.domainType.banner.review}}** 会打开应用窗口。

![传播窗口](/guide-assets/zh/standard-propagation.webp)

* 会显示每个列将要变化的属性和值。
* 只有勾选的列会改为新值。未勾选的列保持原值，并标记为“部分属性不同”。
* 在列上直接修改过的属性会被跳过。
* 点击 **{{model.editor.domainType.propagation.skipAll}}** 则不修改任何列。

删除域类型后，列的值保持不变。列上只会留下“链接已断开”的标记。

### 9.7 逻辑名自动推断

![逻辑名自动推断](/guide-assets/zh/editor-logical-names.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.logicalNames}}** 会找出逻辑名为空或与物理名相同的表和列，并用词典填写。

* 把名称按 `_` 拆开，逐个片段在词典中查找。工作区词典优先于系统词典。
* 用 **{{model.editor.logicalNames.languageLabel}}** 选择使用系统词典中哪种语言的标签。
* 选择要填写的项目并应用。已有的逻辑名不会被改动。
* 应用后撤销一次即可全部恢复原状。

### 9.8 系统词典

![系统词典](/guide-assets/zh/standard-system.webp)

系统词典是管理员登记的公共单词。它带有多种语言的标签，所有工作区都可以查看。可以在首字母栏中选择字母来查找。如果在工作区词典中登记了相同的标识，则以工作区一方为准，并显示 **{{model.editor.termDictionary.overridden}}** 标记。

## 10. SQL 和数据库

### 10.1 数据库标签页 — 连接

![数据库标签页](/guide-assets/zh/workspace-database.webp)

工作区的 **{{workspace.detail.tabs.database}}** 标签页中有两部分内容。

**{{managed.sectionTitle}}** — 没有可供练习或测试的数据库时，Crowfoot 会提供一个。

* 点击 **{{managed.issue}}** 会创建专用的模式，并自动登记为连接。
* 可以选择 PostgreSQL 和 MySQL，每个账号最多免费使用五个。
* 点击钥匙图标会显示连接地址、账号和密码。可以直接用于 DBeaver 等外部工具。
* 垃圾桶图标是撤销发放。模式及其中的数据会全部删除，无法恢复。

**连接列表** — 登记自己数据库的连接信息。

![添加连接](/guide-assets/zh/connection-dialog.webp)

* 点击 **{{connection.list.newConnection}}**，填写名称、DBMS、主机、端口、数据库、用户和密码。密码会加密存储。
* 列表的每一行都有测试连接、从数据库导入为文档、查看数据、编辑、删除按钮。
* 测试连接成功时会同时显示耗时。
* 删除连接后，用该连接创建的文档仍会保留。
* **{{connection.dialog.mcpApply}}** 是允许 Claude 通过 MCP 更改此数据库结构的开关。默认关闭（见第 20.4 节）。

### 10.2 生成 SQL

![SQL 脚本](/guide-assets/zh/editor-sql.webp)

点击编辑器的 **{{model.editor.toolbar.ddl}}**，会显示按目标 DBMS 的语法为整个文档生成的脚本。

* 包含表、主键、唯一键、索引、外键和注释。逻辑名作为 COMMENT 输出。
* 用 **{{model.editor.ddl.copy}}** 复制，用 **{{model.editor.ddl.download}}** 下载 .sql 文件。
* 脚本以最后保存的内容为准。有未保存的更改时会给出提示。
* 有需要注意的地方时，会显示在 **{{model.editor.ddl.warningTitle}}** 中。

### 10.3 部署

![部署到数据库](/guide-assets/zh/editor-deploy.webp)

点击 SQL 脚本窗口中的 **{{model.editor.deploy.button}}**，会在连接的数据库中直接执行脚本。

1. 选择 **{{model.editor.deploy.connection}}**。只显示与文档相同 DBMS 的连接。
2. 点击 **{{model.editor.deploy.run}}**。
3. 会显示每条语句的成功或失败。与已有对象冲突的语句记为失败，其余语句继续执行。

这个功能用于在空数据库中首次创建结构。修改已创建的数据库时，请使用迁移 DDL（见 10.4 节、14.3 节）。

### 10.4 同步数据库

![同步数据库](/guide-assets/zh/editor-sync.webp)

在文档与实际数据库不一致时使用。通过 **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.sync}}** 打开。仅已连接数据库的文档可见。

| 按钮 | 方向 | 说明 |
|---|---|---|
| **{{model.editor.sync.compare}}** → **{{model.editor.sync.apply}}** | 数据库 → 文档 | 比较数据库的当前结构和文档，显示差异，并让文档与数据库保持一致 |
| **{{model.editor.migration.button}}** | 文档 → 数据库 | 把文档与数据库的差异生成为 ALTER 语句。可以用 **{{model.editor.migration.apply}}** 直接执行 |

* 让文档与数据库一致时，表的颜色、位置、备注等文档独有的属性会保留。撤销一次即可全部恢复原状。
* 在数据库中执行迁移 DDL 后无法撤销。如果包含删除列或表的语句，会显示警告。

尚未连接的文档，可以在文档列表的行菜单中用 **{{model.list.menu.connect}}** 连接。

### 10.5 复制为其他 DBMS

![复制为其他 DBMS](/guide-assets/zh/editor-convert.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}** 会创建一个仅目标 DBMS 不同的新文档。原文档不会改变。

* 创建前会显示写法会变化的类型，以及不适用于目标 DBMS 的类型。
* 不适用的类型会按原值保留在新文档中。请在创建后自行修改。

## 11. 数据浏览器

数据浏览器是查看和修改连接中实际数据的窗口。可以从三个地方打开。

* 数据库标签页中连接行上的查看数据按钮
* 编辑器的 **{{model.editor.toolbar.tools}}** › **{{database.openShort}}**
* 在编辑器中右键点击表 › **{{model.editor.contextMenu.viewTableData}}**

需要编辑者及以上的角色。实际能做的操作取决于连接中登记的数据库账号的权限。账号没有写入权限时，编辑行和写入类 SQL 会失败。

### 11.1 数据标签页 — 查看

![数据标签页](/guide-assets/zh/data-tab.webp)

* 在左侧列表中选择表或视图。名称旁的数字是估算的行数。
* 用 **{{database.data.addFilter}}** 设置列、运算符和值，然后点击 **{{database.data.apply}}**。可以添加多个条件。
* 运算符有 `=`、`≠`、`<`、`≤`、`>`、`≥`、{{database.data.op.CONTAINS}}、{{database.data.op.STARTS_WITH}}、{{database.data.op.IN}}、{{database.data.op.IS_NULL}}、{{database.data.op.IS_NOT_NULL}}。
* 点击列标题，会按该列排序。
* 在下方翻页。点击 **{{database.data.countExact}}** 会精确统计总行数。
* **{{database.data.downloadCsv}}** 把当前条件下的结果下载为文件。
* 如果连接关联了 ERD 文档，列标题上会同时显示该文档中的逻辑名。
* 较长的值会缩略显示。点击单元格可以查看完整的值。

### 11.2 数据标签页 — 修改行

![编辑行](/guide-assets/zh/data-edit.webp)

修改的内容不会立即生效，而是先汇总起来，再一次性应用。

| 操作 | 方法 | 标记 |
|---|---|---|
| 修改值 | 双击单元格，输入值后按 `Enter` | 单元格变为橙色 |
| 设为 NULL | 编辑时点击 **{{database.edit.setNull}}** 按钮 | 单元格变为橙色 |
| 添加行 | **{{database.edit.addRow}}** | 行变为绿色 |
| 删除行 | 行左侧的垃圾桶图标 | 行变为红色，文字带删除线 |
| 取消 | 行左侧的撤销图标或 **{{database.edit.discard}}** | 标记消失 |

下方的横条会显示添加、修改、删除的条数。点击 **{{database.edit.apply}}** 会弹出确认窗口。

![确认应用](/guide-assets/zh/data-apply-confirm.webp)

* 应用时作为一个整体执行。只要有一项失败，就全部取消。
* 包含删除时会显示警告。应用后无法撤销。
* 视图和没有主键的表无法修改。

### 11.3 结构标签页

![结构标签页](/guide-assets/zh/data-structure.webp)

显示所选表的列（名称、类型、是否允许 NULL、默认值、注释）、索引和外键。这里不能修改结构。请在 ERD 中修改后用迁移 DDL 应用。

### 11.4 SQL 标签页

![SQL 标签页](/guide-assets/zh/data-sql.webp)

* 输入 SQL 后点击 **{{database.sql.run}}**，或按 `Ctrl/Cmd+Enter`。只执行光标所在的语句或选中的部分。
* 表名和列名会自动补全。
* 查询结果显示在下方的表格中。结果较多时只显示前面的部分并给出提示。
* 修改数据的语句会显示受影响的行数。
* 用历史按钮可以重新调出之前执行过的语句。
* 执行修改表结构的语句后，可能会与 ERD 文档不一致。请用 **{{model.editor.toolbar.sync}}** 更新到文档。

## 12. 校验

![设计校验](/guide-assets/zh/editor-validation.webp)

点击工具栏的 **{{model.validation.toggle}}**，左侧会打开 **{{model.validation.title}}** 面板。每次修改文档都会重新检查。

* 用上方的级别按钮筛选查看错误、警告和提示。
* 点击条目，画布会移到对应的表。
* 有问题的表在画布上也会带有标记。

| 级别 | 规则 | 含义 |
|---|---|---|
| 错误 | {{model.validation.rules.DUPLICATE_TABLE_NAME}} | 有两张以上物理名相同的表 |
| 错误 | {{model.validation.rules.DUPLICATE_COLUMN_NAME}} | 一张表中有两个以上同名的列 |
| 错误 | {{model.validation.rules.DUPLICATE_KEY_NAME}} | 唯一键或索引的名称重复 |
| 错误 | {{model.validation.rules.COMPOSITE_KEY_DUPLICATE_COLUMN}} | 一个键中同一列出现两次 |
| 错误 | {{model.validation.rules.FK_TYPE_MISMATCH}} | 外键列与父列的类型不同 |
| 错误 | {{model.validation.rules.FK_TARGET_NOT_KEY}} | 外键指向的列不是主键或唯一键 |
| 错误 | {{model.validation.rules.FK_NULLABILITY_MISMATCH}} | 关系的多重性与外键是否允许 NULL 不一致 |
| 错误 | {{model.validation.rules.ONE_TO_ONE_MISSING_UK}} | 是 1:1 关系，但外键上没有唯一键 |
| 警告 | {{model.validation.rules.MISSING_PK}} | 没有主键的表 |
| 警告 | {{model.validation.rules.EMPTY_TABLE}} | 没有列的表 |
| 警告 | {{model.validation.rules.FK_MAPPING_EMPTY}} | 关系中没有关联的列 |
| 警告 | {{model.validation.rules.ORPHAN_TABLE}} | 与任何表都没有关系 |
| 警告 | {{model.validation.rules.CIRCULAR_REFERENCE}} | 外键绕了一圈又回到自身 |
| 警告 | {{model.validation.rules.NAMING_CONVENTION}} | 物理名不符合命名规则 |
| 警告 | {{model.validation.rules.MISSING_LOGICAL_NAME}} | 逻辑名为空 |
| 提示 | {{model.validation.rules.FK_WITHOUT_INDEX}} | 没有以外键列开头的索引 |
| 提示 | {{model.validation.rules.WIDE_TABLE}} | 列数超过 30 个 |

## 13. 共享和评论

### 13.1 共享链接

![共享文档](/guide-assets/zh/editor-share.webp)

点击 **{{model.editor.toolbar.share}}**，再点击 **{{model.share.issue}}**，就会生成链接。知道链接的人无需登录即可阅读文档，但不能修改。

* 选择 **{{model.share.period.unlimited}}** 或 **{{model.share.period.custom}}**。设置期限后，在开始和结束时间之外无法打开。
* 每个链接会显示浏览数、点赞数和评论数。
* 用复制图标复制地址，用垃圾桶图标撤销链接。撤销的链接会立即无法打开。
* 共享的文档也会出现在起始页的共享画廊中。

在共享页面中可以查看 ERD、下载 SQL 脚本，并留下点赞和评论。只有已登录的人才能点赞。未登录的人需要填写昵称和密码后发表评论。

### 13.2 评论标签页

通过共享链接收到的点赞和评论会汇集在编辑器最下方的 **{{shareViewer.tab.comments}}** 标签页中。评论者及以上的角色可以在这里回复。有新评论时，铃铛图标会收到通知。

## 14. 版本历史

### 14.1 查看保存记录

![版本历史](/guide-assets/zh/editor-history.webp)

文档每次保存都会留下一个版本。通过 **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.history}}** 打开。

* 每个版本会显示保存的人、时间和变更内容摘要（添加、修改、删除、移动）。
* 用 **{{model.editor.history.editMemo}}** 为版本添加备注。搜索框在备注中查找。
* **{{model.editor.history.view}}** 以只读方式打开该版本的文档。
* **{{model.editor.history.restore}}** 把该版本的内容保存为一个新版本。当前的文档也会原样保留在记录中。

### 14.2 版本对比

点击 **{{model.editor.history.compare}}** 可以查看两个版本的差异。

* 画布按对比版本绘制，发生变化的表会带有 `+`（添加）和 `~`（修改）标记。
* 已消失的表会另外列出。
* 用 **{{model.editor.compare.exit}}** 返回文档。

### 14.3 迁移 DDL

版本对比界面中的 **{{model.editor.compare.migrationDdl}}** 会把两个版本的差异生成为 ALTER 语句。用于只把上次部署之后的变化应用到数据库。复制脚本后在数据库中执行。可能导致数据被删除的语句会带有警告。要直接在数据库中执行，请使用同步数据库中的迁移 DDL（见 10.4 节）。

## 15. 共同编辑

多人可以同时打开并修改同一个文档。

* 工具栏上会显示当前一起查看的人，画布上可以看到其他人的光标在移动。
* 其他人修改的内容会立即反映到我的屏幕上。
* 其他人正在修改的项目会被锁定，并显示正在修改的人的名字。
* 两个人修改同一属性时，保留后修改的值。我的值被更改时会弹出通知，可以用 **{{model.editor.collab.lwwRestore}}** 恢复。
* 右下角的气泡按钮是 **{{model.editor.chat.label}}**。可以与一起查看文档的人交流。

保存时如果其他人已先保存，会弹出 **{{model.editor.conflict.title}}** 窗口。

* 互不重叠的更改会自动合并。
* 对每个重叠的项目选择 **{{model.editor.conflict.keepMine}}** 或 **{{model.editor.conflict.useServer}}**。
* 点击 **{{model.editor.conflict.resolve}}**，会按所选内容合并并保存。

即使未能保存就关闭了窗口，编辑内容也会保留在浏览器中。重新打开文档时会恢复。

## 16. 团队

![团队界面](/guide-assets/zh/team-detail.webp)

团队是把人归在一起的单位。把团队作为成员加入工作区后，所有团队成员会一次性获得权限。

* 通过顶部菜单的 **{{shell.nav.teams}}** 进入。用侧边栏的 **{{shell.sidebar.newTeam}}** 创建团队。创建团队不会同时创建工作区。
* 用 **{{team.members.addButton}}** 查找并加入成员，用 **{{team.members.remove}}** 移出。
* 团队所有者可以修改名称和说明，并可以 **{{team.detail.settings.dissolveButton}}**。解散团队后，授予该团队的工作区权限也会一并收回。

## 17. 社区和通知

### 17.1 发布说明

![发布说明](/guide-assets/zh/community-release-notes.webp)

这里的文章介绍新版本的变化。点击文章会打开正文，并可以选择正文的语言。

### 17.2 反馈

![反馈](/guide-assets/zh/community-feedback.webp)

这是用来填写改进建议或所发现 Bug 的版块。用 **{{community.board.newPost}}** 发帖，并可以附上图片。每个帖子下可以互相评论。

### 17.3 我的评论、点赞的文档

![我的评论](/guide-assets/zh/community-my-comments.webp)

**{{shell.sidebar.communityMyComments}}** 汇总显示我在共享文档上发表的评论。**{{shell.sidebar.communityMyLikes}}** 是我点过赞的共享文档。点击行会前往该文档。

### 17.4 通知

![通知](/guide-assets/zh/shell-notifications.webp)

点击铃铛图标会显示最近的通知。通知有三种。

* 我的文档收到评论时
* 我的文档被点赞时
* 文档所有者回复了我的评论时

用 **{{shell.notifications.markAll}}** 全部标为已读，用 **{{shell.notifications.viewAll}}** 前往完整列表。

![通知列表](/guide-assets/zh/community-notifications.webp)

## 18. 管理员

![管理员界面](/guide-assets/zh/admin-users.webp)

管理员账号的顶部菜单中会显示 **{{shell.nav.admin}}**。

| 菜单 | 内容 |
|---|---|
| **{{shell.sidebar.adminUsers}}** | 用户列表、管理员权限、账号状态 |
| **{{shell.sidebar.adminCodes}}** | 数据库类型等代码值 |
| **{{shell.sidebar.adminManaged}}** | 服务方提供的数据库的实例和发放情况 |
| **{{shell.sidebar.adminSystemTerms}}** | 登记和删除系统词典的单词 |
| **{{shell.sidebar.adminAuditLogs}}** | 主要操作的记录 |
| **{{shell.sidebar.adminTraffic}}** | 访问统计 |

## 19. 快捷键

![键盘快捷键帮助](/guide-assets/zh/editor-shortcuts.webp)

在编辑器中按 `Ctrl/Cmd+/`，或点击工具栏的键盘图标，会打开快捷键窗口。

| 快捷键 | 作用 |
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
| 方向键 | {{model.editor.shortcuts.row.nudge}} |
| `Shift+` 方向键 | {{model.editor.shortcuts.row.nudgeFast}} |
| `Space+Drag` | {{model.editor.shortcuts.row.pan}} |
| 鼠标右键 | {{model.editor.shortcuts.row.contextMenu}} |
| `Ctrl/Cmd+/` | {{model.editor.shortcuts.row.help}} |
| `Ctrl/Cmd+Enter` | 在数据浏览器的 SQL 标签页中执行 |

光标位于文字输入框中时，除帮助以外的快捷键不起作用。没有编辑权限时，编辑、移动、删除的快捷键不起作用。

## 20. 与 Claude 一起设计 (MCP)

把 Claude Code 等 MCP 客户端连接到工作区后，可以通过对话整理需求、创建和修改 ERD。Claude 创建的内容会原样显示在 Crowfoot 中，在界面上修改的内容 Claude 会重新读取。

### 20.1 连接

![MCP 标签页](/guide-assets/zh/workspace-mcp.webp)

在工作区的 **{{workspace.detail.tabs.mcp}}** 标签页签发令牌。所有成员都能看到这个标签页。

![签发令牌](/guide-assets/zh/mcp-issue.webp)

* 点击 **{{workspace.mcp.issueButton}}**，设置名称和期限。每人在每个工作区最多可签发五个。
* 签发后会显示令牌和 **{{workspace.mcp.commandLabel}}**。复制命令并在终端运行，即可完成连接。
* 令牌只在此时显示。如果丢失，请吊销后重新签发。

![已签发的令牌和注册命令](/guide-assets/zh/mcp-issued.webp)

* 令牌以签发者的权限运行，且只在该工作区有效。{{common.role.VIEWER}} 或 {{common.role.COMMENTER}} 签发的令牌只能读取。
* 不要把令牌粘贴到与 Claude 的对话中。注册命令在终端运行。
* 列表中的垃圾桶图标是吊销。吊销后，用该令牌连接的 Claude 立即无法访问。所有者也可以吊销其他成员的令牌。
* 目前可用于能够设置请求头的客户端（Claude Code）。

### 20.2 可以交给 Claude 的事

| 事项 | 说明 |
|---|---|
| 查看工作区 | 读取文档列表、术语词典、域类型和设计规则 |
| 整理需求 | 把对话中提到的需求登记到文档并修改（见第 20.3 节） |
| 创建和修改 ERD | 创建和修改表、列、键、索引、关系和分组，并遵循工作区的术语和域类型 |
| 校验和 SQL | 获取设计校验结果和 SQL 脚本 |
| 导入 SQL | 用 CREATE TABLE 脚本创建新文档 |
| 应用到数据库 | 签发托管数据库，部署文档或只应用变更部分（见第 20.4 节） |

* Claude 每次修改都会留下版本。如果不满意，可以恢复到以前的版本（见第 14 节）。
* Claude 不能删除文档。删除表或列之前，会先显示将被删除的内容。
* Claude 创建的表会在打开文档时自动排好位置。已经摆好的表和备注不会被移动。
* 编辑器打开期间如果 Claude 修改了文档，界面会加载新内容。如果有未保存的编辑，会先显示提示。

### 20.3 需求面板

![需求面板](/guide-assets/zh/editor-requirements.webp)

点击工具栏的 **{{model.editor.toolbar.requirements}}**，左侧会打开面板。需求与文档一起保存。有待反映的需求时，按钮上会显示数量。

* 需求按分组归类显示。没有分组的归入 **{{model.requirements.group.unassigned}}**，适用于整个文档的归入 **{{model.requirements.group.document}}**。
* 点击行会展开内容和链接的表。点击表名，画布会移动到该表。
* 用上方的状态按钮筛选。最初只隐藏 **{{model.requirements.state.DROPPED}}**。
* 面板下方的 **{{model.requirements.untraced.title}}** 是未链接到任何需求的表。

| 状态 | 含义 |
|---|---|
| **{{model.requirements.state.APPLIED}}** | 已确认的需求已反映到 ERD |
| **{{model.requirements.state.PENDING}}** | 已确认，但 ERD 尚未反映最新内容。修改标题或内容后会变为此状态 |
| **{{model.requirements.state.UNLINKED}}** | 已标记为已反映，但没有链接的表 |
| **{{model.requirements.state.LEFTOVER}}** | 已排除的需求仍链接着表 |
| **{{model.requirements.state.DRAFT}}** | 尚未确认 |
| **{{model.requirements.state.DROPPED}}** | 不再处理 |

![编辑需求](/guide-assets/zh/editor-requirement-dialog.webp)

编辑者及以上可以自己添加和修改需求。

* 点击面板上方的 **{{model.requirements.add}}** 或展开行中的编辑按钮。设置标题、内容、范围、状态、分组和要链接的表。代码（REQ-001）会自动生成。
* 点击待反映行的 **{{model.requirements.markApplied}}**，会变为已反映。
* 不再需要的需求不要删除，把状态改为 **{{model.requirements.status.dropped}}**。删除只用于登记错误的条目。
* 每个文档最多登记 500 条。

### 20.4 应用到数据库

要让 Claude 更改数据库的结构，需要在该连接上允许。

* 添加或编辑连接时开启 **{{connection.dialog.mcpApply}}**。默认关闭，开启的连接会在列表中带有标记。
* 托管数据库从一开始就允许。
* Claude 会先显示要执行的 SQL，只执行已确认的计划。如果查看计划后文档或数据库发生了变化，则不执行并重新制定计划。
* 对未允许的连接，Claude 只显示要执行的 SQL。请在编辑器的部署（见第 10.3 节）或迁移 DDL（见第 14.3 节）中自行执行。

## 21. 常见问题

**可以更改文档的数据库类型吗？**
不可以。请用 **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}** 创建其他类型的新文档。

**什么时候保存？**
编辑后稍等片刻会自动保存。也可以用 **{{model.editor.toolbar.save}}** 按钮或 `Ctrl/Cmd+S` 立即保存。每次保存都会留下一个版本。

**改错了怎么恢复？**
刚做的编辑用 `Ctrl/Cmd+Z` 撤销。已经保存的内容可以在版本历史中恢复到以前的版本。

**单词和术语有什么区别？**
单词是名称的一个片段，术语是完整的列名。术语可以指向域类型，因此在列上使用术语时，类型也会一并确定。

**修改域类型后，列会立即改变吗？**
不会。打开文档时会提示已发生变化，并让你选择要应用到哪些列。

**没有数据库也能使用吗？**
可以。只绘制 ERD 并下载 SQL 脚本也没问题。如果想实际执行，可以在数据库标签页领取服务方提供的数据库。

**可以在数据浏览器中修改结构吗？**
在数据标签页和结构标签页中不能修改。请在 ERD 中修改后用迁移 DDL 应用。

**收到共享链接的人可以修改文档吗？**
不可以。要一起修改，请把对方加为工作区成员并分配编辑者角色。

**改进建议写在哪里？**
请写在 **{{shell.nav.community}}** › **{{shell.sidebar.communityFeedback}}** 中。

**Claude 修改的内容可以撤销吗？**
可以。Claude 每次修改都会留下版本，可以在版本历史中恢复到以前的版本。
