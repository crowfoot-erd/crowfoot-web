Crowfoot is a web tool for drawing ERDs, exchanging them with databases, and working on them as a team. This guide follows the order of real work: creating your first document, setting standards, and applying the design to a database.

![The ERD editor](/landing/editor-en-light.webp)

Screenshots below show the Korean interface. Menu names in the text are the English ones.

## 1. Getting started

1. Sign in with a GitHub or Google account.
2. Create a **workspace**. A workspace holds documents, database connections, the term dictionary and domain types together. One per team or project works well.
3. Create a document in the workspace's **ERD** tab. There are four ways.

| Way | When to use it |
| --- | --- |
| New ERD document | Drawing from a blank canvas |
| Import SQL | You already have `CREATE TABLE` statements |
| Import from DB | Reading the structure of an existing database |
| Start from a template | Starting from an example on a similar topic |

You choose the **target DBMS** (MySQL, PostgreSQL and so on) when creating a document. It cannot be changed afterwards. If you need another DBMS, use **Tools › Duplicate for another DBMS** to make a new document.

## 2. Drawing an ERD

### Tables and columns

- **Right-click** an empty spot **› New entity** to create a table.
- Use **Add column** at the bottom of a table. Name, type, length and NN (NOT NULL) are edited right on the table.
- Click the key icon to make a column the primary key.
- **Double-click** a column name to open **Column Info**. Logical name, default, domain type and description are set there.
- A column has a **physical name** (the name created in the database) and a **logical name** (the name people read). Choose which to show in the **View** menu.

### Relationships

- Click a dot on the edge of a table, choose the type (1:N, 1:1) and kind (identifying, non-identifying), then click the other table. The foreign key column is created for you.
- **Right-click** a relationship line **› Edit relationship** to change cardinality and the delete or update action.
- In the same dialog, **column mapping** lets you change which child column is the foreign key. When you want an existing column to be the foreign key, you do not have to delete and recreate the relationship.

![Column mapping in the relationship dialog](/guide-assets/relationship-mapping.webp)

### Tidying up

- **Auto layout** arranges tables by their relationships. The arrow next to it offers the mode (layered, hub-centered, hybrid) and the direction (top to bottom, left to right).
- Select several tables and **right-click › New group** to group them. Groups are color-coded, and you can view one group on its own.
- Create a **note** by right-clicking an empty spot. Drop it on a table to attach it.

![Choosing the layout direction](/guide-assets/layout-direction.webp)

### Copy and paste

- **Right-click** a table or note **› Copy / Duplicate**. The shortcuts are `Ctrl/Cmd+C`, `V` and `D`.
- What you copy can be pasted into **another document opened in another tab** of the same browser. Relationships between the tables you selected come along.
- Undo mistakes with `Ctrl/Cmd+Z`. Large operations such as auto layout or paste are undone in one step.
- Press `Ctrl/Cmd+/` for the full list of shortcuts.

## 3. Setting standards — words, terms and domain types

When several people draw several documents, the same thing ends up named and stored differently. `email` becomes `VARCHAR(100)` in one place and `VARCHAR(255)` in another. To prevent this, each workspace keeps three kinds of standards.

| Standard | Question it answers | Example |
| --- | --- | --- |
| **Word** | What does this part of a name mean? | `user` → member |
| **Term** | What is this column, and what type is it? | `user_email` → member email, domain type "Email" |
| **Domain type** | How is this kind of value stored? | Email = `VARCHAR(191)`, NOT NULL |

All three are managed in the **Term dictionary** panel on the toolbar. Words and terms are in the **Workspace** tab, domain types in the **Domain types** tab. Every document in the workspace shares the same standards.

![The Domain types tab of the dictionary panel](/guide-assets/standard-panel.webp)

### Recommended order

1. **Start with domain types.** Define the kinds of values that repeat across tables, such as email, amount and created-at.
2. **Register words.** These are the parts used in names and their meaning, such as `user` → member and `order` → order. Do not give them a type.
3. **Register terms.** Enter a whole column name such as `user_email` and choose its domain type. An entry with a domain type is a term.

If you already have dictionary entries with a type written in, **Make a domain type** in the edit dialog turns that type into a domain type.

### When creating a column

As you start typing a column name, the dictionary offers suggestions.

![Column name suggestions](/guide-assets/term-suggest.webp)

- Choosing a **term** fills in the whole name and the logical name, and applies the type, length, nullability and default with the domain type linked.
- Choosing a **word** completes only the part you are typing. With `user_em`, choosing `email` gives `user_email`. You can keep typing.
- The **logical name** at the top of the list previews what the name you typed will become.

A column that uses a domain type shows a `D` badge next to its name.

### When you need to differ from the standard

A column can keep its domain type and still hold different values. If you change the length in Column Info, the dialog says what differs and the badge becomes `D*`. **Revert to the domain type's values** brings it back in one click.

If a column's name matches a term in the dictionary but its domain type differs, Column Info shows the **dictionary standard** and offers **Apply**.

![Domain type in the Column Info dialog](/guide-assets/domain-column.webp)

### When the standard changes

When you edit a domain type, the editor asks whether to apply the change to the columns that use it. You preview the new values per column and choose which columns to update. Properties you chose to keep different are skipped.

![Preview for applying a domain type change](/guide-assets/domain-propagation.webp)

- Documents that are not open do not change right away. The next editor to open such a document sees a notice that domain types have changed.
- Applying the change can be undone in one step.

### Filling in logical names in an existing document

Documents imported from a database often have no logical names. **Tools › Logical names** fills them in from the words and terms in the dictionary, turning `user_id` into "member ID". You preview the result and choose before applying.

## 4. Working with databases

Register connections in the workspace's **Database** tab. If you do not have a development database, you can get a free one there.

| What you want | How |
| --- | --- |
| Database structure into a document | **Import from DB** in the Database tab |
| Document into SQL | **Generate SQL** in the editor |
| Create the document in a database | **Deploy** in the Generate SQL dialog |
| Bring the database in line after editing the document | **Migration DDL** — SQL for only what changed |
| Bring database changes into the document | **Tools › Sync DB** |
| Link a hand-made document to a database | **Tools › Connect database** |

Changes applied to a database cannot be undone. Always check the SQL shown before running it.

## 5. Browsing data

You can view and edit the data of a connected database directly. Open it with **Browse data** in the Database tab, **Tools › Browse data** in the editor, or **right-click a table › View this table's data**.

![The data browser](/guide-assets/data-tab.webp)

- **Data** tab: sort by clicking a header, filter with conditions, and download as CSV.
- **Editing rows**: double-click a cell to edit. Edits collect at the bottom and are applied together when you click **Apply**. If any change fails, all are rolled back.
- **SQL** tab: run statements yourself. `Ctrl/Cmd+Enter` runs only the statement under the cursor. Statements that change data ask for confirmation.

![Editing rows](/guide-assets/row-edit.webp)

Browsing data is available to Editors and above.

## 6. Working together

### Members and roles

Invite people or teams in the workspace's **Members** tab.

| Role | Can do |
| --- | --- |
| Viewer | View |
| Commenter | View and comment |
| Editor | Edit documents, connect databases, manage the dictionary and domain types, browse data |
| Owner | All of the above, manage members, delete documents and the workspace |

### Editing at the same time

When several people open the same document, they see each other's cursors and changes live. A table that someone has open for editing is shown as locked to others.

### Showing it to others

- **Share** creates a read-only link that needs no sign-in. You can set a period and revoke it at any time.
- **Export** produces an image or a document file (`.crown`).

### Version history

Every save leaves a version. In **Tools › Version history** you can view earlier versions, compare two versions, and restore one.

## 7. Checking your work

**Validation** on the toolbar inspects the document. It finds tables without a primary key, foreign keys whose types do not match, names that break naming rules, columns without a logical name, and more. Click an item to jump to the table.

## 8. Frequently asked

**How do the term dictionary and domain types differ?**
The dictionary is the standard for names, and domain types are the standard for types. `user_email`, `backup_email` and `contact_mail` are different names with different dictionary entries, but all three use the single domain type "Email".

**Are words and terms registered separately?**
They are registered in the same list. An entry with a domain type (or with a type written in) is a term; the rest are words.

**What happens to columns when a domain type is deleted?**
The columns keep their values. Only the link is shown as broken.

**What about domain types when pasting into another workspace?**
Domain types belong to a workspace. In a document of another workspace the link is shown as broken and the values stay.

**When is my work saved?**
It is saved automatically when you stop editing. You can also save right away with `Ctrl/Cmd+S` or the **Save** button.
