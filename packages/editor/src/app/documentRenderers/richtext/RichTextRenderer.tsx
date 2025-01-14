import { observer } from "mobx-react-lite";
import React from "react";
// import LocalExecutionHost from "../../../runtime/executor/executionHosts/local/LocalExecutionHost"
import { EditorContent, useEditor } from "@blocknote/core";
import "@blocknote/core/style.css";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import ReactDOM from "react-dom";
import { DocumentResource } from "../../../store/DocumentResource";
import { getStoreService } from "../../../store/local/stores";
import styles from "./RichTextRenderer.module.css";

type Props = {
  document: DocumentResource;
};
window.React = React;
window.ReactDOM = ReactDOM;

const RichTextRenderer: React.FC<Props> = observer((props) => {
  const sessionStore = getStoreService().sessionStore;

  const editor = useEditor({
    onUpdate: ({ editor }) => {
      console.log(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: styles.editor,
        "data-test": "editor",
      },
    },
    disableHistoryExtension: true,
    extensions: [
      CollaborationCursor.configure({
        provider: props.document.webrtcProvider,
        user: {
          name: sessionStore.loggedInUserId || "Anonymous",
          color: sessionStore.userColor,
        },
      }),
      Collaboration.configure({
        fragment: props.document.data,
      }),
    ],
  });
  return <EditorContent editor={editor} />;
});

export default RichTextRenderer;
