Crowfoot는 브라우저에서 ERD를 그리고, 팀과 함께 고치고, 데이터베이스에 반영하는 도구입니다. 이 가이드는 화면 어디에 무엇이 있는지부터 시작해 모든 기능을 차례로 설명합니다. 화면 그림의 데이터는 설명을 위해 만든 예시입니다.

## 1. 화면 구성 한눈에 보기

Crowfoot의 화면은 크게 세 종류입니다.

| 화면 | 여는 방법 | 하는 일 |
|---|---|---|
| 앱 화면 | 로그인하면 열립니다 | 워크스페이스, 문서 목록, 멤버, 데이터베이스, 팀, 커뮤니티 |
| 에디터 | 문서 목록에서 문서를 누르면 새 창으로 열립니다 | ERD 그리기, 표준 관리, SQL 생성, 공유, 버전 기록 |
| 데이터 브라우저 | 커넥션의 데이터 보기 버튼을 누르면 새 창으로 열립니다 | 실제 데이터 조회, 행 편집, SQL 실행 |

### 1.1 앱 화면의 위쪽 메뉴

![앱 화면 위쪽 메뉴](/guide-assets/ko/shell-header.webp)

왼쪽부터 차례로 이렇게 놓여 있습니다.

| 위치 | 이름 | 설명 |
|---|---|---|
| 왼쪽 | 로고 | 대시보드로 갑니다 |
| 왼쪽 | **{{shell.nav.workspaces}}** | 워크스페이스와 그 안의 ERD 문서 |
| 왼쪽 | **{{shell.nav.teams}}** | 팀을 만들고 멤버를 관리합니다 |
| 왼쪽 | **{{shell.nav.community}}** | 릴리스 노트, 제안 및 신고, 내 댓글, 좋아요 문서, 알림 |
| 왼쪽 | **{{shell.nav.admin}}** | 관리자 계정에만 보입니다 |
| 왼쪽 | **{{guide.title}}** | 이 문서를 새 창으로 엽니다 |
| 오른쪽 | **{{shell.nav.home}}** | 시작 페이지(소개 화면)로 갑니다 |
| 오른쪽 | 해 모양 아이콘 | 밝은 화면과 어두운 화면을 바꿉니다 |
| 오른쪽 | 지구 모양 아이콘 | 언어를 바꿉니다({{common.language.ko}}, {{common.language.en}}, {{common.language.ja}}, {{common.language.zh}}) |
| 오른쪽 | 종 모양 아이콘 | 알림. 읽지 않은 알림 수가 빨간 숫자로 붙습니다 |
| 오른쪽 | 내 이름 | 내 정보, 언어, 로그아웃 |

### 1.2 왼쪽 사이드바

위쪽 메뉴에서 고른 항목에 따라 왼쪽 사이드바의 내용이 바뀝니다.

| 위쪽 메뉴 | 사이드바에 나오는 것 |
|---|---|
| **{{shell.nav.workspaces}}** | **{{shell.sidebar.newWorkspace}}** 버튼, **{{shell.sidebar.mine}}**, **{{shell.sidebar.shared}}** |
| **{{shell.nav.teams}}** | **{{shell.sidebar.newTeam}}** 버튼, **{{shell.sidebar.ownedTeams}}**, **{{shell.sidebar.joinedTeams}}** |
| **{{shell.nav.community}}** | **{{shell.sidebar.communityReleaseNotes}}**, **{{shell.sidebar.communityFeedback}}**, **{{shell.sidebar.communityMyComments}}**, **{{shell.sidebar.communityMyLikes}}**, **{{shell.sidebar.communityNotifications}}** |
| **{{shell.nav.admin}}** | **{{shell.sidebar.adminUsers}}**, **{{shell.sidebar.adminCodes}}**, **{{shell.sidebar.adminManaged}}**, **{{shell.sidebar.adminSystemTerms}}**, **{{shell.sidebar.adminAuditLogs}}**, **{{shell.sidebar.adminTraffic}}** |

### 1.3 에디터 창

![에디터 전체 화면](/guide-assets/ko/editor-overview.webp)

| 위치 | 내용 |
|---|---|
| 맨 위 | 문서 이름, 대상 DBMS, 버전 번호, 마지막으로 저장한 사람과 시각, **{{model.viewer.close}}** |
| 도구 모음 | 탐색기, 용어 사전, 검증, 되돌리기, 저장, 자동 배치, SQL 생성, 공유, 내보내기, 도구, 보기, 확대와 축소 |
| 가운데 | 캔버스. 테이블, 관계선, 메모, 그룹이 놓입니다 |
| 오른쪽 아래 | 미니맵과 문서 채팅 버튼 |
| 맨 아래 | **ERD** 탭, **{{shareViewer.tab.requirements}}** 탭, **{{shareViewer.tab.comments}}** 탭 |

도구 모음의 버튼은 5절에서 하나씩 설명합니다.

### 1.4 데이터 브라우저 창

![데이터 브라우저](/guide-assets/ko/data-tab.webp)

| 위치 | 내용 |
|---|---|
| 맨 위 | 커넥션 이름, DBMS, 접속 주소, 테마와 언어, **{{database.close}}** |
| 왼쪽 | 테이블과 뷰 목록, 검색 칸, 새로 고침 |
| 오른쪽 위 | 고른 테이블 이름과 **{{database.tabs.data}}**, **{{database.tabs.structure}}**, **{{database.tabs.sql}}** 탭 |
| 오른쪽 | 탭의 내용 |

## 2. 시작하기

### 2.1 로그인

![로그인 화면](/guide-assets/ko/login.webp)

1. 시작 페이지에서 로그인 버튼을 누릅니다.
2. 이용약관을 읽고 동의 칸에 표시합니다. 표시해야 로그인 버튼이 켜집니다.
3. GitHub 또는 Google 계정으로 계속합니다. 따로 가입하는 절차는 없습니다.

오래 쓰지 않으면 **{{auth.sessionExpired.title}}** 창이 뜹니다. **{{auth.sessionExpired.loginAgain}}**을 누르면 됩니다.

### 2.2 대시보드

![대시보드](/guide-assets/ko/dashboard.webp)

로그인하면 대시보드가 열립니다.

* 위쪽 숫자 카드는 내 워크스페이스 수, 내 팀 수, 멤버로 참여한 워크스페이스 수입니다.
* **{{dashboard.shortcuts}}**의 카드를 누르면 그 워크스페이스로 갑니다.
* **{{dashboard.myTeams}}**의 카드를 누르면 그 팀으로 갑니다.
* **{{community.recent.title}}**에는 릴리스 노트와 제안 글이 최근 순으로 나옵니다.
* 오른쪽 위 **{{dashboard.newWorkspace}}** 버튼으로 워크스페이스를 만듭니다.

### 2.3 내 정보, 언어, 테마

![사용자 메뉴](/guide-assets/ko/shell-user-menu.webp)

오른쪽 위 내 이름을 누르면 이름, 이메일, 연결된 계정, 가입일이 나옵니다. 같은 메뉴에서 언어를 바꾸고 로그아웃합니다. 언어는 지구 모양 아이콘으로도 바꿀 수 있습니다. 고른 언어는 다음에 들어와도 그대로입니다.

## 3. 워크스페이스

워크스페이스는 ERD 문서, 데이터베이스 커넥션, 용어 사전, 도메인 타입을 담는 공간입니다. 멤버와 권한도 워크스페이스 단위로 정합니다.

### 3.1 만들기

![새 워크스페이스](/guide-assets/ko/workspace-create.webp)

사이드바의 **{{shell.sidebar.newWorkspace}}**를 누르고 이름을 적습니다. 만든 사람이 소유자가 됩니다.

### 3.2 워크스페이스의 탭

워크스페이스를 열면 이름 아래에 탭이 여섯 개 있습니다.

| 탭 | 내용 |
|---|---|
| **{{workspace.detail.tabs.erd}}** | ERD 문서 목록. 문서를 만들고, 열고, 지웁니다 |
| **{{workspace.detail.tabs.database}}** | 서비스 제공 DB와 데이터베이스 커넥션 |
| **{{workspace.detail.tabs.overview}}** | 이름, 설명, 생성자, 멤버 수, 생성일 |
| **{{workspace.detail.tabs.members}}** | 멤버와 역할 |
| **{{workspace.detail.tabs.mcp}}** | Claude 같은 MCP 클라이언트를 연결하는 토큰을 발급하고 폐기합니다(20절) |
| **{{workspace.detail.tabs.settings}}** | 이름과 설명 수정, 워크스페이스 삭제. 소유자에게만 보입니다 |

### 3.3 ERD 탭 — 문서 목록

![문서 목록](/guide-assets/ko/workspace-erd.webp)

* 검색 칸에 문서 이름이나 설명을 적어 찾습니다.
* 문서 이름을 누르면 에디터가 새 창으로 열립니다.
* 목록의 열은 문서 이름, DB 종류, 버전, 생성자, 최근 수정입니다.
* 위쪽 버튼 다섯 개로 문서를 만듭니다. 4절에서 설명합니다.

![문서 행 메뉴](/guide-assets/ko/document-row-menu.webp)

행 오른쪽 끝의 점 세 개 버튼을 누르면 **{{model.list.menu.edit}}**과 **{{model.list.menu.delete}}**가 나옵니다. 데이터베이스에 연결하지 않은 문서에는 **{{model.list.menu.connect}}**도 나옵니다. 삭제한 문서는 되돌릴 수 없습니다.

### 3.4 멤버 탭 — 멤버와 역할

![멤버 탭](/guide-assets/ko/workspace-members.webp)

역할은 네 가지입니다.

| 역할 | 할 수 있는 일 |
|---|---|
| {{common.role.OWNER}} (OWNER) | 모든 일. 멤버 관리, 워크스페이스 설정과 삭제 |
| {{common.role.EDITOR}} (EDITOR) | 문서 만들기와 고치기, 사전과 도메인 타입 고치기 |
| {{common.role.COMMENTER}} (COMMENTER) | 문서 읽기와 댓글 달기 |
| {{common.role.VIEWER}} (VIEWER) | 문서 읽기 |

![멤버 추가](/guide-assets/ko/member-add.webp)

**{{workspace.members.addButton}}**를 누르면 사람 한 명 또는 팀을 고를 수 있습니다.

* **{{workspace.members.addDialog.targetUser}}**: 이름이나 이메일을 두 글자 이상 적어 찾습니다.
* **{{workspace.members.addDialog.targetTeam}}**: 팀에 역할을 주면 그 팀의 모든 멤버가 같은 역할을 받습니다.
* 소유자 역할은 줄 수 없습니다.
* 목록에서 역할을 바꾸거나 **{{workspace.members.revoke}}**로 권한을 거둡니다.

### 3.5 개요 탭과 설정 탭

![개요 탭](/guide-assets/ko/workspace-overview.webp)

개요 탭은 워크스페이스의 기본 정보를 보여 줍니다.

![설정 탭](/guide-assets/ko/workspace-settings.webp)

설정 탭에서 이름과 설명을 고칩니다. **{{workspace.detail.settings.dangerZone}}**의 **{{workspace.detail.settings.deleteButton}}**는 워크스페이스와 그 안의 문서를 모두 지웁니다. 되돌릴 수 없습니다.

## 4. ERD 문서 만들기

문서를 만드는 방법은 다섯 가지입니다. 모두 ERD 탭 위쪽의 버튼입니다.

| 버튼 | 언제 쓰나 |
|---|---|
| **{{model.list.newDocument}}** | 빈 문서에서 직접 그릴 때 |
| **{{model.templates.openButton}}** | 예시 문서를 복사해서 시작할 때 |
| **{{sqlImport.openButton}}** | CREATE TABLE 스크립트가 있을 때 |
| **{{reverse.openButton}}** | 이미 있는 데이터베이스의 구조를 읽어 올 때 |
| **{{model.import.button}}** | 내보낸 문서 파일(.crown)을 다시 넣을 때 |

### 4.1 새 ERD 문서

![새 ERD 문서](/guide-assets/ko/document-create.webp)

이름과 데이터베이스 종류를 고릅니다. 데이터베이스 종류는 문서를 만들 때 정해지고 나중에 바꿀 수 없습니다. 다른 종류로 옮기려면 에디터의 **{{model.editor.toolbar.dbmsConvert}}**를 씁니다(10.5절).

### 4.2 템플릿으로 시작

![템플릿으로 시작](/guide-assets/ko/document-template.webp)

준비된 예시 문서 가운데 하나를 골라 내 워크스페이스로 복사합니다. **{{model.templates.preview}}**로 먼저 열어 볼 수 있습니다.

### 4.3 SQL 가져오기

![SQL 가져오기](/guide-assets/ko/document-sql-import.webp)

1. 데이터베이스 종류와 문서 이름을 적습니다.
2. CREATE TABLE 스크립트를 붙여 넣거나 **{{sqlImport.readFile}}**로 파일을 읽습니다. 파일은 1MB까지입니다.
3. **{{sqlImport.preview}}**를 누르면 읽은 테이블 수와 관계 수, 읽지 못한 문장이 나옵니다.
4. **{{sqlImport.submit}}**를 누릅니다.

데이터베이스에 접속하지 않고 스크립트만으로 문서를 만드는 방법입니다.

### 4.4 DB에서 가져오기

![DB에서 가져오기](/guide-assets/ko/document-reverse.webp)

등록한 커넥션을 고르면 그 데이터베이스의 테이블, 컬럼, 키, 관계, 코멘트를 읽어 문서를 만듭니다. 컬럼 코멘트는 논리명으로 들어옵니다. 이렇게 만든 문서는 그 커넥션에 연결되어 **{{model.editor.toolbar.sync}}**를 쓸 수 있습니다. 커넥션은 먼저 데이터베이스 탭에서 등록합니다(10.1절).

### 4.5 문서 파일(.crown) 가져오기

에디터의 **{{model.editor.toolbar.export}}** › **{{model.editor.toolbar.crown}}**로 내려받은 파일을 다시 문서로 만듭니다. 다른 워크스페이스로 문서를 옮기거나 백업을 되살릴 때 씁니다.

## 5. 에디터 화면과 도구 모음

![에디터 도구 모음](/guide-assets/ko/editor-toolbar.webp)

### 5.1 도구 모음의 버튼

왼쪽부터 차례입니다.

| 버튼 | 설명 |
|---|---|
| **{{model.editor.explorer.toggle}}** | 왼쪽에 모델 익스플로러를 열고 닫습니다(5.2절) |
| **{{model.editor.termDictionary.toggle}}** | 용어 사전과 도메인 타입 패널을 열고 닫습니다(9절) |
| **{{model.validation.toggle}}** | 설계 검증 패널을 열고 닫습니다. 문제 수가 숫자로 붙습니다(12절) |
| {{model.editor.toolbar.undo}}, {{model.editor.toolbar.redo}} | 편집을 한 단계씩 되돌리고 다시 실행합니다 |
| **{{model.editor.toolbar.save}}** | 지금 저장합니다. 편집하면 잠시 뒤 자동으로도 저장됩니다 |
| **{{model.editor.toolbar.autoLayoutLayered}}** | 테이블을 자동으로 다시 놓습니다. 옆의 화살표로 방식과 방향을 고릅니다(5.3절) |
| **{{model.editor.toolbar.ddl}}** | 문서를 SQL 스크립트로 만듭니다(10.2절) |
| **{{model.editor.toolbar.share}}** | 읽기 전용 공유 링크를 만듭니다(13절) |
| **{{model.editor.toolbar.export}}** | 이미지와 문서 파일로 내려받습니다(5.4절) |
| **{{model.editor.toolbar.tools}}** | 논리명 추론, DB 동기화, 데이터 보기, 다른 DBMS로 복제, 도메인 타입, 버전 기록(5.5절) |
| DBMS 배지 | 문서의 대상 DBMS. 누르면 **{{model.editor.toolbar.dbmsConvert}}** 창이 열립니다 |
| **{{model.editor.toolbar.view}}** | 컬럼 이름 표시, 컬럼 표시, 그룹 보기를 고릅니다(5.6절) |
| − 숫자 + | 축소, 지금 배율, 확대 |
| 네 모서리 아이콘 | **{{model.editor.toolbar.fit}}**. 문서 전체가 화면에 들어오게 맞춥니다 |
| 키보드 아이콘 | **{{model.editor.shortcuts.open}}** (19절) |
| 물음표 아이콘 | 이 사용 가이드를 새 창으로 엽니다 |
| 해 모양 아이콘 | 밝은 화면과 어두운 화면을 바꿉니다 |

읽기 전용 역할로 열면 편집 버튼이 꺼지고 **{{model.editor.toolbar.readOnly}}** 표시가 붙습니다.

### 5.2 탐색기(모델 익스플로러)

![탐색기](/guide-assets/ko/editor-explorer.webp)

* 문서의 테이블, 관계, 메모를 나무 모양 목록으로 보여 줍니다. 테이블은 그룹별로 묶입니다.
* 검색 칸에 적으면 테이블, 컬럼, 관계, 메모에서 찾습니다. `Ctrl/Cmd+F` 로 바로 검색 칸에 갑니다.
* 항목을 누르면 캔버스가 그 객체로 옮겨 가고 객체가 선택됩니다.
* 그룹 행의 눈 아이콘은 그 그룹만 보기, 연필 아이콘은 그룹 편집, 휴지통 아이콘은 그룹 삭제입니다.

### 5.3 자동 배치

![자동 배치 메뉴](/guide-assets/ko/editor-menu-layout.webp)

버튼을 누르면 고른 방식으로 테이블을 다시 놓습니다. 화살표를 누르면 방식과 방향을 고릅니다. 고르는 즉시 실행됩니다.

| 항목 | 설명 |
|---|---|
| **{{model.editor.toolbar.autoLayoutLayered}}** | 부모에서 자식으로 층을 나눠 놓습니다. 대부분의 문서에 맞습니다 |
| **{{model.editor.toolbar.autoLayoutHub}}** | 관계가 많은 테이블을 가운데에 두고 둘레에 놓습니다 |
| **{{model.editor.toolbar.autoLayoutHybrid}}** | 두 방식을 섞습니다 |
| **{{model.editor.toolbar.autoLayoutDown}}** | 부모가 위, 자식이 아래 |
| **{{model.editor.toolbar.autoLayoutRight}}** | 부모가 왼쪽, 자식이 오른쪽 |

* 큰 문서는 계산에 몇 초가 걸립니다. 계산하는 동안에도 화면은 멈추지 않고, **{{model.editor.toolbar.autoLayoutCancel}}**로 그만둘 수 있습니다.
* 결과가 마음에 들지 않으면 되돌리기 한 번으로 원래 자리로 돌아갑니다.
* 메모는 연관 테이블 가까이에 놓입니다.

### 5.4 내보내기 메뉴

![내보내기 메뉴](/guide-assets/ko/editor-menu-export.webp)

| 항목 | 설명 |
|---|---|
| **{{model.editor.image.viewport}}** | 지금 화면에 보이는 부분을 PNG 이미지로 내려받습니다 |
| **{{model.editor.image.document}}** | 문서 전체를 PNG 이미지 한 장으로 내려받습니다 |
| **{{model.editor.toolbar.crown}}** | 문서를 .crown 파일로 내려받습니다. **{{model.import.button}}**로 다시 넣을 수 있습니다 |

### 5.5 도구 메뉴

![도구 메뉴](/guide-assets/ko/editor-menu-tools.webp)

| 항목 | 설명 | 자세한 곳 |
|---|---|---|
| **{{model.editor.toolbar.logicalNames}}** | 비어 있는 논리명을 사전으로 채웁니다 | 9.7절 |
| **{{model.editor.toolbar.sync}}** | 연결된 데이터베이스와 문서를 비교하고 맞춥니다. 연결된 문서에만 보입니다 | 10.4절 |
| **{{database.openShort}}** | 연결된 데이터베이스의 데이터 브라우저를 새 창으로 엽니다 | 11절 |
| **{{model.editor.toolbar.dbmsConvert}}** | 대상 DBMS만 다른 새 문서를 만듭니다 | 10.5절 |
| **{{model.editor.domainType.menu}}** | 도메인 타입 목록을 엽니다 | 9.3절 |
| **{{model.editor.toolbar.history}}** | 저장 기록을 보고 비교하고 되돌립니다 | 14절 |

### 5.6 보기 메뉴

![보기 메뉴](/guide-assets/ko/editor-menu-view.webp)

| 묶음 | 항목 | 설명 |
|---|---|---|
| **{{model.editor.toolbar.nameMode.label}}** | {{model.editor.toolbar.nameMode.physical}}, {{model.editor.toolbar.nameMode.logical}}, {{model.editor.toolbar.nameMode.both}} | 컬럼 이름을 어떤 이름으로 보일지 고릅니다 |
| **{{model.editor.toolbar.columnMode.label}}** | {{model.editor.toolbar.columnMode.all}}, {{model.editor.toolbar.columnMode.keys}} | 키만 고르면 PK와 FK 컬럼만 보여 큰 문서를 한눈에 봅니다 |
| **{{model.editor.toolbar.areaFilter.label}}** | {{model.editor.toolbar.areaFilter.all}}, 그룹 이름 | 고른 그룹의 테이블만 보입니다 |

보기 설정은 화면 표시만 바꿉니다. 문서는 바뀌지 않습니다.

### 5.7 캔버스 움직이기

* 빈 곳을 끌거나 `Space` 를 누른 채 끌면 화면이 움직입니다.
* 마우스 휠 또는 도구 모음의 − + 로 확대하고 축소합니다.
* 오른쪽 아래 미니맵을 누르면 그 자리로 갑니다.
* `Shift` 를 누른 채 객체를 누르면 여러 객체를 함께 고릅니다. `Ctrl/Cmd+A` 는 전체 선택입니다.

## 6. 테이블과 컬럼

### 6.1 테이블 만들기

![빈 곳의 우클릭 메뉴](/guide-assets/ko/editor-context-canvas.webp)

캔버스의 빈 곳을 오른쪽 버튼으로 누르고 **{{model.editor.contextMenu.createTable}}**을 고릅니다. 누른 자리에 테이블이 생깁니다.

### 6.2 테이블의 생김새

![테이블](/guide-assets/ko/editor-table.webp)

| 위치 | 설명 |
|---|---|
| 색 띠 | 테이블의 논리명. 띠를 끌면 테이블이 움직입니다 |
| 이름 줄 | 테이블 물리명. 눌러서 바로 고칩니다. 오른쪽 ⓘ 는 **{{model.editor.table.info}}** 입니다 |
| 컬럼 줄 | 왼쪽 점 여섯 개를 끌어 순서를 바꿉니다. 열쇠 아이콘은 기본 키 표시입니다 |
| 컬럼 이름 | 위는 물리명, 아래는 논리명. 눌러서 바로 고칩니다 |
| 타입, 길이 | 데이터 타입과 길이(또는 정밀도와 스케일). 눌러서 고칩니다 |
| **NN** | NOT NULL. 눌러서 켜고 끕니다. 기본 키 컬럼은 항상 켜져 있습니다 |
| **AI** | 자동 증가. 기본 키이면서 정수 타입일 때만 켤 수 있습니다 |
| **FK** | 외래 키 컬럼. 관계가 만든 컬럼입니다 |
| **D** | 도메인 타입을 쓰는 컬럼(9.4절) |
| × | 컬럼 삭제 |
| **{{model.editor.table.addColumn}}** | 맨 아래에 컬럼을 더합니다 |
| **{{model.editor.key.addUnique}}**, **{{model.editor.key.addIndex}}** | 유니크 키와 인덱스를 만듭니다(6.5절) |
| 테두리의 점 | 관계를 시작하는 손잡이(7.1절) |

기본 키 컬럼은 항상 맨 위에 모입니다.

### 6.3 컬럼 정보

![컬럼 정보](/guide-assets/ko/editor-column-info.webp)

컬럼 이름을 두 번 누르면 **{{model.editor.columnInfo.title}}** 창이 열립니다. 테이블에서 바로 고칠 수 없는 속성까지 한곳에서 고칩니다.

| 항목 | 설명 |
|---|---|
| {{model.editor.columnInfo.physicalName}} | 데이터베이스에 만들어지는 컬럼 이름 |
| {{model.editor.columnInfo.logicalName}} | 사람이 읽는 이름. SQL을 만들 때 COMMENT로 나갑니다 |
| {{model.editor.columnInfo.pk}} | 켜면 NOT NULL이 되고 컬럼이 맨 위로 올라갑니다 |
| {{model.editor.columnInfo.nullable}} | NULL을 받을지 정합니다 |
| {{model.editor.columnInfo.autoIncrement}} | 기본 키이면서 INT, BIGINT, SMALLINT일 때만 켤 수 있습니다 |
| {{model.editor.domainType.label}} | 도메인 타입을 고르면 타입, 길이, NULL 허용, 기본값이 그 값으로 채워집니다(9.4절) |
| {{model.editor.columnInfo.dataType}}, {{model.editor.columnInfo.length}} | 타입에 따라 길이 또는 정밀도와 스케일 칸이 나옵니다 |
| {{model.editor.columnInfo.defaultValue}} | 예: `0`, `NOW()` |
| {{model.editor.columnInfo.comment}} | 컬럼 설명 |

타입 이름은 DBMS에 맞게 보입니다. 예를 들어 날짜와 시각 타입은 PostgreSQL 문서에서 TIMESTAMP, MySQL 문서에서 DATETIME으로 보입니다.

### 6.4 테이블 정보

![테이블 정보](/guide-assets/ko/editor-table-info.webp)

테이블의 ⓘ 를 누르거나 우클릭 메뉴에서 **{{model.editor.contextMenu.tableInfo}}**를 고릅니다. 물리명, 논리명, 설명, 색상을 정합니다. 그룹에 속한 테이블은 그룹 색이 우선합니다. 요구사항에 연결된 테이블에는 그 요구사항이 함께 나오고, 누르면 요구사항 패널에서 그 항목이 열립니다(20.3절).

### 6.5 유니크 키와 인덱스

![인덱스 추가](/guide-assets/ko/editor-key-dialog.webp)

1. 테이블 아래의 **{{model.editor.key.addUnique}}** 또는 **{{model.editor.key.addIndex}}**를 누릅니다.
2. 이름을 적고 컬럼을 고릅니다. 고른 순서가 복합 키의 컬럼 순서입니다. 화살표로 순서를 바꿉니다.
3. 인덱스는 컬럼마다 정렬(ASC, DESC)을 정할 수 있습니다.

만든 키는 테이블 아래에 **UK**, **IX** 줄로 나옵니다. 줄을 누르면 고치거나 지울 수 있습니다. 관계를 만들면 외래 키 컬럼의 인덱스가 자동으로 생깁니다.

## 7. 관계

### 7.1 관계 만들기

![관계 시작](/guide-assets/ko/editor-relation-picker.webp)

1. 부모가 될 테이블의 테두리에 있는 점을 누릅니다.
2. **{{model.editor.relation.startMenu}}** 창에서 관계 유형, 기수, 관계 종류를 고릅니다.
3. 자식이 될 테이블을 누릅니다. 자기 참조는 자기 테이블을 누릅니다. `Esc` 로 그만둡니다.

자식 테이블에 외래 키 컬럼이 자동으로 생깁니다. 부모 테이블에 기본 키가 없으면 관계를 만들 수 없습니다.

| 고르는 것 | 선택지 | 설명 |
|---|---|---|
| {{model.editor.relation.pickType}} | 1:N, 1:1 | 1:1은 외래 키 컬럼에 유니크 키가 함께 생깁니다 |
| {{model.editor.relation.childSide}} | {{model.editor.relationship.multiplicity_ZERO_OR_MORE}}, {{model.editor.relationship.multiplicity_ONE_OR_MORE}} | 관계선 끝의 표기를 정합니다 |
| {{model.editor.relation.parentSide}} | {{model.editor.relationship.multiplicity_EXACTLY_ONE}}, {{model.editor.relationship.multiplicity_ZERO_OR_ONE}} | 하나면 외래 키가 NOT NULL, 0 또는 하나면 NULL 허용 |
| {{model.editor.relation.pickKind}} | {{model.editor.relation.nonIdentifying}}, {{model.editor.relation.identifying}} | 식별 관계는 외래 키가 자식의 기본 키에 들어갑니다. 실선으로 그려집니다 |

### 7.2 관계 고치기

![관계 우클릭 메뉴](/guide-assets/ko/editor-context-relationship.webp)

관계선을 오른쪽 버튼으로 누르면 **{{model.editor.contextMenu.editRelationship}}**과 **{{model.editor.contextMenu.removeRelationship}}**가 나옵니다. 관계선을 두 번 눌러도 편집 창이 열립니다.

![관계 편집](/guide-assets/ko/editor-relationship-dialog.webp)

| 항목 | 설명 |
|---|---|
| {{model.editor.relationship.mappingTitle}} | 부모 컬럼마다 연결할 자식 컬럼을 고릅니다(7.3절) |
| {{model.editor.relationship.type}} | 1:N 또는 1:1 |
| {{model.editor.relationship.fkName}} | 외래 키 제약조건의 이름 |
| {{model.editor.relationship.identifying}} | 켜면 외래 키가 자식의 기본 키에 들어가고 NOT NULL이 됩니다 |
| {{model.editor.relationship.parentMultiplicity}}, {{model.editor.relationship.childMultiplicity}} | 관계선 양쪽 끝의 표기 |
| ON DELETE, ON UPDATE | {{model.editor.relationship.action_NO_ACTION}}, {{model.editor.relationship.action_RESTRICT}}, {{model.editor.relationship.action_CASCADE}}, {{model.editor.relationship.action_SET_NULL}}, {{model.editor.relationship.action_SET_DEFAULT}} |
| **{{model.editor.relationship.remove}}** | 관계를 지웁니다 |

### 7.3 컬럼 매핑 바꾸기

![컬럼 매핑](/guide-assets/ko/editor-relationship-mapping.webp)

관계를 만들면 외래 키 컬럼이 새로 생깁니다. 이미 있는 컬럼을 외래 키로 쓰고 싶으면 컬럼 매핑에서 그 컬럼을 고릅니다.

* 목록에서 자식 테이블의 다른 컬럼을 고르거나 **{{model.editor.relationship.mappingNewColumn}}**를 고릅니다.
* 고른 컬럼의 타입이 부모 컬럼과 다르면 **{{model.editor.relationship.mappingAlignType}}** 선택 칸이 나옵니다.
* 쓰지 않게 된 예전 외래 키 컬럼은 **{{model.editor.relationship.mappingRemoveReleased}}**로 함께 지울 수 있습니다.
* 같은 자식 컬럼을 두 번 고를 수 없습니다.

## 8. 메모, 그룹, 복사

### 8.1 메모

![메모](/guide-assets/ko/editor-note.webp)

* 빈 곳의 우클릭 메뉴에서 **{{model.editor.contextMenu.createNote}}**을 고릅니다.
* 메모를 두 번 누르면 내용을 고칩니다. 위쪽 띠를 끌면 움직입니다.
* 메모 편집 창에서 제목, 색, **{{model.editor.note.linkedTable}}**을 정합니다. 메모를 테이블 위로 끌어다 놓아도 연관 테이블이 정해집니다.
* 연관 테이블이 있는 메모는 자동 배치 때 그 테이블 가까이에 놓입니다.
* 메모의 우클릭 메뉴에서 **{{model.editor.contextMenu.removeNote}}**로 지웁니다.

### 8.2 그룹

![그룹 편집](/guide-assets/ko/editor-group-dialog.webp)

그룹은 테이블을 주제별로 묶습니다. 그룹에 속한 테이블은 그룹 색 띠를 갖습니다.

* 테이블을 고르고 우클릭 메뉴에서 **{{model.editor.contextMenu.createGroup}}**을 누릅니다. 여러 테이블을 함께 골라도 됩니다.
* **{{model.editor.contextMenu.addToGroup}}**, **{{model.editor.contextMenu.removeFromGroup}}**로 넣고 뺍니다.
* **{{model.editor.contextMenu.editGroup}}**에서 이름, 설명, 강조색, 멤버 테이블을 고칩니다.
* **{{model.editor.toolbar.view}}** 메뉴나 탐색기에서 그룹 하나만 골라 볼 수 있습니다.
* 그룹 하나만 보는 중에는 우클릭 메뉴의 **{{model.editor.contextMenu.exitGroupView}}**로 전체 문서로 돌아옵니다.

### 8.3 테이블의 우클릭 메뉴

![테이블 우클릭 메뉴](/guide-assets/ko/editor-context-table.webp)

| 항목 | 설명 |
|---|---|
| **{{model.editor.contextMenu.tableInfo}}** | 테이블 정보 창을 엽니다 |
| **{{model.editor.contextMenu.viewTableData}}** | 연결된 데이터베이스에서 이 테이블의 데이터를 봅니다. 연결된 문서에만 보입니다 |
| **{{model.editor.contextMenu.copy}}** | 고른 객체를 복사합니다 |
| **{{model.editor.contextMenu.duplicate}}** | 바로 옆에 사본을 만듭니다 |
| **{{model.editor.contextMenu.createGroup}}**, **{{model.editor.contextMenu.addToGroup}}**, **{{model.editor.contextMenu.removeFromGroup}}**, **{{model.editor.contextMenu.editGroup}}** | 그룹 관리 |
| **{{model.editor.contextMenu.removeTable}}** | 테이블과 그 테이블의 관계를 지웁니다 |

### 8.4 복사, 붙여넣기, 복제

* `Ctrl/Cmd+C` 로 복사하고 `Ctrl/Cmd+V` 로 붙여 넣습니다. `Ctrl/Cmd+D` 는 복제입니다.
* 여러 테이블을 함께 복사하면 그 사이의 관계도 함께 복사됩니다.
* 붙여 넣은 테이블은 이름이 겹치지 않게 다른 이름이 자동으로 붙습니다.
* 같은 브라우저에서 연 다른 문서에도 붙여 넣을 수 있습니다. 내용이 아주 크면 같은 문서 안에서만 붙여 넣을 수 있습니다.
* 빈 곳의 우클릭 메뉴에서 **{{model.editor.contextMenu.paste}}**를 고르면 누른 자리에 붙습니다.

## 9. 표준 — 단어, 용어, 도메인 타입

컬럼 이름과 타입을 문서마다 다르게 쓰지 않도록 워크스페이스에서 표준을 정해 둡니다. 표준은 세 가지입니다.

| 표준 | 정하는 것 | 예 |
|---|---|---|
| 단어 | 이름 조각 하나와 그 뜻 | `user` → 회원, `email` → 이메일 |
| 용어 | 컬럼 이름 전체와 그 뜻, 쓰는 타입 | `user_email` → 회원 이메일, 도메인 타입 "이메일" |
| 도메인 타입 | 여러 컬럼이 함께 쓰는 타입 정의 | 이메일 = VARCHAR(191), NOT NULL |

단어와 용어는 같은 사전에 등록합니다. 도메인 타입을 가리키거나 타입을 적은 항목이 용어이고, 그렇지 않은 항목이 단어입니다. 표준은 워크스페이스의 모든 문서가 함께 씁니다.

### 9.1 표준 패널 열기

도구 모음의 **{{model.editor.termDictionary.toggle}}**을 누르면 왼쪽에 패널이 열립니다. 탭이 세 개입니다.

| 탭 | 내용 |
|---|---|
| **{{model.editor.termDictionary.tabStandard}}** | 이 워크스페이스의 단어와 용어 |
| **{{model.editor.domainType.menu}}** | 이 워크스페이스의 도메인 타입 |
| **{{model.editor.termDictionary.tabSystem}}** | 관리자가 등록한 공용 사전. 읽기만 할 수 있습니다 |

### 9.2 단어와 용어 등록하기

![워크스페이스 사전](/guide-assets/ko/standard-terms.webp)

* 검색 칸으로 토큰이나 라벨을 찾습니다.
* **{{model.editor.termDictionary.add}}**을 누르면 등록 창이 열립니다. 목록의 항목을 누르면 고칩니다.
* 용어에는 가리키는 도메인 타입의 이름이 보라색 배지로 붙습니다. 배지를 누르면 도메인 타입 탭의 그 항목으로 갑니다.

![용어 수정](/guide-assets/ko/standard-term-dialog.webp)

| 항목 | 설명 |
|---|---|
| {{model.editor.termDictionary.term}} | 컬럼 이름에 쓰는 글자. 단어면 `email`, 용어면 `user_email` 처럼 이름 전체를 적습니다 |
| {{model.editor.termDictionary.label}} | 논리명으로 쓸 글자 |
| {{model.editor.domainType.label}} | 고르면 용어가 됩니다. 타입은 도메인 타입이 정합니다 |
| **{{model.editor.termDictionary.promote}}** | 적어 둔 타입으로 도메인 타입을 새로 만들어 연결합니다. 같은 이름이 있으면 그것을 고릅니다 |

같은 토큰을 다시 등록하면 덮어씁니다. 이름 전체를 등록한 용어는 단어를 이어 붙인 결과보다 우선합니다.

### 9.3 도메인 타입 만들기

![도메인 타입 탭](/guide-assets/ko/standard-domain-types.webp)

도메인 타입 탭은 **{{model.editor.toolbar.tools}}** › **{{model.editor.domainType.menu}}**로도 열립니다.

* 항목마다 타입과 NULL 허용 여부, 지금 문서에서 쓰는 컬럼 수, 가리키는 용어 수가 나옵니다.
* 용어 수를 누르면 사전 탭이 그 도메인 타입을 가리키는 용어만 보여 줍니다.
* 컬럼 수는 지금 연 문서 기준입니다.

![도메인 타입 추가](/guide-assets/ko/standard-domain-dialog.webp)

**{{model.editor.domainType.add}}**를 누르고 이름, 타입, 길이(또는 정밀도와 스케일), NULL 허용, 기본값, 설명을 적습니다. 워크스페이스 하나에 200개까지 만들 수 있고 이름은 겹칠 수 없습니다.

### 9.4 컬럼에 도메인 타입 쓰기

![컬럼 정보의 도메인 타입](/guide-assets/ko/standard-column.webp)

1. 컬럼 이름을 두 번 눌러 컬럼 정보 창을 엽니다.
2. **{{model.editor.domainType.label}}**에서 도메인 타입을 고릅니다. 타입, 길이, NULL 허용, 기본값이 채워집니다.
3. 저장합니다. 테이블의 컬럼 이름 옆에 **D** 배지가 붙습니다.

컬럼마다 값을 다르게 쓸 수도 있습니다. 도메인 타입을 고른 뒤 길이를 직접 고치면 "도메인 타입과 다름" 표시가 붙고, 그 속성은 도메인 타입이 바뀌어도 따라가지 않습니다. **{{model.editor.domainType.revert}}**로 되돌립니다.

외래 키 컬럼의 타입은 부모 컬럼을 따르므로 도메인 타입을 쓸 수 없습니다.

### 9.5 컬럼 이름을 치면 나오는 제안

![사전 제안](/guide-assets/ko/standard-suggest.webp)

테이블에서 컬럼 이름을 치면 사전에서 찾은 항목이 아래에 나옵니다.

* 맨 위 줄은 지금 친 이름으로 만들어질 논리명입니다.
* **{{model.editor.table.termGroupTerms}}**: 고르면 이름 전체가 그 용어로 바뀌고, 논리명과 도메인 타입이 함께 들어갑니다.
* **{{model.editor.table.termGroupWords}}**: 고르면 지금 치고 있는 조각만 그 단어로 바뀝니다. 이어서 다음 조각을 칠 수 있습니다.
* 화살표 키로 고르고 `Enter` 로 넣습니다. `Esc` 로 닫습니다.

컬럼 정보 창에서는 컬럼 이름이 사전의 용어와 같으면 **사전 표준** 안내가 나옵니다. **{{model.editor.domainType.standardApply}}**을 누르면 그 용어의 도메인 타입이 들어갑니다.

### 9.6 도메인 타입을 고쳤을 때

도메인 타입의 값을 고쳐도 문서의 컬럼은 저절로 바뀌지 않습니다. 문서를 열면 알려 주고, 어느 컬럼에 반영할지 묻습니다.

![도메인 타입 변경 안내](/guide-assets/ko/standard-banner.webp)

**{{model.editor.domainType.banner.review}}**를 누르면 반영 창이 열립니다.

![전파 창](/guide-assets/ko/standard-propagation.webp)

* 컬럼마다 바뀌는 속성과 값이 나옵니다.
* 표시한 컬럼만 새 값으로 바뀝니다. 표시하지 않은 컬럼은 값을 그대로 두고 "다르게 씀"으로 남습니다.
* 컬럼에서 직접 고쳐 둔 속성은 건너뜁니다.
* **{{model.editor.domainType.propagation.skipAll}}**을 누르면 아무 컬럼도 바꾸지 않습니다.

도메인 타입을 지워도 컬럼의 값은 그대로입니다. 컬럼에는 "연결 끊김" 표시만 남습니다.

### 9.7 논리명 자동 추론

![논리명 자동 추론](/guide-assets/ko/editor-logical-names.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.logicalNames}}**은 논리명이 비어 있거나 물리명과 같은 테이블과 컬럼을 찾아 사전으로 채웁니다.

* 이름을 `_` 로 나눠 조각마다 사전에서 찾습니다. 워크스페이스 사전이 시스템 사전보다 우선합니다.
* **{{model.editor.logicalNames.languageLabel}}**로 시스템 사전의 어느 언어 표기를 쓸지 고릅니다.
* 채울 항목을 고르고 적용합니다. 이미 있는 논리명은 건드리지 않습니다.
* 적용한 뒤 되돌리기 한 번으로 모두 원래대로 돌릴 수 있습니다.

### 9.8 시스템 사전

![시스템 사전](/guide-assets/ko/standard-system.webp)

시스템 사전은 관리자가 등록한 공용 단어입니다. 여러 언어의 라벨을 갖고 있고, 모든 워크스페이스에서 읽을 수 있습니다. 이니셜 줄로 글자를 골라 찾습니다. 같은 토큰을 워크스페이스 사전에 등록하면 워크스페이스 쪽이 우선하고 **{{model.editor.termDictionary.overridden}}** 표시가 붙습니다.

## 10. SQL과 데이터베이스

### 10.1 데이터베이스 탭 — 커넥션

![데이터베이스 탭](/guide-assets/ko/workspace-database.webp)

워크스페이스의 **{{workspace.detail.tabs.database}}** 탭에는 두 가지가 있습니다.

**{{managed.sectionTitle}}** — 연습하거나 시험할 데이터베이스가 없을 때 Crowfoot가 하나 내어 줍니다.

* **{{managed.issue}}**를 누르면 전용 스키마가 만들어지고 커넥션으로 자동 등록됩니다.
* PostgreSQL과 MySQL을 고를 수 있고, 계정마다 다섯 개까지 무료입니다.
* 열쇠 아이콘을 누르면 접속 주소, 계정, 비밀번호가 나옵니다. DBeaver 같은 외부 도구에 그대로 쓸 수 있습니다.
* 휴지통 아이콘은 발급 철회입니다. 스키마와 그 안의 데이터가 모두 지워지고 되돌릴 수 없습니다.

**커넥션 목록** — 내 데이터베이스의 접속 정보를 등록합니다.

![커넥션 추가](/guide-assets/ko/connection-dialog.webp)

* **{{connection.list.newConnection}}**를 누르고 이름, DBMS, 호스트, 포트, 데이터베이스, 사용자, 비밀번호를 적습니다. 비밀번호는 암호화해서 저장합니다.
* 목록의 행마다 접속 테스트, DB에서 문서로 가져오기, 데이터 보기, 편집, 삭제 버튼이 있습니다.
* 접속 테스트가 성공하면 걸린 시간이 함께 나옵니다.
* 커넥션을 지워도 그 커넥션으로 만든 문서는 남습니다.
* **{{connection.dialog.mcpApply}}**는 Claude가 MCP로 이 데이터베이스의 구조를 바꾸도록 허용하는 스위치입니다. 기본은 꺼져 있습니다(20.4절).

### 10.2 SQL 생성

![SQL 스크립트](/guide-assets/ko/editor-sql.webp)

에디터의 **{{model.editor.toolbar.ddl}}**을 누르면 문서 전체를 대상 DBMS의 문법으로 만든 스크립트가 나옵니다.

* 테이블, 기본 키, 유니크 키, 인덱스, 외래 키, 코멘트가 들어갑니다. 논리명은 COMMENT로 나갑니다.
* **{{model.editor.ddl.copy}}**로 복사하고 **{{model.editor.ddl.download}}**로 .sql 파일을 받습니다.
* 스크립트는 마지막으로 저장한 내용 기준입니다. 저장하지 않은 변경이 있으면 안내가 나옵니다.
* 주의할 점이 있으면 **{{model.editor.ddl.warningTitle}}**에 나옵니다.

### 10.3 배포

![데이터베이스에 배포](/guide-assets/ko/editor-deploy.webp)

SQL 스크립트 창의 **{{model.editor.deploy.button}}**를 누르면 스크립트를 커넥션의 데이터베이스에서 바로 실행합니다.

1. **{{model.editor.deploy.connection}}**을 고릅니다. 문서와 같은 DBMS의 커넥션만 나옵니다.
2. **{{model.editor.deploy.run}}**를 누릅니다.
3. 문장마다 성공과 실패가 나옵니다. 이미 있는 객체와 부딪힌 문장은 실패로 기록되고 나머지는 계속 실행됩니다.

빈 데이터베이스에 처음 만들 때 쓰는 기능입니다. 이미 만든 데이터베이스를 고칠 때는 마이그레이션 DDL을 씁니다(10.4절, 14.3절).

### 10.4 DB 동기화

![데이터베이스 동기화](/guide-assets/ko/editor-sync.webp)

문서와 실제 데이터베이스가 달라졌을 때 씁니다. **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.sync}}**로 엽니다. 데이터베이스에 연결된 문서에만 나옵니다.

| 버튼 | 방향 | 설명 |
|---|---|---|
| **{{model.editor.sync.compare}}** → **{{model.editor.sync.apply}}** | 데이터베이스 → 문서 | 데이터베이스의 지금 구조와 문서를 비교해 다른 점을 보여 주고, 문서를 데이터베이스에 맞춥니다 |
| **{{model.editor.migration.button}}** | 문서 → 데이터베이스 | 문서와 데이터베이스의 차이를 ALTER 문으로 만듭니다. **{{model.editor.migration.apply}}**으로 바로 실행할 수 있습니다 |

* 문서에 맞출 때 테이블의 색상, 위치, 메모 같은 문서만의 속성은 그대로 남습니다. 되돌리기 한 번으로 모두 원래대로 돌릴 수 있습니다.
* 마이그레이션 DDL을 데이터베이스에 실행하면 되돌릴 수 없습니다. 컬럼이나 테이블을 지우는 문장은 기본으로 실행하지 않고 추가와 변경만 반영합니다. 지우는 문장까지 실행하려면 **{{model.editor.migration.destructiveToggle}}**을 켭니다. 이미 쓰던 데이터베이스에 새 문서를 연결하면 문서에 없는 기존 테이블이 모두 삭제 대상으로 나오니 꼭 확인하세요.

연결하지 않은 문서는 문서 목록의 행 메뉴에서 **{{model.list.menu.connect}}**로 연결합니다.

### 10.5 다른 DBMS로 복제

![다른 DBMS로 복제](/guide-assets/ko/editor-convert.webp)

**{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}**는 대상 DBMS만 다른 새 문서를 만듭니다. 원래 문서는 바뀌지 않습니다.

* 만들기 전에 표기가 바뀌는 타입과 대상 DBMS에 맞지 않는 타입을 보여 줍니다.
* 맞지 않는 타입은 새 문서에 원래 값 그대로 남습니다. 만든 뒤 직접 고칩니다.

## 11. 데이터 브라우저

데이터 브라우저는 커넥션의 실제 데이터를 보고 고치는 창입니다. 여는 곳은 세 군데입니다.

* 데이터베이스 탭의 커넥션 행에 있는 데이터 보기 버튼
* 에디터의 **{{model.editor.toolbar.tools}}** › **{{database.openShort}}**
* 에디터에서 테이블 우클릭 › **{{model.editor.contextMenu.viewTableData}}**

편집자 이상의 역할이 필요합니다. 실제로 할 수 있는 일은 커넥션에 등록한 데이터베이스 계정의 권한을 따릅니다. 계정에 쓰기 권한이 없으면 행 편집과 쓰기 SQL은 실패합니다.

### 11.1 데이터 탭 — 조회

![데이터 탭](/guide-assets/ko/data-tab.webp)

* 왼쪽 목록에서 테이블이나 뷰를 고릅니다. 이름 옆 숫자는 어림한 행 수입니다.
* **{{database.data.addFilter}}**로 컬럼, 연산자, 값을 정하고 **{{database.data.apply}}**을 누릅니다. 조건은 여러 개 넣을 수 있습니다.
* 연산자는 `=`, `≠`, `<`, `≤`, `>`, `≥`, {{database.data.op.CONTAINS}}, {{database.data.op.STARTS_WITH}}, {{database.data.op.IN}}, {{database.data.op.IS_NULL}}, {{database.data.op.IS_NOT_NULL}} 입니다.
* 열 머리글을 누르면 그 컬럼으로 정렬합니다.
* 아래쪽에서 쪽을 넘깁니다. **{{database.data.countExact}}**를 누르면 전체 행 수를 정확히 셉니다.
* **{{database.data.downloadCsv}}**는 지금 조건의 결과를 파일로 받습니다.
* 커넥션에 연결된 ERD 문서가 있으면 열 머리글에 그 문서의 논리명이 함께 나옵니다.
* 글자가 긴 값은 줄여서 보여 줍니다. 칸을 누르면 전체 값을 봅니다.

### 11.2 데이터 탭 — 행 고치기

![행 편집](/guide-assets/ko/data-edit.webp)

고친 내용은 바로 반영되지 않습니다. 모아 두었다가 한 번에 적용합니다.

| 하는 일 | 방법 | 표시 |
|---|---|---|
| 값 고치기 | 칸을 두 번 누르고 값을 적은 뒤 `Enter` | 칸이 주황색 |
| NULL로 만들기 | 편집 중 **{{database.edit.setNull}}** 버튼 | 칸이 주황색 |
| 행 추가 | **{{database.edit.addRow}}** | 행이 초록색 |
| 행 삭제 | 행 왼쪽의 휴지통 아이콘 | 행이 빨간색, 글자에 줄 |
| 취소 | 행 왼쪽의 되돌리기 아이콘 또는 **{{database.edit.discard}}** | 표시가 사라짐 |

아래쪽 띠에 추가, 수정, 삭제 건수가 나옵니다. **{{database.edit.apply}}**을 누르면 확인 창이 뜹니다.

![적용 확인](/guide-assets/ko/data-apply-confirm.webp)

* 적용은 한 묶음으로 실행됩니다. 하나라도 실패하면 모두 취소됩니다.
* 삭제가 들어 있으면 경고가 나옵니다. 적용한 뒤에는 되돌릴 수 없습니다.
* 뷰와 기본 키가 없는 테이블은 고칠 수 없습니다.

### 11.3 구조 탭

![구조 탭](/guide-assets/ko/data-structure.webp)

고른 테이블의 컬럼(이름, 타입, NULL 허용, 기본값, 코멘트), 인덱스, 외래 키를 보여 줍니다. 구조는 여기서 고칠 수 없습니다. ERD에서 고친 뒤 마이그레이션 DDL로 반영합니다.

### 11.4 SQL 탭

![SQL 탭](/guide-assets/ko/data-sql.webp)

* SQL을 적고 **{{database.sql.run}}**을 누르거나 `Ctrl/Cmd+Enter` 를 누릅니다. 커서가 놓인 문장 또는 선택한 부분만 실행합니다.
* 테이블과 컬럼 이름이 자동 완성됩니다.
* 조회 결과는 아래 표로 나옵니다. 결과가 많으면 앞부분만 보여 주고 알려 줍니다.
* 데이터를 바꾸는 문장은 바뀐 행 수가 나옵니다.
* 이력 버튼으로 앞서 실행한 문장을 다시 부릅니다.
* 테이블 구조를 바꾸는 문장을 실행하면 ERD 문서와 달라질 수 있습니다. **{{model.editor.toolbar.sync}}**로 문서에 반영합니다.

## 12. 검증

![설계 검증](/guide-assets/ko/editor-validation.webp)

도구 모음의 **{{model.validation.toggle}}**을 누르면 왼쪽에 **{{model.validation.title}}** 패널이 열립니다. 문서를 고칠 때마다 다시 검사합니다.

* 위쪽의 등급 버튼으로 오류, 경고, 참고를 골라 봅니다.
* 항목을 누르면 캔버스가 그 테이블로 옮겨 갑니다.
* 문제가 있는 테이블에는 캔버스에서도 표시가 붙습니다.

| 등급 | 규칙 | 뜻 |
|---|---|---|
| 오류 | {{model.validation.rules.DUPLICATE_TABLE_NAME}} | 같은 물리명의 테이블이 둘 이상 |
| 오류 | {{model.validation.rules.DUPLICATE_COLUMN_NAME}} | 한 테이블에 같은 이름의 컬럼이 둘 이상 |
| 오류 | {{model.validation.rules.DUPLICATE_KEY_NAME}} | 유니크 키나 인덱스의 이름이 겹침 |
| 오류 | {{model.validation.rules.COMPOSITE_KEY_DUPLICATE_COLUMN}} | 키 하나에 같은 컬럼이 두 번 |
| 오류 | {{model.validation.rules.FK_TYPE_MISMATCH}} | 외래 키 컬럼과 부모 컬럼의 타입이 다름 |
| 오류 | {{model.validation.rules.FK_TARGET_NOT_KEY}} | 외래 키가 가리키는 컬럼이 기본 키나 유니크 키가 아님 |
| 오류 | {{model.validation.rules.FK_NULLABILITY_MISMATCH}} | 관계의 기수와 외래 키의 NULL 허용이 맞지 않음 |
| 오류 | {{model.validation.rules.ONE_TO_ONE_MISSING_UK}} | 1:1 관계인데 외래 키에 유니크 키가 없음 |
| 경고 | {{model.validation.rules.MISSING_PK}} | 기본 키가 없는 테이블 |
| 경고 | {{model.validation.rules.EMPTY_TABLE}} | 컬럼이 없는 테이블 |
| 경고 | {{model.validation.rules.FK_MAPPING_EMPTY}} | 관계에 연결된 컬럼이 없음 |
| 경고 | {{model.validation.rules.ORPHAN_TABLE}} | 어느 테이블과도 관계가 없음 |
| 경고 | {{model.validation.rules.CIRCULAR_REFERENCE}} | 외래 키가 돌고 돌아 자기에게 돌아옴 |
| 경고 | {{model.validation.rules.NAMING_CONVENTION}} | 물리명이 명명 규칙에 맞지 않음 |
| 경고 | {{model.validation.rules.MISSING_LOGICAL_NAME}} | 논리명이 비어 있음 |
| 참고 | {{model.validation.rules.FK_WITHOUT_INDEX}} | 외래 키 컬럼으로 시작하는 인덱스가 없음 |
| 참고 | {{model.validation.rules.WIDE_TABLE}} | 컬럼이 30개를 넘음 |

## 13. 공유와 댓글

### 13.1 공유 링크

![문서 공유](/guide-assets/ko/editor-share.webp)

**{{model.editor.toolbar.share}}**를 누르고 **{{model.share.issue}}**을 누르면 링크가 만들어집니다. 링크를 아는 사람은 로그인하지 않아도 문서를 읽을 수 있습니다. 고칠 수는 없습니다.

* **{{model.share.period.unlimited}}** 또는 **{{model.share.period.custom}}**을 고릅니다. 기간을 정하면 시작과 종료 일시 밖에서는 열리지 않습니다.
* 링크마다 조회 수, 좋아요 수, 댓글 수가 나옵니다.
* 복사 아이콘으로 주소를 복사하고, 휴지통 아이콘으로 링크를 철회합니다. 철회한 링크는 바로 열리지 않습니다.
* 공유한 문서는 시작 페이지의 공유 갤러리에도 나옵니다. 갤러리 아래의 **{{landing.gallery.more}}**를 누르면 공유 문서 전체를 이름·설명으로 검색하고 페이지를 넘기며 볼 수 있습니다.

공유 화면에서는 ERD를 보고, SQL 스크립트를 받고, 좋아요와 댓글을 남길 수 있습니다. 좋아요는 로그인한 사람만 남길 수 있습니다. 로그인하지 않은 사람은 별명과 비밀번호를 적고 댓글을 남깁니다.

### 13.2 댓글 탭

에디터 맨 아래의 **{{shareViewer.tab.comments}}** 탭에 공유 링크로 들어온 좋아요와 댓글이 모입니다. 댓글 작성자 이상의 역할이면 여기서 답글을 답니다. 댓글이 달리면 종 모양 아이콘에 알림이 옵니다.

## 14. 버전 기록

### 14.1 저장 기록 보기

![버전 기록](/guide-assets/ko/editor-history.webp)

문서는 저장할 때마다 버전이 하나씩 남습니다. **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.history}}**으로 엽니다.

* 버전마다 저장한 사람, 시각, 바뀐 내용 요약(추가, 변경, 삭제, 이동)이 나옵니다.
* **{{model.editor.history.editMemo}}**으로 버전에 메모를 남깁니다. 검색 칸은 메모에서 찾습니다.
* **{{model.editor.history.view}}**는 그 버전의 문서를 읽기 전용으로 엽니다.
* **{{model.editor.history.restore}}**는 그 버전의 내용을 새 버전으로 저장합니다. 지금 문서도 기록에 그대로 남습니다.

### 14.2 버전 비교

**{{model.editor.history.compare}}**를 누르면 두 버전의 차이를 봅니다.

* 캔버스는 비교 버전 기준으로 그려지고, 바뀐 테이블에 `+`(추가)와 `~`(변경) 표시가 붙습니다.
* 사라진 테이블은 따로 목록으로 나옵니다.
* **{{model.editor.compare.exit}}**로 문서로 돌아옵니다.

### 14.3 마이그레이션 DDL

버전 비교 화면의 **{{model.editor.compare.migrationDdl}}**은 두 버전의 차이를 ALTER 문으로 만듭니다. 지난 배포 뒤에 바뀐 것만 데이터베이스에 반영할 때 씁니다. 스크립트를 복사해 데이터베이스에서 실행합니다. 데이터가 지워질 수 있는 문장에는 경고가 붙습니다. 데이터베이스에 바로 실행하려면 DB 동기화의 마이그레이션 DDL을 씁니다(10.4절).

## 15. 함께 편집하기

여러 사람이 같은 문서를 동시에 열고 고칠 수 있습니다.

* 도구 모음에 지금 함께 보는 사람이 나오고, 캔버스에 다른 사람의 커서가 움직입니다.
* 다른 사람이 고친 내용은 바로 내 화면에 반영됩니다.
* 다른 사람이 고치고 있는 항목은 잠깁니다. 누가 고치고 있는지 이름이 나옵니다.
* 두 사람이 같은 속성을 고치면 나중에 고친 값이 남습니다. 내 값이 바뀌면 알림이 뜨고 **{{model.editor.collab.lwwRestore}}**으로 되돌릴 수 있습니다.
* 오른쪽 아래 말풍선 버튼은 **{{model.editor.chat.label}}** 입니다. 문서를 함께 보는 사람과 이야기합니다.

저장할 때 다른 사람이 먼저 저장했으면 **{{model.editor.conflict.title}}** 창이 뜹니다.

* 서로 겹치지 않는 변경은 자동으로 합쳐집니다.
* 겹치는 항목마다 **{{model.editor.conflict.keepMine}}** 또는 **{{model.editor.conflict.useServer}}**을 고릅니다.
* **{{model.editor.conflict.resolve}}**을 누르면 고른 대로 합쳐 저장합니다.

저장하지 못한 채 창이 닫혀도 편집 내용은 브라우저에 남습니다. 문서를 다시 열면 복구됩니다.

## 16. 팀

![팀 화면](/guide-assets/ko/team-detail.webp)

팀은 사람을 묶어 두는 단위입니다. 워크스페이스에 팀을 멤버로 넣으면 팀원 모두가 한 번에 권한을 받습니다.

* 위쪽 메뉴의 **{{shell.nav.teams}}**로 갑니다. 사이드바의 **{{shell.sidebar.newTeam}}**으로 팀을 만듭니다. 팀을 만들어도 워크스페이스가 함께 생기지는 않습니다.
* **{{team.members.addButton}}**로 사람을 찾아 넣고, **{{team.members.remove}}**로 뺍니다.
* 팀 소유자는 이름과 설명을 고치고 **{{team.detail.settings.dissolveButton}}**를 할 수 있습니다. 팀을 해체하면 팀에 준 워크스페이스 권한도 함께 거둬집니다.

## 17. 커뮤니티와 알림

### 17.1 릴리스 노트

![릴리스 노트](/guide-assets/ko/community-release-notes.webp)

새 버전에서 바뀐 것을 알리는 글입니다. 글을 누르면 본문이 열리고, 본문 언어를 고를 수 있습니다.

### 17.2 제안 및 신고

![제안 및 신고](/guide-assets/ko/community-feedback.webp)

고쳤으면 하는 점이나 찾은 버그를 적는 게시판입니다. **{{community.board.newPost}}**로 글을 쓰고 이미지를 붙일 수 있습니다. 글마다 코멘트를 주고받습니다.

### 17.3 내가 작성한 댓글, 좋아요 문서

![내가 작성한 댓글](/guide-assets/ko/community-my-comments.webp)

**{{shell.sidebar.communityMyComments}}**은 공유 문서에 내가 남긴 댓글을 모아 보여 줍니다. **{{shell.sidebar.communityMyLikes}}**는 내가 좋아요를 누른 공유 문서입니다. 행을 누르면 그 문서로 갑니다.

### 17.4 알림

![알림](/guide-assets/ko/shell-notifications.webp)

종 모양 아이콘을 누르면 최근 알림이 나옵니다. 알림은 세 가지입니다.

* 내 문서에 댓글이 달렸을 때
* 내 문서에 좋아요가 눌렸을 때
* 내 댓글에 문서 소유자가 답했을 때

**{{shell.notifications.markAll}}**으로 모두 읽은 것으로 바꾸고, **{{shell.notifications.viewAll}}**로 전체 목록에 갑니다.

![알림 목록](/guide-assets/ko/community-notifications.webp)

## 18. 관리자

![관리자 화면](/guide-assets/ko/admin-users.webp)

관리자 계정에는 위쪽 메뉴에 **{{shell.nav.admin}}**가 보입니다.

| 메뉴 | 내용 |
|---|---|
| **{{shell.sidebar.adminUsers}}** | 사용자 목록, 관리자 권한, 계정 상태 |
| **{{shell.sidebar.adminCodes}}** | 데이터베이스 종류 같은 코드 값 |
| **{{shell.sidebar.adminManaged}}** | 서비스 제공 DB의 인스턴스와 발급 현황 |
| **{{shell.sidebar.adminSystemTerms}}** | 시스템 사전의 단어 등록과 삭제 |
| **{{shell.sidebar.adminAuditLogs}}** | 주요 작업의 기록 |
| **{{shell.sidebar.adminTraffic}}** | 방문 통계 |

## 19. 단축키

![단축키 도움말](/guide-assets/ko/editor-shortcuts.webp)

에디터에서 `Ctrl/Cmd+/` 를 누르거나 도구 모음의 키보드 아이콘을 누르면 단축키 창이 열립니다.

| 단축키 | 하는 일 |
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
| 화살표 키 | {{model.editor.shortcuts.row.nudge}} |
| `Shift+` 화살표 키 | {{model.editor.shortcuts.row.nudgeFast}} |
| `Space+Drag` | {{model.editor.shortcuts.row.pan}} |
| 마우스 오른쪽 버튼 | {{model.editor.shortcuts.row.contextMenu}} |
| `Ctrl/Cmd+/` | {{model.editor.shortcuts.row.help}} |
| `Ctrl/Cmd+Enter` | 데이터 브라우저의 SQL 탭에서 실행 |

글자를 적는 칸에 커서가 있을 때는 도움말을 뺀 단축키가 동작하지 않습니다. 편집 권한이 없으면 편집, 이동, 삭제 단축키가 동작하지 않습니다.

## 20. Claude와 함께 설계하기 (MCP)

Claude Code 같은 MCP 클라이언트를 워크스페이스에 연결하면 대화로 요구사항을 정리하고 ERD를 만들고 고칠 수 있습니다. Claude가 만든 것은 Crowfoot 화면에 그대로 나타나고, 화면에서 고친 것은 Claude가 다시 읽습니다.

### 20.1 연결하기

![MCP 탭](/guide-assets/ko/workspace-mcp.webp)

워크스페이스의 **{{workspace.detail.tabs.mcp}}** 탭에서 토큰을 발급합니다. 이 탭은 멤버 모두에게 보입니다.

![토큰 발급](/guide-assets/ko/mcp-issue.webp)

* **{{workspace.mcp.issueButton}}**을 누르고 이름과 기간을 정합니다. 한 사람이 워크스페이스마다 다섯 개까지 발급합니다.
* 발급하면 토큰과 **{{workspace.mcp.commandLabel}}**이 나옵니다. 명령을 복사해 터미널에서 실행하면 연결이 끝납니다.
* 토큰과 명령은 탭에서 언제든 다시 복사할 수 있습니다. 목록의 토큰 옆 복사 버튼은 토큰만 복사합니다. 원문은 발급한 본인에게만 보이고, 다른 멤버의 토큰은 소유자에게도 앞부분만 보입니다.

![발급한 토큰과 등록 명령](/guide-assets/ko/mcp-issued.webp)

* 토큰은 발급한 사람의 권한으로 그 워크스페이스에서만 동작합니다. {{common.role.VIEWER}} 나 {{common.role.COMMENTER}} 가 발급한 토큰은 읽기만 합니다.
* 토큰을 Claude와의 대화에 붙여 넣지 않습니다. 등록 명령은 터미널에서 실행합니다.
* 목록의 휴지통 아이콘은 폐기입니다. 폐기하면 그 토큰으로 연결한 Claude는 바로 접근하지 못합니다. 소유자는 다른 멤버의 토큰도 폐기합니다.
* Claude Code와 ChatGPT(Codex)에서 쓸 수 있습니다. 탭의 **{{workspace.mcp.connectTitle}}**에서 클라이언트를 고르면 등록 방법이 나오고 복사할 수 있습니다. ChatGPT 웹·모바일 앱의 커넥터는 지원하지 않습니다.

### 20.2 Claude에게 맡길 수 있는 일

![사용 방법과 예시 요청](/guide-assets/ko/mcp-usage.webp)

등록한 폴더에서 Claude Code나 Codex를 켜고, 하고 싶은 일을 말로 요청합니다. 탭의 **{{workspace.mcp.usage.title}}**에 예시 요청이 있고 복사할 수 있습니다.

* 대화 창에 `/mcp` 를 입력하면 연결됐는지 볼 수 있습니다.
* 등록은 명령을 실행한 폴더에서만 적용됩니다. 모든 폴더에서 쓰려면 등록 명령에 `--scope user` 를 붙입니다.
* 요청 예: "도서 대여 서비스의 요구사항을 정리해서 MySQL용 새 ERD 문서로 만들어 줘", "이 문서를 검증하고 DDL을 보여 줘".

| 하는 일 | 설명 |
|---|---|
| 워크스페이스 살펴보기 | 문서 목록, 용어 사전, 도메인 타입, 설계 규칙을 읽습니다 |
| 요구사항 정리 | 대화에서 나온 요구사항을 문서에 등록하고 고칩니다(20.3절) |
| ERD 만들기와 고치기 | 테이블, 컬럼, 키, 인덱스, 관계, 그룹을 만들고 고칩니다. 워크스페이스의 용어와 도메인 타입을 따릅니다 |
| 검증과 SQL | 설계 검증 결과와 SQL 스크립트를 받아 봅니다 |
| SQL 가져오기 | CREATE TABLE 스크립트로 새 문서를 만듭니다 |
| 데이터베이스 반영 | 서비스 제공 DB를 발급하고 문서를 배포하거나 바뀐 부분만 반영합니다(20.4절) |
| 샘플 데이터 | 테이블 구조에 맞는 샘플 데이터를 만들어 배포한 데이터베이스에 넣습니다(20.4절) |

* Claude가 고칠 때마다 버전이 남습니다. 마음에 들지 않으면 예전 버전으로 되돌립니다(14절).
* Claude는 문서를 지우지 못합니다. 테이블이나 컬럼을 지울 때는 무엇이 지워지는지 먼저 보여 줍니다.
* Claude가 만든 테이블은 문서를 열 때 자동으로 자리를 잡습니다. 이미 배치해 둔 테이블과 메모는 옮기지 않습니다.
* 에디터를 열어 둔 동안 Claude가 문서를 고치면 화면이 새 내용을 불러옵니다. 저장하지 않은 편집이 있으면 알림이 먼저 뜹니다.

### 20.3 요구사항 패널

![요구사항 패널](/guide-assets/ko/editor-requirements.webp)

에디터 맨 아래의 **{{shareViewer.tab.requirements}}** 탭을 누르면 요구사항 화면이 열립니다. 요구사항은 문서에 함께 저장됩니다. 반영 대기인 요구사항이 있으면 탭에 그 수가 붙습니다.

* 요구사항은 도메인(그룹)별로 정리됩니다. 왼쪽 목록에서 도메인을 고르면 그 도메인만 보이고, 도메인마다 반영된 수와 진행 막대가 나옵니다. 그룹이 없는 것은 **{{model.requirements.group.unassigned}}**, 문서 전체에 해당하는 것은 **{{model.requirements.group.document}}**에 모입니다.
* 도메인 구역의 제목을 누르면 접히고, **{{model.requirements.domains.showOnCanvas}}**를 누르면 그 도메인의 테이블을 골라 ERD 탭에서 보여 줍니다.
* 행을 누르면 내용과 연결된 테이블이 펼쳐집니다. 테이블 이름을 누르면 ERD 탭으로 돌아가 그 테이블을 보여 줍니다. 펼친 행의 **{{model.requirements.domains.showOnCanvas}}**는 연결된 테이블을 모두 골라 한 화면에 보여 줍니다.
* 위쪽의 상태 버튼으로 골라 봅니다. 처음에는 **{{model.requirements.state.DROPPED}}**만 숨겨져 있습니다. 찾기 칸에서는 코드, 제목, 내용, 테이블 이름으로 찾습니다.
* 도메인 구역 아래의 **{{model.requirements.untraced.title}}**은 그 도메인의 테이블 가운데 어떤 요구사항에도 연결되지 않은 테이블입니다.
* **{{model.requirements.export.button}}**로 요구사항 명세를 Markdown이나 CSV 파일로 받습니다.

| 상태 | 뜻 |
|---|---|
| **{{model.requirements.state.APPLIED}}** | 확정한 요구사항이 ERD에 반영되어 있습니다 |
| **{{model.requirements.state.PENDING}}** | 확정했지만 ERD가 최신 내용을 아직 반영하지 않았습니다. 제목이나 내용을 고치면 이 상태가 됩니다 |
| **{{model.requirements.state.UNLINKED}}** | 반영했다고 표시했는데 연결된 테이블이 없습니다 |
| **{{model.requirements.state.LEFTOVER}}** | 제외한 요구사항에 테이블이 아직 연결되어 있습니다 |
| **{{model.requirements.state.DRAFT}}** | 아직 확정하지 않았습니다 |
| **{{model.requirements.state.DROPPED}}** | 더 이상 다루지 않습니다 |

![요구사항 수정](/guide-assets/ko/editor-requirement-dialog.webp)

편집자 이상은 요구사항을 직접 추가하고 고칩니다.

* 패널 위의 **{{model.requirements.add}}**나 펼친 행의 수정 버튼을 누릅니다. 제목, 내용, 범위, 상태, 그룹, 연결할 테이블을 정합니다. 코드(REQ-001)는 자동으로 붙습니다.
* 반영 대기인 행의 **{{model.requirements.markApplied}}**를 누르면 반영됨으로 바뀝니다.
* **{{model.requirements.criteria.title}}**은 요구사항이 제대로 반영됐는지 확인할 항목입니다. 수정 창에서 한 줄에 하나씩 적고, 펼친 행에서 체크합니다.
* 빠진 요구사항은 지우지 않고 상태를 **{{model.requirements.status.dropped}}**로 바꿉니다. 삭제는 잘못 등록한 것에만 씁니다.
* 문서 하나에 500개까지 등록합니다.

### 20.4 데이터베이스에 반영하기

Claude가 데이터베이스의 구조를 바꾸려면 그 커넥션에서 허용해야 합니다.

* 커넥션을 추가하거나 편집할 때 **{{connection.dialog.mcpApply}}**를 켭니다. 기본은 꺼져 있고, 켠 커넥션에는 목록에 표시가 붙습니다.
* 서비스 제공 DB는 처음부터 허용되어 있습니다.
* Claude는 실행할 SQL을 먼저 보여 주고, 확인한 계획만 실행합니다. 계획을 본 뒤에 문서나 데이터베이스가 바뀌었으면 실행하지 않고 계획을 다시 세웁니다.
* 샘플 데이터는 먼저 넣어 본 뒤 되돌려서 제약 위반이 없는지 확인하고, 확인한 데이터만 실제로 넣습니다. 넣기만 하고 고치거나 지우지 않습니다. 한 번에 테이블 20개, 행 1,000개까지입니다.
* 허용하지 않은 커넥션에는 Claude가 실행할 SQL까지만 보여 줍니다. 실행은 에디터의 배포(10.3절)나 마이그레이션 DDL(14.3절)에서 직접 합니다.

## 21. 자주 묻는 것

**문서의 데이터베이스 종류를 바꿀 수 있나요?**
바꿀 수 없습니다. **{{model.editor.toolbar.tools}}** › **{{model.editor.toolbar.dbmsConvert}}**로 다른 종류의 새 문서를 만듭니다.

**저장은 언제 되나요?**
편집하면 잠시 뒤 자동으로 저장됩니다. **{{model.editor.toolbar.save}}** 버튼이나 `Ctrl/Cmd+S` 로 바로 저장할 수도 있습니다. 저장할 때마다 버전이 남습니다.

**잘못 고친 것을 되돌리려면?**
방금 한 편집은 `Ctrl/Cmd+Z` 로 되돌립니다. 이미 저장한 내용은 버전 기록에서 예전 버전으로 되돌립니다.

**단어와 용어는 어떻게 다른가요?**
단어는 이름의 조각 하나이고, 용어는 컬럼 이름 전체입니다. 용어는 도메인 타입을 가리킬 수 있어서, 컬럼에 용어를 쓰면 타입까지 함께 정해집니다.

**도메인 타입을 고치면 컬럼이 바로 바뀌나요?**
바뀌지 않습니다. 문서를 열면 바뀐 사실을 알려 주고, 어느 컬럼에 반영할지 고르게 합니다.

**데이터베이스가 없어도 쓸 수 있나요?**
쓸 수 있습니다. ERD만 그리고 SQL 스크립트를 받아 가도 됩니다. 실행해 보고 싶으면 데이터베이스 탭에서 서비스 제공 DB를 발급받습니다.

**데이터 브라우저에서 구조를 바꿀 수 있나요?**
데이터 탭과 구조 탭에서는 바꿀 수 없습니다. ERD에서 고친 뒤 마이그레이션 DDL로 반영합니다.

**공유 링크를 받은 사람이 문서를 고칠 수 있나요?**
고칠 수 없습니다. 함께 고치려면 워크스페이스 멤버로 넣고 편집자 역할을 줍니다.

**고쳤으면 하는 점은 어디에 적나요?**
**{{shell.nav.community}}** › **{{shell.sidebar.communityFeedback}}**에 적어 주세요.

**Claude가 고친 것을 되돌릴 수 있나요?**
되돌릴 수 있습니다. Claude가 고칠 때마다 버전이 남으므로 버전 기록에서 예전 버전으로 되돌립니다.

**화면 위에 "새 버전이 배포되었습니다"가 뜨면?**
새로고침하세요. 열려 있던 화면은 예전 버전이라 저장을 멈춥니다. 저장하지 않은 편집은 새로고침 뒤에 그대로 복원됩니다.
