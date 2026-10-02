Crowfoot is a tool for drawing ERDs in your browser, editing them with your team, and applying them to a database. This guide starts with where things are on the screen and then walks through every feature in turn. The data in the screenshots is sample data made for this guide.

## 1. The screens at a glance

Crowfoot has three kinds of screens.

| Screen | How to open it | What you do there |
|---|---|---|
| App | Opens when you sign in | Workspaces, document lists, members, databases, teams, community |
| Editor | Click a document in the document list; it opens in a new window | Draw ERDs, manage standards, generate SQL, share, version history |
| Data browser | Click the browse data button of a connection; it opens in a new window | View real data, edit rows, run SQL |

### 1.1 The top menu of the app

![The top menu of the app](/guide-assets/en/shell-header.webp)

From left to right, it contains the following.

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
| Right | Your name | Your profile, language, sign out |

### 1.2 The left sidebar

The left sidebar changes with the item you choose in the top menu.

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
| Center | The canvas. Tables, relationship lines, notes, and groups go here |
| Bottom right | The minimap and the document chat button |
| Bottom | The **ERD** tab and the **{{shareViewer.tab.comments}}** tab |

Section 5 explains the toolbar buttons one by one.

### 1.4 The data browser window

![The data browser](/guide-assets/en/data-tab.webp)

| Position | Contents |
|---|---|
| Top | Connection name, DBMS, host address, theme and language, **{{database.close}}** |
| Left | List of tables and views, search box, refresh |
| Top right | The name of the selected table and the **{{database.tabs.data}}**, **{{database.tabs.structure}}**, and **{{database.tabs.sql}}** tabs |
| Right | The contents of the tab |

## 2. Getting started

### 2.1 Signing in

![The sign-in screen](/guide-assets/en/login.webp)

1. Click the sign-in button on the start page.
2. Read the Terms of Service and tick the box to agree. The sign-in buttons are enabled only after you tick it.
3. Continue with a GitHub or Google account. There is no separate sign-up step.

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

Click your name at the top right to see your name, email, linked account, and the date you joined. The same menu lets you change the language and sign out. You can also change the language with the globe icon. The language you choose is remembered the next time you visit.

## 3. Workspaces

A workspace holds ERD documents, database connections, the term dictionary, and domain types. Members and permissions are also set per workspace.

### 3.1 Creating a workspace

![New workspace](/guide-assets/en/workspace-create.webp)

Click **{{shell.sidebar.newWorkspace}}** in the sidebar and enter a name. The person who creates the workspace becomes its owner.

### 3.2 The tabs of a workspace

When you open a workspace, there are five tabs below its name.

| Tab | Contents |
|---|---|
| **{{workspace.detail.tabs.erd}}** | The list of ERD documents. Create, open, and delete documents |
| **{{workspace.detail.tabs.database}}** | Service-provided databases and database connections |
| **{{workspace.detail.tabs.overview}}** | Name, description, creator, number of members, creation date |
| **{{workspace.detail.tabs.members}}** | Members and their roles |
| **{{workspace.detail.tabs.settings}}** | Edit the name and description, delete the workspace. Shown only to the owner |

### 3.3 The ERD tab — the document list

![The document list](/guide-assets/en/workspace-erd.webp)

* Type a document name or description in the search box to find a document.
* Click a document name to open the editor in a new window.
* The columns of the list are document name, database type, version, creator, and last modified.
* The five buttons at the top create documents. Section 4 explains them.

![The document row menu](/guide-assets/en/document-row-menu.webp)

Click the three-dot button at the right end of a row to see **{{model.list.menu.edit}}** and **{{model.list.menu.delete}}**. Documents that are not connected to a database also show **{{model.list.menu.connect}}**. A deleted document cannot be restored.

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

Click **{{workspace.members.addButton}}** to choose one person or a team.

* **{{workspace.members.addDialog.targetUser}}**: Type at least two characters of a name or email to search.
* **{{workspace.members.addDialog.targetTeam}}**: When you give a role to a team, every member of that team gets the same role.
* The Owner role cannot be given to anyone.
* In the list, change a role or take access away with **{{workspace.members.revoke}}**.

### 3.5 The Overview and Settings tabs

![The Overview tab](/guide-assets/en/workspace-overview.webp)

The Overview tab shows the basic information of the workspace.

![The Settings tab](/guide-assets/en/workspace-settings.webp)

Edit the name and description in the Settings tab. **{{workspace.detail.settings.deleteButton}}** under **{{workspace.detail.settings.dangerZone}}** deletes the workspace and every document in it. This cannot be undone.

## 4. Creating an ERD document

There are five ways to create a document. Each is a button at the top of the ERD tab.

| Button | When to use it |
|---|---|
| **{{model.list.newDocument}}** | To draw from a blank document |
| **{{model.templates.openButton}}** | To start from a copy of an example document |
| **{{sqlImport.openButton}}** | When you have a CREATE TABLE script |
| **{{reverse.openButton}}** | To read the structure of an existing database |
| **{{model.import.button}}** | To bring back an exported document file (.crown) |

### 4.1 New ERD document

![New ERD document](/guide-assets/en/document-create.webp)

Enter a name and choose a database type. The database type is fixed when the document is created and cannot be changed later. To move to another type, use **{{model.editor.toolbar.dbmsConvert}}** in the editor (section 10.5).

### 4.2 Start from a template

![Start from a template](/guide-assets/en/document-template.webp)

Choose one of the prepared example documents and copy it into your workspace. You can look at it first with **{{model.templates.preview}}**.

### 4.3 Import SQL

![Import SQL](/guide-assets/en/document-sql-import.webp)

1. Choose the database type and enter a document name.
2. Paste a CREATE TABLE script, or read a file with **{{sqlImport.readFile}}**. Files can be up to 1MB.
3. Click **{{sqlImport.preview}}** to see the number of tables and relationships that were read, and any statements that could not be read.
4. Click **{{sqlImport.submit}}**.

This creates a document from a script alone, without connecting to a database.

### 4.4 Import from DB

![Import from DB](/guide-assets/en/document-reverse.webp)

Choose a registered connection, and Crowfoot reads the tables, columns, keys, relationships, and comments of that database and creates a document. Column comments become logical names. A document created this way is connected to that connection, so you can use **{{model.editor.toolbar.sync}}**. Register the connection first in the Database tab (section 10.1).

### 4.5 Import a document file (.crown)

This turns a file downloaded with **{{model.editor.toolbar.export}}** › **{{model.editor.toolbar.crown}}** in the editor back into a document. Use it to move a document to another workspace or to restore a backup.

## 5. The editor and its toolbar

![The editor toolbar](/guide-assets/en/editor-toolbar.webp)

### 5.1 The toolbar buttons

From left to right.

| Button | Description |
|---|---|
| **{{model.editor.explorer.toggle}}** | Opens and closes the Model Explorer on the left (section 5.2) |
| **{{model.editor.termDictionary.toggle}}** | Opens and closes the term dictionary and domain types panel (section 9) |
| **{{model.validation.toggle}}** | Opens and closes the design validation panel. A number shows how many issues there are (section 12) |
| {{model.editor.toolbar.undo}}, {{model.editor.toolbar.redo}} | Undo and redo edits one step at a time |
| **{{model.editor.toolbar.save}}** | Saves now. Edits are also saved automatically after a moment |
| **{{model.editor.toolbar.autoLayoutLayered}}** | Rearranges the tables automatically. The arrow next to it chooses the mode and direction (section 5.3) |
| **{{model.editor.toolbar.ddl}}** | Turns the document into a SQL script (section 10.2) |
| **{{model.editor.toolbar.share}}** | Creates a read-only share link (section 13) |
| **{{model.editor.toolbar.export}}** | Downloads the document as an image or a document file (section 5.4) |
| **{{model.editor.toolbar.tools}}** | Logical names, sync DB, browse data, duplicate for another DBMS, domain types, version history (section 5.5) |
| DBMS badge | The target DBMS of the document. Click it to open the **{{model.editor.toolbar.dbmsConvert}}** dialog |
| **{{model.editor.toolbar.view}}** | Choose the column name display, the column display, and the group to show (section 5.6) |
| − number + | Zoom out, current zoom level, zoom in |
| Four-corners icon | **{{model.editor.toolbar.fit}}**. Fits the whole document on the screen |
| Keyboard icon | **{{model.editor.shortcuts.open}}** (section 19) |
| Question mark icon | Opens this user guide in a new window |
| Sun icon | Switches between the light and dark themes |

If you open a document with a read-only role, the editing buttons are disabled and a **{{model.editor.toolbar.readOnly}}** label is shown.

### 5.2 The explorer (Model Explorer)

![The explorer](/guide-assets/en/editor-explorer.webp)

* Shows the tables, relationships, and notes of the document as a tree. Tables are listed by group.
* Type in the search box to search tables, columns, relationships, and notes. `Ctrl/Cmd+F` takes you straight to the search box.
* Click an item to move the canvas to that object and select it.
* On a group row, the eye icon shows only that group, the pencil icon edits the group, and the trash icon deletes it.

### 5.3 Auto layout

![The auto layout menu](/guide-assets/en/editor-menu-layout.webp)

Click the button to rearrange the tables in the selected mode. Click the arrow to choose the mode and direction. Your choice runs right away.

| Item | Description |
|---|---|
| **{{model.editor.toolbar.autoLayoutLayered}}** | Arranges tables in layers from parent to child. Suits most documents |
| **{{model.editor.toolbar.autoLayoutHub}}** | Puts tables with many relationships in the center and the others around them |
| **{{model.editor.toolbar.autoLayoutHybrid}}** | Mixes the two modes |
| **{{model.editor.toolbar.autoLayoutDown}}** | Parents at the top, children below |
| **{{model.editor.toolbar.autoLayoutRight}}** | Parents on the left, children on the right |

* Large documents take a few seconds to calculate. The screen does not freeze while it is calculating, and you can stop it with **{{model.editor.toolbar.autoLayoutCancel}}**.
* If you do not like the result, a single undo puts everything back where it was.
* Notes are placed near their linked table.

### 5.4 The Export menu

![The Export menu](/guide-assets/en/editor-menu-export.webp)

| Item | Description |
|---|---|
| **{{model.editor.image.viewport}}** | Downloads the part you see on the screen as a PNG image |
| **{{model.editor.image.document}}** | Downloads the whole document as a single PNG image |
| **{{model.editor.toolbar.crown}}** | Downloads the document as a .crown file. You can bring it back with **{{model.import.button}}** |

### 5.5 The Tools menu

![The Tools menu](/guide-assets/en/editor-menu-tools.webp)

| Item | Description | Details |
|---|---|---|
| **{{model.editor.toolbar.logicalNames}}** | Fills in empty logical names from the dictionary | Section 9.7 |
| **{{model.editor.toolbar.sync}}** | Compares the document with the connected database and brings them in line. Shown only for connected documents | Section 10.4 |
| **{{database.openShort}}** | Opens the data browser of the connected database in a new window | Section 11 |
| **{{model.editor.toolbar.dbmsConvert}}** | Creates a new document that differs only in its target DBMS | Section 10.5 |
| **{{model.editor.domainType.menu}}** | Opens the list of domain types | Section 9.3 |
| **{{model.editor.toolbar.history}}** | View, compare, and restore saved versions | Section 14 |

### 5.6 The View menu

![The View menu](/guide-assets/en/editor-menu-view.webp)

| Section | Items | Description |
|---|---|---|
| **{{model.editor.toolbar.nameMode.label}}** | {{model.editor.toolbar.nameMode.physical}}, {{model.editor.toolbar.nameMode.logical}}, {{model.editor.toolbar.nameMode.both}} | Chooses which name is shown for columns |
| **{{model.editor.toolbar.columnMode.label}}** | {{model.editor.toolbar.columnMode.all}}, {{model.editor.toolbar.columnMode.keys}} | Keys only shows just the PK and FK columns, so you can take in a large document at a glance |
| **{{model.editor.toolbar.areaFilter.label}}** | {{model.editor.toolbar.areaFilter.all}}, group names | Shows only the tables of the selected group |

View settings change only what is displayed. The document itself does not change.

### 5.7 Moving around the canvas

* Drag an empty spot, or hold `Space` and drag, to move the view.
* Zoom in and out with the mouse wheel or the − + buttons on the toolbar.
* Click the minimap at the bottom right to go to that spot.
* Hold `Shift` and click objects to select several of them. `Ctrl/Cmd+A` selects everything.

## 6. Tables and columns

### 6.1 Creating a table

![The right-click menu of an empty spot](/guide-assets/en/editor-context-canvas.webp)

Right-click an empty spot on the canvas and choose **{{model.editor.contextMenu.createTable}}**. A table is created where you clicked.

### 6.2 The parts of a table

![A table](/guide-assets/en/editor-table.webp)

| Part | Description |
|---|---|
| Color band | The logical name of the table. Drag the band to move the table |
| Name row | The physical name of the table. Click it to edit in place. The ⓘ on the right is **{{model.editor.table.info}}** |
| Column row | Drag the six dots on the left to reorder. The key icon marks a primary key |
| Column name | Physical name on top, logical name below. Click to edit in place |
| Type, length | The data type and length (or precision and scale). Click to edit |
| **NN** | NOT NULL. Click to turn it on or off. It is always on for primary key columns |
| **AI** | Auto increment. Can be turned on only for a primary key with an integer type |
| **FK** | A foreign key column. It was created by a relationship |
| **D** | A column that uses a domain type (section 9.4) |
| × | Deletes the column |
| **{{model.editor.table.addColumn}}** | Adds a column at the bottom |
| **{{model.editor.key.addUnique}}**, **{{model.editor.key.addIndex}}** | Create a unique key or an index (section 6.5) |
| Dots on the border | Handles for starting a relationship (section 7.1) |

Primary key columns are always gathered at the top.

### 6.3 Column info

![Column info](/guide-assets/en/editor-column-info.webp)

Double-click a column name to open the **{{model.editor.columnInfo.title}}** dialog. It lets you edit everything in one place, including properties that cannot be edited directly on the table.

| Field | Description |
|---|---|
| {{model.editor.columnInfo.physicalName}} | The column name created in the database |
| {{model.editor.columnInfo.logicalName}} | The name people read. It goes out as a COMMENT when SQL is generated |
| {{model.editor.columnInfo.pk}} | Turning it on makes the column NOT NULL and moves it to the top |
| {{model.editor.columnInfo.nullable}} | Sets whether the column accepts NULL |
| {{model.editor.columnInfo.autoIncrement}} | Can be turned on only for a primary key of type INT, BIGINT, or SMALLINT |
| {{model.editor.domainType.label}} | Choosing a domain type fills in the type, length, nullability, and default value from it (section 9.4) |
| {{model.editor.columnInfo.dataType}}, {{model.editor.columnInfo.length}} | Depending on the type, a length field or precision and scale fields appear |
| {{model.editor.columnInfo.defaultValue}} | For example `0` or `NOW()` |
| {{model.editor.columnInfo.comment}} | A description of the column |

Type names are shown the way the DBMS writes them. For example, the date and time type appears as TIMESTAMP in a PostgreSQL document and as DATETIME in a MySQL document.

### 6.4 Table info

![Table info](/guide-assets/en/editor-table-info.webp)

Click the ⓘ on a table, or choose **{{model.editor.contextMenu.tableInfo}}** from the right-click menu. Set the physical name, logical name, description, and color. For a table in a group, the group color takes priority.

### 6.5 Unique keys and indexes

![Adding an index](/guide-assets/en/editor-key-dialog.webp)

1. Click **{{model.editor.key.addUnique}}** or **{{model.editor.key.addIndex}}** at the bottom of the table.
2. Enter a name and choose the columns. The order you choose them in is the column order of a composite key. Use the arrows to change the order.
3. For an index, you can set the sort order (ASC, DESC) of each column.

The keys you create appear as **UK** and **IX** rows at the bottom of the table. Click a row to edit or delete it. When you create a relationship, an index on the foreign key column is created automatically.

## 7. Relationships

### 7.1 Creating a relationship

![Starting a relationship](/guide-assets/en/editor-relation-picker.webp)

1. Click a dot on the border of the table that will be the parent.
2. In the **{{model.editor.relation.startMenu}}** dialog, choose the relationship type, multiplicity, and relationship kind.
3. Click the table that will be the child. For a self-reference, click the same table. Press `Esc` to cancel.

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

Creating a relationship adds a new foreign key column. If you want to use an existing column as the foreign key instead, choose that column in the column mapping.

* From the list, choose another column of the child table, or choose **{{model.editor.relationship.mappingNewColumn}}**.
* If the type of the chosen column differs from the parent column, the **{{model.editor.relationship.mappingAlignType}}** checkbox appears.
* The old foreign key column that is no longer used can be deleted at the same time with **{{model.editor.relationship.mappingRemoveReleased}}**.
* The same child column cannot be chosen twice.

## 8. Notes, groups, and copying

### 8.1 Notes

![A note](/guide-assets/en/editor-note.webp)

* Choose **{{model.editor.contextMenu.createNote}}** from the right-click menu of an empty spot.
* Double-click a note to edit its text. Drag the band at the top to move it.
* In the note edit dialog, set the title, color, and **{{model.editor.note.linkedTable}}**. Dropping a note onto a table also sets its linked table.
* A note with a linked table is placed near that table by auto layout.
* To delete a note, right-click it and choose **{{model.editor.contextMenu.removeNote}}**.

### 8.2 Groups

![Editing a group](/guide-assets/en/editor-group-dialog.webp)

Groups collect tables by topic. A table in a group has a band in the group color.

* Select a table and click **{{model.editor.contextMenu.createGroup}}** in the right-click menu. You can select several tables at once.
* Add and remove tables with **{{model.editor.contextMenu.addToGroup}}** and **{{model.editor.contextMenu.removeFromGroup}}**.
* In **{{model.editor.contextMenu.editGroup}}**, edit the name, description, color, and member tables.
* You can show a single group from the **{{model.editor.toolbar.view}}** menu or the explorer.
* While viewing a single group, choose **{{model.editor.contextMenu.exitGroupView}}** from the right-click menu to return to the whole document.

### 8.3 The right-click menu of a table

![The right-click menu of a table](/guide-assets/en/editor-context-table.webp)

| Item | Description |
|---|---|
| **{{model.editor.contextMenu.tableInfo}}** | Opens the table info dialog |
| **{{model.editor.contextMenu.viewTableData}}** | Shows the data of this table in the connected database. Shown only for connected documents |
| **{{model.editor.contextMenu.copy}}** | Copies the selected objects |
| **{{model.editor.contextMenu.duplicate}}** | Makes a copy right next to the original |
| **{{model.editor.contextMenu.createGroup}}**, **{{model.editor.contextMenu.addToGroup}}**, **{{model.editor.contextMenu.removeFromGroup}}**, **{{model.editor.contextMenu.editGroup}}** | Manage groups |
| **{{model.editor.contextMenu.removeTable}}** | Deletes the table and its relationships |

### 8.4 Copy, paste, and duplicate

* Copy with `Ctrl/Cmd+C` and paste with `Ctrl/Cmd+V`. `Ctrl/Cmd+D` duplicates.
* When you copy several tables together, the relationships between them are copied too.
* Pasted tables are renamed automatically so that names do not clash.
* You can also paste into another document open in the same browser. Very large content can be pasted only within the same document.
* Choose **{{model.editor.contextMenu.paste}}** from the right-click menu of an empty spot to paste where you clicked.

## 9. Standards — words, terms, and domain types

A workspace keeps standards so that column names and types are not written differently from document to document. There are three kinds.

| Standard | What it defines | Example |
|---|---|---|
| Word | One part of a name and its meaning | `user` → Members, `email` → Email |
| Term | A whole column name, its meaning, and the type it uses | `user_email` → Members Email, domain type "Email" |
| Domain type | A type definition shared by many columns | Email = VARCHAR(191), NOT NULL |

Words and terms are registered in the same dictionary. An entry that points to a domain type or has a type written in is a term; any other entry is a word. Every document in the workspace shares the same standards.

### 9.1 Opening the standards panel

Click **{{model.editor.termDictionary.toggle}}** on the toolbar to open the panel on the left. It has three tabs.

| Tab | Contents |
|---|---|
| **{{model.editor.termDictionary.tabStandard}}** | The words and terms of this workspace |
| **{{model.editor.domainType.menu}}** | The domain types of this workspace |
| **{{model.editor.termDictionary.tabSystem}}** | The shared dictionary registered by administrators. Read-only |

### 9.2 Registering words and terms

![The workspace dictionary](/guide-assets/en/standard-terms.webp)

* Use the search box to find a token or label.
* Click **{{model.editor.termDictionary.add}}** to open the registration dialog. Click an entry in the list to edit it.
* A term shows the name of the domain type it points to as a purple badge. Click the badge to go to that entry in the Domain types tab.

![Editing a term](/guide-assets/en/standard-term-dialog.webp)

| Field | Description |
|---|---|
| {{model.editor.termDictionary.term}} | The text used in column names. Enter `email` for a word, or the whole name such as `user_email` for a term |
| {{model.editor.termDictionary.label}} | The text to use as the logical name |
| {{model.editor.domainType.label}} | Choosing one makes the entry a term. The type is defined by the domain type |
| **{{model.editor.termDictionary.promote}}** | Creates a new domain type from the type written in and links it. If one with the same name exists, that one is selected |

Registering the same token again overwrites it. A term registered as a whole name takes priority over the result of joining words together.

### 9.3 Creating a domain type

![The Domain types tab](/guide-assets/en/standard-domain-types.webp)

You can also open the Domain types tab with **{{model.editor.toolbar.tools}}** › **{{model.editor.domainType.menu}}**.

* Each entry shows its type and nullability, the number of columns using it in the current document, and the number of terms pointing to it.
* Click the number of terms, and the dictionary tab shows only the terms that point to that domain type.
* The number of columns counts only the document that is open now.

![Adding a domain type](/guide-assets/en/standard-domain-dialog.webp)

Click **{{model.editor.domainType.add}}** and enter the name, type, length (or precision and scale), nullability, default value, and description. A workspace can have up to 200 domain types, and their names must be unique.

### 9.4 Using a domain type on a column

![The domain type in column info](/guide-assets/en/standard-column.webp)

1. Double-click the column name to open the column info dialog.
2. Choose a domain type under **{{model.editor.domainType.label}}**. The type, length, nullability, and default value are filled in.
3. Save. A **D** badge appears next to the column name on the table.

A column can also use values of its own. If you choose a domain type and then edit the length yourself, a "Differs from the domain type" label appears, and that property no longer follows changes to the domain type. Use **{{model.editor.domainType.revert}}** to go back.

The type of a foreign key column follows its parent column, so it cannot use a domain type.

### 9.5 Suggestions while you type a column name

![Dictionary suggestions](/guide-assets/en/standard-suggest.webp)

When you type a column name on a table, the matching dictionary entries appear below it.

* The top line is the logical name that the name you have typed will produce.
* **{{model.editor.table.termGroupTerms}}**: Choosing one replaces the whole name with that term and fills in the logical name and domain type as well.
* **{{model.editor.table.termGroupWords}}**: Choosing one replaces only the part you are typing with that word. You can go on to type the next part.
* Choose with the arrow keys and insert with `Enter`. Press `Esc` to close.

In the column info dialog, a **Dictionary standard** notice appears when the column name matches a term in the dictionary. Click **{{model.editor.domainType.standardApply}}** to apply the domain type of that term.

### 9.6 When a domain type is edited

Editing the values of a domain type does not change the columns in your documents by itself. When you open a document, Crowfoot tells you about the change and asks which columns to apply it to.

![The notice that domain types have changed](/guide-assets/en/standard-banner.webp)

Click **{{model.editor.domainType.banner.review}}** to open the dialog for applying the change.

![The propagation dialog](/guide-assets/en/standard-propagation.webp)

* For each column, it shows the properties that change and their values.
* Only the columns you tick are changed to the new values. Columns you leave unticked keep their values and stay marked as "differs".
* Properties you edited directly on a column are skipped.
* Click **{{model.editor.domainType.propagation.skipAll}}** to change no columns at all.

Deleting a domain type leaves the values of the columns as they are. The columns only show a "Link broken" label.

### 9.7 Logical name inference

![Logical name inference](/guide-assets/en/editor-logical-names.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.logicalNames}}** finds tables and columns whose logical name is empty or the same as the physical name, and fills them in from the dictionary.

* It splits each name at `_` and looks up every part in the dictionary. The workspace dictionary takes priority over the system dictionary.
* Use **{{model.editor.logicalNames.languageLabel}}** to choose which language of the system dictionary to use.
* Choose the items to fill in and apply. Existing logical names are left untouched.
* After applying, a single undo puts everything back.

### 9.8 The system dictionary

![The system dictionary](/guide-assets/en/standard-system.webp)

The system dictionary is a set of shared words registered by administrators. It has labels in several languages and can be read from every workspace. Use the row of initial letters to find words by letter. If you register the same token in the workspace dictionary, the workspace entry takes priority and an **{{model.editor.termDictionary.overridden}}** label is shown.

## 10. SQL and databases

### 10.1 The Database tab — connections

![The Database tab](/guide-assets/en/workspace-database.webp)

The **{{workspace.detail.tabs.database}}** tab of a workspace has two parts.

**{{managed.sectionTitle}}** — If you have no database to practice or test with, Crowfoot gives you one.

* Click **{{managed.issue}}** to create a dedicated schema, which is registered as a connection automatically.
* You can choose PostgreSQL or MySQL, and each account gets up to five for free.
* Click the key icon to see the host address, user, and password. You can use them as they are in an external tool such as DBeaver.
* The trash icon revokes the database. The schema and all the data in it are deleted, and this cannot be undone.

**Connection list** — Register the connection details of your own databases.

![Adding a connection](/guide-assets/en/connection-dialog.webp)

* Click **{{connection.list.newConnection}}** and enter the name, DBMS, host, port, database, user, and password. The password is stored encrypted.
* Each row of the list has buttons to test the connection, import from the DB into a document, browse data, edit, and delete.
* When a connection test succeeds, the time it took is shown as well.
* Deleting a connection does not delete the documents created from it.

### 10.2 Generating SQL

![The SQL script](/guide-assets/en/editor-sql.webp)

Click **{{model.editor.toolbar.ddl}}** in the editor to get a script of the whole document in the syntax of the target DBMS.

* It includes tables, primary keys, unique keys, indexes, foreign keys, and comments. Logical names go out as COMMENT.
* Copy it with **{{model.editor.ddl.copy}}** or get a .sql file with **{{model.editor.ddl.download}}**.
* The script is based on the last saved content. If you have unsaved changes, a notice tells you so.
* Anything you should watch out for is listed under **{{model.editor.ddl.warningTitle}}**.

### 10.3 Deploying

![Deploying to a database](/guide-assets/en/editor-deploy.webp)

Click **{{model.editor.deploy.button}}** in the SQL script dialog to run the script directly on the database of a connection.

1. Choose the **{{model.editor.deploy.connection}}**. Only connections with the same DBMS as the document are listed.
2. Click **{{model.editor.deploy.run}}**.
3. Success or failure is shown for each statement. A statement that clashes with an existing object is recorded as failed, and the rest keep running.

This feature is for creating everything in an empty database for the first time. To change a database that already exists, use migration DDL (sections 10.4 and 14.3).

### 10.4 Sync DB

![Syncing with a database](/guide-assets/en/editor-sync.webp)

Use this when the document and the real database have drifted apart. Open it with **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.sync}}**. It is shown only for documents connected to a database.

| Button | Direction | Description |
|---|---|---|
| **{{model.editor.sync.compare}}** → **{{model.editor.sync.apply}}** | Database → document | Compares the current structure of the database with the document, shows the differences, and brings the document in line with the database |
| **{{model.editor.migration.button}}** | Document → database | Turns the differences between the document and the database into ALTER statements. You can run them right away with **{{model.editor.migration.apply}}** |

* When the document is brought in line, properties that exist only in the document, such as table colors, positions, and notes, are kept. A single undo puts everything back.
* Running migration DDL on a database cannot be undone. A warning appears if any statement drops a column or a table.

To connect a document that is not connected, use **{{model.list.menu.connect}}** in the row menu of the document list.

### 10.5 Duplicating for another DBMS

![Duplicate for another DBMS](/guide-assets/en/editor-convert.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}** creates a new document that differs only in its target DBMS. The original document is not changed.

* Before creating it, Crowfoot shows the types whose notation changes and the types that do not fit the target DBMS.
* Types that do not fit are kept in the new document with their original values. Fix them yourself afterwards.

## 11. The data browser

The data browser is a window for viewing and editing the real data of a connection. You can open it from three places.

* The browse data button on a connection row in the Database tab
* **{{model.editor.toolbar.tools}}** › **{{database.openShort}}** in the editor
* Right-click a table in the editor › **{{model.editor.contextMenu.viewTableData}}**

You need the Editor role or higher. What you can actually do depends on the permissions of the database account registered in the connection. If the account has no write permission, row edits and SQL that writes will fail.

### 11.1 The Data tab — viewing

![The Data tab](/guide-assets/en/data-tab.webp)

* Choose a table or view from the list on the left. The number next to the name is an estimated row count.
* Use **{{database.data.addFilter}}** to set a column, operator, and value, then click **{{database.data.apply}}**. You can add several conditions.
* The operators are `=`, `≠`, `<`, `≤`, `>`, `≥`, {{database.data.op.CONTAINS}}, {{database.data.op.STARTS_WITH}}, {{database.data.op.IN}}, {{database.data.op.IS_NULL}}, and {{database.data.op.IS_NOT_NULL}}.
* Click a column header to sort by that column.
* Move between pages at the bottom. Click **{{database.data.countExact}}** to count the exact total number of rows.
* **{{database.data.downloadCsv}}** downloads the result of the current conditions as a file.
* If an ERD document is connected to the connection, the column headers also show the logical names from that document.
* Long values are shortened. Click a cell to see the whole value.

### 11.2 The Data tab — editing rows

![Editing rows](/guide-assets/en/data-edit.webp)

Your edits are not applied right away. They are collected and applied together.

| What you do | How | How it is marked |
|---|---|---|
| Edit a value | Double-click the cell, type the value, and press `Enter` | The cell turns orange |
| Set to NULL | The **{{database.edit.setNull}}** button while editing | The cell turns orange |
| Add a row | **{{database.edit.addRow}}** | The row turns green |
| Delete a row | The trash icon to the left of the row | The row turns red, with the text struck through |
| Cancel | The undo icon to the left of the row, or **{{database.edit.discard}}** | The mark disappears |

The bar at the bottom shows how many rows are added, edited, and deleted. Click **{{database.edit.apply}}** to open a confirmation dialog.

![Confirming the changes](/guide-assets/en/data-apply-confirm.webp)

* The changes are applied as one batch. If any one fails, all of them are rolled back.
* A warning appears if the batch includes deletions. Changes cannot be undone once applied.
* Views and tables without a primary key cannot be edited.

### 11.3 The Structure tab

![The Structure tab](/guide-assets/en/data-structure.webp)

Shows the columns (name, type, nullability, default value, comment), indexes, and foreign keys of the selected table. The structure cannot be edited here. Edit it in the ERD and then apply it with migration DDL.

### 11.4 The SQL tab

![The SQL tab](/guide-assets/en/data-sql.webp)

* Write SQL and click **{{database.sql.run}}** or press `Ctrl/Cmd+Enter`. Only the statement under the cursor, or the selected text, is run.
* Table and column names are autocompleted.
* Query results appear in the table below. If there are many results, only the first part is shown and a notice tells you so.
* For statements that change data, the number of affected rows is shown.
* Use the history button to bring back statements you ran earlier.
* Running a statement that changes the table structure can make the database differ from the ERD document. Bring the change into the document with **{{model.editor.toolbar.sync}}**.

## 12. Validation

![Design validation](/guide-assets/en/editor-validation.webp)

Click **{{model.validation.toggle}}** on the toolbar to open the **{{model.validation.title}}** panel on the left. The document is checked again every time you edit it.

* Use the level buttons at the top to show errors, warnings, or info.
* Click an item to move the canvas to that table.
* Tables with issues are also marked on the canvas.

| Level | Rule | Meaning |
|---|---|---|
| Error | {{model.validation.rules.DUPLICATE_TABLE_NAME}} | Two or more tables have the same physical name |
| Error | {{model.validation.rules.DUPLICATE_COLUMN_NAME}} | Two or more columns in one table have the same name |
| Error | {{model.validation.rules.DUPLICATE_KEY_NAME}} | Unique keys or indexes share a name |
| Error | {{model.validation.rules.COMPOSITE_KEY_DUPLICATE_COLUMN}} | The same column appears twice in one key |
| Error | {{model.validation.rules.FK_TYPE_MISMATCH}} | The foreign key column and the parent column have different types |
| Error | {{model.validation.rules.FK_TARGET_NOT_KEY}} | The column the foreign key points to is not a primary key or unique key |
| Error | {{model.validation.rules.FK_NULLABILITY_MISMATCH}} | The multiplicity of the relationship and the nullability of the foreign key do not agree |
| Error | {{model.validation.rules.ONE_TO_ONE_MISSING_UK}} | A 1:1 relationship has no unique key on its foreign key |
| Warning | {{model.validation.rules.MISSING_PK}} | A table has no primary key |
| Warning | {{model.validation.rules.EMPTY_TABLE}} | A table has no columns |
| Warning | {{model.validation.rules.FK_MAPPING_EMPTY}} | A relationship has no linked columns |
| Warning | {{model.validation.rules.ORPHAN_TABLE}} | A table has no relationship with any other table |
| Warning | {{model.validation.rules.CIRCULAR_REFERENCE}} | Foreign keys form a loop that leads back to the same table |
| Warning | {{model.validation.rules.NAMING_CONVENTION}} | A physical name does not follow the naming rules |
| Warning | {{model.validation.rules.MISSING_LOGICAL_NAME}} | A logical name is empty |
| Info | {{model.validation.rules.FK_WITHOUT_INDEX}} | No index starts with the foreign key column |
| Info | {{model.validation.rules.WIDE_TABLE}} | A table has more than 30 columns |

## 13. Sharing and comments

### 13.1 Share links

![Sharing a document](/guide-assets/en/editor-share.webp)

Click **{{model.editor.toolbar.share}}** and then **{{model.share.issue}}** to create a link. Anyone who knows the link can read the document without signing in. They cannot edit it.

* Choose **{{model.share.period.unlimited}}** or **{{model.share.period.custom}}**. If you set a period, the link does not open outside the start and end date and time.
* Each link shows its number of views, likes, and comments.
* Use the copy icon to copy the address and the trash icon to revoke the link. A revoked link stops opening right away.
* Shared documents also appear in the share gallery on the start page.

On the shared page, people can view the ERD, download the SQL script, and leave likes and comments. Only signed-in people can leave a like. People who are not signed in enter a nickname and a password to leave a comment.

### 13.2 The Comments tab

The **{{shareViewer.tab.comments}}** tab at the bottom of the editor collects the likes and comments that came in through share links. With the Commenter role or higher, you can reply here. When a comment is posted, a notification appears on the bell icon.

## 14. Version history

### 14.1 Viewing saved versions

![Version history](/guide-assets/en/editor-history.webp)

Every time a document is saved, one version is kept. Open the list with **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.history}}**.

* Each version shows who saved it, when, and a summary of what changed (added, changed, deleted, moved).
* Use **{{model.editor.history.editMemo}}** to leave a note on a version. The search box searches these notes.
* **{{model.editor.history.view}}** opens the document of that version as read-only.
* **{{model.editor.history.restore}}** saves the content of that version as a new version. The current document also stays in the history.

### 14.2 Comparing versions

Click **{{model.editor.history.compare}}** to see the differences between two versions.

* The canvas is drawn from the compared version, and changed tables are marked with `+` (added) and `~` (changed).
* Tables that were removed are listed separately.
* Return to the document with **{{model.editor.compare.exit}}**.

### 14.3 Migration DDL

**{{model.editor.compare.migrationDdl}}** on the version comparison screen turns the differences between two versions into ALTER statements. Use it to apply only what has changed since the last deployment to the database. Copy the script and run it on the database. Statements that may delete data carry a warning. To run it on the database directly, use the migration DDL of Sync DB (section 10.4).

## 15. Editing together

Several people can open and edit the same document at the same time.

* The toolbar shows who is viewing the document with you, and other people's cursors move on the canvas.
* What other people edit shows up on your screen right away.
* An item that someone else is editing is locked. The name of the person editing it is shown.
* If two people edit the same property, the later value stays. When your value is replaced, a notice appears and you can bring yours back with **{{model.editor.collab.lwwRestore}}**.
* The speech bubble button at the bottom right is **{{model.editor.chat.label}}**. Use it to talk with the people viewing the document with you.

If someone else saved before you, the **{{model.editor.conflict.title}}** dialog appears when you save.

* Changes that do not overlap are merged automatically.
* For each overlapping item, choose **{{model.editor.conflict.keepMine}}** or **{{model.editor.conflict.useServer}}**.
* Click **{{model.editor.conflict.resolve}}** to merge as you chose and save.

Even if the window closes before you can save, your edits stay in the browser. They are recovered when you open the document again.

## 16. Teams

![The team screen](/guide-assets/en/team-detail.webp)

A team is a way to keep people together. When you add a team as a member of a workspace, everyone on the team gets access at once.

* Go to **{{shell.nav.teams}}** in the top menu. Create a team with **{{shell.sidebar.newTeam}}** in the sidebar. Creating a team does not create a workspace along with it.
* Find and add people with **{{team.members.addButton}}**, and take them out with **{{team.members.remove}}**.
* The team owner can edit the name and description and use **{{team.detail.settings.dissolveButton}}**. Dissolving a team also takes away the workspace access given to that team.

## 17. Community and notifications

### 17.1 Release notes

![Release notes](/guide-assets/en/community-release-notes.webp)

These posts announce what has changed in each new version. Click a post to open it, and choose the language to read it in.

### 17.2 Feedback

![Feedback](/guide-assets/en/community-feedback.webp)

This board is for things you would like improved and bugs you have found. Write a post with **{{community.board.newPost}}**; you can attach images. Each post has its own comments.

### 17.3 My comments and liked documents

![My comments](/guide-assets/en/community-my-comments.webp)

**{{shell.sidebar.communityMyComments}}** collects the comments you have left on shared documents. **{{shell.sidebar.communityMyLikes}}** lists the shared documents you have liked. Click a row to go to that document.

### 17.4 Notifications

![Notifications](/guide-assets/en/shell-notifications.webp)

Click the bell icon to see your recent notifications. There are three kinds.

* Someone commented on your document
* Someone liked your document
* The document owner replied to your comment

Use **{{shell.notifications.markAll}}** to mark them all as read, and **{{shell.notifications.viewAll}}** to go to the full list.

![The notification list](/guide-assets/en/community-notifications.webp)

## 18. Administrators

![The admin screen](/guide-assets/en/admin-users.webp)

Administrator accounts see **{{shell.nav.admin}}** in the top menu.

| Menu | Contents |
|---|---|
| **{{shell.sidebar.adminUsers}}** | The list of users, administrator rights, account status |
| **{{shell.sidebar.adminCodes}}** | Code values such as database types |
| **{{shell.sidebar.adminManaged}}** | Instances of the service-provided databases and what has been issued |
| **{{shell.sidebar.adminSystemTerms}}** | Add and delete words in the system dictionary |
| **{{shell.sidebar.adminAuditLogs}}** | A record of important actions |
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
| `Ctrl/Cmd+Enter` | Run in the SQL tab of the data browser |

While the cursor is in a text field, no shortcut works except the one for help. Without edit permission, the shortcuts for editing, moving, and deleting do not work.

## 20. Frequently asked questions

**Can I change the database type of a document?**
No. Create a new document of another type with **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}**.

**When is my work saved?**
It is saved automatically a moment after you edit. You can also save right away with the **{{model.editor.toolbar.save}}** button or `Ctrl/Cmd+S`. A version is kept every time the document is saved.

**How do I undo a mistake?**
Undo an edit you have just made with `Ctrl/Cmd+Z`. For content that is already saved, restore an earlier version from the version history.

**How do words and terms differ?**
A word is one part of a name, and a term is a whole column name. A term can point to a domain type, so using a term on a column sets its type as well.

**Do columns change as soon as I edit a domain type?**
No. When you open a document, Crowfoot tells you about the change and lets you choose which columns to apply it to.

**Can I use Crowfoot without a database?**
Yes. You can just draw an ERD and take the SQL script with you. If you want to try running it, get a service-provided database in the Database tab.

**Can I change the structure in the data browser?**
Not in the Data tab or the Structure tab. Edit it in the ERD and then apply it with migration DDL.

**Can someone with a share link edit the document?**
No. To edit together, add them as a workspace member and give them the Editor role.

**Where do I write what I would like improved?**
Please write it in **{{shell.nav.community}}** › **{{shell.sidebar.communityFeedback}}**.
