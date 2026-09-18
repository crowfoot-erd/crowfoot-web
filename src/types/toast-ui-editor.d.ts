/**
 * @toast-ui/editor 3.2.2 ambient 모듈 선언
 *
 * 패키지가 타입(types/index.d.ts)을 제공하지만 package.json exports 맵에
 * "types" 조건이 없어 moduleResolution: bundler에서 해석되지 않는다(TS7016).
 * 실제 타입을 재노출하는 선언으로 우회한다 — API 표면은 패키지 타입 그대로.
 */
declare module '@toast-ui/editor' {
  import Editor from '../../node_modules/@toast-ui/editor/types/index'

  export default Editor
}

declare module '@toast-ui/editor/dist/toastui-editor-viewer' {
  import { Viewer } from '../../node_modules/@toast-ui/editor/types/index'

  export default Viewer
}

// 사이드이펙트 임포트 — ko-KR 문구 등록(Editor.setLanguage), 노출 면 없음.
// exports 맵 패턴상 확장자 없는 지정자("./dist/i18n/*" → "./dist/esm/i18n/*.js")
declare module '@toast-ui/editor/dist/i18n/ko-kr'
