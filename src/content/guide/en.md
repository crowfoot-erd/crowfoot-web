Crowfoot is a tool for drawing ERDs in your browser, editing them with your team, and applying them to a database. This guide first shows you around the screens, then walks through each feature. Screenshots use sample data created for this guide.

## 1. The screens at a glance

Crowfoot has three kinds of screens.

| Screen | How to open it | What you do there |
|---|---|---|
| App | Opens when you sign in | Workspaces, document lists, members, databases, teams, community |
| Editor | Click a document in the document list; it opens in a new window | Draw ERDs, manage standards, generate SQL, share, version history |
| Data browser | Click the Browse data button on a connection; it opens in a new window. In the editor, it opens in the **{{shareViewer.tab.data}}** tab at the bottom | View real data, edit rows, run SQL |

### 1.1 The top menu of the app

![The top menu of the app](/guide-assets/en/shell-header.webp)

From left to right, it contains the following items.

| Position | Name | Description |
|---|---|---|
| Left | Logo | Goes to the dashboard |
| Left | **{{shell.nav.workspaces}}** | Workspaces and the ERD documents in them |
| Left | **{{shell.nav.teams}}** | Create teams and manage their members |
| Left | **{{shell.nav.community}}** | Release notes, feedback, my comments, liked documents, notifications |
| Left | **{{shell.nav.admin}}** | Shown only to administrator accounts |
| Left | **{{guide.title}}** | Opens this guide in a new window |
| Right | **{{shell.nav.home}}** | Goes to the start page (the introduction) |
| Right | Sun icon | Switches between the light and dark themes |
| Right | Globe icon | Changes the language ({{common.language.ko}}, {{common.language.en}}, {{common.language.ja}}, {{common.language.zh}}) |
| Right | Bell icon | Notifications. A red number shows how many are unread |
| Right | Your name | Your profile, language, and sign-out |

### 1.2 The left sidebar

The left sidebar changes depending on what you select in the top menu.

| Top menu | What the sidebar shows |
|---|---|
| **{{shell.nav.workspaces}}** | The **{{shell.sidebar.newWorkspace}}** button, **{{shell.sidebar.mine}}**, **{{shell.sidebar.shared}}** |
| **{{shell.nav.teams}}** | The **{{shell.sidebar.newTeam}}** button, **{{shell.sidebar.ownedTeams}}**, **{{shell.sidebar.joinedTeams}}** |
| **{{shell.nav.community}}** | **{{shell.sidebar.communityReleaseNotes}}**, **{{shell.sidebar.communityFeedback}}**, **{{shell.sidebar.communityMyComments}}**, **{{shell.sidebar.communityMyLikes}}**, **{{shell.sidebar.communityNotifications}}** |
| **{{shell.nav.admin}}** | **{{shell.sidebar.adminUsers}}**, **{{shell.sidebar.adminCodes}}**, **{{shell.sidebar.adminManaged}}**, **{{shell.sidebar.adminSystemTerms}}**, **{{shell.sidebar.adminAuditLogs}}**, **{{shell.sidebar.adminTraffic}}** |

### 1.3 The editor window

![The whole editor window](/guide-assets/en/editor-overview.webp)

| Position | Contents |
|---|---|
| Top | Document name, target DBMS, version number, who saved last and when, **{{model.viewer.close}}** |
| Toolbar | Explorer, term dictionary, validation, undo, save, auto layout, generate SQL, share, export, tools, view, zoom in and out |
| Center | The canvas, which holds tables, relationship lines, notes, and groups |
| Bottom right | The minimap and the document chat button |
| Bottom | The **ERD**, **{{shareViewer.tab.requirements}}**, **{{shareViewer.tab.data}}**, and **{{shareViewer.tab.comments}}** tabs |

Section 5 describes each toolbar button.

### 1.4 The data browser window

![The data browser](/guide-assets/en/data-browser.webp)

| Position | Contents |
|---|---|
| Top | Connection name, DBMS, host address, theme and language, **{{database.close}}** |
| Left | List of tables and views, search box, refresh. When opened with an ERD document, tables are split by the document's groups |
| Top right | The name of the selected table and the **{{database.tabs.data}}**, **{{database.tabs.structure}}**, and **{{database.tabs.sql}}** tabs |
| Right | The contents of the tab |

In the **{{shareViewer.tab.data}}** tab of the editor, there is no top bar. The connection name, DBMS, and address appear at the right end of the top-right bar.

## 2. Getting started

### 2.1 Signing in

![The sign-in screen](/guide-assets/en/login.webp)

1. Click the sign-in button on the start page.
2. Read the Terms of Service and check the box to agree. The sign-in buttons are enabled only after you check it.
3. Sign in with your GitHub or Google account. There is no separate sign-up step.

If you have not used the app for a long time, the **{{auth.sessionExpired.title}}** dialog appears. Click **{{auth.sessionExpired.loginAgain}}**.

### 2.2 The dashboard

![The dashboard](/guide-assets/en/dashboard.webp)

The dashboard opens when you sign in.

* The number cards at the top show how many workspaces you own, how many teams you have, and how many workspaces you are a member of.
* Click a card under **{{dashboard.shortcuts}}** to go to that workspace.
* Click a card under **{{dashboard.myTeams}}** to go to that team.
* **{{community.recent.title}}** lists release notes and feedback posts, newest first.
* Use the **{{dashboard.newWorkspace}}** button at the top right to create a workspace.

### 2.3 Your profile, language, and theme

![The user menu](/guide-assets/en/shell-user-menu.webp)

Click your name at the top right to see your name, email, linked account, and the date you joined. The same menu lets you change the language and sign out. You can also change the language with the globe icon. Crowfoot remembers your language for your next visit.

## 3. Workspaces

A workspace holds ERD documents, database connections, the term dictionary, and domain types. Members and permissions are also set per workspace.

### 3.1 Creating a workspace

![New workspace](/guide-assets/en/workspace-create.webp)

Click **{{shell.sidebar.newWorkspace}}** in the sidebar and enter a name. The person who creates the workspace becomes its owner.

### 3.2 The tabs of a workspace

A workspace has six tabs below its name.

| Tab | Contents |
|---|---|
| **{{workspace.detail.tabs.erd}}** | The list of ERD documents. Create, open, and delete documents |
| **{{workspace.detail.tabs.database}}** | Service-provided databases and database connections |
| **{{workspace.detail.tabs.overview}}** | Name, description, creator, number of members, creation date |
| **{{workspace.detail.tabs.members}}** | Members and their roles |
| **{{workspace.detail.tabs.mcp}}** | Issue and revoke the tokens that connect an MCP client such as Claude (section 20) |
| **{{workspace.detail.tabs.settings}}** | Edit the name and description, delete the workspace. Shown only to the owner |

### 3.3 The ERD tab — the document list

![The document list](/guide-assets/en/workspace-erd.webp)

* Type a document name or description in the search box to find a document.
* Click a document name to open the editor in a new window.
* The list shows the document name, database type, version, creator, and last modified date.
* When there are more than 20 documents, the total count and Previous and Next buttons appear below the list.
* Use the five buttons at the top to create documents (section 4).

![The document row menu](/guide-assets/en/document-row-menu.webp)

Click the three-dot menu at the right end of a row to see **{{model.list.menu.edit}}** and **{{model.list.menu.delete}}**. Documents that are not connected to a database also show **{{model.list.menu.connect}}**.

* **{{model.list.menu.edit}}** changes only the name and description. The database type and version cannot be changed.
* **{{model.list.menu.connect}}** lists only connections with the same DBMS as the document. Once connected, you can use Sync DB in the editor (section 10.4).
* Only the owner can delete a document. A deleted document cannot be restored.

### 3.4 The Members tab — members and roles

![The Members tab](/guide-assets/en/workspace-members.webp)

There are four roles.

| Role | What it can do |
|---|---|
| {{common.role.OWNER}} (OWNER) | Everything. Manage members, change workspace settings, delete the workspace |
| {{common.role.EDITOR}} (EDITOR) | Create and edit documents, edit the dictionary and domain types |
| {{common.role.COMMENTER}} (COMMENTER) | Read documents and comment |
| {{common.role.VIEWER}} (VIEWER) | Read documents |

![Adding a member](/guide-assets/en/member-add.webp)

Click **{{workspace.members.addButton}}** to add a person or a team.

* **{{workspace.members.addDialog.targetUser}}**: Type at least two characters of a name or email to search.
* **{{workspace.members.addDialog.targetTeam}}**: When you give a role to a team, every member of that team gets the same role.
* The Owner role cannot be assigned.
* In the list, change a member's role or remove access with **{{workspace.members.revoke}}**.
* Only the owner can add members, change roles, and remove access. Other members can only view the list.
* People who are already members do not appear in the search results.
* If someone has one role as an individual and a different role through a team, the higher role applies.
* If there is only one owner, that owner cannot lower or remove their own role.
* Permission changes take effect immediately, without signing in again.

### 3.5 The Overview and Settings tabs

![The Overview tab](/guide-assets/en/workspace-overview.webp)

The Overview tab shows basic information about the workspace.

![The Settings tab](/guide-assets/en/workspace-settings.webp)

Edit the name and description in the Settings tab. **{{workspace.detail.settings.deleteButton}}** under **{{workspace.detail.settings.dangerZone}}** deletes the workspace and every document in it. This cannot be undone.

## 4. Creating an ERD document

There are five ways to create a document. Each is a button at the top of the ERD tab.

| Button | When to use it |
|---|---|
| **{{model.list.newDocument}}** | To start from a blank document |
| **{{model.templates.openButton}}** | To start from a copy of an example document |
| **{{sqlImport.openButton}}** | When you have a CREATE TABLE script |
| **{{reverse.openButton}}** | To read the structure of an existing database |
| **{{model.import.button}}** | To reopen an exported document file (.crown) |

### 4.1 New ERD document

![New ERD document](/guide-assets/en/document-create.webp)

Enter a name and choose a database type. The database type is fixed when the document is created and cannot be changed later. To switch to another type, use **{{model.editor.toolbar.dbmsConvert}}** in the editor (section 10.5).

### 4.2 Start from a template

![Start from a template](/guide-assets/en/document-template.webp)

Pick an example document to copy into your workspace. To look at it first, use **{{model.templates.preview}}**. You can name the copy when you create it; by default it takes the template's name.

The words and terms used in the template are also added to the workspace dictionary, so logical name inference and column name suggestions use them right after you copy (section 9).

### 4.3 Import SQL

![Import SQL](/guide-assets/en/document-sql-import.webp)

1. Choose the database type and enter a document name.
2. Paste a CREATE TABLE script, or load a file with **{{sqlImport.readFile}}**. Files can be up to 1 MB.
3. Click **{{sqlImport.preview}}** to see how many tables and relationships were found and which statements could not be parsed.
4. Click **{{sqlImport.submit}}**.

This creates a document from the script alone; no database connection is needed.

* The importer reads `CREATE TABLE`, `ALTER TABLE ... ADD CONSTRAINT`, and `CREATE [UNIQUE|FULLTEXT] INDEX` statements. It reads columns, types (including fractional seconds), NOT NULL, default values, auto increment, primary keys, unique keys, indexes (including FULLTEXT and SPATIAL), foreign keys, CHECK constraints, generated columns, `ON UPDATE`, and comments. PostgreSQL `COMMENT ON` statements are also read as logical names.
* Statements it cannot read, such as `CREATE VIEW` and `INSERT`, are skipped and listed in the preview.
* Items that were read but reduced or dropped are listed separately below, under "items read but reduced or dropped". Examples are types narrowed to a Crowfoot type, types outside the catalog, dropped column attributes (`UNSIGNED`, `COLLATE`, `CHARACTER SET`, and so on), and session statements that are not read (`SET FOREIGN_KEY_CHECKS`, `USE`). Check this list before creating the document.
* If the script has no `CREATE TABLE` statement, no document can be created.
* If you leave the document name empty, the document is named "SQL ERD".
* A document created this way is not connected to a database. To use Sync DB, choose **{{model.list.menu.connect}}** in the document list.

### 4.4 Import from DB

![Import from DB](/guide-assets/en/document-reverse.webp)

Choose a registered connection, and Crowfoot reads the tables, columns, keys, relationships, and comments of that database and creates a document. Column comments become logical names. A document created this way is connected to that connection, so you can use **{{model.editor.toolbar.sync}}**. First register the connection in the Database tab (section 10.1).

* The document's database type follows the connection's type.
* By default, the document is named after the connection followed by "ERD".
* If you delete the connection later, the document remains, but Sync DB is no longer available for it.

### 4.5 Import a document file (.crown)

This turns a file downloaded with **{{model.editor.toolbar.export}}** › **{{model.editor.toolbar.crown}}** in the editor back into a document. Use it to move a document to another workspace or to restore a backup. Importing always creates a new document and never overwrites an existing one. If the file format is not valid, you are told why.

## 5. The editor and its toolbar

![The editor toolbar](/guide-assets/en/editor-toolbar.webp)

### 5.1 The toolbar buttons

From left to right:

| Button | Description |
|---|---|
| **{{model.editor.explorer.toggle}}** | Shows or hides the Model Explorer on the left (section 5.2) |
| **{{model.editor.termDictionary.toggle}}** | Shows or hides the term dictionary and domain types panel (section 9) |
| **{{model.validation.toggle}}** | Shows or hides the design validation panel. A badge shows the number of issues (section 12) |
| {{model.editor.toolbar.undo}}, {{model.editor.toolbar.redo}} | Undo and redo edits one step at a time |
| **{{model.editor.toolbar.save}}** | Saves immediately. Edits are also saved automatically shortly after you make them |
| **{{model.editor.toolbar.autoLayoutLayered}}** | Rearranges the tables automatically. Use the arrow next to it to choose the mode and direction (section 5.3) |
| **{{model.editor.toolbar.ddl}}** | Generates a SQL script from the document (section 10.2) |
| **{{model.editor.toolbar.share}}** | Creates a read-only share link (section 13) |
| **{{model.editor.toolbar.export}}** | Downloads the document as an image or a document file (section 5.4) |
| **{{model.editor.toolbar.tools}}** | Logical names, sync DB, browse data, duplicate for another DBMS, domain types, version history (section 5.5) |
| DBMS badge | The target DBMS of the document. Click it to open the **{{model.editor.toolbar.dbmsConvert}}** dialog |
| **{{model.editor.toolbar.view}}** | Chooses how column names appear, which columns appear, and which group is shown (section 5.6) |
| − number + | Zoom out, current zoom level, zoom in |
| Four-corners icon | **{{model.editor.toolbar.fit}}**. Fits the whole document on the screen |
| Keyboard icon | **{{model.editor.shortcuts.open}}** (section 19) |
| Question mark icon | Opens this user guide in a new window |
| Sun icon | Switches between the light and dark themes |

If your role is read-only, the editing buttons are disabled and a **{{model.editor.toolbar.readOnly}}** label appears.

### 5.2 The explorer (Model Explorer)

![The explorer](/guide-assets/en/editor-explorer.webp)

* Shows the tables, relationships, and notes of the document as a tree. Tables are listed by group.
* Type in the search box to search tables, columns, relationships, and notes. `Ctrl/Cmd+F` takes you straight to the search box.
* Click an item to jump to it on the canvas and select it.
* On a group row, the eye icon shows only that group, the pencil icon edits the group, and the trash icon deletes it.

### 5.3 Auto layout

![The auto layout menu](/guide-assets/en/editor-menu-layout.webp)

Click the button to rearrange the tables in the selected mode. Click the arrow to choose a mode and direction; the layout runs as soon as you choose.

| Item | Description |
|---|---|
| **{{model.editor.toolbar.autoLayoutLayered}}** | Arranges tables in layers from parent to child. Works well for most documents |
| **{{model.editor.toolbar.autoLayoutHub}}** | Puts tables with many relationships in the center and the others around them |
| **{{model.editor.toolbar.autoLayoutHybrid}}** | Combines the two modes |
| **{{model.editor.toolbar.autoLayoutDown}}** | Parents at the top, children below |
| **{{model.editor.toolbar.autoLayoutRight}}** | Parents on the left, children on the right |

* Large documents can take a few seconds to lay out. The screen stays responsive meanwhile, and you can stop the layout with **{{model.editor.toolbar.autoLayoutCancel}}**.
* If you do not like the result, a single undo puts everything back where it was.
* Notes are placed near their linked table.

### 5.4 The Export menu

![The Export menu](/guide-assets/en/editor-menu-export.webp)

| Item | Description |
|---|---|
| **{{model.editor.image.viewport}}** | Downloads the visible area as a PNG image |
| **{{model.editor.image.document}}** | Downloads the whole document as a single PNG image |
| **{{model.editor.toolbar.crown}}** | Downloads the document as a .crown file. You can reopen it with **{{model.import.button}}** |

* While an image is being created, its progress is shown, and you cannot use the canvas until it finishes.
* The image items are not available in an empty document with no tables or notes.
* You can export even a read-only document.

### 5.5 The Tools menu

![The Tools menu](/guide-assets/en/editor-menu-tools.webp)

| Item | Description | Details |
|---|---|---|
| **{{model.editor.toolbar.logicalNames}}** | Fills in empty logical names from the dictionary | Section 9.7 |
| **{{model.editor.toolbar.sync}}** | Compares the document with the connected database and syncs them. Shown only for connected documents | Section 10.4 |
| **{{database.openShort}}** | Switches to the **{{shareViewer.tab.data}}** tab at the bottom and shows the data browser of the connected database | Section 11 |
| **{{model.editor.toolbar.dbmsConvert}}** | Creates a new document that differs only in its target DBMS | Section 10.5 |
| **{{model.editor.domainType.menu}}** | Opens the list of domain types | Section 9.3 |
| **{{model.editor.toolbar.history}}** | Views, compares, and restores saved versions | Section 14 |

### 5.6 The View menu

![The View menu](/guide-assets/en/editor-menu-view.webp)

| Section | Items | Description |
|---|---|---|
| **{{model.editor.toolbar.nameMode.label}}** | {{model.editor.toolbar.nameMode.physical}}, {{model.editor.toolbar.nameMode.logical}}, {{model.editor.toolbar.nameMode.both}} | Chooses which name is shown for columns |
| **{{model.editor.toolbar.columnMode.label}}** | {{model.editor.toolbar.columnMode.all}}, {{model.editor.toolbar.columnMode.keys}} | The keys-only option shows only PK and FK columns, which makes a large document easier to scan |
| **{{model.editor.toolbar.areaFilter.label}}** | {{model.editor.toolbar.areaFilter.all}}, group names | Shows only the tables of the selected group |

View settings affect only the display. The document itself does not change, and view changes are not recorded in the undo history. While only keys are shown, the **{{model.editor.table.addColumn}}** button is hidden.

### 5.7 Moving around the canvas

* Drag an empty area, or hold `Space` and drag, to pan the view.
* Zoom in and out with the mouse wheel or the − + buttons on the toolbar.
* Click the minimap at the bottom right to jump to that area.
* Hold `Shift` and click objects to select more than one. `Ctrl/Cmd+A` selects everything.

## 6. Tables and columns

### 6.1 Creating a table

![The right-click menu on an empty area of the canvas](/guide-assets/en/editor-context-canvas.webp)

Right-click an empty area of the canvas and choose **{{model.editor.contextMenu.createTable}}**. A table is created where you clicked.

### 6.2 The parts of a table

![A table](/guide-assets/en/editor-table.webp)

| Part | Description |
|---|---|
| Color band | The logical name of the table. Drag the band to move the table |
| Name row | The physical name of the table. Click it to edit in place. The ⓘ on the right opens **{{model.editor.table.info}}** |
| Column row | Drag the six-dot handle on the left to reorder columns. The key icon marks a primary key |
| Column name | Physical name on top, logical name below. Click to edit in place |
| Type, length | The data type and length (or precision and scale). Click to edit |
| **NN** | NOT NULL. Click to toggle it. It is always on for primary key columns |
| **AI** | Auto increment. Available only for a primary key with an integer type |
| **FK** | A foreign key column created by a relationship |
| **D** | A column that uses a domain type (section 9.4) |
| × | Deletes the column |
| **{{model.editor.table.addColumn}}** | Adds a column at the bottom |
| **{{model.editor.key.addUnique}}**, **{{model.editor.key.addIndex}}**, **{{model.editor.check.add}}** | Create a unique key, an index, or a CHECK constraint (section 6.5) |
| **ƒ** | A generated column. Hover over it to see the expression (section 6.3) |
| Dots on the border | Handles for starting a relationship (section 7.1) |

Primary key columns always stay at the top.

### 6.3 Column info

![Column info](/guide-assets/en/editor-column-info.webp)

Double-click a column name to open the **{{model.editor.columnInfo.title}}** dialog. Here you can edit every property in one place, including those you cannot edit directly on the table.

| Field | Description |
|---|---|
| {{model.editor.columnInfo.physicalName}} | The column name used in the database |
| {{model.editor.columnInfo.logicalName}} | The human-readable name. Generated SQL includes it as a COMMENT |
| {{model.editor.columnInfo.pk}} | Turning it on makes the column NOT NULL and moves it to the top |
| {{model.editor.columnInfo.nullable}} | Sets whether the column accepts NULL |
| {{model.editor.columnInfo.autoIncrement}} | Available only for a primary key of type INT, BIGINT, or SMALLINT |
| {{model.editor.domainType.label}} | Choosing a domain type fills in the type, length, nullability, and default value from it (section 9.4) |
| {{model.editor.columnInfo.dataType}}, {{model.editor.columnInfo.length}} | Depending on the type, a length field or precision and scale fields appear |
| {{model.editor.columnInfo.defaultValue}} | For example `0` or `NOW()` |
| {{model.editor.columnInfo.onUpdate}} | A value set automatically when a row is updated, for example `CURRENT_TIMESTAMP(6)`. Shown only in MySQL documents |
| {{model.editor.columnInfo.generated}} | When turned on, enter the {{model.editor.columnInfo.generatedExpression}} and choose STORED (store the value) or VIRTUAL (compute on read). A generated column cannot have a default value, auto increment, or ON UPDATE, so those fields are turned off and cleared |
| {{model.editor.columnInfo.comment}} | A description of the column used only within the document. It is not included in the SQL COMMENT |

Type names follow the notation of the target DBMS. For example, the date and time type appears as TIMESTAMP in a PostgreSQL document and as DATETIME in a MySQL document.

### 6.4 Table info

![Table info](/guide-assets/en/editor-table-info.webp)

Click the ⓘ on a table, or choose **{{model.editor.contextMenu.tableInfo}}** from the right-click menu. Set the physical name, logical name, description, and color. For a table in a group, the group color takes priority. If the table is linked to requirements, they are listed here; click one to open it in the requirements panel (section 20.3).

### 6.5 Unique keys and indexes

![Adding an index](/guide-assets/en/editor-key-dialog.webp)

1. Click **{{model.editor.key.addUnique}}** or **{{model.editor.key.addIndex}}** at the bottom of the table.
2. Enter a name and choose the columns. The order in which you select them becomes the column order of a composite key. Use the arrows to change the order.
3. For an index, you can set the sort order (ASC, DESC) of each column.
4. For an index, choose the **{{model.editor.key.indexType}}**: BTREE, FULLTEXT, or SPATIAL. FULLTEXT and SPATIAL have no sort order. For FULLTEXT, you can enter a MySQL full-text parser (for example `ngram`).

The keys you create appear as **UK**, **IX**, and **CK** rows at the bottom of the table. FULLTEXT indexes are marked **FT** and SPATIAL indexes **SP**. Click a row to edit or delete it. When you create a relationship, an index on the foreign key column is created automatically.

Click **{{model.editor.check.add}}** to create a CHECK constraint. The name is filled in like `ck_table_1`, and you write the expression inside the parentheses as is (for example `price >= 0`). The expression is not parsed, so update it yourself when you rename a column. Deleting a column does not remove the CHECK constraint.

## 7. Relationships

### 7.1 Creating a relationship

![Starting a relationship](/guide-assets/en/editor-relation-picker.webp)

1. Click a dot on the border of the table that will be the parent.
2. In the **{{model.editor.relation.startMenu}}** dialog, choose the relationship type, multiplicity, and relationship kind.
3. Click the table that will be the child. For a self-referencing relationship, click the same table. Press `Esc` to cancel.

A foreign key column is created in the child table automatically. You cannot create a relationship if the parent table has no primary key.

| What you choose | Options | Description |
|---|---|---|
| {{model.editor.relation.pickType}} | 1:N, 1:1 | For 1:1, a unique key is also created on the foreign key column |
| {{model.editor.relation.childSide}} | {{model.editor.relationship.multiplicity_ZERO_OR_MORE}}, {{model.editor.relationship.multiplicity_ONE_OR_MORE}} | Sets the symbol at the end of the relationship line |
| {{model.editor.relation.parentSide}} | {{model.editor.relationship.multiplicity_EXACTLY_ONE}}, {{model.editor.relationship.multiplicity_ZERO_OR_ONE}} | Exactly one makes the foreign key NOT NULL; zero or one makes it nullable |
| {{model.editor.relation.pickKind}} | {{model.editor.relation.nonIdentifying}}, {{model.editor.relation.identifying}} | In an identifying relationship the foreign key becomes part of the child's primary key. It is drawn as a solid line |

### 7.2 Editing a relationship

![The right-click menu of a relationship](/guide-assets/en/editor-context-relationship.webp)

Right-click a relationship line to see **{{model.editor.contextMenu.editRelationship}}** and **{{model.editor.contextMenu.removeRelationship}}**. Double-clicking the line also opens the edit dialog.

![Editing a relationship](/guide-assets/en/editor-relationship-dialog.webp)

| Field | Description |
|---|---|
| {{model.editor.relationship.mappingTitle}} | Choose the child column to link to each parent column (section 7.3) |
| {{model.editor.relationship.type}} | 1:N or 1:1 |
| {{model.editor.relationship.fkName}} | The name of the foreign key constraint |
| {{model.editor.relationship.identifying}} | Turning it on puts the foreign key in the child's primary key and makes it NOT NULL |
| {{model.editor.relationship.parentMultiplicity}}, {{model.editor.relationship.childMultiplicity}} | The symbols at the two ends of the relationship line |
| ON DELETE, ON UPDATE | {{model.editor.relationship.action_NO_ACTION}}, {{model.editor.relationship.action_RESTRICT}}, {{model.editor.relationship.action_CASCADE}}, {{model.editor.relationship.action_SET_NULL}}, {{model.editor.relationship.action_SET_DEFAULT}} |
| **{{model.editor.relationship.remove}}** | Deletes the relationship |

### 7.3 Changing the column mapping

![Column mapping](/guide-assets/en/editor-relationship-mapping.webp)

Creating a relationship adds a new foreign key column. To use an existing column as the foreign key instead, select it in the column mapping.

* From the list, choose another column of the child table, or choose **{{model.editor.relationship.mappingNewColumn}}**.
* If the type of the chosen column differs from the parent column, the **{{model.editor.relationship.mappingAlignType}}** checkbox appears.
* Select **{{model.editor.relationship.mappingRemoveReleased}}** to delete the old foreign key column that is no longer used at the same time.
* You cannot map the same child column twice.

## 8. Notes, groups, and copying

### 8.1 Notes

![A note](/guide-assets/en/editor-note.webp)

* Choose **{{model.editor.contextMenu.createNote}}** from the right-click menu on an empty area.
* Double-click a note to edit its text. Drag the band at the top to move it.
* In the note edit dialog, set the title, color, and **{{model.editor.note.linkedTable}}**. Dropping a note onto a table also sets its linked table.
* A note with a linked table is placed near that table by auto layout.
* To delete a note, right-click it and choose **{{model.editor.contextMenu.removeNote}}**.

### 8.2 Groups

![Editing a group](/guide-assets/en/editor-group-dialog.webp)

Groups organize tables by topic. A table in a group shows the group color in its band.

* Select one or more tables and choose **{{model.editor.contextMenu.createGroup}}** from the right-click menu.
* Add and remove tables with **{{model.editor.contextMenu.addToGroup}}** and **{{model.editor.contextMenu.removeFromGroup}}**.
* In **{{model.editor.contextMenu.editGroup}}**, edit the name, description, color, and member tables.
* To show only one group, use the **{{model.editor.toolbar.view}}** menu or the explorer.
* While viewing a single group, choose **{{model.editor.contextMenu.exitGroupView}}** from the right-click menu to return to the whole document.

### 8.3 The right-click menu of a table

![The right-click menu of a table](/guide-assets/en/editor-context-table.webp)

| Item | Description |
|---|---|
| **{{model.editor.contextMenu.tableInfo}}** | Opens the table info dialog |
| **{{model.editor.contextMenu.viewTableData}}** | Switches to the **{{shareViewer.tab.data}}** tab and shows the data of this table. Shown only for connected documents |
| **{{model.editor.contextMenu.copy}}** | Copies the selected objects |
| **{{model.editor.contextMenu.duplicate}}** | Makes a copy right next to the original |
| **{{model.editor.contextMenu.createGroup}}**, **{{model.editor.contextMenu.addToGroup}}**, **{{model.editor.contextMenu.removeFromGroup}}**, **{{model.editor.contextMenu.editGroup}}** | Manage groups |
| **{{model.editor.contextMenu.removeTable}}** | Deletes the table and its relationships |

### 8.4 Copy, paste, and duplicate

* Copy with `Ctrl/Cmd+C` and paste with `Ctrl/Cmd+V`. `Ctrl/Cmd+D` duplicates.
* When you copy several tables together, the relationships between them are copied too.
* Pasted tables are renamed automatically to avoid name conflicts.
* You can also paste into another document open in the same browser. Very large content can be pasted only within the same document.
* Choose **{{model.editor.contextMenu.paste}}** from the right-click menu on an empty area to paste where you clicked.

## 9. Standards — words, terms, and domain types

A workspace keeps naming standards so that column names and types stay consistent across documents. There are three kinds.

| Standard | What it defines | Example |
|---|---|---|
| Word | One part of a name and its meaning | `user` → Member, `email` → Email |
| Term | A whole column name, its meaning, and the type it uses | `user_email` → Member Email, domain type "Email" |
| Domain type | A type definition shared by many columns | Email = VARCHAR(191), NOT NULL |

Words and terms are registered in the same dictionary. An entry that points to a domain type or specifies a type is a term; any other entry is a word. Every document in the workspace shares the same standards.

### 9.1 Opening the standards panel

Click **{{model.editor.termDictionary.toggle}}** on the toolbar to open the panel on the left. It has three tabs.

| Tab | Contents |
|---|---|
| **{{model.editor.termDictionary.tabStandard}}** | The words and terms of this workspace |
| **{{model.editor.domainType.menu}}** | The domain types of this workspace |
| **{{model.editor.termDictionary.tabSystem}}** | The shared dictionary maintained by administrators. Read-only |

### 9.2 Registering words and terms

![The workspace dictionary](/guide-assets/en/standard-terms.webp)

* Use the search box to find a token or label.
* Click **{{model.editor.termDictionary.add}}** to open the registration dialog. Click an entry in the list to edit it.
* A term shows its domain type as a purple badge. Click the badge to go to that entry in the Domain types tab.

![Editing a term](/guide-assets/en/standard-term-dialog.webp)

| Field | Description |
|---|---|
| {{model.editor.termDictionary.term}} | The text used in column names. Enter `email` for a word, or the whole name such as `user_email` for a term |
| {{model.editor.termDictionary.label}} | The text to use as the logical name |
| {{model.editor.domainType.label}} | Choosing one makes the entry a term, and its type comes from the domain type |
| **{{model.editor.termDictionary.promote}}** | Creates a domain type from the type you entered and links it. If a domain type with the same name already exists, it is selected instead |

Registering the same token again overwrites it. A term registered as a whole name takes priority over a name assembled from words.

### 9.3 Creating a domain type

![The Domain types tab](/guide-assets/en/standard-domain-types.webp)

You can also open the Domain types tab with **{{model.editor.toolbar.tools}}** › **{{model.editor.domainType.menu}}**.

* Each entry shows its type and nullability, the number of columns using it in the current document, and the number of terms pointing to it.
* Click the term count to show, in the dictionary tab, only the terms that point to that domain type.
* The column count covers only the currently open document.

![Adding a domain type](/guide-assets/en/standard-domain-dialog.webp)

Click **{{model.editor.domainType.add}}** and enter the name, type, length (or precision and scale), nullability, default value, and description. A workspace can have up to 200 domain types, and their names must be unique.

### 9.4 Using a domain type on a column

![The domain type in column info](/guide-assets/en/standard-column.webp)

1. Double-click the column name to open the column info dialog.
2. Choose a domain type under **{{model.editor.domainType.label}}**. The type, length, nullability, and default value are filled in.
3. Save. A **D** badge appears next to the column name on the table.

A column can also override the domain type's values. If you choose a domain type and then edit the length yourself, a "Differs from the domain type" label appears, and that property no longer follows changes to the domain type. Use **{{model.editor.domainType.revert}}** to go back.

A foreign key column cannot use a domain type, because its type follows the parent column.

### 9.5 Suggestions while you type a column name

![Dictionary suggestions](/guide-assets/en/standard-suggest.webp)

As you type a column name on a table, matching dictionary entries appear below it.

* The top line shows the logical name produced from what you have typed.
* **{{model.editor.table.termGroupTerms}}**: Choosing one replaces the whole name with that term and fills in the logical name and domain type as well.
* **{{model.editor.table.termGroupWords}}**: Choosing one replaces only the part you are typing with that word. You can then continue typing the next part.
* Choose with the arrow keys and insert with `Enter`. Press `Esc` to close.

In the column info dialog, a **Dictionary standard** notice appears when the column name matches a term in the dictionary. Click **{{model.editor.domainType.standardApply}}** to apply the domain type of that term.

### 9.6 When a domain type is edited

Editing a domain type does not automatically change the columns in your documents. When you open a document, Crowfoot notifies you of the change and asks which columns to apply it to.

![The notice that domain types have changed](/guide-assets/en/standard-banner.webp)

Click **{{model.editor.domainType.banner.review}}** to open the dialog for applying the change.

![The propagation dialog](/guide-assets/en/standard-propagation.webp)

* For each column, the dialog lists the properties that will change and their new values.
* Only the columns you select get the new values. Unselected columns keep their values and stay marked as "differs".
* Properties you edited directly on a column are skipped.
* Click **{{model.editor.domainType.propagation.skipAll}}** to change no columns at all.

Deleting a domain type does not change column values; the affected columns only show a "Link broken" label.

### 9.7 Logical name inference

![Logical name inference](/guide-assets/en/editor-logical-names.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.logicalNames}}** finds tables and columns whose logical name is empty or the same as the physical name, and fills them in from the dictionary.

* It splits each name at `_` and looks up every part in the dictionary. The workspace dictionary takes priority over the system dictionary.
* Use **{{model.editor.logicalNames.languageLabel}}** to choose which language of the system dictionary to use.
* Select the items to fill in, then apply. Existing logical names are left untouched.
* After applying, a single undo puts everything back.

### 9.8 The system dictionary

![The system dictionary](/guide-assets/en/standard-system.webp)

The system dictionary is a set of shared words maintained by administrators. It has labels in several languages and can be read from every workspace. Use the initial-letter bar to find words by their first letter. If you register the same token in the workspace dictionary, the workspace entry takes priority and an **{{model.editor.termDictionary.overridden}}** label is shown.

## 10. SQL and databases

### 10.1 The Database tab — connections

![The Database tab](/guide-assets/en/workspace-database.webp)

The **{{workspace.detail.tabs.database}}** tab of a workspace has two parts.

**{{managed.sectionTitle}}** — If you do not have a database for practice or testing, Crowfoot provides one. This section appears only when an administrator has set up service-provided databases.

* Click **{{managed.issue}}** to create a dedicated schema, which is registered as a connection automatically.
* You can choose PostgreSQL or MySQL. The number each person can create per workspace is set by the administrator; the default is five. The section shows how many you have used and the limit.
* Each database gets its own dedicated account, which can access only its own schema.
* Click the key icon to see the host address, user, and password. You can use them directly in an external tool such as DBeaver. Only the person who created the database can see these credentials.
* The trash icon revokes the database. The schema and all the data in it are deleted, and this cannot be undone. Only the person who created the database can revoke it.
* A connection created this way can only be renamed. You cannot edit its connection details.
* In the connection list, clicking delete on such a connection opens the revoke confirmation. Revoking removes the connection and the schema together.

**Connection list** — Register the connection details of your own databases.

![Adding a connection](/guide-assets/en/connection-dialog.webp)

* Click **{{connection.list.newConnection}}** and enter the name, DBMS, host, port, database, user, and password. Choosing a DBMS fills in the default port (MySQL 3306, PostgreSQL 5432). The password is stored encrypted and is never shown again.
* When you edit a connection, leave the password field empty to keep the existing password.
* Editors and above can register, edit, delete, and test connections. All members can see the list.
* Each row has buttons to test the connection, import from DB, browse data, edit, and delete.
* Registering a connection does not test it automatically. After registering, check it with the Test connection button. A successful test shows how long it took; a failed test shows the cause (host unreachable, authentication failed, or timed out).
* Once a connection is registered, members with the Editor role or higher can view and edit that database's data in the data browser (section 11). Keep this in mind before registering a production database.
* Deleting a connection does not delete the documents created from it.
* **{{connection.dialog.mcpApply}}** is the switch that lets Claude change the structure of this database over MCP. It is off by default (section 20.4).

### 10.2 Generating SQL

![The SQL script](/guide-assets/en/editor-sql.webp)

Click **{{model.editor.toolbar.ddl}}** in the editor to get a script of the whole document in the syntax of the target DBMS.

* It includes tables, primary keys, unique keys, indexes, foreign keys, and comments. Logical names are output as COMMENT clauses.
* Copy it with **{{model.editor.ddl.copy}}** or get a .sql file with **{{model.editor.ddl.download}}**.
* The script is based on the last saved content. If you have unsaved changes, a notice tells you so.
* Potential issues are listed under **{{model.editor.ddl.warningTitle}}**.

### 10.3 Deploying

![Deploying to a database](/guide-assets/en/editor-deploy.webp)

Click **{{model.editor.deploy.button}}** in the SQL script dialog to run the script directly against a connected database.

1. Choose the **{{model.editor.deploy.connection}}**. Only connections with the same DBMS as the document are listed.
2. Click **{{model.editor.deploy.run}}**.
3. Success or failure is shown for each statement. A statement that conflicts with an existing object is recorded as failed, and the rest continue to run.

Deploy is meant for creating the full schema in an empty database. To change an existing database, use migration DDL (sections 10.4 and 14.3).

### 10.4 Sync DB

![Syncing with a database](/guide-assets/en/editor-sync.webp)

Use this when the document and the real database are out of sync. Open it with **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.sync}}**. It is shown only for documents connected to a database.

| Button | Direction | Description |
|---|---|---|
| **{{model.editor.sync.compare}}** → **{{model.editor.sync.apply}}** | Database → document | Compares the current structure of the database with the document, shows the differences, and updates the document to match the database |
| **{{model.editor.migration.button}}** | Document → database | Turns the differences between the document and the database into ALTER statements. You can run them right away with **{{model.editor.migration.apply}}** |

* When the document is updated, document-only properties such as table colors, positions, and notes are kept. A single undo puts everything back.
* Running migration DDL on a database cannot be undone. Statements that drop a column or a table are not run by default; only additions and changes are applied. To run them too, turn on **{{model.editor.migration.destructiveToggle}}**. If you link a new document to a database that is already in use, every existing table missing from the document shows up as a deletion, so check carefully.
* When you rename a table or column in the document, migration DDL creates a rename statement (RENAME). It does not drop and recreate it, so the data is kept.
* Indexes added to existing tables are also included in migration DDL.

To connect an unconnected document, use **{{model.list.menu.connect}}** in its row menu in the document list.

### 10.5 Duplicating for another DBMS

![Duplicate for another DBMS](/guide-assets/en/editor-convert.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}** creates a new document that differs only in its target DBMS. The original document is not changed.

* Before creating it, Crowfoot shows the types whose notation changes and the types that are incompatible with the target DBMS.
* Incompatible types keep their original values in the new document. Fix them yourself afterward.
* Unsaved edits are included in the new document.
* If the target DBMS does not create indexes for foreign keys automatically, indexes are added to foreign key columns that do not have one. These indexes are also shown before the document is created.
* The new document is named "original name (target DBMS)" by default, and you can change it.

## 11. The data browser

The data browser is a window for viewing and editing the real data of a connection. You can open it from three places.

* The Browse data button on a connection row in the Database tab
* **{{model.editor.toolbar.tools}}** › **{{database.openShort}}** in the editor
* Right-click a table in the editor › **{{model.editor.contextMenu.viewTableData}}**

The two editor entries do not open a new window. They switch to the **{{shareViewer.tab.data}}** tab at the bottom of the editor and show the document's connection. The tabs are in the order **ERD**, **{{shareViewer.tab.requirements}}**, **{{shareViewer.tab.data}}**, **{{shareViewer.tab.comments}}**. The selected table and filters stay when you switch to another tab. For a document without a database, the tab shows the **{{model.connect.toolbar}}** button.

In the tab, the connection name, DBMS, and address appear at the right end of the bar with the table name and the **{{database.tabs.data}}**, **{{database.tabs.structure}}**, and **{{database.tabs.sql}}** tabs. There is no separate top bar.

When opened with an ERD document, the list on the left splits the tables by the document's groups. Groups appear in document order, with the same colors as in the editor. Tables in no group go under **{{database.objects.ungrouped}}**, and tables missing from the document go under **{{database.objects.notInDocument}}**. Click a group name to collapse it. While you search, groups with no matching table are hidden.

You need the Editor role or higher; Viewers and Commenters do not see the browse data buttons. What you can actually do depends on the permissions of the database account registered in the connection. If the account has no write permission, row edits and write statements fail.

Each statement must finish within 8 seconds. After 8 seconds it is canceled, so narrow the conditions and run it again. Each person can run up to two requests at the same time.

### 11.1 The Data tab — viewing

![The Data tab](/guide-assets/en/data-tab.webp)

* Choose a table or view from the list on the left. The number next to the name is an estimated row count.
* Use **{{database.data.addFilter}}** to set a column, operator, and value, then click **{{database.data.apply}}**. You can add up to 10 conditions, and only rows that meet all of them are shown. Nothing is queried while you type a value; the query runs only when you click **{{database.data.apply}}**.
* The operators are `=`, `≠`, `<`, `≤`, `>`, `≥`, {{database.data.op.CONTAINS}}, {{database.data.op.STARTS_WITH}}, {{database.data.op.IN}}, {{database.data.op.IS_NULL}}, and {{database.data.op.IS_NOT_NULL}}.
* Click a column header to sort by that column. Click it again to reverse the order.
* Rows are shown 100 per page; move between pages at the bottom. Until you click **{{database.data.countExact}}**, an estimated row count is shown; click it to count the exact total number of rows.
* **{{database.data.downloadCsv}}** downloads the rows currently shown on screen as a CSV file. Rows on other pages are not included.
* If an ERD document is linked to the connection, the column headers also show the logical names from that document. A description added to a logical name after `-----` appears when you hover over the header.
* Columns start at a width that fits the header and type. Drag the right edge of a header to change the width, and double-click it to reset.
* You can also change the width with the keyboard. Focus the right edge of a header and press `←` or `→`. Hold `Shift` for bigger steps, and press `Enter` to reset.
* Changed widths are remembered per connection and table in this browser.
* Long values are truncated, with their full character count shown at the end. Click a cell to see the whole value.
* NULL appears as a dimmed `NULL`, and an empty string appears as an empty cell. For binary values, only the size is shown.
* If you sort or filter on a column without an index, or use a {{database.data.op.CONTAINS}} or {{database.data.op.STARTS_WITH}} condition, an orange notice appears under the condition bar. It means the query may be slow on a large table; the query still runs. The notice goes away when you use the primary key or the first column of an index.

![Notice that the query may be slow](/guide-assets/en/data-slow-hint.webp)

### 11.2 Following foreign keys

![View rows referencing this row](/guide-assets/en/data-follow-menu.webp)

You can open rows linked by a foreign key directly.

* A small arrow button sits next to each foreign key value. Click it to open the parent table showing only the row with that value.
* In a table that other tables reference, each row has a **{{database.follow.references}}** button on the left. Click it to list the referencing tables as "table (foreign key columns)". Choose one to open that table showing only the rows that point to this row.
* The filter appears in the filter row. Edit or remove it and click **{{database.data.apply}}** to query again.
* Foreign keys made of several columns can be followed too.
* A value that is NULL, truncated, or binary cannot be followed. In that case the button does not appear or cannot be clicked.
* If the target table is not in the list on the left, a notice says it cannot be found.

![A table opened by following a foreign key](/guide-assets/en/data-follow.webp)

### 11.3 The Data tab — editing rows

![Editing rows](/guide-assets/en/data-edit.webp)

Edits are not applied immediately. They are queued and applied together.

| What you do | How | How it is marked |
|---|---|---|
| Edit a value | Double-click the cell, type the value, and press `Enter` | The cell turns orange |
| Set to NULL | The **{{database.edit.setNull}}** button while editing. It appears only for columns that accept NULL | The cell turns orange |
| Add a row | **{{database.edit.addRow}}**. A blank row appears at the top of the table | The row turns green |
| Delete a row | The trash icon to the left of the row | The row turns red, with the text struck through |
| Cancel | The undo icon to the left of the row, or **{{database.edit.discard}}** | The mark disappears |

The bar at the bottom shows how many rows are added, edited, and deleted. Click **{{database.edit.apply}}** to open a confirmation dialog.

![Confirming the changes](/guide-assets/en/data-apply-confirm.webp)

* The changes are applied as one batch. If any change fails, all of them are rolled back.
* A warning appears if the batch includes deletions. Changes cannot be undone once applied.
* The data of views and tables without a primary key cannot be edited. In that case, the reason is shown above the tab.
* Cells left blank in a new row get the database's default value.
* Generated columns are calculated by the database. In a new row they show **{{database.edit.generatedPlaceholder}}**, and you cannot enter or edit their values.
* Clearing a cell sets it to an empty string. To set NULL, use the **{{database.edit.setNull}}** button.
* A cell changed back to its original value is dropped from the changes.
* Up to 100 changes can be applied at once.
* If applying fails, the changes stay on screen, and the failed rows show the database's error message.
* If you move to another table or tab, or close the window, with unapplied changes, a confirmation dialog appears.

### 11.4 The Structure tab

![The Structure tab](/guide-assets/en/data-structure.webp)

Shows the columns (name, type, nullability, default value, comment), indexes, foreign keys, and **{{database.structure.referencedBy}}** of the selected table. The structure cannot be edited here. Edit it in the ERD and then apply it with migration DDL.

* Comments also show only the part before `-----`; hover to see the description.
* Auto-increment columns are marked **{{database.structure.autoIncrement}}**, and generated columns are marked **{{database.structure.generated}}**.
* **{{database.structure.referencedBy}}** lists the foreign keys in other tables that point to this table.

![Differences from the document](/guide-assets/en/data-compare.webp)

In the **{{shareViewer.tab.data}}** tab of the editor, **{{database.compare.title}}** appears at the top of the Structure tab. Only editors and above see it. It is not in the data browser opened in a new window.

* Click **{{database.compare.run}}** to compare the actual structure of the selected table with the ERD document. To read it again, click **{{database.compare.again}}**.
* Each difference appears on its own line, per table, column, primary key, unique key, or relationship. It is labeled "only in DB" if it exists only in the database, "only in document" if it exists only in the document, and "differs" if both have it but they differ.
* If there are no differences, **{{database.compare.same}}** appears.
* When you edit the document, the list updates right away. Unsaved edits are included.
* **{{database.compare.toDocument}}** opens the Sync DB dialog. Use it to bring the database structure into the document (section 10.4).
* **{{database.compare.toDatabase}}** opens the migration DDL dialog. Use it to apply the document structure to the database (section 10.4).

### 11.5 The SQL tab

![The SQL tab](/guide-assets/en/data-sql.webp)

* Write SQL and click **{{database.sql.run}}** or press `Ctrl/Cmd+Enter`. Only the statement under the cursor, or the selected text, is run.
* Syntax highlighting follows the DBMS of the connection. SQL keywords and table and view names are autocompleted. Column names are not.
* Query results appear in the table below. For large results, only the first 500 rows are shown, along with a notice. The result table cannot be sorted by its headers; to sort, use `ORDER BY` in the statement. You can download the results as a CSV file.
* A confirmation dialog appears before a statement that changes data or structure runs. Once run, it cannot be undone.
* For statements that change data, the number of affected rows is shown. If an error occurs, the database's error message is shown as is.
* Use the history button to recall statements you ran earlier. The history keeps up to the last 50 statements per connection, stored only in this browser.
* Statements that change the table structure can leave the database out of sync with the ERD document. In that case, bring the change into the document with **{{model.editor.toolbar.sync}}**.

## 12. Validation

![Design validation](/guide-assets/en/editor-validation.webp)

Click **{{model.validation.toggle}}** on the toolbar to open the **{{model.validation.title}}** panel on the left. The document is rechecked every time you edit it.

* Use the level buttons at the top to filter by errors, warnings, or info.
* Click an item to jump to that table on the canvas.
* While the panel is open, tables with issues also have their borders marked in the level's color on the canvas. Info-level issues are not marked on the canvas.
* The **{{model.validation.toggle}}** button on the toolbar shows the number of errors, or the number of warnings if there are no errors. The count stays up to date even when the panel is closed.
* Warnings and info items can be marked as intended exceptions. Hover over an item, click the eye icon on the right (**{{model.validation.exception.mark}}**), write a one-line reason (up to 200 characters), and save. Errors cannot be marked as exceptions.
* Excepted items are left out of the button count, the level button counts, and the border colors on the canvas. Click the **{{model.validation.exception.chip}}** button at the top to see the exceptions with their reason, author, and date, and use **{{model.validation.exception.remove}}** to undo one. An exception whose issue no longer appears is marked **{{model.validation.exception.stale}}**. Deleting the target table, column, or relationship also deletes the exception. Exceptions are saved in the document, so they work with undo and collaborative editing; people with view-only access can see them but not change them.
* Errors do not block saving. Errors are problems that can make applying the document to a database fail, so fix them before deploying.

| Level | Rule | Meaning |
|---|---|---|
| Error | {{model.validation.rules.DUPLICATE_TABLE_NAME}} | Two or more tables have the same physical name |
| Error | {{model.validation.rules.DUPLICATE_COLUMN_NAME}} | Two or more columns in one table have the same name |
| Error | {{model.validation.rules.DUPLICATE_KEY_NAME}} | Names of unique keys, indexes, or CHECK constraints overlap |
| Error | {{model.validation.rules.COMPOSITE_KEY_DUPLICATE_COLUMN}} | The same column appears twice in one key |
| Error | {{model.validation.rules.FK_TYPE_MISMATCH}} | The foreign key column and the parent column have different types |
| Error | {{model.validation.rules.FK_TARGET_NOT_KEY}} | The column the foreign key points to is not a primary key or unique key |
| Error | {{model.validation.rules.FK_NULLABILITY_MISMATCH}} | The multiplicity of the relationship and the nullability of the foreign key do not agree |
| Error | {{model.validation.rules.ONE_TO_ONE_MISSING_UK}} | A 1:1 relationship has no unique key on its foreign key |
| Error | {{model.validation.rules.UNKNOWN_DATA_TYPE}} | The column type is not in the Crowfoot type list |
| Error | {{model.validation.rules.MISSING_TYPE_LENGTH}} | VARCHAR or VARBINARY has no length (not checked in PostgreSQL documents) |
| Warning | {{model.validation.rules.MISSING_PK}} | A table has no primary key |
| Warning | {{model.validation.rules.EMPTY_TABLE}} | A table has no columns |
| Warning | {{model.validation.rules.FK_MAPPING_EMPTY}} | A relationship has no linked columns |
| Warning | {{model.validation.rules.ORPHAN_TABLE}} | A table is not related to any other table |
| Warning | {{model.validation.rules.CIRCULAR_REFERENCE}} | Foreign keys form a loop that leads back to the same table |
| Warning | {{model.validation.rules.NAMING_CONVENTION}} | A physical name does not follow the naming rules |
| Warning | {{model.validation.rules.MISSING_LOGICAL_NAME}} | A logical name is empty |
| Info | {{model.validation.rules.FK_WITHOUT_INDEX}} | No index starts with the foreign key column |
| Info | {{model.validation.rules.WIDE_TABLE}} | A table has more than 30 columns |

## 13. Sharing and comments

### 13.1 Share links

![Sharing a document](/guide-assets/en/editor-share.webp)

Click **{{model.editor.toolbar.share}}** and then **{{model.share.issue}}** to create a link. Anyone with the link can view the document without signing in, but cannot edit it.

* Choose **{{model.share.period.unlimited}}** or **{{model.share.period.custom}}**. With a custom period, the link works only between the start and end date and time.
* Each link shows its number of views, likes, and comments.
* Use the copy icon to copy the address and the trash icon to revoke the link. A revoked link stops working immediately.
* Editors and above can create and revoke links. A document can have several links.
* A share link shows the latest content of the document, not a copy taken when the link was created.
* Shared documents also appear in the share gallery on the start page. Click **{{landing.gallery.more}}** under the gallery to search every shared document by name or description and page through the list.

On the shared page, people can view the ERD, download the SQL script, and leave likes and comments. Only signed-in users can like a document. Visitors who are not signed in can comment by entering a nickname and a password.

### 13.2 The Comments tab

The **{{shareViewer.tab.comments}}** tab at the bottom of the editor collects the likes and comments received through share links. When a comment is posted, a notification appears on the bell icon.

* Comments belong to the document. All share links of the same document show the same comments, and comments remain even after a link is revoked.
* Members can also comment on a document in this tab even if it has no share link.
* Users with the Commenter role or higher can comment. Viewers can only read comments and like the document.
* Only the person who created the document can reply to comments, and replies carry an author label. Replies cannot be replied to.
* Comments posted without signing in can be edited or deleted with the password entered when posting.

## 14. Version history

### 14.1 Viewing saved versions

![Version history](/guide-assets/en/editor-history.webp)

Each time a document is saved, a version is kept. Open the list with **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.history}}**.

* Each version shows who saved it, when, and a summary of what changed (added, changed, deleted, moved).
* Use **{{model.editor.history.editMemo}}** to leave a note on a version. The search box searches these notes.
* **{{model.editor.history.view}}** opens that version read-only.
* **{{model.editor.history.restore}}** saves the content of that version as a new version. The current content also remains in the history.

### 14.2 Comparing versions

Click **{{model.editor.history.compare}}** to see the differences between two versions.

* The canvas is drawn from the compared version, and changed tables are marked with `+` (added) and `~` (changed).
* Deleted tables are listed separately.
* Return to the document with **{{model.editor.compare.exit}}**.

### 14.3 Migration DDL

**{{model.editor.compare.migrationDdl}}** on the version comparison screen turns the differences between two versions into ALTER statements. Use it to apply to the database only what has changed since the last deployment. Copy the script and run it on the database. Statements that may delete data carry a warning. To run it on the database directly, use the migration DDL of Sync DB (section 10.4).

## 15. Editing together

Several people can open and edit the same document at the same time.

* The toolbar shows who is viewing the document with you, and you can see other people's cursors move on the canvas.
* Other people's edits appear on your screen immediately.
* An item someone else is editing is locked and shows that person's name. The lock is released when that person closes the edit dialog or leaves the document.
* Viewers and Commenters can see other people's edits and cursors, but cannot edit the document.
* If two people edit the same property, the last edit wins. When your value is overwritten, a notice appears and you can restore yours with **{{model.editor.collab.lwwRestore}}**.
* The speech bubble button at the bottom right is **{{model.editor.chat.label}}**. Use it to chat with the people viewing the document with you.
  * Press `Enter` to send and `Shift+Enter` for a new line. Messages can be up to 500 characters.
  * If a message arrives while the chat is closed, a notification appears and the button shows the unread count.
  * People who join later can see the last 50 messages. Chat is not saved with the document.

If someone else saved before you, the **{{model.editor.conflict.title}}** dialog appears when you save.

* Changes that do not overlap are merged automatically.
* For each overlapping item, choose **{{model.editor.conflict.keepMine}}** or **{{model.editor.conflict.useServer}}**.
* Click **{{model.editor.conflict.resolve}}** to merge as you chose and save.

If the window closes before you save, your edits remain in the browser and are recovered when you reopen the document.

## 16. Teams

![The team screen](/guide-assets/en/team-detail.webp)

A team groups people together. When you add a team as a member of a workspace, everyone on the team gets access at once.

* Go to **{{shell.nav.teams}}** in the top menu. Create a team with **{{shell.sidebar.newTeam}}** in the sidebar. Creating a team does not create a workspace.
* Find and add people with **{{team.members.addButton}}**, and remove them with **{{team.members.remove}}**.
* The team owner can edit the name and description and use **{{team.detail.settings.dissolveButton}}**. Dissolving a team also removes the workspace access granted to that team.

## 17. Community and notifications

### 17.1 Release notes

![Release notes](/guide-assets/en/community-release-notes.webp)

These posts announce what has changed in each new version. Click a post to open it, and choose the language to read it in.

### 17.2 Feedback

![Feedback](/guide-assets/en/community-feedback.webp)

Use this board to suggest improvements and report bugs. Write a post with **{{community.board.newPost}}**; you can attach images. Each post has its own comments.

### 17.3 My comments and liked documents

![My comments](/guide-assets/en/community-my-comments.webp)

**{{shell.sidebar.communityMyComments}}** collects the comments you have left on shared documents. **{{shell.sidebar.communityMyLikes}}** lists the shared documents you have liked. Click a row to go to that document.

### 17.4 Notifications

![Notifications](/guide-assets/en/shell-notifications.webp)

Click the bell icon to see your recent notifications. There are five kinds.

* Someone commented on your document
* Someone liked your document
* The person who created the document replied to your comment
* Someone commented on your post in Feedback. Your own comments are not notified
* (Administrators only) Someone posted in Feedback

Clicking a notification marks it as read and takes you to the document or post. A comment notification scrolls to that comment and highlights it briefly.

Use **{{shell.notifications.markAll}}** to mark them all as read, and **{{shell.notifications.viewAll}}** to go to the full list.

![The notification list](/guide-assets/en/community-notifications.webp)

## 18. Administrators

![The admin screen](/guide-assets/en/admin-users.webp)

Administrator accounts see **{{shell.nav.admin}}** in the top menu.

| Menu | Contents |
|---|---|
| **{{shell.sidebar.adminUsers}}** | Users, administrator rights, and account status |
| **{{shell.sidebar.adminCodes}}** | Code values such as database types |
| **{{shell.sidebar.adminManaged}}** | Instances for service-provided databases and the databases issued from them |
| **{{shell.sidebar.adminSystemTerms}}** | Add and delete words in the system dictionary |
| **{{shell.sidebar.adminAuditLogs}}** | A log of important actions |
| **{{shell.sidebar.adminTraffic}}** | Visit statistics |

## 19. Keyboard shortcuts

![Keyboard shortcuts help](/guide-assets/en/editor-shortcuts.webp)

In the editor, press `Ctrl/Cmd+/` or click the keyboard icon on the toolbar to open the shortcuts dialog.

| Shortcut | What it does |
|---|---|
| `Ctrl/Cmd+Z` | {{model.editor.shortcuts.row.undo}} |
| `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y` | {{model.editor.shortcuts.row.redo}} |
| `Ctrl/Cmd+S` | {{model.editor.shortcuts.row.save}} |
| `Ctrl/Cmd+C` | {{model.editor.shortcuts.row.copy}} |
| `Ctrl/Cmd+V` | {{model.editor.shortcuts.row.paste}} |
| `Ctrl/Cmd+D` | {{model.editor.shortcuts.row.duplicate}} |
| `Delete`, `Backspace` | {{model.editor.shortcuts.row.delete}} |
| `Ctrl/Cmd+F` | {{model.editor.shortcuts.row.search}} |
| `Ctrl/Cmd+A` | {{model.editor.shortcuts.row.selectAll}} |
| `Esc` | {{model.editor.shortcuts.row.deselect}} |
| `Shift+Click` | {{model.editor.shortcuts.row.rangeSelect}} |
| Arrow keys | {{model.editor.shortcuts.row.nudge}} |
| `Shift+` arrow keys | {{model.editor.shortcuts.row.nudgeFast}} |
| `Space+Drag` | {{model.editor.shortcuts.row.pan}} |
| Right mouse button | {{model.editor.shortcuts.row.contextMenu}} |
| `Ctrl/Cmd+/` | {{model.editor.shortcuts.row.help}} |
| `Ctrl/Cmd+Enter` | Run SQL in the SQL tab of the data browser |

While you are typing in a text field, only the help shortcut works. Without edit permission, the shortcuts for editing, moving, and deleting are disabled.

## 20. Designing with Claude (MCP)

Connect an MCP client such as Claude Code to a workspace to collect requirements and build and edit ERDs through conversation. What Claude creates appears in Crowfoot as is, and Claude can read the changes you make on screen.

### 20.1 Connecting

![The MCP tab](/guide-assets/en/workspace-mcp.webp)

Issue a token on the workspace's **{{workspace.detail.tabs.mcp}}** tab. All members can see this tab.

![Issuing a token](/guide-assets/en/mcp-issue.webp)

* Click **{{workspace.mcp.issueButton}}** and set a name and a lifetime. Choose a lifetime of no expiry, 30 days, 90 days, or 365 days. Each person can issue up to five tokens per workspace.
* After issuing, the token and the **{{workspace.mcp.commandLabel}}** are shown. Copy the command and run it in a terminal to finish connecting.
* You can copy the token and the command again from the tab at any time. The copy button next to a token in the list copies only the token. The full token is shown only to the person who issued it; even the owner sees only the beginning of other members' tokens. The owner sees every token in the workspace; other members see only their own.
* The list shows each token's name, who issued it, the issue date, the expiration date, and when it was last used.

![Issued token and registration command](/guide-assets/en/mcp-issued.webp)

* A token works only in that workspace, with the permissions of the person who issued it. A token issued by a {{common.role.VIEWER}} or {{common.role.COMMENTER}} is read-only.
* Do not paste the token into a conversation with Claude. Run the registration command in a terminal.
* The trash icon in the list revokes a token. Claude sessions connected with it lose access immediately. The owner can revoke other members' tokens too.
* It works with Claude Code and ChatGPT (Codex). Pick a client under **{{workspace.mcp.connectTitle}}** on the tab to see and copy the registration instructions. Connectors in the ChatGPT web and mobile apps are not supported.

### 20.2 What you can ask Claude to do

![How to use and example requests](/guide-assets/en/mcp-usage.webp)

Start Claude Code or Codex in the folder where you ran the registration command, and ask for what you want in plain words. **{{workspace.mcp.usage.title}}** on the tab lists example requests you can copy.

* Type `/mcp` in the chat to check the connection.
* The registration applies only to the folder where you ran the command. To use it from every folder, add `--scope user` to the registration command.
* Example requests: "Collect the requirements for a book rental service and create a new ERD document for MySQL", "Validate this document and show me the DDL".

| Task | Description |
|---|---|
| Explore the workspace | Reads the document list, the term dictionary, domain types, and design rules |
| Collect requirements | Registers and edits the requirements that come up in conversation (section 20.3) |
| Sync the requirement list | Compares a whole requirement list, collected from meeting notes or a planning document, with the document. It first shows what to add, change, and what is missing, and applies everything at once after you confirm. Missing requirements are set to dropped, not deleted |
| Check acceptance criteria with data | Adds check SQL to acceptance criteria, runs it on the connected database, and tells you whether each criterion passes (section 20.3) |
| Create and edit ERDs | Creates and edits tables, columns, keys, indexes, relationships, and groups, following the workspace's terms and domain types |
| Validation and SQL | Gets the design validation result and the SQL script |
| Import SQL | Creates a new document from a CREATE TABLE script |
| Apply to a database | Issues a service-provided database and deploys a document or applies only what changed. It can also bring structure changes in the database into the document (section 20.4) |
| Sample data | Creates sample data that fits the table structure and inserts it into the deployed database (section 20.4) |

* Every change Claude makes is saved as a version. If you do not like it, restore an earlier version (section 14).
* Claude cannot delete documents. Before deleting a table or column, it shows what will be removed.
* Some things Claude does not do. Do these yourself in the app: managing workspaces and members, registering and changing connections, revoking service-provided databases, viewing connection credentials, creating share links, restoring versions, and registering dictionary entries and domain types.
* Tables Claude creates are laid out automatically when you open the document. Tables and notes you have already arranged stay where they are.
* If Claude edits a document while you have it open in the editor, the editor reloads with the new content. If you have unsaved edits, a notice appears first.

### 20.3 Requirements panel

![The requirements panel](/guide-assets/en/editor-requirements.webp)

Click the **{{shareViewer.tab.requirements}}** tab at the bottom of the editor to open the requirements view. Requirements are saved with the document. When requirements are pending, the tab shows how many.

* Requirements are organized by domain (group). Pick a domain in the list on the left to see only that domain; each domain shows its number of applied requirements with a progress bar. Requirements without a group are collected under **{{model.requirements.group.unassigned}}**, and those that apply to the whole document under **{{model.requirements.group.document}}**.
* Click a domain section's title to collapse it, and **{{model.requirements.domains.showOnCanvas}}** to select that domain's tables and show them in the ERD tab.
* Click a row to expand its description and linked tables. Click a table name to go back to the ERD tab and show that table. **{{model.requirements.domains.showOnCanvas}}** in an expanded row selects all linked tables and fits them on screen.
* Use the status buttons at the top to filter. By default, only **{{model.requirements.state.DROPPED}}** is hidden. The search box searches codes, titles, descriptions, and table names.
* **{{model.requirements.untraced.title}}** under a domain section lists that domain's tables that are not linked to any requirement.
* **{{model.requirements.export.button}}** downloads the requirements specification as a Markdown or CSV file.

| Status | Meaning |
|---|---|
| **{{model.requirements.state.APPLIED}}** | The confirmed requirement is reflected in the ERD |
| **{{model.requirements.state.PENDING}}** | Confirmed, but the ERD does not reflect the latest text yet. Editing the title or description puts a requirement in this status |
| **{{model.requirements.state.UNLINKED}}** | Marked as applied, but no table is linked |
| **{{model.requirements.state.LEFTOVER}}** | A dropped requirement still has linked tables |
| **{{model.requirements.state.DRAFT}}** | Not confirmed yet |
| **{{model.requirements.state.DROPPED}}** | No longer in scope |

![Editing a requirement](/guide-assets/en/editor-requirement-dialog.webp)

Users with the Editor role or higher can add and edit requirements directly.

* Click **{{model.requirements.add}}** at the top of the panel, or the edit button in an expanded row. Set the title, description, scope, status, group, and tables to link. The code (such as REQ-001) is assigned automatically.
* Expand a pending row and click **{{model.requirements.changes.show}}** to compare the last applied content with the current one. It shows the changed title, lines added to the description (green +) and removed (red −), and the differences in acceptance criteria and linked tables. The comparison uses the saved document, so unsaved edits appear after you save. A requirement that was never applied shows **{{model.requirements.changes.isNew}}**.
* Follow the **{{model.requirements.steps.title}}** on the same row. Use **{{model.requirements.steps.tables}}** to change the linked tables. If the document is connected to a database, save it and click **{{model.requirements.steps.database}}** to run the changed structure on the database. This button opens the migration DDL window of DB sync. Finally, click **{{model.requirements.markApplied}}** to change it to applied. This mark is a document edit, so you can undo it.
* **{{model.requirements.criteria.title}}** are the checks that show a requirement is properly reflected. Write one per line in the edit dialog and check them off in the expanded row. You can also attach check SQL to each criterion and check it with data (below).
* For a requirement that is no longer needed, change its status to **{{model.requirements.status.dropped}}** instead of deleting it. Delete only entries added by mistake.
* A document can hold up to 500 requirements.

![Changes and the steps to apply them](/guide-assets/en/editor-requirement-changes.webp)

![Check SQL for acceptance criteria](/guide-assets/en/editor-requirement-check-dialog.webp)

In a document connected to a database, you can check acceptance criteria against real data.

* In the edit dialog, open a criterion under **{{model.requirements.checks.dialog.title}}** and enter a SELECT statement that returns one value, plus the **{{model.requirements.checks.dialog.expect}}** value. An empty expected value means 0. For example, for "No member has an empty email", enter `SELECT COUNT(*) FROM users WHERE email IS NULL`. Leave the SQL empty to skip the check.
* Check SQL belongs to the criterion text. If you change the text of a line, enter its check SQL again. Changing criteria or check SQL does not make the requirement pending.
* A requirement can have up to 20 acceptance criteria of up to 200 characters each. Check SQL can be up to 4,000 characters.
* When a criterion has check SQL, the **{{model.requirements.checks.run}}** button appears at the top of the panel. It runs the check SQL read-only on the connected database and compares the results with the expected values. **{{model.requirements.checks.runOne}}** in an expanded row checks only that requirement. You need the editor role or higher, and dropped requirements are not checked.
* Each criterion gets **{{model.requirements.checks.PASSED}}**, **{{model.requirements.checks.FAILED}}**, or **{{model.requirements.checks.ERROR}}**, and the counts appear next to the button. A failure shows the actual and expected values; an error shows why the SQL could not run and the message from the database. Check SQL must be a single SELECT statement.
* Results are not saved in the document. When you change the check SQL, the result for that criterion disappears. You can also ask Claude to "check the acceptance criteria with data" for the same check.

![Results of checking with data](/guide-assets/en/editor-requirement-checks.webp)

### 20.4 Applying to a database

For Claude to change the structure of a database, the connection must allow it.

* Turn on **{{connection.dialog.mcpApply}}** when adding or editing a connection. It is off by default, and connections with it on are marked in the list.
* Service-provided databases allow it by default.
* Claude shows the SQL first and runs only the plan you confirmed. If the document or the database has changed since the plan was shown, Claude does not run it and makes a new plan.
* Claude first inserts sample data in a trial run and rolls it back to check for constraint violations, then inserts only the data you confirm. It only inserts rows; it never updates or deletes them. Each request can cover up to 20 tables and 1,000 rows.
* The first deployment is made only to an empty database. For a database that already has tables, only what changed is applied.
* Renaming the physical name of a table or column shows up in the change plan as a rename statement (RENAME). The data is kept.
* Statements that delete run only after separate approval. Without approval, only additions and changes are run.
* For a connection that does not allow it, Claude only shows the SQL. Run it yourself with Deploy (section 10.3) or migration DDL (section 14.3) in the editor.

## 21. Frequently asked questions

**Can I change the database type of a document?**
No. Create a new document of another type with **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}**.

**When is my work saved?**
It is saved automatically shortly after you edit. You can also save right away with the **{{model.editor.toolbar.save}}** button or `Ctrl/Cmd+S`. Each save also keeps a version.

**How do I undo a mistake?**
Press `Ctrl/Cmd+Z` to undo a recent edit. For changes that are already saved, restore an earlier version from the version history.

**How do words and terms differ?**
A word is one part of a name, and a term is a whole column name. A term can point to a domain type, so using a term on a column sets its type as well.

**Do columns change as soon as I edit a domain type?**
No. When you open a document, Crowfoot tells you about the change and lets you choose which columns to apply it to.

**Can I use Crowfoot without a database?**
Yes. You can simply draw an ERD and use the generated SQL script elsewhere. To try running it, issue a service-provided database in the Database tab.

**Can I change the structure in the data browser?**
Not in the Data tab or the Structure tab. Edit it in the ERD and then apply it with migration DDL. In the **{{shareViewer.tab.data}}** tab of the editor, **{{database.compare.toDatabase}}** on the Structure tab takes you there directly.

**Can someone with a share link edit the document?**
No. To edit together, add them as a workspace member and give them the Editor role.

**Where can I suggest improvements?**
Post it in **{{shell.nav.community}}** › **{{shell.sidebar.communityFeedback}}**.

**Can I undo what Claude changed?**
Yes. Every change Claude makes is saved as a version, so you can restore an earlier one from the version history.

**What if "A new version has been deployed" appears at the top?**
Refresh the page. The page you have open is an old version, so it no longer saves. Unsaved edits are restored after the refresh.
